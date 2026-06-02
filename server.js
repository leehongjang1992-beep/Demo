// Is block ko server.js ke io.on('connection') ke andar paste karein

// Timer Logic
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

// Admin Draw Number Trigger
socket.on('newNumber', (num) => {
    if (!gameState.calledNumbers.includes(num)) {
        gameState.calledNumbers.push(num);
    }
    gameState.latestBall = num;
    
    // Broadcast instantly to users & admin dashboard
    io.emit('gameUpdate', gameState);
    updateAdminDashboard();
});
