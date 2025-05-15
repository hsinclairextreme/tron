// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, push, serverTimestamp } from "firebase/database";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

// Your web app's Firebase configuration
// Replace these with your actual Firebase project configuration
const firebaseConfig = {
    apiKey: "AIzaSyBF_a25fL1VPZP69ChZe7f8Hxa-fhzhbYs",
    authDomain: "tron-68e15.firebaseapp.com",
    projectId: "tron-68e15",
    storageBucket: "tron-68e15.firebasestorage.app",
    messagingSenderId: "667449228368",
    appId: "1:667449228368:web:67c8e203137ef2c7fc2555",
    measurementId: "G-ZP7T61TH9V"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// User authentication management
let userId = null;
let userDisplayName = null;

// Try to load saved user credentials
const loadSavedCredentials = () => {
  const savedUserId = localStorage.getItem('tronUserId');
  const savedDisplayName = localStorage.getItem('tronDisplayName');
  return { savedUserId, savedDisplayName };
};

// Initialize authentication
const initAuth = async (playerName) => {
  const { savedUserId, savedDisplayName } = loadSavedCredentials();
  
  // If we have stored credentials, use them
  if (savedUserId) {
    userId = savedUserId;
    userDisplayName = savedDisplayName || playerName;
    return { userId, displayName: userDisplayName };
  }
  
  // Otherwise, create a new anonymous user
  try {
    const userCredential = await signInAnonymously(auth);
    userId = userCredential.user.uid;
    userDisplayName = playerName;
    
    // Save to localStorage for future sessions
    localStorage.setItem('tronUserId', userId);
    localStorage.setItem('tronDisplayName', playerName);
    
    return { userId, displayName: userDisplayName };
  } catch (error) {
    console.error("Authentication error:", error);
    // Fallback to local mode if authentication fails
    return { userId: `local_${Date.now()}`, displayName: playerName };
  }
};

// Rate limiting constants
const RATE_LIMIT_DURATION = 10000; // 10 seconds between score submissions
let lastScoreSubmissionTime = 0;

// Save score to Firebase with rate limiting
const saveScoreToFirebase = async (score, level) => {
  if (!userId) return false;
  
  // Rate limiting check (client-side)
  const now = Date.now();
  if (now - lastScoreSubmissionTime < RATE_LIMIT_DURATION) {
    console.warn("Rate limit reached. Please wait before submitting another score.");
    return false;
  }
  
  try {
    // First update the user's last submission time
    const userSubmissionRef = ref(db, `userSubmissions/${userId}`);
    await set(userSubmissionRef, now);
    
    // Then save the score
    const scoresRef = ref(db, 'scores');
    const newScoreRef = push(scoresRef);
    
    await set(newScoreRef, {
      userId,
      playerName: userDisplayName,
      score,
      level,
      timestamp: now,
      serverTime: serverTimestamp()
    });
    
    // Update client-side tracking
    lastScoreSubmissionTime = now;
    
    return true;
  } catch (error) {
    console.error("Error saving score:", error);
    return false;
  }
};

// Get top scores from Firebase
const getTopScores = async (limit = 10) => {
  try {
    const scoresRef = ref(db, 'scores');
    
    // Instead of querying with orderByChild which requires an index,
    // we'll get all scores and sort them in JavaScript
    const snapshot = await get(scoresRef);
    
    if (snapshot.exists()) {
      // Convert to array and sort by score (highest first)
      const scoresArray = [];
      snapshot.forEach((childSnapshot) => {
        scoresArray.push({
          id: childSnapshot.key,
          ...childSnapshot.val()
        });
      });
      
      // Sort by score (highest first) and take only the top 'limit' scores
      return scoresArray
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    }
    
    return [];
  } catch (error) {
    console.error("Error getting top scores:", error);
    return [];
  }
};

export {
  initAuth,
  saveScoreToFirebase,
  getTopScores
};