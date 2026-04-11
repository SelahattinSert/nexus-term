# 🚀 NexusTerm

**NexusTerm** is an open-source, browser-native terminal emulator that transforms your local shell (Bash, Zsh, PowerShell) into a modern, smart, and visually rich web interface.

Built with **React**, **Node.js**, and **xterm.js**, NexusTerm bridges the gap between the power of the command line and the visual flexibility of modern web tools—without the weight of Electron or the privacy concerns of telemetry.

---

## ✨ Key Features

*   **🌐 Browser-Native:** No desktop app installation required. Access your terminal from any modern browser.
*   **🧩 Smart Grid Layout:** Manage multiple terminals simultaneously with split-pane views, tab swapping, and background sessions.
*   **🔄 Seamless Reconnection:** Your sessions persist through page refreshes and temporary network drops.
*   **🧠 Embedded Local AI (Zero-Cloud):** Built-in Qwen2.5 1.5B LLM analyzes failed commands and provides instant, context-aware autocorrect suggestions—running 100% locally with zero data sent to the cloud.
*   **🌿 Source Control (Git Panel):** VS Code-style Git sidebar. View local/remote branches, one-click checkout, and see real-time added, modified, and deleted files.
*   **📁 File Explorer:** A collapsible sidebar that automatically syncs with the active terminal's current working directory. Double-click folders to `cd` into them, or double-click files to execute them.
*   **💻 System Monitor:** Real-time CPU and RAM usage tracker elegantly displayed in the header.
*   **🚀 Auto-Complete:** Native-feeling tab completion suggestions based on system executables.
*   **🛠️ Visual CLI Builder & Snippets:** Construct complex CLI commands via an intuitive UI (flags, key-value pairs, args), save them as Snippets, and execute them with a single click.
*   **⌨️ Command Palette:** Press `Ctrl+P` (or `Cmd+P`) to quickly run saved snippets, open new sessions, or toggle the UI layout.

---

## 🛠️ Tech Stack

- **Frontend:** React, Zustand (State Management), TailwindCSS, xterm.js, Lucide Icons
- **Backend:** Node.js (Express), WebSocket (ws), node-pty, node-llama-cpp (for Local AI)
- **Platform Support:** Windows, macOS, Linux

---

## 📅 Roadmap

- [x] **Phase 1:** Core Engine and Secure WebSocket Communication
- [x] **Phase 2:** Multi-Session (Tabs), Grid Layout, and State Reconnection
- [x] **Phase 3:** Smart Terminal (Typo Correction, Error Beautifier, Embedded LLM)
- [x] **Phase 4:** Visual Panels (File Manager, Git Status, System Monitor)
- [x] **Phase 5:** Open Source & Community (Packaging & NPX, Command Palette, Visual CLI Builder)

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
    # (Optional) Download the local AI model for smart autocorrect:
    # npm run setup:ai
    npm start
    ```

3.  **Start the Client:**
    ```bash
    cd ../client
    npm install
    npm run build
    # The build script automatically copies files to the server's public directory
    ```

4.  **Open in Browser:**
    NexusTerm will automatically open in your default browser. If not, follow the URL printed in the terminal (e.g., `http://127.0.0.1:4000/?token=...`)

---

## 📦 Global Installation (via NPX)

You can run NexusTerm directly from anywhere on your system without cloning the repository!
*(Note: Requires the package to be published to npm. For local testing, you can run `npm link` inside the server directory).*

```bash
npx nexusterm
```

---

## ⚖️ License

MIT License - see the [LICENSE](LICENSE) file for details.
