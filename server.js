// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = "admin123"; // Apka master login password

// Game State Storage
let onlineUsers = {}; 
let depositRequests = []; 
let chatHistory = []; 

let gameState = {
    latestBall: "-",
    calledNumbers: []
};

app.use(express.static(__dirname));

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// Helper: Broadcast Updates to Admin Dashboard Panel
function updateAdminDashboard() {
    const usersArray = Object.values(onlineUsers);
    const dashboardData = {
        onlineCount: usersArray.filter(u => u.role !== 'admin').length,
        activeUsers: usersArray.filter(u => u.role !== 'admin'),
        pendingRequests: depositRequests.filter(r => r.status === 'pending'),
        allRequests: depositRequests,
        latestBall: gameState.latestBall,
        calledNumbers: gameState.calledNumbers
    };
    io.to('admin-room').emit('adminDashboardUpdate', dashboardData);
}

// Helper: Broadcast Online Counter to Players
function updateGlobalUserCount() {
    const totalPlayers = Object.values(onlineUsers).filter(u => u.role !== 'admin').length;
    io.emit('userCountUpdate', totalPlayers);
}

// Socket Orchestration Pipeline
io.on('connection', (socket) => {
    console.log('⚡ Connected:', socket.id);
    
    // User Joins Game
    socket.on('joinGame', (username) => {
        onlineUsers[socket.id] = {
            username: username,
            wallet: 1000, 
            tokens: 100, // Default signup bonus tokens
            role: 'user'
        };
        
        socket.emit('initUser', onlineUsers[socket.id]);
        socket.emit('chatHistory', chatHistory);
        socket.emit('gameUpdate', gameState); // User ko current live board status milega
        
        updateGlobalUserCount();
        updateAdminDashboard();
    });

    // Admin Authentication
    socket.on('adminLogin', (password) => {
        if (password === ADMIN_PASSWORD) {
            onlineUsers[socket.id] = { role: 'admin', username: 'System Admin' };
            socket.join('admin-room');
            socket.emit('adminAuthSuccess');
            updateAdminDashboard();
            socket.emit('chatHistory', chatHistory);
        } else {
            socket.emit('adminAuthFailure', 'Invalid Admin Password!');
        }
    });

    // Timer Implementation logic
    socket.on('startTimerEvent', () => {
        let timeLeft = 60;
        let timerInterval = setInterval(() => {
            io.emit('syncTimer', timeLeft);
            timeLeft--;
            if(timeLeft < 0) {
                clearInterval(timerInterval);
            }
        }, 1000);
    });

    // Admin Draw Number Click System
    socket.on('newNumber', (num) => {
        const parsedNum = parseInt(num);
        if (!gameState.calledNumbers.includes(parsedNum)) {
            gameState.calledNumbers.push(parsedNum);
        }
        gameState.latestBall = parsedNum;
        
        // Dono screens ko simultaneously instant message broadcast
        io.emit('gameUpdate', gameState);
        updateAdminDashboard();
    });

    // Reset Game Board Engine
    socket.on('resetGame', () => {
        gameState = { latestBall: "-", calledNumbers: [] };
        io.emit('gameUpdate', gameState);
        updateAdminDashboard();
    });

    // Global Chat Pipeline
    socket.on('sendMessage', (msgText) => {
        const user = onlineUsers[socket.id];
        if (!user) return;

        const msgData = {
            sender: user.username,
            text: msgText,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isAdmin: user.role === 'admin'
        };

        chatHistory.push(msgData);
        if (chatHistory.length > 50) chatHistory.shift();

        io.emit('receiveMessage', msgData);
    });

    // Handle Deposit Submission
    socket.on('submitDeposit', (data) => {
        const user = onlineUsers[socket.id];
        if (!user) return;

        const newRequest = {
            id: 'REQ-' + Date.now(),
            username: user.username,
            socketId: socket.id,
            amount: parseFloat(data.amount),
            utr: data.utr,
            status: 'pending',
            timestamp: new Date().toLocaleTimeString()
        };

        depositRequests.push(newRequest);
        socket.emit('notification', { type: 'success', text: 'Deposit request submitted to Admin panel.' });
        updateAdminDashboard();
    });

    // Ledger Approval Processing
    socket.on('processRequest', ({ requestId, action }) => {
        const reqIndex = depositRequests.findIndex(r => r.id === requestId);
        if (reqIndex === -1 || depositRequests[reqIndex].status !== 'pending') return;

        const depositReq = depositRequests[reqIndex];
        depositReq.status = action; 

        const targetSocketId = depositReq.socketId;
        const targetUser = onlineUsers[targetSocketId];

        if (targetUser && action === 'approved') {
            targetUser.tokens += depositReq.amount;
            io.to(targetSocketId).emit('updateBalances', { wallet: targetUser.wallet, tokens: targetUser.tokens });
            io.to(targetSocketId).emit('notification', { 
                type: 'success', 
                text: `🎉 Admin Approved your deposit! ${depositReq.amount} tokens credited.` 
            });
        } else if (targetUser && action === 'rejected') {
            io.to(targetSocketId).emit('notification', { 
                type: 'error', 
                text: `❌ Your deposit request of amount ${depositReq.amount} was rejected.` 
            });
        }

        updateAdminDashboard();
    });

    // Disconnect Handle
    socket.on('disconnect', () => {
        if (onlineUsers[socket.id]) {
            const role = onlineUsers[socket.id].role;
            delete onlineUsers[socket.id];
            if (role !== 'admin') updateGlobalUserCount();
            updateAdminDashboard();
        }
    });
});

server.listen(PORT, () => console.log(`🚀 Core Server Active at Port ${PORT}`));
