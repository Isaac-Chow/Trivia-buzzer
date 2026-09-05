const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

let gameState = {
    roundActive: false,
    timerRunning: false,
    answersReleased: false,
    defaultTime: 15,
    nextRoundTime: 15, 
    modelAnswers: [],
    submissions: [],
    scores: { Red: 0, Blue: 0, Yellow: 0, Green: 0 },
    teamTimers: { Red: 15, Blue: 15, Yellow: 15, Green: 15 },
    activeAlliances: ['Red', 'Blue'], 
    powerUpSettings: {
        extraTime: { maxUses: 0, value: 20 },
        stopCard: { maxUses: 0 }
    },
    teamPowerUps: {
        Red: { extraTime: { remaining: 0 }, stopCard: { remaining: 0 } },
        Blue: { extraTime: { remaining: 0 }, stopCard: { remaining: 0 } },
        Yellow: { extraTime: { remaining: 0 }, stopCard: { remaining: 0 } },
        Green: { extraTime: { remaining: 0 }, stopCard: { remaining: 0 } }
    }
};

let serverInterval = null;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'alliance.html'));
});

app.get('/host', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/powerup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'powerup.html'));
});

function checkAutoStopConditions() {
    const activeTeams = gameState.activeAlliances;
    if (activeTeams.length === 0) return;
    
    const allTeamsDone = activeTeams.every(color => {
        const hasSubmitted = gameState.submissions.some(s => s.alliance === color);
        const hasTimedOut = gameState.teamTimers[color] <= 0;
        return hasSubmitted || hasTimedOut;
    });

    if (allTeamsDone) {
        stopRoundExecution();
    }
}

function stopRoundExecution() {
    if (serverInterval) clearInterval(serverInterval);
    gameState.roundActive = false;
    gameState.timerRunning = false;
    gameState.nextRoundTime = gameState.defaultTime;
    io.emit('round_stopped', gameState);
}

// --- MAIN WEB-SOCKET GATEWAY ENTRY POINT ---
io.on('connection', (socket) => {
    socket.emit('init_state', gameState);

    socket.on('start_round', (customTime) => {
        if (serverInterval) clearInterval(serverInterval);
        gameState.roundActive = true;
        gameState.timerRunning = false;
        gameState.answersReleased = false;
        gameState.modelAnswers = [];
        gameState.submissions = [];
        
        gameState.nextRoundTime = parseInt(customTime) || gameState.defaultTime;
        
        gameState.activeAlliances.forEach(color => {
            gameState.teamTimers[color] = gameState.nextRoundTime;
        });
        
        io.emit('round_started', gameState);
    });

    socket.on('trigger_countdown', () => {
        if (!gameState.roundActive || gameState.timerRunning) return;
        gameState.timerRunning = true;
        io.emit('countdown_started', gameState);

        serverInterval = setInterval(() => {
            gameState.activeAlliances.forEach(color => {
                const alreadySubmitted = gameState.submissions.some(s => s.alliance === color);
                if (!alreadySubmitted && gameState.teamTimers[color] > 0) {
                    gameState.teamTimers[color]--;
                }
            });

            io.emit('timer_tick', { 
                teamTimers: gameState.teamTimers, 
                submissions: gameState.submissions 
            });
            
            checkAutoStopConditions();
        }, 1000);
    });

    socket.on('stop_round', () => {
        stopRoundExecution();
    });

    socket.on('update_settings', (settings) => {
        gameState.defaultTime = parseInt(settings.defaultTime) || 15;
        gameState.scores = settings.scores;
        gameState.activeAlliances = settings.activeAlliances || ['Red', 'Blue', 'Yellow', 'Green'];
        
        if (settings.powerUpSettings) {
            gameState.powerUpSettings = settings.powerUpSettings;
            
            ['Red', 'Blue', 'Yellow', 'Green'].forEach(color => {
                if (!gameState.teamPowerUps[color]) gameState.teamPowerUps[color] = { extraTime: { remaining: 0 }, stopCard: { remaining: 0 } };
                if (!gameState.teamPowerUps[color].stopCard) gameState.teamPowerUps[color].stopCard = { remaining: 0 };
                
                gameState.teamPowerUps[color].extraTime.remaining = settings.powerUpSettings.extraTime.maxUses;
                gameState.teamPowerUps[color].stopCard.remaining = settings.powerUpSettings.stopCard.maxUses;
            });
        }
        io.emit('settings_synced', gameState);
    });

    socket.on('manual_powerup_update', (data) => {
        const color = data.alliance;
        const type = data.type; 
        const count = parseInt(data.count);

        if (gameState.teamPowerUps[color] && gameState.teamPowerUps[color][type]) {
            gameState.teamPowerUps[color][type].remaining = isNaN(count) ? 0 : count;
            io.emit('settings_synced', gameState);
        }
    });

    // WATERPROOF TARGET BLOCK: Safely nested inside the main connection function block
      socket.on('activate_powerup', (data) => {
        const color = data.alliance;
        const type = data.type; 

        // CRITICAL FIX: The round must be active, but we REMOVED timerRunning 
        // from the global gate so HALT can fire before the clock ticks!
        if (!gameState.roundActive) return;
        if (!gameState.activeAlliances.includes(color)) return;

        // --- POWER UP 1: EXTRA TIME ---
        if (type === 'extraTime') {
            // Extra Time still requires the timer to be actively running to work
            if (!gameState.timerRunning) return;

            const alreadySubmitted = gameState.submissions.some(s => s.alliance === color);
            if (alreadySubmitted) return;

            const inventory = gameState.teamPowerUps[color].extraTime;
            const config = gameState.powerUpSettings.extraTime;

            if (config.maxUses > 0 && inventory.remaining > 0) {
                inventory.remaining--;
                gameState.teamTimers[color] += config.value;
                io.emit('powerup_activated', { alliance: color, type: type, gameState: gameState });
            }
        }
        
        // --- POWER UP 2: STOP!!! ---
        else if (type === 'stopCard') {
            const inventory = gameState.teamPowerUps[color].stopCard;
            const config = gameState.powerUpSettings.stopCard;

            if (config.maxUses > 0 && inventory.remaining > 0) {
                inventory.remaining--;
                io.emit('powerup_activated', { alliance: color, type: type, gameState: gameState });
                stopRoundExecution(); // Instantly freezes the game board
            }
        }
    });


    socket.on('update_model_answers', (answers) => {
        gameState.modelAnswers = answers;
        io.emit('model_answers_updated', gameState.modelAnswers);
    });

    socket.on('push_and_release', (data) => {
        gameState.scores = data.finalScores;
        gameState.answersReleased = true;
        io.emit('answers_released', { scores: gameState.scores, modelAnswers: gameState.modelAnswers });
    });

    socket.on('submit_answer', (data) => {
        if (!gameState.roundActive) return;
        if (!gameState.activeAlliances.includes(data.alliance)) return;

        const alreadySubmitted = gameState.submissions.some(s => s.alliance === data.alliance);
        if (alreadySubmitted) return;

        gameState.submissions.push({
            alliance: data.alliance,
            answers: data.answers,
            time: new Date().toLocaleTimeString()
        });

        io.emit('new_submission', gameState.submissions);
        checkAutoStopConditions();
    });
});

server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
