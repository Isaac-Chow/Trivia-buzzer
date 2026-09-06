const socket = io();
let serverScoresCache = { Red: 0, Blue: 0, Yellow: 0, Green: 0 };
let currentSubmissions = [];
let hostModelAnswers = [];
let currentPhase = 'START';
let globalActiveAlliances = ['Red', 'Blue', 'Yellow', 'Green'];
let currentGameState = null;

function switchTab(tabId) {
    document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    event.currentTarget.classList.add('active');
    document.getElementById(tabId).classList.add('active');
}

function handleSmartButtonClick() {
    if (currentPhase === 'START') { startRound(); }
    else if (currentPhase === 'COUNTDOWN') { triggerCountdown(); }
    else if (currentPhase === 'RELEASE') { pushAndRelease(); }
}

function startRound() { 
    document.querySelectorAll('.matrix-box').forEach(cb => cb.checked = false);
    hostModelAnswers = [];
    const timeOverride = document.getElementById('host-round-override').value;
    socket.emit('start_round', timeOverride); 
}

function triggerCountdown() { socket.emit('trigger_countdown'); }
function stopRound() { socket.emit('stop_round'); }

function pushSettingsUpdate() {
    const defTime = document.getElementById('setting-default-time').value;
    const activeTeams = [];
    document.querySelectorAll('.active-alliance-cb:checked').forEach(cb => activeTeams.push(cb.value));
    
    const extraTimeUses = parseInt(document.getElementById('setting-extratime-uses').value) || 0;
    const extraTimeValue = parseInt(document.getElementById('setting-extratime-value').value) || 20;
    const stopCardUses = parseInt(document.getElementById('setting-stopcard-uses').value) || 0;
    
    const doubleRiskUses = parseInt(document.getElementById('setting-doublerisk-uses').value) || 0;
    const doubleRiskPenalty = parseInt(document.getElementById('setting-doublerisk-penalty').value) || 5;
    
    socket.emit('update_settings', { 
        defaultTime: defTime, 
        scores: serverScoresCache,
        activeAlliances: activeTeams,
        powerUpSettings: {
            extraTime: { maxUses: extraTimeUses, value: extraTimeValue },
            stopCard: { maxUses: stopCardUses },
            doubleRisk: { maxUses: doubleRiskUses, penalty: doubleRiskPenalty }
        }
    });
}

function modelAnswerChanged() {
    const checked = [];
    document.querySelectorAll('.matrix-box:checked').forEach(cb => checked.push(cb.value));
    hostModelAnswers = checked;
    socket.emit('update_model_answers', checked);
    recalculateScores();
}

function saveScores() {
    const updated = {};
    ['Red', 'Blue', 'Yellow', 'Green'].forEach(color => {
        const val = parseInt(document.getElementById('edit-' + color).value);
        updated[color] = isNaN(val) ? 0 : val;
    });
    serverScoresCache = updated;
    pushSettingsUpdate();
}

