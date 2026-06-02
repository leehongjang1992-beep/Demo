// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = "admin123";

let onlineUsers = {}; 
let chatHistory = []; 
let gameState = { 
    latestBall: "-", 
    calledNumbers: [],
    timerActive: false,
    timeLeft: 0,
    gameStatus: "WAITING", // WAITING, REGISTRATION, STARTED
    playMode: "manual" // manual ya auto
};

let timerInterval = null;
let autoPlayInterval = null;

app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

function updateAdminDashboard() {
    io.to('admin-room').emit('adminDashboardUpdate', {
        latestBall: gameState.latestBall,
        calledNumbers: gameState.calledNumbers,
        gameStatus: gameState.gameStatus,
        timeLeft: gameState.timeLeft,
        playMode: gameState.playMode
    });
}

// Helper for Auto Play Drawing
function drawAutomaticNumber() {
    let remaining = [];
    for (let i = 1; i <= 90; i++) {
        if (!gameState.calledNumbers.includes(i)) remaining.push(i);
    }
    if (remaining.length === 0) {
        if (autoPlayInterval) clearInterval(autoPlayInterval);
        return;
    }
    let randomIndex = Math.floor(Math.random() * remaining.length);
    let drawnNum = remaining[randomIndex];
    
    gameState.calledNumbers.unshift(drawnNum);
    gameState.latestBall = drawnNum;
    
    io.emit('gameUpdate', gameState);
    updateAdminDashboard();
}

io.on('connection', (socket) => {
    
    socket.on('joinGame', (username) => {
        onlineUsers[socket.id] = { username, role: 'user' };
        socket.emit('initUser', onlineUsers[socket.id]);
        socket.emit('chatHistory', chatHistory);
        socket.emit('gameUpdate', gameState);
    });

    socket.on('adminLogin', (password) => {
        if (password === ADMIN_PASSWORD) {
            onlineUsers[socket.id] = { role: 'admin', username: 'Admin Master' };
            socket.join('admin-room');
            socket.emit('adminAuthSuccess');
            updateAdminDashboard();
            socket.emit('chatHistory', chatHistory);
        } else {
            socket.emit('adminAuthFailure', 'Invalid Admin Pin!');
        }
    });

    socket.on('startRegistrationWindow', () => {
        if (timerInterval) clearInterval(timerInterval);
        if (autoPlayInterval) clearInterval(autoPlayInterval);
        
        gameState.gameStatus = "REGISTRATION";
        gameState.timerActive = true;
        gameState.timeLeft = 60;
        gameState.calledNumbers = [];
        gameState.latestBall = "-";

        io.emit('gameUpdate', gameState);
        updateAdminDashboard();

        timerInterval = setInterval(() => {
            gameState.timeLeft--;
            io.emit('syncTimer', gameState.timeLeft);
            
            if (gameState.timeLeft <= 0) {
                clearInterval(timerInterval);
                gameState.timerActive = false;
                gameState.gameStatus = "STARTED";
                io.emit('gameUpdate', gameState);
                updateAdminDashboard();
            }
        }, 1000);
    });

    // Handle Manual or Auto mode switch from admin
    socket.on('switchPlayMode', (mode) => {
        gameState.playMode = mode;
        if (autoPlayInterval) clearInterval(autoPlayInterval);
        
        if (mode === "auto" && gameState.gameStatus === "STARTED") {
            autoPlayInterval = setInterval(drawAutomaticNumber, 7000); // Har 7 second me automatic number draw
        }
        updateAdminDashboard();
    });

    socket.on('newNumber', (num) => {
        const parsedNum = parseInt(num);
        if (!gameState.calledNumbers.includes(parsedNum)) {
            gameState.calledNumbers.unshift(parsedNum);
        }
        gameState.latestBall = parsedNum;
        gameState.gameStatus = "STARTED";
        
        io.emit('gameUpdate', gameState);
        updateAdminDashboard();
    });

    // 🏆 Global Win Declaration Handler
    socket.on('claimWinEvent', (data) => {
        // BroadCast SMS type window alert box to everyone
        io.emit('victoryNotificationPopup', {
            winner: data.winner,
            claimType: data.claimType
        });
    });

    // 🔄 Game Reset Engine + Chat Wiper
    socket.on('resetGame', () => {
        if (timerInterval) clearInterval(timerInterval);
        if (autoPlayInterval) clearInterval(autoPlayInterval);
        
        gameState = { latestBall: "-", calledNumbers: [], timerActive: false, timeLeft: 0, gameStatus: "WAITING", playMode: "manual" };
        chatHistory = []; // Purana sara chat clear ho jayega
        
        io.emit('gameUpdate', gameState);
        io.emit('chatHistory', chatHistory); // Users ki screen par bhi clear clear broadcast
        updateAdminDashboard();
    });

    socket.on('sendMessage', (msgText) => {
        const user = onlineUsers[socket.id];
        if (!user) return;
        
        const msgData = {
            sender: user.username,
            text: msgText,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        chatHistory.push(msgData);
        if (chatHistory.length > 40) chatHistory.shift();
        io.emit('receiveMessage', msgData);
    });

    socket.on('disconnect', () => {
        delete onlineUsers[socket.id];
    });
});

server.listen(PORT, () => console.log(`🚀 Tambola Dynamic Engine Running on Port ${PORT}`));
