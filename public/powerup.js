const socket = io();
let myAlliance = null;
let currentSettings = null;
let currentGameState = null;

window.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlAlliance = urlParams.get('alliance');
    if (urlAlliance) setPowerUpAlliance(urlAlliance);
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
    
    const roundLive = currentGameState.roundActive === true;
    const countdownRunning = currentGameState.timerRunning === true;
    const answersReleased = currentGameState.answersReleased === true;
    
    const hasSubmitted = currentGameState.submissions && currentGameState.submissions.some(s => s.alliance === myAlliance);
    const hasTimedOut = currentGameState.teamTimers && currentGameState.teamTimers[myAlliance] <= 0;

    // 1. EXTRA TIME CARD
    const extraTimeConfig = currentSettings.extraTime;
    if (extraTimeConfig && extraTimeConfig.maxUses > 0) {
        const remUses = currentGameState.teamPowerUps[myAlliance].extraTime.remaining;
        const extraTimeDisabled = !countdownRunning || remUses <= 0 || hasSubmitted || hasTimedOut;
        
        htmlPayload += '<div class="powerup-item" style="border-left-color: #ffc107;">' +
            '<div><span class="powerup-name">⏳ Extra Time</span><span class="powerup-count">Remaining: <strong>' + remUses + '/' + extraTimeConfig.maxUses + '</strong></span></div>' +
            '<button class="btn-activate" ' + (extraTimeDisabled ? 'disabled' : '') + ' onclick="deployPower(\'extraTime\')">+' + extraTimeConfig.value + 's</button>' +
        '</div>';
    }

    // 2. STOP!!! CARD
    const stopConfig = currentSettings.stopCard;
    if (stopConfig && stopConfig.maxUses > 0) {
        const remUses = currentGameState.teamPowerUps[myAlliance].stopCard ? currentGameState.teamPowerUps[myAlliance].stopCard.remaining : 0;
        const stopDisabled = !roundLive || remUses <= 0;
        
        htmlPayload += '<div class="powerup-item" style="border-left-color: #dc3545;">' +
            '<div><span class="powerup-name" style="color:#dc3545;">🛑 STOP!!!</span><span class="powerup-count">Remaining: <strong>' + remUses + '/' + stopConfig.maxUses + '</strong></span></div>' +
            '<button class="btn-activate" style="background:#dc3545; color:white;" ' + (stopDisabled ? 'disabled' : '') + ' onclick="deployPower(\'stopCard\')">HALT</button>' +
        '</div>';
    }

        // 3. DOUBLE OR DEDUCT RISK CARD
    const riskConfig = currentSettings.doubleRisk;
    if (riskConfig && riskConfig.maxUses > 0) {
        const remUses = currentGameState.teamPowerUps[myAlliance].doubleRisk ? currentGameState.teamPowerUps[myAlliance].doubleRisk.remaining : 0;
        const isAlreadyActive = currentGameState.teamPowerUps[myAlliance].doubleRisk ? currentGameState.teamPowerUps[myAlliance].doubleRisk.activeInRound : false;
        
        // TARGET SAFETY GATE: Lock it if answers are released OR if we are in an idle state before a round starts
        // We know we are in an idle pre-round state if roundActive is false AND no entries have been logged in the queue yet.
        const isPreRoundIdle = (!currentGameState.roundActive && (!currentGameState.submissions || currentGameState.submissions.length === 0));
        
        const riskDisabled = answersReleased || remUses <= 0 || isAlreadyActive || isPreRoundIdle;
        
        let buttonText = "BET";
        let noticeSpan = "";
        
        if (isAlreadyActive) {
            buttonText = "ACTIVE";
            noticeSpan = '<span style="font-size:11px; color:#28a745; display:block; font-weight:bold; margin-top:2px;">[RISK MULTIPLIER ACTIVE]</span>';
        }

        htmlPayload += '<div class="powerup-item" style="border-left-color: #28a745;">' +
            '<div>' +
                '<span class="powerup-name" style="color:#28a745;">🎲 Double / Deduct</span>' +
                '<span class="powerup-count">Remaining: <strong>' + remUses + '/' + riskConfig.maxUses + '</strong></span>' +
                noticeSpan +
            '</div>' +
            '<button class="btn-activate" style="background:#28a745; color:white;" ' + (riskDisabled ? 'disabled' : '') + ' onclick="deployPower(\'doubleRisk\')">' + buttonText + '</button>' +
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

socket.on('init_state', function(state) { currentGameState = state; currentSettings = state.powerUpSettings; renderConsole(); });
socket.on('settings_synced', function(state) { currentGameState = state; currentSettings = state.powerUpSettings; renderConsole(); });
socket.on('round_started', function(state) { currentGameState = state; renderConsole(); });
socket.on('countdown_started', function(state) { currentGameState = state; renderConsole(); });
socket.on('timer_tick', function(data) { if (currentGameState) currentGameState.teamTimers = data.teamTimers; });
socket.on('round_stopped', function(state) { currentGameState = state; renderConsole(); });
socket.on('powerup_activated', function(data) { currentGameState = data.gameState; renderConsole(); });
