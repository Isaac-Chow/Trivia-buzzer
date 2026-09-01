const socket = io();
let myAlliance = null;
let selectedOptions = [];
const isHost = new URLSearchParams(window.location.search).get('role') === 'host';

let serverScoresCache = { Red: 0, Blue: 0, Yellow: 0, Green: 0 };
let currentSubmissions = [];
let hostModelAnswers = [];
let currentPhase = 'START'; 

// --- STATE MANAGEMENT TRACKING FLAGS ---
let hasSubmitted = false;
let roundEnded = false;

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
    // Safety Gate: If the round hasn't started or is already over, block all input clicks
    if (roundEnded) return;

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
    hasSubmitted = true; 
    socket.emit('submit_answer', { alliance: myAlliance, answers: selectedOptions });
    document.querySelectorAll('.option-btn').forEach(function(b) { b.disabled = true; });
    document.getElementById('submit-action-btn').disabled = true;
    document.getElementById('status-text').innerText = "Answer locked in! Waiting for host...";
}
function handleSmartButtonClick() {
    if (currentPhase === 'START') {
        startRound();
    } else if (currentPhase === 'COUNTDOWN') {
        triggerCountdown();
    } else if (currentPhase === 'RELEASE') {
        pushAndRelease();
    }
}

// Master execution hooks
function startRound() { 
    document.querySelectorAll('.matrix-box').forEach(cb => cb.checked = false);
    hostModelAnswers = [];
    socket.emit('start_round'); 
}

function triggerCountdown() { socket.emit('trigger_countdown'); }
function stopRound() { socket.emit('stop_round'); }

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
    socket.emit('update_scores', updated);
}

