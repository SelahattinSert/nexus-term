import { pipeline } from '@xenova/transformers';
import OpenAI from 'openai';
import { voiceFunctionSchemas } from '../utils/functionSchemas.js';
import { readConfig } from '../utils/configManager.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pkg from 'wavefile';
const { WaveFile } = pkg;

import { fingerprint, normalize as normalizeError } from './errorFingerprint.js';
import { extractKeywords } from './keywordExtractor.js';
import { findByFingerprint, findByKeywords, add as addMemory } from './errorMemoryStore.js';

ffmpeg.setFfmpegPath(ffmpegStatic);

let transcriber = null;
let currentTranscriberModel = null;
const globalConversationHistory = [];

export async function transcribeAudio(audioFilePath) {
  const config = await readConfig();
  const targetModel = config.whisperModel || 'Xenova/whisper-base';
  const targetLanguage = config.whisperLanguage || 'auto';

  // Initialize or re-initialize the transcriber if the model changed
  if (!transcriber || currentTranscriberModel !== targetModel) {
    console.log(`[Voice API] Loading ${targetModel} model into memory...`);
    transcriber = await pipeline('automatic-speech-recognition', targetModel);
    currentTranscriberModel = targetModel;
  }
  
  return new Promise((resolve, reject) => {
    const wavFilePath = audioFilePath + '.wav';
    
    // Convert WebM to 16kHz WAV format using ffmpeg
    ffmpeg(audioFilePath)
      .output(wavFilePath)
      .outputOptions([
        '-ar 16000', // Sample rate 16kHz
        '-ac 1',     // Mono channel
        '-c:a pcm_s16le' // 16-bit PCM
      ])
      .on('end', async () => {
        try {
          // Read the WAV file
          const buffer = fs.readFileSync(wavFilePath);
          const wav = new WaveFile(buffer);
          wav.toBitDepth('32f'); // Convert to 32-bit float
          wav.toSampleRate(16000); // Ensure 16kHz
          let audioData = wav.getSamples();
          
          if (Array.isArray(audioData)) {
            if (audioData.length > 0) audioData = audioData[0]; // Take first channel if it's an array of channels
            else audioData = new Float32Array(0);
          }

          console.log(`[Voice API] Sending audio data to local Whisper model (${targetModel}, Lang: ${targetLanguage})...`);
          
          const transcriptionOptions = {};
          if (targetLanguage !== 'auto' && !targetModel.endsWith('.en')) {
            transcriptionOptions.language = targetLanguage;
            transcriptionOptions.task = 'transcribe';
          }

          const result = await transcriber(audioData, transcriptionOptions);
          
          // Cleanup the converted wav file
          if (fs.existsSync(wavFilePath)) fs.unlinkSync(wavFilePath);
          
          resolve(result.text);
        } catch (err) {
          if (fs.existsSync(wavFilePath)) fs.unlinkSync(wavFilePath);
          reject(err);
        }
      })
      .on('error', (err) => {
        if (fs.existsSync(wavFilePath)) fs.unlinkSync(wavFilePath);
        reject(err);
      })
      .run();
  });
}

import { getSessionDetails } from '../ptyManager.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const activeErrorSessions = new Map();

function detectProjectType(cwd) {
  try {
    if (!cwd) return 'unknown';
    if (fs.existsSync(path.join(cwd, 'package.json'))) return 'node';
    if (fs.existsSync(path.join(cwd, 'requirements.txt')) || fs.existsSync(path.join(cwd, 'setup.py')) || fs.existsSync(path.join(cwd, 'Pipfile'))) return 'python';
    if (fs.existsSync(path.join(cwd, 'Dockerfile')) || fs.existsSync(path.join(cwd, 'docker-compose.yml'))) return 'docker';
    if (fs.existsSync(path.join(cwd, '.git'))) return 'git';
    return 'system';
  } catch (_) {
    return 'unknown';
  }
}

async function generateSolutionSummary(openai, config, originalError, commandChain) {
  try {
    const prompt = `You are an AI that evaluates error resolution logs.
Original Error:
"${originalError.substring(0, 300)}"

Commands executed:
${commandChain.map((cmd, idx) => `${idx + 1}. ${cmd}`).join('\n')}

Task: Did these commands actually resolve the error, or did the AI just run passive/investigative commands (like dir, ls, pwd) and fail to fix it?
If NOT resolved, output exactly "UNRESOLVED".
If resolved, describe what was the error and what command(s) fixed it in 1 or 2 short sentences. Do not write anything else. Keep it plain English.`;

    const response = await openai.chat.completions.create({
      model: config.model || 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 60
    });
    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error('[Memory Service] Failed to generate solution summary:', err.message);
    return 'Resolved the terminal error by running fixing commands.';
  }
}

