# 🚀 NexusTerm

**NexusTerm** is an open-source, browser-native terminal emulator that transforms your local shell (Bash, Zsh, PowerShell) into a modern, smart, and visually rich web interface.

Built with **React**, **Node.js**, and **xterm.js**, NexusTerm bridges the gap between the power of the command line and the visual flexibility of modern web tools—without the weight of Electron or the privacy concerns of telemetry.

---

## ✨ Key Features

*   **🌐 Browser-Native:** No desktop app installation required. Access your terminal from any modern browser.
*   **🧩 Smart Grid Layout & Draggable Panes:** Manage multiple terminals simultaneously with split-pane views. Fluidly resize panes with mouse dragging (`react-resizable-panels`) and swap tabs easily.
*   **📝 Built-in Code Editor (Monaco):** Double-click files to open them in a fully featured, IDE-like Monaco editor right next to your terminal. Includes `Ctrl+S` auto-save.
*   **🔄 Seamless Reconnection:** Your sessions persist through page refreshes and temporary network drops.
*   **🧠 Embedded Local AI (Zero-Cloud):** Built-in Qwen2.5 1.5B LLM analyzes failed commands and provides instant, context-aware autocorrect suggestions—running 100% locally.
*   **🌿 Source Control (Git Panel):** VS Code-style Git sidebar. View local/remote branches, one-click checkout, and see real-time added, modified, and deleted files.
*   **📁 File Explorer:** A collapsible sidebar that automatically syncs with the active terminal's current working directory.
*   **🎨 Theming Engine:** Personalize your terminal with multiple built-in themes including Catppuccin (Mocha, Macchiato, Frappe, Latte) and a fully monochromatic **Pitch Black** theme.
*   **🔍 Terminal Search:** Press `Ctrl+F` for an integrated search overlay with incremental highlighting.
*   **💻 System Monitor:** Real-time CPU and RAM usage tracker elegantly displayed in the header.
*   **🛠️ Visual CLI Builder & Snippets:** Construct complex CLI commands via an intuitive UI, save them, import/export them as JSON, and execute them with a single click.
*   **⌨️ Command Palette:** Press `Ctrl+P` (or `Cmd+P`) to quickly run saved snippets, change themes, open new sessions, or toggle the UI layout.
*   **🔔 Toast Notifications:** Beautiful, non-intrusive notifications for system events and terminal statuses.

---

## 🛠️ Tech Stack

- **Frontend:** React, Zustand (State Management), TailwindCSS, xterm.js, Lucide Icons
- **Backend:** Node.js (Express), WebSocket (ws), node-pty, node-llama-cpp (for Local AI)
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
