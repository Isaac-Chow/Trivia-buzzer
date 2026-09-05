const socket = io();
let myAlliance = null;
let currentSettings = null;
let currentGameState = null;

window.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlAlliance = urlParams.get('alliance');
    if (urlAlliance) {
        setPowerUpAlliance(urlAlliance);
    }
});

function setPowerUpAlliance(color) {
    myAlliance = color;
    document.getElementById('powerup-setup').style.display = 'none';
    const consoleBox = document.getElementById('powerup-console');
    consoleBox.style.display = 'block';
    
    const banner = document.getElementById('console-banner');
    banner.innerText = color + " Power-Ups";
    banner.style.backgroundColor = color === 'Red' ? '#dc3545' : color === 'Blue' ? '#007bff' : color === 'Yellow' ? '#ffc107' : '#28a745';
    banner.style.color = color === 'Yellow' ? 'black' : 'white';
    
    socket.emit('init_state');
}

function renderConsole() {
    const list = document.getElementById('powerups-available-list');
    if (!list || !currentSettings || !myAlliance || !currentGameState) return;

    let htmlPayload = '';
    
    // Core game state checks from the server
    const globalRoundLive = currentGameState.roundActive === true; // Round is live (even if clock isn't ticking yet)
    const countdownRunning = currentGameState.timerRunning === true; // Countdown has actively started
    
    const hasSubmitted = currentGameState.submissions && currentGameState.submissions.some(s => s.alliance === myAlliance);
    const hasTimedOut = currentGameState.teamTimers && currentGameState.teamTimers[myAlliance] <= 0;

    // 1. Process Item 1: Extra Time Card Row (Only works while countdown is running for them)
    const extraTimeConfig = currentSettings.extraTime;
    if (extraTimeConfig && extraTimeConfig.maxUses > 0) {
        const remUses = currentGameState.teamPowerUps[myAlliance].extraTime.remaining;
        
        // Capped Rules: Lock out if countdown isn't running, out of uses, OR if they already submitted/timed out
        const extraTimeDisabled = !countdownRunning || remUses <= 0 || hasSubmitted || hasTimedOut;
        
        htmlPayload += '<div class="powerup-item" style="border-left-color: #ffc107;">' +
            '<div><span class="powerup-name">⏳ Extra Time</span><span class="powerup-count">Remaining: <strong>' + remUses + '/' + extraTimeConfig.maxUses + '</strong></span></div>' +
            '<button class="btn-activate" ' + (extraTimeDisabled ? 'disabled' : '') + ' onclick="deployPower(\'extraTime\')">+' + extraTimeConfig.value + 's</button>' +
        '</div>';
    }

    // 2. Process Item 2: STOP!!! Panic Button Card Row (Active immediately when round starts)
    const stopConfig = currentSettings.stopCard;
    if (stopConfig && stopConfig.maxUses > 0) {
        const remUses = (currentGameState.teamPowerUps[myAlliance].stopCard) ? currentGameState.teamPowerUps[myAlliance].stopCard.remaining : 0;
        
        // Capped Rules: Unlock the moment the round goes active, checking only if they have inventory uses left
        const stopDisabled = !globalRoundLive || remUses <= 0;
        
        htmlPayload += '<div class="powerup-item" style="border-left-color: #dc3545;">' +
            '<div><span class="powerup-name" style="color:#dc3545;">🛑 STOP!!!</span><span class="powerup-count">Remaining: <strong>' + remUses + '/' + stopConfig.maxUses + '</strong></span></div>' +
            '<button class="btn-activate" style="background:#dc3545; color:white;" ' + (stopDisabled ? 'disabled' : '') + ' onclick="deployPower(\'stopCard\')">HALT</button>' +
        '</div>';
    }

    if (htmlPayload === '') {
        list.innerHTML = '<div style="color:#666; font-size:14px; padding:20px; text-align:center;">No power-ups configured.</div>';
    } else {
        list.innerHTML = htmlPayload;
    }
}




function deployPower(type) {
    if (!myAlliance) return;
    socket.emit('activate_powerup', { alliance: myAlliance, type: type });
}

socket.on('init_state', function(state) {
    currentGameState = state;
    currentSettings = state.powerUpSettings;
    renderConsole();
});

socket.on('settings_synced', function(state) {
    currentGameState = state;
    currentSettings = state.powerUpSettings;
    renderConsole();
});

socket.on('round_started', function(state) {
    currentGameState = state;
    renderConsole();
});

socket.on('countdown_started', function(state) {
    currentGameState = state;
    renderConsole();
});

socket.on('timer_tick', function(data) {
    if (currentGameState) currentGameState.teamTimers = data.teamTimers;
});

socket.on('round_stopped', function(state) {
    currentGameState = state;
    renderConsole();
});

// NEW EVENT CHANNEL: Captures an active capability launch from the server and force re-renders numbers
socket.on('powerup_activated', function(data) {
    currentGameState = data.gameState;
    renderConsole();
});
