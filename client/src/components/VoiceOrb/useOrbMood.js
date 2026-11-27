import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { RUNNING_RANK, TRANSIENT_MS, SHOW_DELAY_MS, getMood } from './orbMoods';

// ── Command classification ─────────────────────────────────────────────

const WRAPPERS = new Set(['sudo', 'time', 'nice', 'nohup', 'exec', 'env', 'command', 'doas', 'npx', 'bunx', 'pnpx']);
const PKG_MANAGERS = new Set(['npm', 'yarn', 'pnpm', 'bun']);
const PKG_INSTALL = new Set(['i', 'install', 'ci', 'add', 'isntall']);
const SYSTEM_PKG = new Set(['apt', 'apt-get', 'dnf', 'yum', 'zypper', 'brew', 'flatpak', 'snap', 'apk', 'port']);
const SYSTEM_PKG_INSTALL = new Set(['install', 'upgrade', 'update', 'reinstall', 'dist-upgrade', 'full-upgrade', 'add', 'groupinstall']);
const BUILD_TOOLS = new Set(['tsc', 'webpack', 'rollup', 'esbuild', 'parcel', 'ninja', 'gcc', 'g++', 'clang', 'clang++', 'cc', 'javac', 'rustc', 'msbuild']);
const TEST_TOOLS = new Set(['vitest', 'jest', 'pytest', 'mocha', 'ava', 'rspec', 'phpunit', 'tox', 'nox', 'ctest', 'karma', 'cypress', 'tap']);
const SERVER_TOOLS = new Set(['nodemon', 'uvicorn', 'gunicorn', 'hypercorn', 'http-server', 'live-server', 'serve', 'caddy', 'nginx', 'json-server']);

/** Classifies an npm/yarn/pnpm/bun script name. */
function classifyScript(name) {
  if (!name) return 'command';
  if (/^(test|t|e2e|spec|coverage)(:|$)|^test/.test(name)) return 'testing';
  if (/^(dev|start|serve|preview|watch)(:|$)/.test(name)) return 'server';
  if (/build|compile|bundle|^dist|^package(:|$)/.test(name)) return 'building';
  return 'command';
}

function baseName(token) {
  const name = token.split('/').pop() || token;
  if (/^python(\d+(\.\d+)*)?$/.test(name)) return 'python';
  if (/^pip(\d+(\.\d+)*)?$/.test(name)) return 'pip';
  return name;
}