function recalculateScores() {
    const pCorrect = parseInt(document.getElementById('rule-correct').value) || 0;
    const pFirst = parseInt(document.getElementById('rule-first').value) || 0;
    const pIncorrect = parseInt(document.getElementById('rule-incorrect').value) || 0;
    const pNoAnswer = parseInt(document.getElementById('rule-noanswer').value) || 0;

    const totalalliances = ['Red', 'Blue', 'Yellow', 'Green'];
    const calculatedDeltas = { Red: pNoAnswer, Blue: pNoAnswer, Yellow: pNoAnswer, Green: pNoAnswer };
    let firstCorrectFound = false;

    const match = (arr1, arr2) => {
        if (arr1.length !== arr2.length) return false;
        return arr1.every(val => arr2.includes(val));
    };

    currentSubmissions.forEach(sub => {
        const isCorrect = match(sub.answers, hostModelAnswers);
        if (isCorrect) {
            if (!firstCorrectFound) { calculatedDeltas[sub.alliance] = pFirst; firstCorrectFound = true; }
            else { calculatedDeltas[sub.alliance] = pCorrect; }
        } else { calculatedDeltas[sub.alliance] = pIncorrect; }
    });

    totalalliances.forEach(color => {
        const inputField = document.getElementById('edit-' + color);
        const badge = document.getElementById('badge-' + color);
        const baseScore = serverScoresCache[color] || 0;
        
        let delta = calculatedDeltas[color];
        let formulaLabel = "";

        const isDoubleRiskActive = currentGameState && currentGameState.teamPowerUps && 
                                   currentGameState.teamPowerUps[color] && currentGameState.teamPowerUps[color].doubleRisk &&
                                   currentGameState.teamPowerUps[color].doubleRisk.activeInRound;

        if (isDoubleRiskActive) {
            const isCorrect = currentSubmissions.some(s => s.alliance === color && match(s.answers, hostModelAnswers));
            const hasSubmitted = currentSubmissions.some(s => s.alliance === color);

            // Evaluates retroactively even if they haven't submitted (treated as wrong/no answer penalty)
            if (hasSubmitted) {
                if (isCorrect) {
                    formulaLabel = delta + "x2";
                    delta = delta * 2;
                } else {
                    const penaltySetting = currentGameState.powerUpSettings.doubleRisk.penalty || 5;
                    formulaLabel = "-" + penaltySetting;
                    delta = -penaltySetting;
                }
            } else {
                const penaltySetting = currentGameState.powerUpSettings.doubleRisk.penalty || 5;
                formulaLabel = "-" + penaltySetting;
                delta = -penaltySetting;
            }
        } else {
            formulaLabel = (delta > 0 ? "+" : "") + delta;
        }

        if(inputField) inputField.value = baseScore + delta;
        if(badge) {
            // FIX: Hide badge if final point addition delta resolves to 0 or formula is a neutral "+0"
            if (delta !== 0 && formulaLabel !== "+0" && formulaLabel !== "-0") { 
                badge.style.display = 'inline-block'; 
                badge.innerText = formulaLabel; 
            } else { 
                badge.style.display = 'none'; 
            }
        }
    });
}

function pushAndRelease() {
    const finalized = {};
    ['Red', 'Blue', 'Yellow', 'Green'].forEach(color => {
        finalized[color] = parseInt(document.getElementById('edit-' + color).value) || 0;
    });
    serverScoresCache = finalized;
    socket.emit('push_and_release', { finalScores: finalized });
}

function handleManualPowerChange(color, type, value) {
    const targetCount = parseInt(value);
    socket.emit('manual_powerup_update', { alliance: color, type: type, count: targetCount });
}
function updateSmartButtonUI(phase) {
    currentPhase = phase;
    const btn = document.getElementById('host-state-btn');
    if (!btn) return;

    if (phase === 'START') {
        btn.innerText = "▶ Start Round"; btn.style.backgroundColor = "#28a745"; btn.style.color = "white"; btn.disabled = false;
    } else if (phase === 'COUNTDOWN') {
        btn.innerText = "⏳ Trigger Countdown Clock"; btn.style.backgroundColor = "#ffc107"; btn.style.color = "black"; btn.disabled = false;
    } else if (phase === 'RELEASE') {
        btn.innerText = "🚀 Push Scores & Release Answers"; btn.style.backgroundColor = "#007bff"; btn.style.color = "white"; btn.disabled = false;
    }
}

function renderUIBasedOnActiveAlliances(activeTeams) {
    globalActiveAlliances = activeTeams;
    ['Red', 'Blue', 'Yellow', 'Green'].forEach(color => {
        const timerCard = document.getElementById('h-timer-' + color);
        const cb = document.querySelector(`.active-alliance-cb[value="${color}"]`);
        if (cb) cb.checked = activeTeams.includes(color);
        if (timerCard) timerCard.style.display = activeTeams.includes(color) ? 'block' : 'none';
    });
}

