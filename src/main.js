// Import styles and Firebase functions
import './style.css';
import { initAuth, saveScoreToFirebase, getTopScores } from './firebase.js';

// Remove default Vite content
document.querySelector('#app').innerHTML = '';

// DOM elements
const startMenu = document.getElementById('start-menu');
const gameOverMenu = document.getElementById('game-over-menu');
const levelInfoDisplay = document.getElementById('level-info');
const startButton = document.getElementById('start-button');
const restartButton = document.getElementById('restart-button');
const nextLevelButton = document.getElementById('next-level-button');
const winnerMessage = document.getElementById('winner-message');
const currentLevelDisplay = document.getElementById('current-level');
const levelDisplay = document.getElementById('level-display');
const scoreDisplay = document.getElementById('score-display');
const finalScoreDisplay = document.getElementById('final-score');
const initialPlayerNameInput = document.getElementById('initial-player-name');
const playerNameDisplay = document.getElementById('player-name-display');
const leaderboardEntries = document.getElementById('leaderboard-entries');
const leaderboardEntriesGameOver = document.getElementById('leaderboard-entries-game-over');
const gameContainer = document.getElementById('game-container');
const gameArea = document.getElementById('game-area');

// Game initialization
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;
gameArea.appendChild(canvas);
canvas.style.display = 'none';

// Player info
let playerName = 'Player';
let isAuthenticated = false;

// Leaderboard functionality
const MAX_LEADERBOARD_ENTRIES = 10;
let leaderboard = [];

// Time tracking for bonus points
let levelStartTime = 0;
const BONUS_TIME_THRESHOLD = 10000; // 10 seconds threshold for maximum bonus
const MAX_TIME_BONUS = 100; // Maximum bonus points

// Load leaderboard from Firebase
async function loadLeaderboard() {
    try {
        leaderboard = await getTopScores(MAX_LEADERBOARD_ENTRIES);
        updateLeaderboardDisplay();
    } catch (error) {
        console.error("Error loading leaderboard:", error);
        // Fallback to empty leaderboard
        leaderboard = [];
        updateLeaderboardDisplay();
    }
}

// Save leaderboard to localStorage
function saveLeaderboard() {
    localStorage.setItem('tronLeaderboard', JSON.stringify(leaderboard));
    updateLeaderboardDisplay();
}

// Update leaderboard display
function updateLeaderboardDisplay() {
    // Update both leaderboard displays (start menu and game over)
    updateLeaderboardElement(leaderboardEntries);
    updateLeaderboardElement(leaderboardEntriesGameOver);
}

// Helper function to update a specific leaderboard element
function updateLeaderboardElement(element) {
    if (!element) return;
    
    element.innerHTML = '';
    
    if (leaderboard.length === 0) {
        const noScores = document.createElement('p');
        noScores.classList.add('no-scores');
        noScores.textContent = 'No scores yet. Be the first to play!';
        element.appendChild(noScores);
        return;
    }
    
    // Display top entries
    leaderboard.forEach((entry, index) => {
        const entryElement = document.createElement('div');
        entryElement.classList.add('leaderboard-entry');
        
        const nameEl = document.createElement('span');
        nameEl.textContent = `${index + 1}. ${entry.playerName}`;
        
        const scoreEl = document.createElement('span');
        scoreEl.textContent = `Level: ${entry.level} | Score: ${entry.score}`;
        
        entryElement.appendChild(nameEl);
        entryElement.appendChild(scoreEl);
        
        element.appendChild(entryElement);
    });
}

// Add score to leaderboard only when player loses or quits
async function addToLeaderboard() {
    // Don't add to leaderboard if the player won (will continue to next level)
    if (winner === 'Player' && nextLevelButton.classList.contains('hidden') === false) {
        return;
    }
    
    // Save score to Firebase
    await saveScoreToFirebase(score, currentLevel);
    
    // Refresh the leaderboard
    await loadLeaderboard();
}

// Game constants
const BASE_GRID_SIZE = 20;
let GRID_SIZE = BASE_GRID_SIZE;
let GAME_SPEED = 150; // milliseconds between updates
const BASE_TRAIL_LENGTH = 20;
let TRAIL_LENGTH = BASE_TRAIL_LENGTH;

// Game state
let player = { 
    x: 5, 
    y: 15, 
    direction: 'right', 
    nextDirection: 'right',
    trail: []
};

let cpu = { 
    x: 35, 
    y: 15, 
    direction: 'left', 
    nextDirection: 'left',
    trail: []
};

let gameInterval;
let gameOver = false;
let currentLevel = 1;
let score = 0;
let obstacles = [];
let winner = '';

// Load leaderboard on startup
loadLeaderboard();