/** Classifies a single simple command (no chaining operators). */
function classifySegment(segment) {
  let tokens = segment.trim().split(/\s+/).filter(Boolean);
  // Drop leading env assignments and wrapper commands (sudo, time, npx …)
  while (tokens.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0]) || WRAPPERS.has(tokens[0]))) tokens = tokens.slice(1);
  if (!tokens.length) return null;
  const cmd = baseName(tokens[0]);
  const args = tokens.slice(1);
  const sub = args.find(a => !a.startsWith('-')) || '';
  const sub2 = args.filter(a => !a.startsWith('-'))[1] || '';

  // JavaScript package managers ("bun file.ts" runs a file, handled with node below)
  if (PKG_MANAGERS.has(cmd) && !(cmd === 'bun' && /\.[cm]?[jt]sx?$/.test(sub))) {
    if (cmd === 'yarn' && !sub) return 'installing'; // bare "yarn" installs
    if (PKG_INSTALL.has(sub) || sub === 'update' || sub === 'upgrade' || sub === 'sync') return 'installing';
    if (sub === 'dlx' || sub === 'exec' || sub === 'x') return classifySegment(args.slice(args.indexOf(sub) + 1).join(' '));
    if (sub === 'run' || sub === 'run-script') return classifyScript(sub2);
    if (sub === 'test' || sub === 't') return 'testing';
    if (sub === 'start') return 'server';
    if (cmd === 'npm') return 'command'; // other npm sub-commands (ls, audit, publish …)
    return classifyScript(sub); // yarn/pnpm/bun accept bare script names
  }
  if (cmd === 'deno') {
    if (sub === 'test') return 'testing';
    if (sub === 'compile') return 'building';
    if (sub === 'task') return classifyScript(sub2);
    if (sub === 'serve') return 'server';
    return 'command';
  }

  // Python
  if (cmd === 'pip' || cmd === 'pipx') return sub === 'install' ? 'installing' : 'command';
  if (cmd === 'uv') {
    if (sub === 'pip' && sub2 === 'install') return 'installing';
    if (sub === 'add' || sub === 'sync') return 'installing';
    if (sub === 'run') return classifySegment(args.slice(args.indexOf('run') + 1).join(' ')) || 'command';
    return 'command';
  }
  if (cmd === 'poetry' || cmd === 'pipenv' || cmd === 'conda' || cmd === 'mamba') {
    if (['install', 'add', 'sync', 'update'].includes(sub)) return 'installing';
    if (sub === 'build') return 'building';
    if (sub === 'run') return classifySegment(args.slice(args.indexOf('run') + 1).join(' ')) || 'command';
    return 'command';
  }
  if (cmd === 'python') {
    const mIdx = args.indexOf('-m');
    if (mIdx !== -1) {
      const mod = args[mIdx + 1] || '';
      const rest = args.slice(mIdx + 2).filter(a => !a.startsWith('-'));
      if (mod === 'pip') return rest[0] === 'install' ? 'installing' : 'command';
      if (mod === 'pytest' || mod === 'unittest' || mod === 'tox') return 'testing';
      if (mod === 'http.server' || mod === 'SimpleHTTPServer' || mod === 'uvicorn' || mod === 'flask' || mod === 'streamlit') return 'server';
      if (mod === 'build') return 'building';
      return 'command';
    }
    if (/manage\.py$/.test(sub)) {
      if (sub2 === 'runserver') return 'server';
      if (sub2 === 'test') return 'testing';
      return 'command';
    }
    if (/(^|\/)(app|server|main|wsgi|asgi)\.py$/.test(sub)) return 'server';
    return 'command';
  }
  if (cmd === 'flask' || cmd === 'django-admin') return sub === 'run' || sub === 'runserver' ? 'server' : 'command';
  if (cmd === 'streamlit') return sub === 'run' ? 'server' : 'command';

  // Rust / Go / JVM / .NET / others
  if (cmd === 'cargo') {
    if (sub === 'build' || sub === 'b' || sub === 'check' || sub === 'clippy') return 'building';
    if (sub === 'test' || sub === 't' || sub === 'nextest' || sub === 'bench') return 'testing';
    if (sub === 'add' || sub === 'install' || sub === 'fetch' || sub === 'update') return 'installing';
    if (sub === 'watch') return 'server';
    return 'command';
  }
  if (cmd === 'go') {
    if (sub === 'build') return 'building';
    if (sub === 'test') return 'testing';
    if (sub === 'get' || sub === 'install' || (sub === 'mod' && (sub2 === 'download' || sub2 === 'tidy'))) return 'installing';
    return 'command';
  }
  if (cmd === 'gradle' || cmd === 'gradlew') {
    if (args.some(a => /^(test|check|connectedAndroidTest)$|:test$/.test(a))) return 'testing';
    if (args.some(a => /^(build|assemble\w*|compile\w*|jar|bootJar|shadowJar)$|:(build|assemble\w*)$/.test(a))) return 'building';
    if (args.some(a => /^(bootRun|run)$/.test(a))) return 'server';
    return 'command';
  }
  if (cmd === 'mvn' || cmd === 'mvnw') {
    if (args.includes('test') || args.includes('verify')) return 'testing';
    if (args.some(a => ['compile', 'package', 'install', 'deploy'].includes(a))) return 'building';
    if (args.some(a => /spring-boot:run|jetty:run/.test(a))) return 'server';
    return 'command';
  }
  if (cmd === 'dotnet') {
    if (sub === 'build' || sub === 'publish') return 'building';
    if (sub === 'test') return 'testing';
    if (sub === 'restore' || sub === 'add') return 'installing';
    if (sub === 'run' || sub === 'watch') return 'server';
    return 'command';
  }
  if (cmd === 'make' || cmd === 'gmake') {
    if (['test', 'check', 'tests'].includes(sub)) return 'testing';
    if (sub === 'install') return 'installing';
    if (['run', 'serve', 'dev', 'start'].includes(sub)) return 'server';
    return 'building';
  }
  if (cmd === 'cmake') return args.includes('--build') ? 'building' : 'command';
  if (cmd === 'bazel' || cmd === 'bazelisk' || cmd === 'swift' || cmd === 'zig') {
    if (sub === 'build') return 'building';
    if (sub === 'test') return 'testing';
    if (sub === 'run') return 'server';
    return 'command';
  }
  if (cmd === 'docker' || cmd === 'podman' || cmd === 'docker-compose') {
    const words = args.filter(a => !a.startsWith('-'));
    if (words.includes('build') || (words[0] === 'buildx' && words[1] === 'build')) return 'building';
    if (words.includes('pull')) return 'installing';
    if (words.includes('up') && !args.includes('-d') && !args.includes('--detach')) return 'server';
    return 'command';
  }
  if (cmd === 'vite') {
    if (sub === 'build') return 'building';
    if (sub === 'optimize') return 'command';
    return 'server'; // bare "vite", "vite dev", "vite preview", "vite --port 3000" …
  }
  if (cmd === 'next' || cmd === 'nuxt' || cmd === 'astro' || cmd === 'remix' || cmd === 'ng' || cmd === 'expo' || cmd === 'react-scripts') {
    if (sub === 'build' || sub === 'export' || sub === 'generate') return 'building';
    if (sub === 'test') return 'testing';
    if (['dev', 'start', 'serve', 'preview'].includes(sub)) return 'server';
    return 'command';
  }
  if (cmd === 'node' || cmd === 'tsx' || cmd === 'ts-node' || cmd === 'bun') {
    if (args.includes('--test')) return 'testing';
    if (args.includes('--watch') || /(^|\/)(server|app|index|main)(\.[cm]?[jt]s)?$/.test(sub)) return 'server';
    return 'command';
  }
  if (cmd === 'php') return args.includes('-S') ? 'server' : (sub === 'artisan' && sub2 === 'serve' ? 'server' : 'command');
  if (cmd === 'rails') return sub === 's' || sub === 'server' ? 'server' : (sub === 'test' ? 'testing' : 'command');
  if (cmd === 'playwright') return sub === 'test' ? 'testing' : 'command';
  if (cmd === 'pacman' || cmd === 'yay' || cmd === 'paru') return args.some(a => /^-S/.test(a)) ? 'installing' : 'command';
  if (cmd === 'gem') return sub === 'install' ? 'installing' : 'command';
  if (cmd === 'bundle') return !sub || sub === 'install' || sub === 'update' ? 'installing' : (sub === 'exec' ? classifySegment(args.slice(args.indexOf('exec') + 1).join(' ')) : 'command');
  if (cmd === 'composer') return ['install', 'require', 'update'].includes(sub) ? 'installing' : 'command';
  if (cmd === 'rpm-ostree') return sub === 'install' || sub === 'upgrade' ? 'installing' : 'command';
  if (SYSTEM_PKG.has(cmd)) return SYSTEM_PKG_INSTALL.has(sub) ? 'installing' : 'command';
  if (BUILD_TOOLS.has(cmd)) return args.includes('--watch') || args.includes('-w') ? 'server' : 'building';
  if (TEST_TOOLS.has(cmd)) return 'testing';
  if (SERVER_TOOLS.has(cmd)) return 'server';
  return 'command';
}

