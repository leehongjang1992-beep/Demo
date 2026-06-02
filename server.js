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
    gameStatus: "WAITING" // WAITING, REGISTRATION, STARTED
};

let timerInterval = null;

app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

function updateAdminDashboard() {
    io.to('admin-room').emit('adminDashboardUpdate', {
        latestBall: gameState.latestBall,
        calledNumbers: gameState.calledNumbers,
        gameStatus: gameState.gameStatus,
        timeLeft: gameState.timeLeft
    });
}

io.on('connection', (socket) => {
    
    socket.on('joinGame', (username) => {
        onlineUsers[socket.id] = { username, tokens: 500, role: 'user' };
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
            socket.emit('adminAuthFailure', 'Invalid Admin Pin Code!');
        }
    });

    // ⏳ Admin manually triggers 1-minute registration window
    socket.on('startRegistrationWindow', () => {
        if (timerInterval) clearInterval(timerInterval);
        
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

    // ⚡ Real-Time Admin Click Confirm Handler
    socket.on('newNumber', (num) => {
        const parsedNum = parseInt(num);
        if (!gameState.calledNumbers.includes(parsedNum)) {
            // Naya number array me SABSE PEHLE (index 0 par) unshift hoga taaki yeh hamesha upar/pehle dikhe
            gameState.calledNumbers.unshift(parsedNum);
        }
        gameState.latestBall = parsedNum;
        gameState.gameStatus = "STARTED"; // Game automatically starts playing
        
        io.emit('gameUpdate', gameState);
        updateAdminDashboard();
    });

    socket.on('resetGame', () => {
        if (timerInterval) clearInterval(timerInterval);
        gameState = { latestBall: "-", calledNumbers: [], timerActive: false, timeLeft: 0, gameStatus: "WAITING" };
        io.emit('gameUpdate', gameState);
        updateAdminDashboard();
    });

    // Chat Pipeline Fix: Storing mapping inside onlineUsers correctly
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

server.listen(PORT, () => console.log(`🚀 Automated Engine Spinning Active on Port ${PORT}`));
