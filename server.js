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
    answersReleased: false,
    modelAnswers: [],
    submissions: [],
    scores: { Red: 0, Blue: 0, Yellow: 0, Green: 0 }
};

let countdownTimer = null;

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    socket.emit('init_state', gameState);

    socket.on('start_round', () => {
        if (countdownTimer) clearInterval(countdownTimer);
        gameState.roundActive = true;
        gameState.answersReleased = false; // CRITICAL: Reset this so new rounds start totally clean
        gameState.modelAnswers = [];
        gameState.submissions = [];
        io.emit('round_started', gameState);
    });

    socket.on('update_model_answers', (answers) => {
        gameState.modelAnswers = answers;
        io.emit('model_answers_updated', gameState.modelAnswers);
    });

    socket.on('trigger_countdown', () => {
        if (!gameState.roundActive) return;
        let timeLeft = 3;
        io.emit('countdown_tick', timeLeft);
        if (countdownTimer) clearInterval(countdownTimer);
        countdownTimer = setInterval(() => {
            timeLeft--;
            if (timeLeft > 0) {
                io.emit('countdown_tick', timeLeft);
            } else {
                clearInterval(countdownTimer);
                gameState.roundActive = false;
                io.emit('round_stopped', gameState);
                io.emit('countdown_finished');
            }
        }, 1000);
    });

    socket.on('stop_round', () => {
        if (countdownTimer) clearInterval(countdownTimer);
        gameState.roundActive = false;
        io.emit('round_stopped', gameState);
    });

    socket.on('update_scores', (newScores) => {
        gameState.scores = newScores;
        io.emit('scores_updated', gameState.scores);
    });

    socket.on('push_and_release', (data) => {
        gameState.scores = data.finalScores;
        gameState.answersReleased = true;
        io.emit('answers_released', {
            scores: gameState.scores,
            modelAnswers: gameState.modelAnswers
        });
    });

    socket.on('submit_answer', (data) => {
        if (!gameState.roundActive) return;
        const alreadySubmitted = gameState.submissions.some(s => s.alliance === data.alliance);
        if (alreadySubmitted) return;
        const timestamp = new Date().toLocaleTimeString();
        gameState.submissions.push({
            alliance: data.alliance,
            answers: data.answers,
            time: timestamp
        });
        io.emit('new_submission', gameState.submissions);
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