export async function resolveIntent(text, sessionId) {
  const config = await readConfig();
  
  const provider = config.provider || 'openai';
  let baseURL = config.url || 'https://api.openai.com/v1';

  // Normalize Gemini URL to prevent 404s
  if (provider === 'gemini') {
    baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
  }

  const openai = new OpenAI({
    apiKey: config.apiKey || process.env.LLM_API_KEY || 'dummy-local-key',
    baseURL: baseURL
  });

  // Load Persona
  let persona = 'You are a helpful CLI assistant.';
  try {
    const personaPath = path.join(__dirname, '..', 'utils', 'nexus_persona.md');
    persona = fs.readFileSync(personaPath, 'utf8');
  } catch (err) {
    console.error('[Voice API] Failed to load persona file:', err.message);
  }

  // Inject Context
  let contextStr = `\n\n## 📍 Current Context\n- Operating System: ${process.platform}\n`;
  let details = null;
  let hasError = false;
  let errorText = '';
  let memoryPrompt = '';
  let matchedMemoryMetadata = null;

  if (sessionId) {
    details = getSessionDetails(sessionId);
    if (details) {
      contextStr += `- Active Shell (Interpreter): ${details.shell}\n`;
      contextStr += `- Current Working Directory: ${details.cwd}\n`;
      contextStr += `\n### 📺 Recent Terminal Output (Screen)\n\`\`\`\n${details.recentOutput}\n\`\`\`\n`;
      contextStr += `\n*Note: Use the terminal output above to answer user questions about what happened, what failed, or what is currently on the screen. Treat it as your eyes.*`;

      // --- Error Detection (Step A) ---
      const recentOutput = details.recentOutput;
      let last500 = recentOutput.slice(-500);
      
      const errorSession = activeErrorSessions.get(sessionId);
      if (errorSession && errorSession.commandChain.length > 0) {
        const lastCmd = errorSession.commandChain[errorSession.commandChain.length - 1];
        const lastCmdIndex = recentOutput.lastIndexOf(lastCmd);
        if (lastCmdIndex !== -1) {
          last500 = recentOutput.slice(lastCmdIndex + lastCmd.length);
        }
      }

      const errorRegex = /error|exception|failed|fatal|traceback|panic|ENOENT|EACCES|ECONNREFUSED|Cannot find|No such file|permission denied|command not found/i;
      
      if (errorRegex.test(last500)) {
        hasError = true;
        errorText = last500;
        
        // --- Memory Lookup (Step B) ---
        const fp = fingerprint(errorText);
        const exactMatch = findByFingerprint(fp);
        
        let matchEntry = null;
        let matchType = 'none';
        
        if (exactMatch) {
          matchEntry = exactMatch;
          matchType = 'exact';
        } else {
          const normalized = normalizeError(errorText);
          const keywords = extractKeywords(normalized);
          const fuzzyMatches = findByKeywords(keywords);
          if (fuzzyMatches.length > 0) {
            matchEntry = fuzzyMatches[0];
            matchType = 'fuzzy';
          }
        }
        
        if (matchEntry) {
          // --- Context Injection (Step C) ---
          let fuzzyWarning = '';
          if (matchType === 'fuzzy' && matchEntry.score === 2) {
            fuzzyWarning = '\nNote: this is a fuzzy match — verify it applies before executing.';
          }
          
          memoryPrompt = `\nMEMORY: I have solved a similar error before.
Error pattern: ${matchEntry.errorPattern.substring(0, 100)}...
What worked: ${matchEntry.solutionSummary}
Commands that resolved it: ${matchEntry.commandChain.join(' → ')}
Match confidence: ${matchType}${fuzzyWarning}
---
Try the remembered solution first before attempting other approaches.\n\n`;

          // Track metadata to notify frontend
          matchedMemoryMetadata = {
            id: matchEntry.id,
            errorPattern: matchEntry.errorPattern,
            solutionSummary: matchEntry.solutionSummary,
            useCount: matchEntry.useCount,
            lastUsedAt: matchEntry.lastUsedAt,
            matchType
          };
        }

        // Initialize error session if not exists
        if (!activeErrorSessions.has(sessionId)) {
          activeErrorSessions.set(sessionId, {
            originalError: errorText,
            commandChain: [],
            shellType: details.shell,
            workingDir: details.cwd,
            createdAt: new Date().toISOString()
          });
        }
      }
    }
  }

  // Inject Port Manager Data
  try {
    const { scanPorts } = await import('./portScanner.js');
    const { getActiveTunnels } = await import('./tunnelManager.js');
    const ports = await scanPorts(false); // don't include ephemeral by default
    const tunnels = getActiveTunnels();
    
    if (ports.length > 0) {
      contextStr += "\n\n## 📡 Active Network Ports\n" + ports.map(p => {
        let line = `- Port ${p.port} (${p.processName || 'unknown'}, ${p.state})`;
        if (tunnels[p.port]) line += ` [TUNNELED via ${tunnels[p.port].provider}: ${tunnels[p.port].url}]`;
        return line;
      }).join("\n");
      
      const portActionDocs = `
If the user asks to expose, share, or tunnel a local port (e.g., "tunnel port 3000"), use \`execute_ui_action\` with \`action: "tunnel_port||[PORT_NUMBER]"\`.
For example: \`{"type": "execute_ui_action", "action": "tunnel_port||3000"}\`
`;
      contextStr += portActionDocs;
    }
  } catch (err) {
    console.error('[Voice API] Could not load port data into prompt:', err.message);
  }

  // Inject Env Manager Data
  try {
    const { findEnvFiles, getEnvFileDetails } = await import('./envService.js');
    const cwd = details ? details.cwd : process.cwd();
    const envFiles = await findEnvFiles(cwd);
    
    // Find active .env and .env.example
    let activeEnv = null;
    let exampleEnv = null;
    
    for (const fp of envFiles) {
      const detail = await getEnvFileDetails(cwd, fp, true); // true = redact secrets
      if (detail && detail.isActive) activeEnv = detail;
      if (detail && detail.profileName === 'example') exampleEnv = detail;
    }

    if (activeEnv) {
      const keys = activeEnv.variables.filter(v => v.key).map(v => v.key);
      contextStr += `\n\n## 🔐 Active Environment Variables (.env)\n`;
      contextStr += `- File: ${activeEnv.filePath}\n`;
      contextStr += `- Defined Keys: ${keys.join(', ')}\n`;
      
      if (exampleEnv) {
        const exampleKeys = exampleEnv.variables.filter(v => v.key).map(v => v.key);
        const missingKeys = exampleKeys.filter(k => !keys.includes(k));
        if (missingKeys.length > 0) {
          contextStr += `- Missing Keys (vs .env.example): ${missingKeys.join(', ')}\n`;
        }
      }
      
      contextStr += `
If the user asks to switch the active environment profile (e.g., "switch env to production"), use \`execute_ui_action\` with \`action: "env_switch_profile||[PROFILE_NAME]"\`.
For example: \`{"type": "execute_ui_action", "action": "env_switch_profile||production"}\`
*Heuristic*: If you encounter an error in the terminal like "API_KEY is not defined", check the Defined Keys above. If it's missing, suggest switching env profiles or adding the key.
`;
    }
  } catch (err) {
    console.error('[Voice API] Could not load env data into prompt:', err.message);
  }

  // Inject SSH Profiles
  try {
    const { getProfiles } = await import('./sshService.js');
    const sshProfiles = await getProfiles();
    if (sshProfiles.length > 0) {
      contextStr += "\n\n## 🌐 Available SSH Connections\n" + sshProfiles.map(p => 
        `- "${p.name}": ${p.username}@${p.host} (tags: ${p.tags ? p.tags.join(', ') : 'none'})`
      ).join("\n") + "\n\n" +
      "To connect to an SSH server, use `execute_ui_action` with `action: 'ssh_connect||[PROFILE_NAME]'`. For example: `{\"type\": \"execute_ui_action\", \"action\": \"ssh_connect||Production API\"}`. The frontend will intercept this and establish the connection.";
    }
  } catch (err) {
    console.error('[Voice API] Could not load SSH profiles into prompt:', err.message);
  }
  
  const systemPrompt = memoryPrompt + persona + contextStr;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...globalConversationHistory,
    { role: 'user', content: text }
  ];

  const response = await openai.chat.completions.create({
    model: config.model || 'gpt-3.5-turbo',
    messages: messages,
    tools: voiceFunctionSchemas,
    tool_choice: 'auto' // Allow multiple tool calls natively
  });

  const message = response.choices[0].message;
  
  // Save to history
  globalConversationHistory.push({ role: 'user', content: text });
  
  if (message.tool_calls && message.tool_calls.length > 0) {
    const actions = message.tool_calls.map(tc => {
      const action = JSON.parse(tc.function.arguments);
      // Fallback for older schema if it wrapped it in {type, ...}
      return action.type ? action : { type: tc.function.name, ...action };
    });

    // Track commands in active session
    if (sessionId && activeErrorSessions.has(sessionId)) {
      const session = activeErrorSessions.get(sessionId);
      actions.forEach(a => {
        if (a.type === 'execute_terminal_command' && a.command) {
          session.commandChain.push(a.command);
        } else if (a.type === 'ssh_run_on' && a.command) {
          session.commandChain.push(a.command);
        } else if (a.type === 'execute_ui_action' && a.action) {
          session.commandChain.push(a.action);
        }
      });
    }
    
    const actionStrings = actions.map(a => a.action || a.command || a.response);
    globalConversationHistory.push({ role: 'system', content: `System Note: In the previous turn, you executed these actions: ${actionStrings.join(', ')}` });
    if (globalConversationHistory.length > 20) globalConversationHistory.splice(0, globalConversationHistory.length - 20);
    
    const resultObj = { type: 'multi_action', actions };
    if (matchedMemoryMetadata) {
      resultObj.memoryUsed = matchedMemoryMetadata;
    }
    return resultObj;
  }
  
  globalConversationHistory.push({ role: 'assistant', content: message.content || '' });
  if (globalConversationHistory.length > 20) globalConversationHistory.splice(0, globalConversationHistory.length - 20);

  // --- Success Detection & Memory Writing (Step D) ---
  if (sessionId && activeErrorSessions.has(sessionId)) {
    const errorSession = activeErrorSessions.get(sessionId);
    const isResolved = !hasError && errorSession.commandChain.length > 0;

    if (isResolved) {
      const lastCmds = errorSession.commandChain;
      const isTooLong = lastCmds.length > 8;
      const isFlaky = lastCmds.length > 1 && lastCmds.every(cmd => cmd === lastCmds[0]);

      if (!isTooLong && !isFlaky) {
        // Trigger Memory Writing asynchronously in background
        (async () => {
          console.log(`[Memory Service] Resolving error. Generating summary...`);
          const solutionSummary = await generateSolutionSummary(openai, config, errorSession.originalError, lastCmds);
          
          if (solutionSummary.toUpperCase() === 'UNRESOLVED') {
            console.log(`[Memory Service] Error resolution was evaluated as unresolved by the LLM. Skipping save.`);
            return;
          }

          const cleanOriginalError = errorSession.originalError
            .replace(/[a-zA-Z]:[\\/][\w\-\.\s\\/]+/g, '<path>/')
            .replace(/\/[\w\-\.\s]+(?:\/[\w\-\.\s]+)+/g, '<path>/');
          
          const entry = {
            id: crypto.randomUUID ? crypto.randomUUID() : `mem-${Date.now()}`,
            createdAt: new Date().toISOString(),
            lastUsedAt: new Date().toISOString(),
            useCount: 1,
            errorFingerprint: fingerprint(errorSession.originalError),
            errorPattern: cleanOriginalError.substring(0, 500),
            errorKeywords: extractKeywords(normalizeError(errorSession.originalError)),
            solutionSummary,
            commandChain: lastCmds,
            shellType: errorSession.shellType || 'unknown',
            workingDirPattern: errorSession.workingDir ? path.basename(errorSession.workingDir) : 'unknown',
            projectType: detectProjectType(errorSession.workingDir)
          };

          addMemory(entry);
          console.log(`[Memory Service] Saved new error memory entry: ${entry.id}`);
        })().catch(err => console.error('[Memory Service] Error saving memory entry:', err));
      }
    }
    
    // Clean up active session
    activeErrorSessions.delete(sessionId);
  }

  const resultObj = { type: 'text_response', response: message.content || 'I could not process that request.' };
  if (matchedMemoryMetadata) {
    resultObj.memoryUsed = matchedMemoryMetadata;
  }
  return resultObj;
}