// Key controls
window.addEventListener('keydown', (e) => {
    switch(e.key) {
        // Arrow keys
        case 'ArrowUp':
        case 'w':
        case 'W':
            if (player.direction !== 'down') player.nextDirection = 'up';
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            if (player.direction !== 'up') player.nextDirection = 'down';
            break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
            if (player.direction !== 'right') player.nextDirection = 'left';
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            if (player.direction !== 'left') player.nextDirection = 'right';
            break;
    }
});

// Start game handler
startButton.addEventListener('click', async () => {
    // Get player name from input and authenticate
    playerName = initialPlayerNameInput.value.trim() || 'Player';
    playerNameDisplay.textContent = playerName;
    
    try {
        // Initialize Firebase Auth with player name
        const authResult = await initAuth(playerName);
        isAuthenticated = !!authResult.userId;
        playerName = authResult.displayName;
    } catch (error) {
        console.error("Authentication failed:", error);
        // Continue with local mode if authentication fails
    }
    
    startMenu.classList.add('hidden');
    canvas.style.display = 'block';
    levelInfoDisplay.classList.remove('hidden');
    currentLevel = 1;
    score = 0;
    setupLevel(currentLevel);
    resetGame();
    startGameLoop();
    
    // Start the timer for this level
    levelStartTime = Date.now();
});

// Restart game handler
restartButton.addEventListener('click', () => {
    gameOverMenu.classList.add('hidden');
    canvas.style.display = 'block';
    levelInfoDisplay.classList.remove('hidden');
    currentLevel = 1;
    score = 0;
    setupLevel(currentLevel);
    resetGame();
    startGameLoop();
    
    // Start the timer for this level
    levelStartTime = Date.now();
});

// Next level handler
nextLevelButton.addEventListener('click', () => {
    gameOverMenu.classList.add('hidden');
    canvas.style.display = 'block';
    levelInfoDisplay.classList.remove('hidden');
    currentLevel++;
    setupLevel(currentLevel);
    resetGame();
    startGameLoop();
    
    // Start the timer for the new level
    levelStartTime = Date.now();
});

// Calculate time bonus for completing a level
function calculateTimeBonus(timeTaken) {
    // If completed in under threshold time (10 seconds), award maximum bonus
    if (timeTaken <= BONUS_TIME_THRESHOLD) {
        return MAX_TIME_BONUS;
    }
    
    // Linear decrease in bonus from MAX_TIME_BONUS to 0 over the next 20 seconds
    const bonusWindow = 20000; // 20 seconds bonus window after threshold
    const timeOverThreshold = timeTaken - BONUS_TIME_THRESHOLD;
    
    if (timeOverThreshold >= bonusWindow) {
        return 0; // No bonus if took too long
    }
    
    // Calculate bonus on a scale (MAX_TIME_BONUS to 0)
    const bonusPercentage = 1 - (timeOverThreshold / bonusWindow);
    return Math.round(MAX_TIME_BONUS * bonusPercentage);
}

// Function to update all score displays
function updateScoreDisplays() {
    scoreDisplay.textContent = score;
    finalScoreDisplay.textContent = score;
}

// Set up level with obstacles based on level number
function setupLevel(level) {
    // Update displays
    levelDisplay.textContent = level;
    currentLevelDisplay.textContent = level;
    updateScoreDisplays();
    
    // Clear obstacles
    obstacles = [];
    
    // Adjust game speed based on level (gets faster)
    GAME_SPEED = Math.max(50, 150 - (level - 1) * 10);
    
    // Create obstacles based on level
    switch(level) {
        case 1:
            // Level 1: No obstacles
            break;
        case 2:
            // Level 2: Central cross
            for (let i = 13; i < 28; i++) {
                obstacles.push({x: i, y: 15});
                obstacles.push({x: 20, y: i - 5});
            }
            break;
        case 3:
            // Level 3: Diagonal barriers
            for (let i = 5; i < 15; i++) {
                obstacles.push({x: i, y: i});
                obstacles.push({x: i + 20, y: i});
                obstacles.push({x: i, y: 30 - i});
                obstacles.push({x: i + 20, y: 30 - i});
            }
            break;
        case 4:
            // Level 4: Maze-like pattern
            for (let i = 5; i < 35; i += 10) {
                for (let j = 5; j < 25; j++) {
                    obstacles.push({x: i, y: j});
                }
            }
            break;
        case 5:
            // Level 5: Border with gaps
            // Top and bottom borders
            for (let i = 0; i < 40; i++) {
                if (i !== 10 && i !== 30) {
                    obstacles.push({x: i, y: 3});
                    obstacles.push({x: i, y: 27});
                }
            }
            // Left and right borders
            for (let i = 4; i < 27; i++) {
                if (i !== 10 && i !== 20) {
                    obstacles.push({x: 3, y: i});
                    obstacles.push({x: 37, y: i});
                }
            }
            break;
        default:
            // Random obstacles for higher levels
            const numObstacles = 30 + (level - 6) * 5;
            for (let i = 0; i < numObstacles; i++) {
                const x = Math.floor(Math.random() * 38) + 1;
                const y = Math.floor(Math.random() * 28) + 1;
                
                // Make sure obstacles don't block starting positions
                if ((x < 3 || x > 37) && (y < 13 || y > 17)) {
                    obstacles.push({x, y});
                }
            }
            break;
    }
}