/**
 * Classifies a shell command line into a terminal mood:
 * 'building' | 'testing' | 'installing' | 'server' | 'command', or null for an empty line.
 * Chained commands ("cd x && npm i && npm run build") take the most significant segment.
 */
export function classifyCommand(command) {
  const text = String(command || '').trim();
  if (!text) return null;
  const segments = text.split(/&&|\|\||;|\||\n/);
  let best = null;
  for (const seg of segments) {
    const kind = classifySegment(seg);
    if (!kind) continue;
    if (!best || segmentRank(kind) > segmentRank(best)) best = kind;
  }
  return best || 'command';
}

// Within one command line the "interesting" part wins; a trailing server ("npm i && npm run dev") still counts as a server.
function segmentRank(kind) {
  return { command: 0, installing: 1, building: 2, testing: 3, server: 4 }[kind] ?? 0;
}

export function isAgentSession(session) {
  return String(session?.createdBy || '').startsWith('mcp:');
}

// ── Mood controller (framework-free, testable with fake timers) ─────────

const SUCCESS_LABELS = { building: 'Build succeeded', testing: 'Tests passing' };

/**
 * Tracks running blocks, pending approvals and transient moods and reports the
 * resulting mood through onChange({ mood, label, pulseKey }).
 *
 * Priority: transient (error/success, ~2.5 s) > pending approval > highest-ranked
 * running command (agent > building > testing > installing > command > server) > idle.
 *
 * isKnownSession(sessionId) filters out blocks of sessions that do not belong to
 * this window (block events are broadcast for every server session).
 */
