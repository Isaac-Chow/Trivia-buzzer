const socket = io();
let myAlliance = null;
let selectedOptions = [];
let hasSubmitted = false;
let roundEnded = false;
let globalActiveAlliances = ['Red', 'Blue', 'Yellow', 'Green'];
let iframeOpen = false;

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
    if (roundEnded || hasSubmitted) return;

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
    document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
    document.getElementById('submit-action-btn').disabled = true;
    document.getElementById('status-text').innerText = "Answer locked in! Waiting for host...";
}

function renderPlayerSelectionScreen(activeTeams) {
    globalActiveAlliances = activeTeams;
    ['Red', 'Blue', 'Yellow', 'Green'].forEach(color => {
        const pickBtn = document.getElementById('pick-' + color);
        if (pickBtn) {
            pickBtn.style.display = activeTeams.includes(color) ? 'block' : 'none';
        }
    });
}

function togglePowerUpIframe() {
    iframeOpen = !iframeOpen;
    const iframe = document.getElementById('p-powerup-iframe');
    const toggleBtn = document.getElementById('toggle-powerup-btn');
    
    if (iframeOpen) {
        // APPEND THE SELECTION PARAMETER SO THE IFRAME JUMPS AHEAD AUTO
        iframe.src = "/powerup?alliance=" + myAlliance;
        iframe.style.display = "block";
        toggleBtn.innerText = "❌ Hide Power-Ups";
    } else {
        iframe.style.display = "none";
        iframe.src = "";
        toggleBtn.innerText = "⚡ Show Power-Ups";
    }
}

socket.on('init_state', function(state) {
    globalActiveAlliances = state.activeAlliances;
    updateSidebarScores(state.scores);
    renderPlayerSelectionScreen(state.activeAlliances);

    if (myAlliance) {
        document.getElementById('p-time-count').innerText = state.teamTimers[myAlliance];
    }
    if (!state.roundActive && !state.answersReleased) {
        roundEnded = false; hasSubmitted = false;
        document.getElementById('submit-action-btn').disabled = true;
        document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
    }
});

socket.on('settings_synced', function(state) {
    globalActiveAlliances = state.activeAlliances;
    updateSidebarScores(state.scores);
    renderPlayerSelectionScreen(state.activeAlliances);
});

socket.on('round_started', function(state) {
    globalActiveAlliances = state.activeAlliances;
    renderPlayerSelectionScreen(state.activeAlliances);
    if (!myAlliance) return;

    document.getElementById('status-text').innerText = "ROUND LIVE - Submit Answer";
    document.getElementById('p-timer-box').className = "timer-wrapper";
    document.getElementById('p-timer-text').innerHTML = 'TIME REMAINING: <span id="p-time-count">' + state.nextRoundTime + '</span>s';

    selectedOptions = []; hasSubmitted = false; roundEnded = false; 
    
    const submitBtn = document.getElementById('submit-action-btn');
    submitBtn.innerText = "None of the above"; submitBtn.className = "btn-submit"; 
    
    document.querySelectorAll('.option-btn').forEach(b => {
        b.className = "btn option-btn"; 
        b.disabled = false;
    });
    submitBtn.disabled = false;
});

socket.on('countdown_started', function(state) {
    document.getElementById('p-timer-box').classList.add('timer-active');
});

socket.on('timer_tick', function(data) {
    if (!myAlliance) return;
    const timers = data.teamTimers;
    const subs = data.submissions;

    if (timers[myAlliance] <= 0 && !hasSubmitted) {
        document.getElementById('status-text').innerText = "TIME'S UP! Your screen is frozen.";
        document.getElementById('p-timer-text').innerText = "TIME'S UP!";
        document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
        document.getElementById('submit-action-btn').disabled = true;
        return;
    }

    if (hasSubmitted) {
        const unsubmittedTeams = globalActiveAlliances.filter(color => {
            const finishedSub = subs.some(s => s.alliance === color);
            const finishedTime = timers[color] <= 0;
            return !finishedSub && !finishedTime;
        });
        
        let maxRemaining = 0;
        if (unsubmittedTeams.length > 0) {
            maxRemaining = Math.max(...unsubmittedTeams.map(color => timers[color]));
        }
        document.getElementById('p-timer-text').innerHTML = 'WAITING FOR OTHERS: <span id="p-time-count">' + maxRemaining + '</span>s';
    } else {
        document.getElementById('p-time-count').innerText = timers[myAlliance];
    }
});

socket.on('round_stopped', function(state) {
    document.getElementById('p-timer-box').className = "timer-wrapper";
    document.getElementById('p-timer-text').innerText = "WAITING FOR HOST TO REVIEW ANSWERS";
    document.getElementById('status-text').innerText = "Round over! Processing entries...";
    document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
    document.getElementById('submit-action-btn').disabled = true;
    roundEnded = true; 
});

socket.on('scores_updated', function(scores) { updateSidebarScores(scores); });

socket.on('answers_released', function(data) {
    updateSidebarScores(data.scores);
    if (!roundEnded) return;
    
    document.getElementById('status-text').innerText = "Results Released!";
    const correctAnswers = data.modelAnswers; 
    const submitBtn = document.getElementById('submit-action-btn');
    
    const didNotSubmit = (hasSubmitted === false && roundEnded === true);
    const actualSelectionsSnapshot = [...selectedOptions];
    if (didNotSubmit) { selectedOptions = []; }

    const noneIsCorrect = (correctAnswers.length === 0);
    const playerChoseNone = (selectedOptions.length === 0);
    const actualPlayerChoseNone = (actualSelectionsSnapshot.length === 0);
    submitBtn.className = "btn-submit";

    document.querySelectorAll('.option-btn').forEach(btn => {
        const letter = btn.getAttribute('data-opt');
        const wasClicked = selectedOptions.includes(letter); 
        const isCorrectOption = correctAnswers.includes(letter);
        btn.className = "btn option-btn";
        if (isCorrectOption) {
            if (wasClicked) btn.classList.add('graded-correct'); 
            else btn.classList.add('graded-missing'); 
        } else {
            if (wasClicked) btn.classList.add('graded-incorrect'); 
        }
    });

    if (noneIsCorrect) {
        submitBtn.innerText = "None of the above";
        if (playerChoseNone) { if (roundEnded) submitBtn.classList.add('graded-correct'); }
        else { if (roundEnded) submitBtn.classList.add('graded-missing'); }
    } else {
        if (playerChoseNone) {
            submitBtn.innerText = "None of the above";
            if (didNotSubmit && !actualPlayerChoseNone) {
                submitBtn.innerText = "Submit"; submitBtn.style.backgroundColor = ""; 
            } else if (roundEnded) {
                submitBtn.classList.add('graded-missing'); 
            }
        } else { submitBtn.innerText = "Submit"; }
    }
    submitBtn.disabled = true;
    document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
});

function updateSidebarScores(scores) {
    const wrapper = document.getElementById('participant-scores'); 
    if (!wrapper) return;
    
    let html = '';
    for (const color in scores) {
        if (!globalActiveAlliances.includes(color)) continue;
        let displayColor = color.toLowerCase(); 
        if (color === 'Yellow') displayColor = '#ffc107';
        
        html += '<div class="score-row">' +
                    '<span style="color:' + displayColor + '">● ' + color + '</span>' +
                    '<strong>' + scores[color] + ' pts</strong>' +
                '</div>';
    }
    wrapper.innerHTML = html;
}