function recalculateScores() {
    if (!isHost) return;

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
            if (!firstCorrectFound) {
                calculatedDeltas[sub.alliance] = pFirst;
                firstCorrectFound = true;
            } else {
                calculatedDeltas[sub.alliance] = pCorrect;
            }
        } else {
            calculatedDeltas[sub.alliance] = pIncorrect;
        }
    });

    totalalliances.forEach(color => {
        const inputField = document.getElementById('edit-' + color);
        const badge = document.getElementById('badge-' + color);
        const baseScore = serverScoresCache[color] || 0;
        const delta = calculatedDeltas[color];
        
        inputField.value = baseScore + delta;

        if (delta !== 0) {
            badge.style.display = 'inline-block';
            badge.innerText = (delta > 0 ? '+' : '') + delta;
        } else {
            badge.style.display = 'none';
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

function updateSmartButtonUI(phase) {
    if (!isHost) return;
    currentPhase = phase;
    const btn = document.getElementById('host-state-btn');

    if (phase === 'START') {
        btn.innerText = "▶ Start Round";
        btn.style.backgroundColor = "#28a745";
        btn.style.color = "white";
        btn.disabled = false;
    } else if (phase === 'COUNTDOWN') {
        btn.innerText = "⏳ Trigger 3s Countdown";
        btn.style.backgroundColor = "#ffc107";
        btn.style.color = "black";
        btn.disabled = false;
    } else if (phase === 'RELEASE') {
        btn.innerText = "🚀 Push Scores & Release Answers";
        btn.style.backgroundColor = "#007bff";
        btn.style.color = "white";
        btn.disabled = false;
    } else if (phase === 'LOCKED') {
        btn.innerText = "🔒 Processing Countdown...";
        btn.style.backgroundColor = "#495057";
        btn.style.color = "#ced4da";
        btn.disabled = true;
    }
}
socket.on('init_state', function(state) {
    serverScoresCache = state.scores;
    currentSubmissions = state.submissions;
    hostModelAnswers = state.modelAnswers;
    updateSidebarScores(state.scores);

    if (isHost) {
        renderHostScores(state.scores);
        renderQueue(state.submissions);
        
        if (state.answersReleased) {
            updateSmartButtonUI('START');
        } else if (state.roundActive) {
            updateSmartButtonUI('COUNTDOWN');
        } else if (state.submissions.length > 0 || state.modelAnswers.length > 0) {
            updateSmartButtonUI('RELEASE');
        } else {
            updateSmartButtonUI('START');
        }
    } else {
        // Safe check for random connections mid-session
        if (!state.roundActive && !state.answersReleased) {
            roundEnded = false;
            hasSubmitted = false;
            const submitBtn = document.getElementById('submit-action-btn');
            submitBtn.className = "btn-submit";
            submitBtn.innerText = "None of the above";
            submitBtn.disabled = true;
            document.querySelectorAll('.option-btn').forEach(b => {
                b.className = "btn option-btn";
                b.disabled = true;
            });
        }
    }
});

socket.on('model_answers_updated', function(answers) {
    hostModelAnswers = answers;
    recalculateScores();
});

socket.on('round_started', function(state) {
    document.getElementById('status-text').innerText = "ROUND LIVE - Submit Answer";
    document.getElementById('countdown-banner').style.display = 'none';
    currentSubmissions = [];
    selectedOptions = [];
    
    // Total reset across flags
    hasSubmitted = false; 
    roundEnded = false; 
    
    const submitBtn = document.getElementById('submit-action-btn');
    submitBtn.innerText = "None of the above";
    submitBtn.className = "btn-submit"; 
    submitBtn.style.backgroundColor = ""; // Clear explicit color bugs
    
    document.querySelectorAll('.option-btn').forEach(function(b) {
        b.className = "btn option-btn"; 
        if (!isHost) b.disabled = false;
    });

    if (!isHost) {
        submitBtn.disabled = false;
    } else {
        renderQueue([]);
        updateSmartButtonUI('COUNTDOWN');
        recalculateScores();
    }
});

socket.on('countdown_tick', function(timeLeft) {
    const banner = document.getElementById('countdown-banner');
    const numDisplay = document.getElementById('countdown-number');
    if (!isHost) {
        banner.style.display = 'block';
        numDisplay.innerText = timeLeft;
    } else {
        updateSmartButtonUI('LOCKED');
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
    
    roundEnded = true; // Turn safety block ON
    
    if (isHost) {
        updateSmartButtonUI('RELEASE');
        recalculateScores();
    }
});

socket.on('new_submission', function(submissions) {
    currentSubmissions = submissions;
    if (isHost) {
        renderQueue(submissions);
        recalculateScores();
    }
});

socket.on('scores_updated', function(scores) {
    serverScoresCache = scores;
    updateSidebarScores(scores);
    if (isHost) renderHostScores(scores);
});

socket.on('answers_released', function(data) {
    serverScoresCache = data.scores;
    updateSidebarScores(data.scores);
    
    if (isHost) {
        updateSmartButtonUI('START');
    } else {
        if (!roundEnded) return;

        document.getElementById('status-text').innerText = "Results Released!";
        const correctAnswers = data.modelAnswers; 
        const submitBtn = document.getElementById('submit-action-btn');
        
        // Check if player genuinely timed out while the round was actively finishing
        const didNotSubmit = (hasSubmitted === false && roundEnded === true);
        
        // Track what they *actually* had clicked on their screen before the timeout wiped it for scoring
        const actualSelectionsSnapshot = [...selectedOptions];

        if (didNotSubmit) {
            selectedOptions = []; 
        }

        const noneIsCorrect = (correctAnswers.length === 0);
        const playerChoseNone = (selectedOptions.length === 0);
        const actualPlayerChoseNone = (actualSelectionsSnapshot.length === 0);

        submitBtn.className = "btn-submit";

        // 1. Grade the A, B, C, D Grid Buttons
        document.querySelectorAll('.option-btn').forEach(btn => {
            const letter = btn.getAttribute('data-opt');
            const wasClicked = selectedOptions.includes(letter); 
            const isCorrectOption = correctAnswers.includes(letter);
            btn.className = "btn option-btn";
            
            if (isCorrectOption) {
                if (wasClicked) btn.classList.add('graded-correct'); // Green
                else btn.classList.add('graded-missing'); // Yellow
            } else {
                if (wasClicked) btn.classList.add('graded-incorrect'); // Red
            }
        });

        // 2. Grade the Bottom Button Track (With absolute precision for unsubmitted states)
        if (didNotSubmit) {
            // IF THEY TIMED OUT:
            if (actualPlayerChoseNone) {
                // If they legitimately had NOTHING selected, their choice was "None of the above"
                submitBtn.innerText = "None of the above";
                if (noneIsCorrect) {
                    submitBtn.classList.add('graded-correct'); // Green if nothing was indeed correct
                } else {
                    submitBtn.classList.add('graded-missing'); // Yellow if nothing was wrong
                }
            } else {
                // If they HAD options clicked (like A) but missed the submit button:
                // Keep the text reading "Submit" and let it drop to neutral GREY so it doesn't fight option A!
                submitBtn.innerText = "Submit";
                submitBtn.style.backgroundColor = ""; 
            }
        } else {
            // IF THEY SUBMITTED NORMALLY:
            if (noneIsCorrect) {
                submitBtn.innerText = "None of the above";
                if (playerChoseNone) submitBtn.classList.add('graded-correct'); 
                else submitBtn.classList.add('graded-missing');
            } else {
                if (playerChoseNone) {
                    submitBtn.innerText = "None of the above";
                    submitBtn.classList.add('graded-missing'); 
                } else {
                    submitBtn.innerText = "Submit";
                }
            }
        }
        
        submitBtn.disabled = true;
        document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
    }
});


function updateSidebarScores(scores) {
    const wrapper = document.getElementById('participant-scores');
    if (!wrapper) return;
    let html = '';
    for (const color in scores) {
        let displayColor = color.toLowerCase();
        if (color === 'Yellow') displayColor = '#ffc107';
        html += '<div class="score-row"><span style="color:' + displayColor + '">● ' + color + '</span><strong>' + scores[color] + ' pts</strong></div>';
    }
    wrapper.innerHTML = html;
}

function renderHostScores(scores) {
    const container = document.getElementById('host-score-modifiers');
    let html = '';
    for (const color in scores) {
        html += '<div class="score-edit-row"><div><span>' + color + ': </span><span id="badge-' + color + '" class="math-badge" style="display:none;"></span></div><input type="number" id="edit-' + color + '" class="score-edit-input" value="' + scores[color] + '"></div>';
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
    submissions.forEach((sub, index) => {
        let colorHex = '#28a745';
        if (sub.alliance === 'Red') colorHex = '#dc3545';
        if (sub.alliance === 'Blue') colorHex = '#007bff';
        if (sub.alliance === 'Yellow') colorHex = '#ffc107';
        const displayAns = sub.answers.length > 0 ? sub.answers.join(', ') : 'None of the above';
        html += '<div class="queue-item" style="border-left-color: ' + colorHex + '"><div><strong>#' + (index + 1) + ' ' + sub.alliance + ' Alliance</strong></div><div style="font-size:14px; color:#b3b3b3;">Selected: [' + displayAns + ']</div><div style="font-size:11px; color:#777777;">Time logged: ' + sub.time + '</div></div>';
    });
    container.innerHTML = html;
}
