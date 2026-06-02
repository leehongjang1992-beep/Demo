// admin.js
const socket = io();

document.getElementById('adminPassInput').addEventListener('keypress', (e) => { if(e.key === 'Enter') executeAdminAuth(); });
document.getElementById('adminChatMessageField').addEventListener('keypress', (e) => { if(e.key === 'Enter') submitAdminChatMessage(); });

function executeAdminAuth() {
    const password = document.getElementById('adminPassInput').value;
    socket.emit('adminLogin', password);
}

socket.on('adminAuthSuccess', () => {
    document.getElementById('adminAuthGate').style.display = 'none';
    document.getElementById('adminMainLayout').style.display = 'block';
});

socket.on('adminAuthFailure', (errMsg) => {
    const errEl = document.getElementById('authErrMsg');
    errEl.textContent = errMsg;
    errEl.style.display = 'block';
});

// Admin state rendering pipelines updates received from core server engine
socket.on('adminDashboardUpdate', (data) => {
    document.getElementById('metricOnlineCount').textContent = data.onlineCount;
    document.getElementById('metricPendingCount').textContent = data.pendingRequests.length;

    renderRequestsTable(data.allRequests);
});

socket.on('chatHistory', (history) => {
    const area = document.getElementById('adminChatLogsArea');
    area.innerHTML = '';
    history.forEach(msg => appendToAdminChat(msg));
    scrollAdminChatBottom();
});

socket.on('receiveMessage', (msg) => {
    appendToAdminChat(msg);
    scrollAdminChatBottom();
});

function renderRequestsTable(allRequests) {
    const tbody = document.getElementById('depositRequestsTableBody');
    if (allRequests.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No transactions submitted yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    // Display latest requested transactions at the top
    const orderedList = [...allRequests].reverse();

    orderedList.forEach(req => {
        const tr = document.createElement('tr');
        
        let statusStyle = '';
        if(req.status === 'pending') statusStyle = 'color: var(--primary); font-weight:700;';
        if(req.status === 'approved') statusStyle = 'color: var(--accent-success);';
        if(req.status === 'rejected') statusStyle = 'color: var(--accent-danger);';

        let actionBlock = '';
        if (req.status === 'pending') {
            actionBlock = `
                <button class="btn btn-success" style="padding:4px 8px; font-size:0.75rem; width:auto; display:inline-block; margin-right:4px;" onclick="dispatchDecision('${req.id}', 'approved')">Approve</button>
                <button class="btn btn-danger" style="padding:4px 8px; font-size:0.75rem; width:auto; display:inline-block;" onclick="dispatchDecision('${req.id}', 'rejected')">Reject</button>
            `;
        } else {
            actionBlock = `<span style="font-size:0.8rem; color:var(--text-muted);">Settled</span>`;
        }

        tr.innerHTML = `
            <td><strong>${req.username}</strong></td>
            <td>₹${req.amount.toLocaleString()}</td>
            <td><code>${req.utr}</code></td>
            <td style="${statusStyle}">${req.status.toUpperCase()}</td>
            <td>${actionBlock}</td>
        `;
        tbody.appendChild(tr);
    });
}

function dispatchDecision(requestId, action) {
    socket.emit('processRequest', { requestId, action });
}

function submitAdminChatMessage() {
    const field = document.getElementById('adminChatMessageField');
    const text = field.value.trim();
    if (!text) return;

    socket.emit('sendMessage', text);
    field.value = '';
}

function appendToAdminChat(msg) {
    const logs = document.getElementById('adminChatLogsArea');
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

function scrollAdminChatBottom() {
    const container = document.getElementById('adminChatLogsArea');
    container.scrollTop = container.scrollHeight;
}

