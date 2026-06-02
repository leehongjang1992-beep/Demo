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
    gameStatus: "WAITING",
    playMode: "manual"
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
    
    gameState.calledNumbers.push(drawnNum); // Server records values natively
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
                
                // Trigger auto trigger system if it was preselected beforehand
                if(gameState.playMode === "auto") {
                    autoPlayInterval = setInterval(drawAutomaticNumber, 7000);
                }
            }
        }, 1000);
    });

    socket.on('switchPlayMode', (mode) => {
        gameState.playMode = mode;
        if (autoPlayInterval) clearInterval(autoPlayInterval);
        
        if (mode === "auto" && gameState.gameStatus === "STARTED") {
            autoPlayInterval = setInterval(drawAutomaticNumber, 7000);
        }
        updateAdminDashboard();
    });

    socket.on('newNumber', (num) => {
        const parsedNum = parseInt(num);
        if (!gameState.calledNumbers.includes(parsedNum)) {
            gameState.calledNumbers.push(parsedNum);
        }
        gameState.latestBall = parsedNum;
        gameState.gameStatus = "STARTED";
        
        io.emit('gameUpdate', gameState);
        updateAdminDashboard();
    });

    socket.on('claimWinEvent', (data) => {
        io.emit('victoryNotificationPopup', {
            winner: data.winner,
            claimType: data.claimType
        });
    });

    socket.on('resetGame', () => {
        if (timerInterval) clearInterval(timerInterval);
        if (autoPlayInterval) clearInterval(autoPlayInterval);
        
        gameState = { latestBall: "-", calledNumbers: [], timerActive: false, timeLeft: 0, gameStatus: "WAITING", playMode: "manual" };
        chatHistory = [];
        
        io.emit('gameUpdate', gameState);
        io.emit('chatHistory', chatHistory);
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

server.listen(PORT, () => console.log(`🚀 Master Application Active On Port ${PORT}`));