// Reset game state
function resetGame() {
    player = { 
        x: 5, 
        y: 15, 
        direction: 'right', 
        nextDirection: 'right',
        trail: []
    };

    cpu = { 
        x: 35, 
        y: 15, 
        direction: 'left', 
        nextDirection: 'left',
        trail: []
    };

    gameOver = false;
    winner = '';
    
    if (gameInterval) {
        clearInterval(gameInterval);
        gameInterval = null;
    }
    
    // Make sure the next level button is hidden
    nextLevelButton.classList.add('hidden');
}

// Start game loop
function startGameLoop() {
    gameInterval = setInterval(updateGame, GAME_SPEED);
}

// Move entity based on direction
function moveEntity(entity) {
    // Update direction
    entity.direction = entity.nextDirection;
    
    // Move based on direction
    switch(entity.direction) {
        case 'up':
            entity.y--;
            break;
        case 'down':
            entity.y++;
            break;
        case 'left':
            entity.x--;
            break;
        case 'right':
            entity.x++;
            break;
    }
    
    // Add current position to trail
    entity.trail.push({x: entity.x, y: entity.y});
    
    // Limit trail length
    if (entity.trail.length > TRAIL_LENGTH) {
        entity.trail.shift();
    }
}

// Check if position contains an obstacle
function hasObstacle(x, y) {
    return obstacles.some(obstacle => obstacle.x === x && obstacle.y === y);
}

// Check for collisions with walls, trails, and obstacles
function hasCollision(x, y) {
    // Check wall collisions
    if (x < 0 || x >= canvas.width / GRID_SIZE || y < 0 || y >= canvas.height / GRID_SIZE) {
        return true;
    }
    
    // Check obstacle collisions
    if (hasObstacle(x, y)) {
        return true;
    }
    
    // Check if position has a trail
    for (let i = 0; i < player.trail.length; i++) {
        if (x === player.trail[i].x && y === player.trail[i].y) {
            return true;
        }
    }
    
    for (let i = 0; i < cpu.trail.length; i++) {
        if (x === cpu.trail[i].x && y === cpu.trail[i].y) {
            return true;
        }
    }
    
    return false;
}

// Update CPU AI
function updateCpuDirection() {
    // Simple AI: try to avoid collisions and chase player
    const possibleDirections = [];
    
    // Check which directions are valid (not immediate collisions)
    if (cpu.direction !== 'down') {
        // Check up
        const upX = cpu.x;
        const upY = cpu.y - 1;
        if (!hasCollision(upX, upY)) {
            possibleDirections.push('up');
        }
    }
    
    if (cpu.direction !== 'up') {
        // Check down
        const downX = cpu.x;
        const downY = cpu.y + 1;
        if (!hasCollision(downX, downY)) {
            possibleDirections.push('down');
        }
    }
    
    if (cpu.direction !== 'right') {
        // Check left
        const leftX = cpu.x - 1;
        const leftY = cpu.y;
        if (!hasCollision(leftX, leftY)) {
            possibleDirections.push('left');
        }
    }
    
    if (cpu.direction !== 'left') {
        // Check right
        const rightX = cpu.x + 1;
        const rightY = cpu.y;
        if (!hasCollision(rightX, rightY)) {
            possibleDirections.push('right');
        }
    }
    
    // If there are possible moves, choose one based on AI difficulty increasing with level
    if (possibleDirections.length > 0) {
        // Higher levels have smarter CPU that follows player more often
        const chaseChance = 0.5 + (currentLevel * 0.05); 
        
        if (Math.random() < chaseChance) { // Chase player with increasing probability
            possibleDirections.sort((a, b) => {
                let aX = cpu.x;
                let aY = cpu.y;
                let bX = cpu.x;
                let bY = cpu.y;
                
                switch(a) {
                    case 'up': aY--; break;
                    case 'down': aY++; break;
                    case 'left': aX--; break;
                    case 'right': aX++; break;
                }
                
                switch(b) {
                    case 'up': bY--; break;
                    case 'down': bY++; break;
                    case 'left': bX--; break;
                    case 'right': bX++; break;
                }
                
                const distA = Math.abs(player.x - aX) + Math.abs(player.y - aY);
                const distB = Math.abs(player.x - bX) + Math.abs(player.y - bY);
                return distA - distB;
            });
            cpu.nextDirection = possibleDirections[0];
        } else { // Move randomly
            const randomIndex = Math.floor(Math.random() * possibleDirections.length);
            cpu.nextDirection = possibleDirections[randomIndex];
        }
    }
}

