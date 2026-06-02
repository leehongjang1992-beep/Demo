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
let gameState = { latestBall: "-", calledNumbers: [] };

// ⏳ Continuous 60s Global Countdown Infinite Loop Automation
let globalTimeLeft = 60;
setInterval(() => {
    io.emit('syncTimer', globalTimeLeft);
    globalTimeLeft--;
    if (globalTimeLeft < 0) {
        globalTimeLeft = 60; // 1 min loop automates again cleanly
    }
}, 1000);

app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

function updateAdminDashboard() {
    io.to('admin-room').emit('adminDashboardUpdate', {
        latestBall: gameState.latestBall,
        calledNumbers: gameState.calledNumbers
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
            socket.emit('adminAuthFailure', 'Invalid Admin Pin Password Code!');
        }
    });

    // ⚡ Real-Time Admin Click Sync Event Pipe Handler
    socket.on('newNumber', (num) => {
        const parsedNum = parseInt(num);
        if (!gameState.calledNumbers.includes(parsedNum)) {
            gameState.calledNumbers.push(parsedNum);
        }
        gameState.latestBall = parsedNum;
        
        io.emit('gameUpdate', gameState);
        updateAdminDashboard();
    });

    socket.on('resetGame', () => {
        gameState = { latestBall: "-", calledNumbers: [] };
        io.emit('gameUpdate', gameState);
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
        if (chatHistory.length > 30) chatHistory.shift();
        io.emit('receiveMessage', msgData);
    });

    socket.on('disconnect', () => {
        delete onlineUsers[socket.id];
    });
});

server.listen(PORT, () => console.log(`🚀 Automated Engine Spinning Active on Port ${PORT}`));
