// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
const ADMIN_PASSWORD = "admin123"; // Fixed Admin Password

// Server Memory State (Resets on restart)
let onlineUsers = {}; // socket.id -> { username, wallet, tokens, role }
let depositRequests = []; // Array of { id, username, socketId, amount, utr, status, timestamp }
let chatHistory = []; // Stores last 50 messages

app.use(express.static(__dirname));

// Route Handlers
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// Helper: Broadcast Admin Dashboard Updates
function updateAdminDashboard() {
    const usersArray = Object.values(onlineUsers);
    const dashboardData = {
        onlineCount: usersArray.filter(u => u.role !== 'admin').length,
        activeUsers: usersArray.filter(u => u.role !== 'admin'),
        pendingRequests: depositRequests.filter(r => r.status === 'pending'),
        allRequests: depositRequests
    };
    io.to('admin-room').emit('adminDashboardUpdate', dashboardData);
}

// Helper: Broadcast Online Counter to Players
function updateGlobalUserCount() {
    const totalPlayers = Object.values(onlineUsers).filter(u => u.role !== 'admin').length;
    io.emit('userCountUpdate', totalPlayers);
}

// Socket.IO Orchestration
io.on('connection', (socket) => {
    
    // 1. User Joins Game
    socket.on('joinGame', (username) => {
        onlineUsers[socket.id] = {
            username: username,
            wallet: 1000, // Starting Default Demo Balance
            tokens: 0,
            role: 'user'
        };
        
        // Send initial setup state to user
        socket.emit('initUser', onlineUsers[socket.id]);
        socket.emit('chatHistory', chatHistory);
        
        updateGlobalUserCount();
        updateAdminDashboard();
    });

    // 2. Admin Authentication & Room Join
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

    // 3. Global Chat Message Pipeline
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
        if (chatHistory.length > 50) chatHistory.shift(); // Keep logs clean

        io.emit('receiveMessage', msgData);
    });

    // 4. Deposit Request Submission
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

    // 5. Admin Decision Action (Approve/Reject)
    socket.on('processRequest', ({ requestId, action }) => {
        const reqIndex = depositRequests.findIndex(r => r.id === requestId);
        if (reqIndex === -1 || depositRequests[reqIndex].status !== 'pending') return;

        const depositReq = depositRequests[reqIndex];
        depositReq.status = action; // 'approved' or 'rejected'

        const targetSocketId = depositReq.socketId;
        const targetUser = onlineUsers[targetSocketId];

        if (targetUser && action === 'approved') {
            // Instant conversion: 1 Currency = 1 Token
            targetUser.tokens += depositReq.amount;
            
            // Push dynamic update to that client target specifically
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

    // 6. Handle Disconnection gracefully
    socket.on('disconnect', () => {
        if (onlineUsers[socket.id]) {
            const role = onlineUsers[socket.id].role;
            delete onlineUsers[socket.id];
            if (role !== 'admin') {
                updateGlobalUserCount();
            }
            updateAdminDashboard();
        }
    });
});

server.listen(PORT, () => console.log(`🚀 Tambola App Cluster live at http://localhost:${PORT}`));

