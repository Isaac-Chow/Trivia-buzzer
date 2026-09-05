# Trivia-buzzer

A real-time, fast-paced trivia game show platform built with **Node.js, Express, and Socket.io**. This platform allows a host to orchestrate live multiple-choice quiz rounds while tracking separate team countdown timers, custom scoring matrices, active team toggles, and tactical alliance power-up inventory selections simultaneously across networked devices.

## 🛠️ Installation & Setup

1. **Download the project** files and ensure you have [Node.js](https://nodejs.org) installed on your machine.
2. Open your terminal or command prompt inside the project folder and install the required dependencies:
   ```bash
   npm install express socket.io
   ```
3. Boot up the game server by running:
   ```bash
   npm start
   ```

## 🌐 How to Access

* **To Join as a Player (Alliance Screen):** Open any browser tab and navigate to your local or Tailscale IP address (e.g., `http://1.xx` or `http://localhost:3000`).
* **To Access the Host Control Panel:** Open a separate master control window and navigate directly to `http://localhost:3000/host`.
* **To Access Standalone Power-Ups Console:** Secondary screen devices can track abilities by navigating to `http://localhost:3000/powerup`.
