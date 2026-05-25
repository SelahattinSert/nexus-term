# 🚀 NexusTerm

**NexusTerm** is an open-source, browser-native terminal emulator that transforms your local shell (Bash, Zsh, PowerShell) into a modern, smart, and visually rich web interface. 

It is not just a terminal; it is an **Autonomous AI-Driven Development Environment**. Powered by a local ReAct (Reason & Act) loop, NexusTerm acts as your personal AI assistant—executing commands, reading terminal output, handling errors, and chaining actions together until your goal is achieved.

---

## ✨ Key Features

### 🧠 Autonomous AI Agent (ReAct Loop)
- **True Autonomy:** Tell the assistant what you want (e.g., "Find the bug in this React project and fix it"). The AI will execute a command, read the terminal output, reason about the errors, and continuously execute new commands until the job is done.
- **Smart Context:** The AI can "see" your terminal screen. You can ask it to explain errors currently visible in the log, and it will analyze them in real-time.

### 🛡️ Advanced Approval System
- **Secure Execution:** Before any destructive or system-altering command is executed, a glassmorphic **Permission Required** card intercepts the action.
- **Feedback Loop:** Don't like the AI's proposed command? Use the **Reject with Feedback** option. Tell the AI *why* you rejected it (e.g., "Use yarn instead of npm"), and it will instantly rethink and propose a new approach.
- **Auto-Pilot Mode:** Toggle "Auto-Execute Commands" in the settings to let the AI fly solo without asking for permission.

### 🎙️ Interactive VoiceOrb & Voice Gallery
- **The Void Orb:** A draggable, physics-enabled (Framer Motion) floating orb that acts as your AI's core. It pulses, spins, and reacts to speech with multi-layered SVG animations.
- **Local STT & TTS:** Powered by local Whisper STT (Xenova Transformers) for flawless, free, and private speech-to-text. It responds using your browser's native Text-to-Speech.
- **Modern Voice Gallery:** A sleek, centralized settings carousel to select your assistant's voice, featuring interactive waveform visualizers and instant audio previews.

### 🎨 Futuristic UI & Experience
- **Dynamic Theme Engine:** Over 30 curated themes (Dracula, Tokyo Night, Catppuccin, Hacker Red, etc.) applied seamlessly across the entire UI and terminal.
- **Glassmorphism:** A HUD-like interface with floating panels, backdrop-blur effects, and smooth transitions.
- **Smart Grid Layout:** Manage multiple terminals simultaneously with fluidly resizable split-pane views (`react-resizable-panels`).

### 🛠️ Developer Productivity Tools
- **Built-in Code Editor (Monaco):** Double-click files in the explorer to open them in a fully featured, IDE-like Monaco editor right next to your terminal.
- **Visual CLI Builder & Snippets:** Construct complex commands via UI, save them, and execute them with a single click.
- **Source Control (Git Panel):** VS Code-style sidebar. View local/remote branches, stage files, and see real-time diffs.
- **Command Palette:** Press `Ctrl+P` (or `Cmd+P`) to quickly run saved snippets, change themes, or open new sessions.
- **System Monitor:** Real-time CPU and RAM usage tracker elegantly displayed in the header.

---

## 🛠️ Tech Stack

- **Frontend:** React, Zustand, TailwindCSS, xterm.js, Framer Motion, Lucide Icons
- **Backend:** Node.js, Express, WebSocket (ws), node-pty, Xenova Transformers (Whisper)
- **AI Integration:** Bring your own API key (Groq, Gemini, OpenAI, Ollama)
- **Platform Support:** Windows, macOS, Linux

---

## 🚀 Quick Start (Development)

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/SelahattinSert/nexus-term.git
    cd nexus-term
    ```

2.  **Start the Server:**
    ```bash
    cd server
    npm install
    npm start
    ```

3.  **Start the Client:**
    ```bash
    cd ../client
    npm install
    npm run build
    ```

4.  **Configuration:**
    Open the settings icon in the bottom-left sidebar, go to the **AI Provider** tab to enter your API key, and head to the **Voice (STT)** tab to pick your assistant's voice!

---

## 📦 Global Installation (via NPX)

You can run NexusTerm directly from anywhere on your system without cloning the repository!

```bash
npx nexusterm
```

---

## ⚖️ License

MIT License - see the [LICENSE](LICENSE) file for details.