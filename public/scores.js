const socket = io();
let globalActiveAlliances = ['Red', 'Blue', 'Yellow', 'Green'];

function renderScoreboard(state) {
    const grid = document.getElementById('alliances-board-grid');
    if (!grid) return;

    let html = '';
    const scores = state.scores;
    const subs = state.submissions;
    const activeTeams = state.activeAlliances;

    // Loop through alliances in standard order
    ['Red', 'Blue', 'Yellow', 'Green'].forEach(color => {
        // Hide deactivated teams entirely
        if (!activeTeams.includes(color)) return;

        let colorHex = '#dc3545';
        if (color === 'Blue') colorHex = '#007bff';
        if (color === 'Yellow') colorHex = '#ffc107';
        if (color === 'Green') colorHex = '#28a745';

        // Check if this team submitted something
        const teamSubmission = subs.find(s => s.alliance === color);
        
        let selectionText = "THINKING...";
        let badgeClass = "";

        if (teamSubmission) {
            const ans = teamSubmission.answers;
            selectionText = ans.length > 0 ? "LOCKED: " + ans.join(', ') : "LOCKED: None";
            badgeClass = "active-pick";
        } else if (!state.roundActive && !state.answersReleased) {
            selectionText = "IDLE";
        } else if (state.teamTimers && state.teamTimers[color] <= 0) {
            selectionText = "TIME'S UP!";
        }

        // Check if they activated Double Risk gambling multiplier
        const hasDoubleRisk = state.teamPowerUps && state.teamPowerUps[color] && 
                             state.teamPowerUps[color].doubleRisk && state.teamPowerUps[color].doubleRisk.activeInRound;
        if (hasDoubleRisk) {
            selectionText += " 🎲 [DOUBLE OR DEDUCT]";
        }

        html += '<div class="team-score-card" style="border-left-color: ' + colorHex + '">' +
                    '' +
                        '<div class="team-name" style="color: ' + (color === 'Yellow' ? '#ffc107' : colorHex) + '">' + color + '</div>' +
                        '<div class="team-selection-badge ' + badgeClass + '">' + selectionText + '</div>' +
                    '</div>' +
                    '<div class="team-points">' + scores[color] + ' <span style="font-size:16px;color:#666;">pts</span></div>' +
                '</div>';
    });

    grid.innerHTML = html;
}

// --- GATEWAY CHANNELS ---
socket.on('init_state', function(state) {
    globalActiveAlliances = state.activeAlliances;
    renderScoreboard(state);
    
    const status = document.getElementById('display-status');
    if (state.roundActive) status.innerText = "ROUND IN PROGRESS";
    else if (state.answersReleased) status.innerText = "MATCH RESULTS RELEASED";
    else status.innerText = "ROUND OVER - HOST REVIEWING";
});

socket.on('settings_synced', function(state) {
    globalActiveAlliances = state.activeAlliances;
    renderScoreboard(state);
});

socket.on('round_started', function(state) {
    document.getElementById('display-status').innerText = "ROUND LIVE - SUBMIT ANSWERS";
    renderScoreboard(state);
});

socket.on('new_submission', function(submissions) {
    // Fetch fresh local copies
    socket.emit('init_state');
});

socket.on('round_stopped', function(state) {
    document.getElementById('display-status').innerText = "ROUND OVER - RESPONSES FROZEN";
    renderScoreboard(state);
});

socket.on('answers_released', function(data) {
    document.getElementById('display-status').innerText = "POINTS DISPATCHED & ANSWER DISCLOSED";
    socket.emit('init_state');
});

socket.on('powerup_activated', function(data) {
    renderScoreboard(data.gameState);
});

// Auto-fallback backup syncing loop interval ticking
socket.on('timer_tick', function(data) {
    // Silent keep-alive to catch state updates smoothly
});
