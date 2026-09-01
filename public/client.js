const socket = io();
let myAlliance = null;
let selectedOptions = [];
const isHost = new URLSearchParams(window.location.search).get('role') === 'host';

if (isHost) {
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('host-ui').style.display = 'block';
}

function selectAlliance(color) {
    myAlliance = color;
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('participant-ui').style.display = 'flex';
    
    const banner = document.getElementById('alliance-banner');
    banner.innerText = color + " Alliance";
    
    if (color === 'Red') { banner.style.backgroundColor = '#dc3545'; banner.style.color = 'white'; }
    else if (color === 'Blue') { banner.style.backgroundColor = '#007bff'; banner.style.color = 'white'; }
    else if (color === 'Yellow') { banner.style.backgroundColor = '#ffc107'; banner.style.color = 'black'; }
    else if (color === 'Green') { banner.style.backgroundColor = '#28a745'; banner.style.color = 'white'; }
}

function toggleOption(letter) {
    const btn = document.querySelector(".option-btn[data-opt='" + letter + "']");
    const index = selectedOptions.indexOf(letter);
    
    if (index > -1) {
        selectedOptions.splice(index, 1);
        btn.classList.remove('selected');
    } else {
        selectedOptions.push(letter);
        btn.classList.add('selected');
    }

    const submitBtn = document.getElementById('submit-action-btn');
    if (selectedOptions.length > 0) {
        submitBtn.innerText = "Submit";
    } else {
        submitBtn.innerText = "None of the above";
    }
}

function submitAnswer() {
    socket.emit('submit_answer', { alliance: myAlliance, answers: selectedOptions });
    document.querySelectorAll('.option-btn').forEach(function(b) { b.disabled = true; });
    document.getElementById('submit-action-btn').disabled = true;
    document.getElementById('status-text').innerText = "Answer locked in! Waiting for host...";
}

// Host Action Triggers
function startRound() { socket.emit('start_round'); }
function triggerCountdown() { socket.emit('trigger_countdown'); }
function stopRound() { socket.emit('stop_round'); }

function saveScores() {
    const updated = {};
    const alliances = ['Red', 'Blue', 'Yellow', 'Green'];
    alliances.forEach(function(color) {
        const val = parseInt(document.getElementById('edit-' + color).value);
        updated[color] = isNaN(val) ? 0 : val;
    });
    socket.emit('update_scores', updated);
}

// WebSocket Event Listeners
socket.on('init_state', function(state) {
    updateSidebarScores(state.scores);
    if (isHost) {
        renderHostScores(state.scores);
        renderQueue(state.submissions);
    }
});

socket.on('round_started', function(state) {
    document.getElementById('status-text').innerText = "ROUND LIVE - Submit Answer";
    document.getElementById('countdown-banner').style.display = 'none';
    selectedOptions = [];
    
    const submitBtn = document.getElementById('submit-action-btn');
    submitBtn.innerText = "None of the above";
    
    if (!isHost) {
        document.querySelectorAll('.option-btn').forEach(function(b) {
            b.disabled = false;
            b.classList.remove('selected');
        });
        submitBtn.disabled = false;
    } else {
        renderQueue([]);
    }
});

socket.on('countdown_tick', function(timeLeft) {
    const banner = document.getElementById('countdown-banner');
    const numDisplay = document.getElementById('countdown-number');
    
    if (!isHost) {
        banner.style.display = 'block';
        numDisplay.innerText = timeLeft;
    }
});

socket.on('countdown_finished', function() {
    document.getElementById('countdown-banner').style.display = 'none';
});

socket.on('round_stopped', function(state) {
    document.getElementById('countdown-banner').style.display = 'none';
    document.getElementById('status-text').innerText = "Round over! Processing entries...";
    document.querySelectorAll('.option-btn').forEach(function(b) { b.disabled = true; });
    document.getElementById('submit-action-btn').disabled = true;
});

socket.on('new_submission', function(submissions) {
    if (isHost) renderQueue(submissions);
});

socket.on('scores_updated', function(scores) {
    updateSidebarScores(scores);
    if (isHost) renderHostScores(scores);
});

function updateSidebarScores(scores) {
    const wrapper = document.getElementById('participant-scores');
    if (!wrapper) return;
    
    let html = '';
    for (const color in scores) {
        let displayColor = color.toLowerCase();
        if (color === 'Yellow') displayColor = '#ffc107';
        html += '<div class="score-row">' +
                '<span style="color:' + displayColor + '">● ' + color + '</span>' +
                '<strong>' + scores[color] + ' pts</strong>' +
            '</div>';
    }
    wrapper.innerHTML = html;
}

function renderHostScores(scores) {
    const container = document.getElementById('host-score-modifiers');
    let html = '';
    for (const color in scores) {
        html += '<div class="score-edit-row">' +
                '<span>' + color + ' Alliance:</span>' +
                '<input type="number" id="edit-' + color + '" class="score-edit-input" value="' + scores[color] + '">' +
            '</div>';
    }
    container.innerHTML = html;
}

function renderQueue(submissions) {
    const container = document.getElementById('submission-queue');
    if (submissions.length === 0) {
        container.innerHTML = '<p style="color:#777; text-align:center; padding: 20px;">No entries submitted yet.</p>';
        return;
    }
    
    let html = '';
    submissions.forEach(function(sub, index) {
        let colorHex = '#28a745';
        if (sub.alliance === 'Red') colorHex = '#dc3545';
        if (sub.alliance === 'Blue') colorHex = '#007bff';
        if (sub.alliance === 'Yellow') colorHex = '#ffc107';
        
        const displayAns = sub.answers.length > 0 ? sub.answers.join(', ') : 'None of the above';
        
        html += '<div class="queue-item" style="border-left-color: ' + colorHex + '">' +
                '<div><strong>#' + (index + 1) + ' ' + sub.alliance + ' Alliance</strong></div>' +
                '<div style="font-size:14px; color:#b3b3b3;">Selected: [' + displayAns + ']</div>' +
                '<div style="font-size:11px; color:#777777;">Time logged: ' + sub.time + '</div>' +
            '</div>';
    });
    container.innerHTML = html;
}
