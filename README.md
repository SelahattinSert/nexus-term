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
- [ ] **Phase 5:** Open Source & Community (CI/CD, Visual CLI Builder)

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
    node server.js
    ```

3.  **Start the Client:**
    ```bash
    cd ../client
    npm install
    npm run build
    ```

4.  **Open in Browser:**
    NexusTerm will automatically open in your default browser. If not, follow the URL printed in the terminal (e.g., `http://127.0.0.1:4000/?token=...`)

---

## ⚖️ License

MIT License - see the [LICENSE](LICENSE) file for details.