// Update game state
function updateGame() {
    // Update CPU direction
    updateCpuDirection();
    
    // Move entities
    moveEntity(player);
    moveEntity(cpu);
    
    // Check for player collisions
    if (player.x < 0 || player.x >= canvas.width / GRID_SIZE || 
        player.y < 0 || player.y >= canvas.height / GRID_SIZE ||
        hasObstacle(player.x, player.y)) {
        winner = 'CPU';
        endGame("Player hit wall or obstacle");
        return;
    }
    
    // Check for CPU collisions
    if (cpu.x < 0 || cpu.x >= canvas.width / GRID_SIZE || 
        cpu.y < 0 || cpu.y >= canvas.height / GRID_SIZE ||
        hasObstacle(cpu.x, cpu.y)) {
        winner = 'Player';
        endGame("CPU hit wall or obstacle");
        return;
    }
    
    // Check if player hit own trail
    for (let i = 0; i < player.trail.length - 1; i++) {
        if (player.x === player.trail[i].x && player.y === player.trail[i].y) {
            winner = 'CPU';
            endGame("Player hit own trail");
            return;
        }
    }
    
    // Check if CPU hit own trail
    for (let i = 0; i < cpu.trail.length - 1; i++) {
        if (cpu.x === cpu.trail[i].x && cpu.y === cpu.trail[i].y) {
            winner = 'Player';
            endGame("CPU hit own trail");
            return;
        }
    }
    
    // Check if player hit CPU trail
    for (let i = 0; i < cpu.trail.length; i++) {
        if (player.x === cpu.trail[i].x && player.y === cpu.trail[i].y) {
            winner = 'CPU';
            endGame("Player hit CPU trail");
            return;
        }
    }
    
    // Check if CPU hit player trail
    for (let i = 0; i < player.trail.length; i++) {
        if (cpu.x === player.trail[i].x && cpu.y === player.trail[i].y) {
            winner = 'Player';
            endGame("CPU hit player trail");
            return;
        }
    }
    
    // Draw game
    drawGame();
}

// When player wins a level
function handleLevelWin() {
    // Calculate time taken to complete the level
    const timeTaken = Date.now() - levelStartTime;
    const timeBonus = calculateTimeBonus(timeTaken);
    
    // Add base score + time bonus
    const baseScore = 100 + (currentLevel * 50);
    const totalScore = baseScore + timeBonus;
    score += totalScore;
    
    // Update all score displays
    updateScoreDisplays();
    
    // Show bonus info in winner message
    if (timeBonus > 0) {
        winnerMessage.textContent = `You Won! 🎉 +${baseScore} points and ${timeBonus} time bonus!`;
    } else {
        winnerMessage.textContent = `You Won! 🎉 +${baseScore} points!`;
    }
    
    // Allow proceeding to next level
    nextLevelButton.classList.remove('hidden');
}

// End game function
function endGame(reason) {
    console.log(reason); // For debugging
    gameOver = true;
    clearInterval(gameInterval);
    gameInterval = null;
    canvas.style.display = 'none';
    levelInfoDisplay.classList.add('hidden');
    gameOverMenu.classList.remove('hidden');
    
    // Update final score display
    finalScoreDisplay.textContent = score;
    
    // Set winner message and handle next level button
    if (winner === 'Player') {
        handleLevelWin();
    } else {
        winnerMessage.textContent = "CPU Won! 😢";
        nextLevelButton.classList.add('hidden');
    }
    
    // Add to leaderboard only when the game is truly over (player lost or quits)
    addToLeaderboard();
}

// Draw the game
function drawGame() {
    // Clear canvas
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw obstacles
    ctx.fillStyle = 'gray';
    obstacles.forEach(obstacle => {
        ctx.fillRect(obstacle.x * GRID_SIZE, obstacle.y * GRID_SIZE, GRID_SIZE - 1, GRID_SIZE - 1);
    });
    
    // Draw player trail
    ctx.fillStyle = 'blue';
    player.trail.forEach(segment => {
        ctx.fillRect(segment.x * GRID_SIZE, segment.y * GRID_SIZE, GRID_SIZE - 1, GRID_SIZE - 1);
    });
    
    // Draw CPU trail
    ctx.fillStyle = 'red';
    cpu.trail.forEach(segment => {
        ctx.fillRect(segment.x * GRID_SIZE, segment.y * GRID_SIZE, GRID_SIZE - 1, GRID_SIZE - 1);
    });
}
