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
        extraTime: { maxUses: 3, value: 20 },
        stopCard: { maxUses: 3 },
        doubleRisk: { maxUses: 3, penalty: 5 }
    },
    teamPowerUps: {
        Red: { extraTime: { remaining: 3 }, stopCard: { remaining: 3 }, doubleRisk: { remaining: 3, activeInRound: false } },
        Blue: { extraTime: { remaining: 3 }, stopCard: { remaining: 3 }, doubleRisk: { remaining: 3, activeInRound: false } },
        Yellow: { extraTime: { remaining: 3 }, stopCard: { remaining: 3 }, doubleRisk: { remaining: 3, activeInRound: false } },
        Green: { extraTime: { remaining: 3 }, stopCard: { remaining: 3 }, doubleRisk: { remaining: 3, activeInRound: false } }
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

// Precision Timestamp Parser to generate exact two decimal spaces for seconds
function getPrecisionTimestamp() {
    const now = new Date();
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const secs = String(now.getSeconds()).padStart(2, '0');
    const ms = String(Math.floor(now.getMilliseconds() / 10)).padStart(2, '0');
    return `${hrs}:${mins}:${secs}.${ms}`;
}

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
        
        ['Red', 'Blue', 'Yellow', 'Green'].forEach(color => {
            gameState.teamPowerUps[color].doubleRisk.activeInRound = false;
        });

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
                if (!gameState.teamPowerUps[color]) {
                    gameState.teamPowerUps[color] = { 
                        extraTime: { remaining: 0 }, 
                        stopCard: { remaining: 0 }, 
                        doubleRisk: { remaining: 0, activeInRound: false } 
                    };
                }
                gameState.teamPowerUps[color].extraTime.remaining = settings.powerUpSettings.extraTime.maxUses;
                gameState.teamPowerUps[color].stopCard.remaining = settings.powerUpSettings.stopCard.maxUses;
                gameState.teamPowerUps[color].doubleRisk.remaining = settings.powerUpSettings.doubleRisk.maxUses;
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

    socket.on('activate_powerup', (data) => {
        const color = data.alliance;
        const type = data.type; 

        if (!gameState.activeAlliances.includes(color)) return;

        // --- POWER UP 1: EXTRA TIME ---
        if (type === 'extraTime') {
            if (!gameState.roundActive || !gameState.timerRunning) return;

            const alreadySubmitted = gameState.submissions.some(s => s.alliance === color);
            if (alreadySubmitted) return;

            const inventory = gameState.teamPowerUps[color].extraTime;
            const config = gameState.powerUpSettings.extraTime;

            if (config.maxUses > 0 && inventory.remaining > 0) {
                inventory.remaining--;
                gameState.teamTimers[color] += config.value;
                
                gameState.submissions.forEach(s => {
                    if (s.alliance === color) s.powerUsed = (s.powerUsed || "") + " [Extra Time]";
                });

                io.emit('powerup_activated', { alliance: color, type: type, gameState: gameState });
            }
        }
        
        // --- POWER UP 2: STOP!!! ---
        else if (type === 'stopCard') {
            if (!gameState.roundActive) return;

            const inventory = gameState.teamPowerUps[color].stopCard;
            const config = gameState.powerUpSettings.stopCard;

            if (config.maxUses > 0 && inventory.remaining > 0) {
                inventory.remaining--;
                
                gameState.submissions.forEach(s => {
                    if (s.alliance === color) s.powerUsed = (s.powerUsed || "") + " [STOP!!! Halt]";
                });

                io.emit('powerup_activated', { alliance: color, type: type, gameState: gameState });
                stopRoundExecution(); 
            }
        }

        // --- POWER UP 3: DOUBLE OR DEDUCT ---
                // --- POWER UP 3: DOUBLE OR DEDUCT ---
        else if (type === 'doubleRisk') {
            // TARGET SAFETY FIX: Blocks if answers are released OR if a new round has not started yet.
            // If answersReleased is false, but roundActive is false and submissions are empty, it means we are in the idle start state.
            if (gameState.answersReleased) return;
            
            // If the round is not active AND no entries have been submitted yet, they are trying to cheat-click before a match starts!
            if (!gameState.roundActive && gameState.submissions.length === 0) return;

            const inventory = gameState.teamPowerUps[color].doubleRisk;
            const config = gameState.powerUpSettings.doubleRisk;
            
            if (inventory.activeInRound) return;

            if (config.maxUses > 0 && inventory.remaining > 0) {
                inventory.remaining--;
                inventory.activeInRound = true;

                io.emit('powerup_activated', { alliance: color, type: type, gameState: gameState });
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

        let tag = "";
        if (gameState.teamPowerUps[data.alliance].doubleRisk.activeInRound) {
            tag = " [Double Risk Active]";
        }

        gameState.submissions.push({
            alliance: data.alliance,
            answers: data.answers,
            time: getPrecisionTimestamp(), 
            powerUsed: tag
        });

        io.emit('new_submission', gameState.submissions);
        checkAutoStopConditions();
    });
});

server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });