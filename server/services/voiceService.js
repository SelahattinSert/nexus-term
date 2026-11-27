import OpenAI from 'openai';
import { voiceFunctionSchemas } from '../utils/functionSchemas.js';
import { readRawConfig } from '../utils/configManager.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { fingerprint, normalize as normalizeError } from './errorFingerprint.js';
import { extractKeywords } from './keywordExtractor.js';
import { findByFingerprint, findByKeywords, add as addMemory } from './errorMemoryStore.js';



// Conversation state per terminal session, so tabs do not leak context into each other.
// { messages: [...OpenAI chat messages], pendingToolCallIds: string[] }
const conversations = new Map();
const MAX_HISTORY_MESSAGES = 30;

function getConversation(sessionId) {
  const key = sessionId || 'global';
  if (!conversations.has(key)) conversations.set(key, { messages: [], pendingToolCallIds: [] });
  return conversations.get(key);
}

/**
 * Trims old messages without ever splitting an assistant tool-call message from its tool results
 * (the API rejects orphaned `tool` messages). Whole groups are dropped from the front, the newest
 * group is always kept, and stray leading `tool` messages are removed.
 */
export function trimHistory(conversation, max = MAX_HISTORY_MESSAGES) {
  const msgs = conversation.messages;
  while (msgs.length && msgs[0].role === 'tool') msgs.shift();
  while (msgs.length > max) {
    // size of the first group: an assistant message with tool_calls plus the tool results that follow
    let size = 1;
    if (msgs[0].role === 'assistant' && msgs[0].tool_calls?.length) {
      while (size < msgs.length && msgs[size].role === 'tool') size++;
    }
    if (size >= msgs.length) break; // never drop the newest group
    msgs.splice(0, size);
  }
}

function parseToolArguments(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
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

/**
 * @param {string} text user utterance, or (isToolResult) a description of what happened to the previous actions
 * @param {string|null} sessionId terminal session the request belongs to
 * @param {{isToolResult?: boolean}} options
 */
/**
 * Wraps a spoken request so the model knows it came from local speech recognition and may contain
 * phonetic mistakes ("en pi em" for npm). Corrections already applied in the browser are listed.
 */
export function describeSpokenRequest(text, { raw, corrections } = {}) {
  const lines = [
    text,
    '',
    '[Note: this request was spoken and transcribed by an offline speech recognizer. Words that sound alike may be wrong,',
    'especially command, file and project names. Prefer the closest matching command or name from the context above;',
    'if the intent is genuinely unclear, ask a short clarifying question with text_response instead of guessing.]',
  ];
  if (raw && raw !== text) lines.push(`[Raw transcript before automatic correction: "${String(raw).slice(0, 500)}"]`);
  if (Array.isArray(corrections) && corrections.length) {
    lines.push(`[Automatic corrections: ${corrections.slice(0, 10).map(c => `"${c.from}" → "${c.to}"`).join(', ')}]`);
  }
  return lines.join('\n');
}

export async function resolveIntent(text, sessionId = null, { isToolResult = false, speech = null } = {}) {
  if (speech && !isToolResult) text = describeSpokenRequest(text, speech);
  const config = await readRawConfig();
  
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
If the user asks to expose, share, or tunnel a local port (e.g., "tunnel port 3000"), call the \`tunnel_port\` tool with the port number. The user must approve it.
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
If the user asks to switch the active environment profile (e.g., "switch env to production"), call the \`env_switch_profile\` tool with the profile name.
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
      "To open an SSH terminal, call the `ssh_connect` tool with the profile name. To run a command on a server, call `ssh_run_on` (the user must approve it).";
    }
  } catch (err) {
    console.error('[Voice API] Could not load SSH profiles into prompt:', err.message);
  }
  
  const systemPrompt = memoryPrompt + persona + contextStr;

  const conversation = getConversation(sessionId);

  // Answer the previous turn's tool calls first (the API requires a result for every tool_call_id)
  if (conversation.pendingToolCallIds.length) {
    for (const id of conversation.pendingToolCallIds) {
      conversation.messages.push({
        role: 'tool',
        tool_call_id: id,
        content: isToolResult ? text : 'No result was reported for this action.',
      });
    }
    conversation.pendingToolCallIds = [];
    if (!isToolResult) conversation.messages.push({ role: 'user', content: text });
  } else {
    conversation.messages.push({ role: 'user', content: isToolResult ? `System Note: ${text}` : text });
  }

  trimHistory(conversation);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversation.messages,
  ];

  const response = await openai.chat.completions.create({
    model: config.model || 'gpt-3.5-turbo',
    messages: messages,
    tools: voiceFunctionSchemas,
    tool_choice: 'auto' // Allow multiple tool calls natively
  });

  const message = response.choices[0].message;

  if (message.tool_calls && message.tool_calls.length > 0) {
    conversation.messages.push({ role: 'assistant', content: message.content || null, tool_calls: message.tool_calls });
    conversation.pendingToolCallIds = message.tool_calls.map(tc => tc.id);
    trimHistory(conversation);

    const actions = message.tool_calls.map(tc => ({ ...parseToolArguments(tc.function.arguments), type: tc.function.name }));

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
        } else if (a.type === 'tunnel_port' && a.port) {
          session.commandChain.push(`tunnel_port ${a.port}`);
        } else if (a.type === 'env_switch_profile' && a.profile_name) {
          session.commandChain.push(`env_switch_profile ${a.profile_name}`);
        }
      });
    }
    

    const resultObj = { type: 'multi_action', actions };
    if (matchedMemoryMetadata) {
      resultObj.memoryUsed = matchedMemoryMetadata;
    }
    return resultObj;
  }
  
  conversation.messages.push({ role: 'assistant', content: message.content || '' });
  trimHistory(conversation);

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