export function createMoodController({ onChange, isAgent = () => false, isKnownSession = () => true, now = () => Date.now() } = {}) {
  const running = new Map(); // sessionId -> { kind, visibleAt }
  const lastFailed = new Map(); // sessionId -> boolean
  let approvals = { server: false, local: false };
  let transient = null; // { mood, label, until }
  let pulseKey = 0;
  let timer = null;
  let current = { mood: 'idle', label: '', pulseKey: 0 };
  let disposed = false;

  function schedule() {
    clearTimeout(timer);
    timer = null;
    const t = now();
    const wakeups = [];
    if (transient) wakeups.push(transient.until);
    for (const r of running.values()) if (r.visibleAt > t) wakeups.push(r.visibleAt);
    if (!wakeups.length) return;
    timer = setTimeout(recompute, Math.max(0, Math.min(...wakeups) - t));
  }

  function compute() {
    const t = now();
    if (transient && transient.until <= t) transient = null;
    if (transient) return { mood: transient.mood, label: transient.label };
    if (approvals.server || approvals.local) return { mood: 'agent', label: 'Awaiting approval' };
    let best = null;
    for (const r of running.values()) {
      if (r.visibleAt > t) continue;
      if (!best || RUNNING_RANK[r.kind] > RUNNING_RANK[best]) best = r.kind;
    }
    if (best) return { mood: best, label: getMood(best).label };
    return { mood: 'idle', label: '' };
  }

  function recompute() {
    if (disposed) return;
    const next = compute();
    schedule();
    if (next.mood !== current.mood || next.label !== current.label || pulseKey !== current.pulseKey) {
      current = { ...next, pulseKey };
      onChange?.(current);
    }
  }

  function setTransient(mood, label) {
    const t = now();
    // Re-trigger the burst only when the previous transient has ended, so a burst
    // of failing commands extends the mood instead of flashing continuously.
    if (!transient || transient.mood !== mood) pulseKey += 1;
    transient = { mood, label, until: t + TRANSIENT_MS };
  }

  return {
    blockStarted(detail) {
      if (!detail?.sessionId || !isKnownSession(detail.sessionId)) return;
      const kind = isAgent(detail.sessionId) ? 'agent' : classifyCommand(detail.command);
      if (!kind) return;
      running.set(detail.sessionId, { kind, visibleAt: now() + SHOW_DELAY_MS });
      recompute();
    },
    blockFinished(detail) {
      if (!detail?.sessionId) return;
      if (!isKnownSession(detail.sessionId)) {
        // Still drop a stale entry (e.g. the session left this window while running), but never flash moods for it.
        if (running.delete(detail.sessionId)) recompute();
        return;
      }
      const prev = running.get(detail.sessionId);
      running.delete(detail.sessionId);
      const code = detail.exitCode;
      if (String(detail.command || '').trim() && code !== null && code !== undefined) {
        const kind = prev?.kind === 'agent' ? classifyCommand(detail.command) : (prev?.kind || classifyCommand(detail.command));
        if (code !== 0 && code !== 130) {
          lastFailed.set(detail.sessionId, true);
          setTransient('error', `Command failed (exit ${code})`);
        } else if (code === 0) {
          const recovered = lastFailed.get(detail.sessionId);
          lastFailed.delete(detail.sessionId);
          if (SUCCESS_LABELS[kind]) setTransient('success', SUCCESS_LABELS[kind]);
          else if (recovered) setTransient('success', 'Back on track');
        }
      }
      recompute();
    },
    setApprovals({ server = false, local = false } = {}) {
      if (approvals.server === !!server && approvals.local === !!local) return;
      approvals = { server: !!server, local: !!local };
      recompute();
    },
    /** Forgets blocks of sessions that no longer exist (closed tabs never send BLOCK_FINISHED). */
    pruneSessions(liveIds) {
      const live = new Set(liveIds);
      let changed = false;
      for (const id of [...running.keys()]) if (!live.has(id)) { running.delete(id); lastFailed.delete(id); changed = true; }
      if (changed) recompute();
    },
    /**
     * Reconciles running blocks with the server's session list, sent on every
     * control-channel (re)connect. BLOCK_FINISHED events lost during a reconnect
     * or server restart would otherwise leave the orb stuck in a running mood.
     */
    applySessionSnapshot(snapshot) {
      if (!Array.isArray(snapshot)) return;
      const byId = new Map(snapshot.filter(s => s && s.id).map(s => [s.id, s]));
      let changed = false;
      for (const id of [...running.keys()]) {
        const s = byId.get(id);
        if (!s || s.exited || !s.running) {
          running.delete(id);
          if (!s || s.exited) lastFailed.delete(id);
          changed = true;
        }
      }
      if (changed) recompute();
    },
    getMood() { return current; },
    dispose() { disposed = true; clearTimeout(timer); },
  };
}