function openPowerUpModal(color) {
    if (!currentGameState || !currentGameState.teamPowerUps || !currentGameState.teamPowerUps[color]) return;
    
    const currentExtra = currentGameState.teamPowerUps[color].extraTime.remaining;
    const currentStop = currentGameState.teamPowerUps[color].stopCard ? currentGameState.teamPowerUps[color].stopCard.remaining : 0;
    const currentRisk = currentGameState.teamPowerUps[color].doubleRisk ? currentGameState.teamPowerUps[color].doubleRisk.remaining : 0;
    
    const menu = "Type 1 to edit 'Extra Time' (" + currentExtra + " left)\n" +
                 "Type 2 to edit 'STOP!!!' (" + currentStop + " left)\n" +
                 "Type 3 to edit 'Double Risk' (" + currentRisk + " left):";
    const targetItem = prompt(menu, "1");
    
    if (targetItem === "1") {
        const count = prompt("Enter new 'Extra Time' count:", currentExtra);
        if (count !== null) handleManualPowerChange(color, 'extraTime', count);
    } else if (targetItem === "2") {
        const count = prompt("Enter new 'STOP!!!' count:", currentStop);
        if (count !== null) handleManualPowerChange(color, 'stopCard', count);
    } else if (targetItem === "3") {
        const count = prompt("Enter new 'Double Risk' count:", currentRisk);
        if (count !== null) handleManualPowerChange(color, 'doubleRisk', count);
    }
}

socket.on('init_state', function(state) {
    currentGameState = state;
    serverScoresCache = state.scores;
    currentSubmissions = state.submissions;
    hostModelAnswers = state.modelAnswers;
    
    document.getElementById('setting-default-time').value = state.defaultTime;
    document.getElementById('host-round-override').value = state.nextRoundTime;
    
    if (state.powerUpSettings) {
        if(state.powerUpSettings.extraTime) document.getElementById('setting-extratime-uses').value = state.powerUpSettings.extraTime.maxUses;
        if(state.powerUpSettings.extraTime) document.getElementById('setting-extratime-value').value = state.powerUpSettings.extraTime.value;
        if(state.powerUpSettings.stopCard) document.getElementById('setting-stopcard-uses').value = state.powerUpSettings.stopCard.maxUses;
        if(state.powerUpSettings.doubleRisk) {
            document.getElementById('setting-doublerisk-uses').value = state.powerUpSettings.doubleRisk.maxUses;
            document.getElementById('setting-doublerisk-penalty').value = state.powerUpSettings.doubleRisk.penalty;
        }
    }
    
    renderHostScores(state.scores);
    renderQueue(state.submissions);
    renderUIBasedOnActiveAlliances(state.activeAlliances);
    
    ['Red', 'Blue', 'Yellow', 'Green'].forEach(color => {
        const element = document.getElementById('time-' + color);
        if (element) element.innerText = state.teamTimers[color];
    });

    if (state.answersReleased) { updateSmartButtonUI('START'); }
    else if (state.roundActive) { updateSmartButtonUI('COUNTDOWN'); }
    else if (state.submissions.length > 0 || state.modelAnswers.length > 0) { updateSmartButtonUI('RELEASE'); }
    else { updateSmartButtonUI('START'); }
});

socket.on('settings_synced', function(state) {
    currentGameState = state;
    serverScoresCache = state.scores;
    document.getElementById('setting-default-time').value = state.defaultTime;
    
    if (state.powerUpSettings) {
        if(state.powerUpSettings.extraTime) document.getElementById('setting-extratime-uses').value = state.powerUpSettings.extraTime.maxUses;
        if(state.powerUpSettings.extraTime) document.getElementById('setting-extratime-value').value = state.powerUpSettings.extraTime.value;
        if(state.powerUpSettings.stopCard) document.getElementById('setting-stopcard-uses').value = state.powerUpSettings.stopCard.maxUses;
        if(state.powerUpSettings.doubleRisk) {
            document.getElementById('setting-doublerisk-uses').value = state.powerUpSettings.doubleRisk.maxUses;
            document.getElementById('setting-doublerisk-penalty').value = state.powerUpSettings.doubleRisk.penalty;
        }
    }
    
    renderUIBasedOnActiveAlliances(state.activeAlliances);
    renderHostScores(state.scores);
    recalculateScores();
});

socket.on('model_answers_updated', function(answers) { hostModelAnswers = answers; recalculateScores(); });

socket.on('round_started', function(state) {
    currentGameState = state;
    document.getElementById('host-round-override').value = state.nextRoundTime;
    ['Red', 'Blue', 'Yellow', 'Green'].forEach(color => {
        const card = document.getElementById('h-timer-' + color);
        if (card) card.className = "timer-wrapper " + color.toLowerCase() + "-border";
        const element = document.getElementById('time-' + color);
        if (element) element.innerText = state.nextRoundTime;
    });
    currentSubmissions = []; hostModelAnswers = [];
    renderQueue([]); updateSmartButtonUI('COUNTDOWN'); recalculateScores();
    renderUIBasedOnActiveAlliances(state.activeAlliances);
});

