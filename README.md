# 🚀 NexusTerm

**NexusTerm** is an open-source, browser-native terminal emulator that transforms your local shell (Bash, Zsh, PowerShell) into a modern, smart, and visually rich web interface.

Built with **React**, **Node.js**, and **xterm.js**, NexusTerm bridges the gap between the power of the command line and the visual flexibility of modern web tools—without the weight of Electron or the privacy concerns of telemetry.

---

## ✨ Key Features

*   **🌐 Browser-Native:** No desktop app installation required. Access your terminal from any modern browser.
*   **🎙️ Smart Voice Assistant (VoiceOrb):** Control your terminal and UI with natural language. Powered by **local Whisper STT** (Free & Private) and your choice of LLM provider (Gemini, Groq, OpenAI, Ollama). 
*   **🎨 Dynamic Theme Engine (30+ Themes):** Choose from a curated library of over 30 professional themes (Dracula, Nord, Tokyo Night, Catppuccin, etc.) with full 16-color ANSI support and real-time syncing.
*   **🧩 HUD & Glassmorphism UI:** A sleek, futuristic interface featuring floating panels, backdrop-blur effects, and smooth animations using Framer Motion.
*   **🧩 Smart Grid Layout & Draggable Panes:** Manage multiple terminals simultaneously with split-pane views. Fluidly resize panes with mouse dragging (`react-resizable-panels`) and swap tabs easily.
*   **📝 Built-in Code Editor (Monaco):** Double-click files to open them in a fully featured, IDE-like Monaco editor right next to your terminal. Includes `Ctrl+S` auto-save.
*   **🔄 Seamless Reconnection:** Your sessions persist through page refreshes and temporary network drops.
*   **🌿 Source Control (Git Panel):** VS Code-style Git sidebar. View local/remote branches, one-click checkout, and see real-time added, modified, and deleted files.
*   **📁 File Explorer:** A collapsible sidebar that automatically syncs with the active terminal's current working directory.
*   **🔍 Terminal Search:** Press `Ctrl+F` for an integrated search overlay with incremental highlighting.
*   **💻 System Monitor:** Real-time CPU and RAM usage tracker elegantly displayed in the header.
*   **🛠️ Visual CLI Builder & Snippets:** Construct complex CLI commands via an intuitive UI, save them, import/export them as JSON, and execute them with a single click.
*   **⌨️ Command Palette:** Press `Ctrl+P` (or `Cmd+P`) to quickly run saved snippets, change themes, open new sessions, or toggle the UI layout.

---

## 🛠️ Tech Stack

- **Frontend:** React, Zustand, TailwindCSS, xterm.js, Framer Motion, Lucide Icons
- **Backend:** Node.js, WebSocket (ws), node-pty, Xenova Transformers (Local Whisper STT)
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
    Open the settings icon in the bottom-left sidebar to configure your AI Provider (Gemini, Groq, etc.) to enable the voice assistant.

---

## 📦 Global Installation (via NPX)

You can run NexusTerm directly from anywhere on your system without cloning the repository!

```bash
npx nexusterm
```

---

## ⚖️ License

MIT License - see the [LICENSE](LICENSE) file for details.