// ── React hook ──────────────────────────────────────────────────────────

/** Returns { mood, label, pulseKey } for the orb, driven by terminal blocks and agent approvals. */
export function useOrbMood() {
  const [state, setState] = useState({ mood: 'idle', label: '', pulseKey: 0 });
  const serverPending = useStore(s => (s.serverApprovals?.length || 0) > 0);
  const localPending = useStore(s => !!s.pendingCommand);
  const sessions = useStore(s => s.sessions);
  const controllerRef = useRef(null);

  useEffect(() => {
    const controller = createMoodController({
      onChange: setState,
      isAgent: (sessionId) => isAgentSession((useStore.getState().sessions || []).find(s => s.id === sessionId)),
      isKnownSession: (sessionId) => (useStore.getState().sessions || []).some(s => s.id === sessionId),
    });
    controllerRef.current = controller;
    const onStart = (e) => controller.blockStarted(e.detail);
    const onFinish = (e) => controller.blockFinished(e.detail);
    const onSnapshot = (e) => controller.applySessionSnapshot(e.detail);
    window.addEventListener('nexus-block-started', onStart);
    window.addEventListener('nexus-block-finished', onFinish);
    window.addEventListener('nexus-sessions-snapshot', onSnapshot);
    return () => {
      window.removeEventListener('nexus-sessions-snapshot', onSnapshot);
      window.removeEventListener('nexus-block-started', onStart);
      window.removeEventListener('nexus-block-finished', onFinish);
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setApprovals({ server: serverPending, local: localPending });
  }, [serverPending, localPending]);

  useEffect(() => {
    controllerRef.current?.pruneSessions((sessions || []).map(s => s.id));
  }, [sessions]);

  return state;
}
