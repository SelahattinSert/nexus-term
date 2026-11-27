# 🚀 NexusTerm

**NexusTerm** is an open-source, browser-native terminal emulator that transforms your local shell (Bash, Zsh, PowerShell) into a modern, smart, and visually rich web interface. 

It is not just a terminal; it is an **Autonomous AI-Driven Development Environment**. Powered by a local ReAct (Reason & Act) loop, NexusTerm acts as your personal AI assistant—executing commands, reading terminal output, handling errors, and chaining actions together until your goal is achieved.

---

## ✨ Key Features

### 🤖 Safe Terminal Gateway for AI Agents (MCP)
- **Your terminal, their tools:** NexusTerm is an [MCP](https://modelcontextprotocol.io) server. Claude Code, Codex or any MCP client can run commands, read terminal screens, search your command history, check git status and ports.
- **You stay in control:** Commands, SSH connections and public tunnels wait for your approval in the NexusTerm window (with the agent's name, risk and reason). Reject with feedback and the agent receives your words. A *read-only* mode lets agents only look.
- **Everything is visible and audited:** Agent commands run live in their own tab and every call is written to an audit log (`~/.nexusterm/audit.jsonl`).
- **Exact results:** Thanks to shell integration the agent gets the real exit code and output of each command, not a screen scrape.

### 📡 Live Terminal Sharing
- Click **Share** to get a link to one terminal. Teammates watch it live in their browser — no install, no account.
- Read-only by default. A guest can *request* control; you allow or deny it, and take it back at any time.
- Privacy first: guests only see your visible screen at share time and what happens while sharing, never earlier (cleared or scrolled-away) output. Links expire and can be stopped instantly.
- Works on the same machine, on your LAN (`HOST=0.0.0.0`), or over the internet through cloudflared/ngrok. Through a tunnel only share pages are reachable; the API and the agent endpoint refuse proxied requests.

### 🔮 A Voice Orb with Moods
- The assistant orb reacts to what your terminals are doing: building, testing, installing, a server running, an agent at work, a failure or a recovery — each with its own color and rhythm.
- Colors always come from your current theme (light themes included) and motion respects `prefers-reduced-motion`.

### 📓 Command Notebook
- Every command you (or an agent) run in bash, zsh or PowerShell becomes a **block**: command, exit code, duration, directory and output.
- Search across all tabs, filter failed commands, add notes, re-run a block, and **export selected blocks as a Markdown runbook**.
- History is kept in `~/.nexusterm/notebook` (private to your user); you can switch to memory-only or clear it from the panel.

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
- **SSH Connection Manager:** Connect to remote servers with a single click. Safely stores SSH keys and encrypted passwords. Fully integrated with the AI agent so you can command it to "connect to Production and check logs."
- **Built-in Code Editor (Monaco):** Double-click files in the explorer to open them in a fully featured, IDE-like Monaco editor right next to your terminal.
- **Visual CLI Builder & Snippets:** Construct complex commands via UI, save them, and execute them with a single click.
- **Source Control (Git Panel):** VS Code-style sidebar. View local/remote branches, stage files, see real-time diffs, and double-click changed files to edit them directly.
- **Command Palette:** Press `Ctrl+P` (or `Cmd+P`) to quickly run saved snippets, change themes, or open new sessions.
- **System Monitor:** Real-time CPU and RAM usage tracker elegantly displayed in the header.

---

## 🛠️ Tech Stack

- **Frontend:** React, Zustand, TailwindCSS, xterm.js, Framer Motion, Lucide Icons
- **Backend:** Node.js, Express, WebSocket (ws), node-pty, Xenova Transformers (Whisper)
- **AI Integration:** Bring your own API key (Groq, Gemini, OpenAI, Ollama)
- **Platform Support:** Windows, macOS, Linux

---

## 🔌 Connecting an Agent

Start NexusTerm and open the **Agents** panel (robot icon) for ready-to-copy commands. For example:

```bash
# stdio (recommended; forwards to the running NexusTerm)
claude mcp add nexusterm -- nexusterm mcp
```

```toml
# Codex: ~/.codex/config.toml
[mcp_servers.nexusterm]
command = "nexusterm"
args = ["mcp"]
```

Clients that speak Streamable HTTP can connect to `http://127.0.0.1:4000/mcp` with the bearer token shown in the panel.
NexusTerm must be running with a browser window open: without a window nobody can approve, so side effects are refused.

| Tool | What it does | Approval |
|---|---|---|
| `list_sessions` | See open terminals | no |
| `read_terminal` | Read a terminal screen | free for the agent's own tabs, once per connection for yours |
| `search_history`, `get_block`, `export_runbook` | Query the notebook, build runbooks | once per connection (output may hold secrets) |
| `git_status`, `list_ports`, `list_ssh_profiles` | Inspect the environment | no |
| `create_session`, `annotate_block` | Open the agent's own tab, add notes | no (audited) |
| `run_command` | Run a command and get exit code + output | **yes** |
| `ssh_open_session` | Connect to a saved SSH profile | **yes** |
| `tunnel_port` | Expose a local port publicly | **yes** |
| `interrupt` | Ctrl+C (free only in the agent's own tabs) | **yes** for other tabs |

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

## 📦 Packaging

`server/` is the publishable package (`nexusterm`). `npm pack` in `server/` builds the client and bundles it into `server/public`.
It is not published to the npm registry yet; until then install it from a checkout:

```bash
cd server && npm install && npm link   # provides the `nexusterm` command
```

State lives in `~/.nexusterm` (override with `NEXUSTERM_HOME`): settings, SSH profiles and the API key are encrypted with a random per-user master key and stored with owner-only permissions.

---

## ⚖️ License

MIT License - see the [LICENSE](LICENSE) file for details.