socket.on('countdown_started', function(state) {
    globalActiveAlliances.forEach(color => {
        const card = document.getElementById('h-timer-' + color);
        if (card) card.classList.add('timer-active');
    });
});

socket.on('timer_tick', function(data) {
    const timers = data.teamTimers;
    ['Red', 'Blue', 'Yellow', 'Green'].forEach(color => {
        const element = document.getElementById('time-' + color);
        if (element) element.innerText = timers[color];
    });
});

socket.on('round_stopped', function(state) {
    currentGameState = state;
    document.getElementById('host-round-override').value = state.nextRoundTime;
    ['Red', 'Blue', 'Yellow', 'Green'].forEach(color => {
        const card = document.getElementById('h-timer-' + color);
        if (card) card.className = "timer-wrapper " + color.toLowerCase() + "-border";
    });
    updateSmartButtonUI('RELEASE'); recalculateScores();
    renderUIBasedOnActiveAlliances(state.activeAlliances);
});

socket.on('new_submission', function(submissions) {
    currentSubmissions = submissions; renderQueue(submissions); recalculateScores();
});

socket.on('answers_released', function(data) {
    serverScoresCache = data.scores; renderHostScores(data.scores); updateSmartButtonUI('START');
});

socket.on('powerup_activated', function(data) {
    currentGameState = data.gameState; 
    renderHostScores(data.gameState.scores);
    if(currentSubmissions.length > 0) renderQueue(currentSubmissions);
    recalculateScores();
});

function renderHostScores(scores) {
    const container = document.getElementById('host-score-modifiers'); if (!container) return;
    let html = '';
    const hasPowerUpData = currentGameState && currentGameState.teamPowerUps;

    for (const color in scores) {
        const isHidden = !globalActiveAlliances.includes(color) ? 'style="display:none;"' : '';
        html += '<div class="score-edit-row" id="row-wrapper-' + color + '" ' + isHidden + ' style="gap:10px;">' +
                    '<div style="flex:1; display:flex; flex-direction:column; gap:2px;">' +
                        '<span style="font-weight:bold;">' + color + ' Team </span>' +
                        '<span id="badge-' + color + '" class="math-badge" style="display:none; width:fit-content; margin-left:0;"></span>' +
                        '<span style="font-size:11px; color:#ffc107; cursor:pointer; text-decoration:underline;" onclick="openPowerUpModal(\'' + color + '\')">⚡ Items Options</span>' +
                    '</div>' +
                    '<div style="display:flex; flex-direction:column; align-items:center; gap:2px;">' +
                        '<label style="font-size:10px; color:#777;">PTS</label>' +
                        '<input type="number" id="edit-' + color + '" class="score-edit-input" value="' + scores[color] + '" oninput="saveScores()">' +
                    '</div>' +
                '</div>';
    }
    container.innerHTML = html;
}

function renderQueue(submissions) {
    const container = document.getElementById('submission-queue'); if(!container) return;
    if (submissions.length === 0) { container.innerHTML = '<p style="color:#777; text-align:center; padding: 20px;">No entries submitted yet.</p>'; return; }
    let html = '';
    submissions.forEach(function(sub, index) {
        let colorHex = '#28a745';
        if (sub.alliance === 'Red') colorHex = '#007bff'; if (sub.alliance === 'Blue') colorHex = '#dc3545'; if (sub.alliance === 'Yellow') colorHex = '#ffc107';
        const logTag = sub.powerUsed ? sub.powerUsed : "";
        
        html += '<div class="queue-item" style="border-left: 6px solid ' + colorHex + '; padding: 12px; margin-bottom: 10px; background: #2a2a2a; border-radius: 6px;">' +
'#' + (index + 1) + ' ' + sub.alliance + ' Alliance ' + logTag + '' +'Selected: [' + sub.answers.join(', ') + ']' +'Precision Logged: ' + sub.time + '' +'';});container.innerHTML = html;}