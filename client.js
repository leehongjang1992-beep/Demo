// client.js
const socket = io();
let localUserData = null;

// Catch Enter key on input fields for easy usage
document.getElementById('nicknameInput').addEventListener('keypress', (e) => { if(e.key === 'Enter') processUserAuth(); });
document.getElementById('chatMessageField').addEventListener('keypress', (e) => { if(e.key === 'Enter') submitUserChatMessage(); });

function processUserAuth() {
    const name = document.getElementById('nicknameInput').value.trim();
    if (!name) { alert('Valid nickname handle is mandatory.'); return; }
    
    // Handshake socket transmission structure
    socket.emit('joinGame', name);
}

// Socket Core Lifecycle Ingestion Receivers
socket.on('initUser', (userData) => {
    localUserData = userData;
    document.getElementById('authGate').style.display = 'none';
    document.getElementById('mainAppLayout').style.display = 'block';
    
    updateUIBalances(userData.wallet, userData.tokens);
    spawnToastNotification('success', `Logged in as ${userData.username}`);
});

socket.on('userCountUpdate', (count) => {
    document.getElementById('onlineCounter').textContent = count;
});

socket.on('updateBalances', (data) => {
    updateUIBalances(data.wallet, data.tokens);
});

socket.on('chatHistory', (history) => {
    const area = document.getElementById('chatLogsArea');
    area.innerHTML = '';
    history.forEach(msg => appendToChatArea(msg));
    scrollChatBottom();
});

socket.on('receiveMessage', (msg) => {
    appendToChatArea(msg);
    scrollChatBottom();
});

socket.on('notification', (data) => {
    spawnToastNotification(data.type, data.text);
});

// UI Modification Helpers
function updateUIBalances(wallet, tokens) {
    document.getElementById('walletDisplay').textContent = '₹' + wallet.toLocaleString();
    document.getElementById('tokensDisplay').textContent = tokens.toLocaleString();
}

function triggerDepositRequest() {
    const amtEl = document.getElementById('depositAmount');
    const utrEl = document.getElementById('depositUtr');
    
    const amount = parseFloat(amtEl.value);
    const utr = utrEl.value.trim();

    if (isNaN(amount) || amount <= 0) { alert('Define proper transaction size.'); return; }
    if (utr.length < 6) { alert('Input valid explicit transaction reference reference.'); return; }

    socket.emit('submitDeposit', { amount, utr });
    
    // Reset fields
    amtEl.value = '';
    utrEl.value = '';
}

function submitUserChatMessage() {
    const field = document.getElementById('chatMessageField');
    const text = field.value.trim();
    if (!text) return;

    socket.emit('sendMessage', text);
    field.value = '';
}

function appendToChatArea(msg) {
    const logs = document.getElementById('chatLogsArea');
    const msgBlock = document.createElement('div');
    msgBlock.className = 'chat-msg';
    
    const roleTag = msg.isAdmin ? ' [Admin]' : '';
    const roleClass = msg.isAdmin ? ' author admin-tag' : ' author';

    msgBlock.innerHTML = `
        <span class="${roleClass}">${msg.sender}${roleTag}:</span>
        <span class="text">${msg.text}</span>
        <span class="time">${msg.time}</span>
    `;
    logs.appendChild(msgBlock);
}

function scrollChatBottom() {
    const container = document.getElementById('chatLogsArea');
    container.scrollTop = container.scrollHeight;
}

function spawnToastNotification(type, text) {
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.textContent = text;
    document.body.appendChild(toast);
    
    setTimeout(() => { toast.remove(); }, 4000);
}

