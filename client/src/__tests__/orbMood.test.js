import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { classifyCommand, createMoodController, isAgentSession } from '../components/VoiceOrb/useOrbMood';
import { MOODS, TRANSIENT_MS, SHOW_DELAY_MS } from '../components/VoiceOrb/orbMoods';
import { themes } from '../themes';

describe('classifyCommand', () => {
  const cases = {
    building: [
      'npm run build', 'yarn build', 'pnpm build', 'pnpm run build:prod', 'bun run build', 'cargo build --release',
      'make', 'make -j8', 'tsc -p .', 'npx tsc --noEmit', 'vite build', 'docker build -t app .', 'docker compose build',
      './gradlew assembleDebug', 'gradle build', 'mvn package', 'go build ./...', 'cmake --build build', 'next build',
    ],
    testing: [
      'npm test', 'npm t', 'npm run test:unit', 'yarn test', 'pnpm test', 'vitest run', 'npx vitest', 'jest --watch',
      'pytest -x', 'python -m pytest', 'cargo test', 'go test ./...', 'make test', './gradlew test', 'mvn test',
      'node --test', 'npx playwright test', 'deno test',
    ],
    installing: [
      'npm i', 'npm install', 'npm ci', 'npm i -D vitest', 'yarn', 'yarn add react', 'pnpm install', 'bun add zod',
      'pip install requests', 'pip3 install -r requirements.txt', 'python3 -m pip install x', 'sudo apt install curl',
      'sudo dnf install -y git', 'apt-get update', 'cargo add serde', 'brew install jq', 'uv add httpx', 'poetry install',
      'gem install rails', 'bundle install', 'sudo pacman -Syu',
    ],
    server: [
      'npm run dev', 'npm start', 'yarn dev', 'pnpm run preview', 'vite', 'vite --port 3000', 'node server.js',
      'node index.js', 'nodemon app.js', 'python -m http.server 8000', 'python manage.py runserver', 'flask run',
      'uvicorn main:app --reload', 'docker compose up', 'tsc --watch', 'next dev', 'php -S localhost:8000',
    ],
    command: ['ls -la', 'git status', 'cd src', 'cat package.json', 'npm audit', 'docker compose up -d', 'python script.py'],
  };
  for (const [kind, commands] of Object.entries(cases)) {
    for (const command of commands) {
      it(`classifies "${command}" as ${kind}`, () => {
        expect(classifyCommand(command)).toBe(kind);
      });
    }
  }

  it('strips env assignments and wrappers', () => {
    expect(classifyCommand('NODE_ENV=production npm run build')).toBe('building');
    expect(classifyCommand('time cargo test')).toBe('testing');
  });

  it('picks the most significant segment of chained commands', () => {
    expect(classifyCommand('cd app && npm i && npm run build')).toBe('building');
    expect(classifyCommand('npm ci && npm test')).toBe('testing');
    expect(classifyCommand('cd web; npm run dev')).toBe('server');
    expect(classifyCommand('cat log | grep error')).toBe('command');
  });

  it('returns null for empty input', () => {
    expect(classifyCommand('')).toBeNull();
    expect(classifyCommand('   ')).toBeNull();
    expect(classifyCommand(undefined)).toBeNull();
  });
});

describe('isAgentSession', () => {
  it('detects mcp-created sessions', () => {
    expect(isAgentSession({ createdBy: 'mcp:claude' })).toBe(true);
    expect(isAgentSession({ createdBy: 'ui' })).toBe(false);
    expect(isAgentSession(undefined)).toBe(false);
  });
});

describe('createMoodController', () => {
  let changes;
  let controller;
  const agentSessions = new Set(['agent-1']);

  beforeEach(() => {
    vi.useFakeTimers();
    changes = [];
    controller = createMoodController({
      onChange: (m) => changes.push(m),
      isAgent: (id) => agentSessions.has(id),
    });
  });

  afterEach(() => {
    controller.dispose();
    vi.useRealTimers();
  });

  const mood = () => controller.getMood().mood;
  const start = (sessionId, command) => controller.blockStarted({ id: `${sessionId}-${command}`, sessionId, command });
  const finish = (sessionId, command, exitCode) => controller.blockFinished({ sessionId, command, exitCode, durationMs: 10 });

  it('debounces short commands so they never reach the orb', () => {
    start('s1', 'ls');
    vi.advanceTimersByTime(100);
    finish('s1', 'ls', 0);
    vi.advanceTimersByTime(5000);
    expect(changes).toEqual([]);
    expect(mood()).toBe('idle');
  });

  it('shows a running mood after the show delay and returns to idle when it finishes', () => {
    start('s1', 'npm run dev');
    expect(mood()).toBe('idle');
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    expect(mood()).toBe('server');
    expect(controller.getMood().label).toBe(MOODS.server.label);
    finish('s1', 'npm run dev', 130);
    expect(mood()).toBe('idle');
  });

  it('prefers the highest-ranked running command across sessions', () => {
    start('s1', 'npm run dev');
    start('s2', 'npm run build');
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    expect(mood()).toBe('building');
    start('agent-1', 'npm test');
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    expect(mood()).toBe('agent');
  });

  it('shows an error on non-zero exit and decays back after the transient window', () => {
    start('s1', 'npm run dev');
    start('s2', 'cat missing');
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    finish('s2', 'cat missing', 1);
    expect(mood()).toBe('error');
    expect(controller.getMood().label).toContain('exit 1');
    vi.advanceTimersByTime(TRANSIENT_MS - 1);
    expect(mood()).toBe('error');
    vi.advanceTimersByTime(1);
    expect(mood()).toBe('server');
  });

  it('treats exit code 130 (Ctrl+C) and unknown exit codes as neutral', () => {
    finish('s1', 'sleep 100', 130);
    expect(mood()).toBe('idle');
    finish('s1', 'sleep 100', null);
    expect(mood()).toBe('idle');
    expect(changes).toEqual([]);
  });

  it('celebrates a successful build or test run', () => {
    start('s1', 'npm run build');
    vi.advanceTimersByTime(1000);
    finish('s1', 'npm run build', 0);
    expect(controller.getMood()).toMatchObject({ mood: 'success', label: 'Build succeeded' });
    vi.advanceTimersByTime(TRANSIENT_MS);
    expect(mood()).toBe('idle');

    finish('s1', 'vitest run', 0);
    expect(controller.getMood().label).toBe('Tests passing');
  });

  it('celebrates success after a failure in the same session only', () => {
    finish('s1', 'ls nope', 2);
    vi.advanceTimersByTime(TRANSIENT_MS);
    finish('s2', 'ls', 0);
    expect(mood()).toBe('idle');
    finish('s1', 'ls', 0);
    expect(controller.getMood()).toMatchObject({ mood: 'success', label: 'Back on track' });
    vi.advanceTimersByTime(TRANSIENT_MS);
    finish('s1', 'ls', 0);
    expect(mood()).toBe('idle');
  });

  it('extends instead of re-flashing on repeated failures', () => {
    finish('s1', 'false', 1);
    const firstKey = controller.getMood().pulseKey;
    vi.advanceTimersByTime(1000);
    finish('s1', 'false', 1);
    vi.advanceTimersByTime(1000);
    finish('s1', 'false', 1);
    expect(controller.getMood().pulseKey).toBe(firstKey);
    vi.advanceTimersByTime(TRANSIENT_MS - 1);
    expect(mood()).toBe('error');
    vi.advanceTimersByTime(1);
    expect(mood()).toBe('idle');
    finish('s1', 'false', 1);
    expect(controller.getMood().pulseKey).toBe(firstKey + 1);
  });

  it('shows the agent mood while an approval is pending', () => {
    controller.setApprovals({ server: true });
    expect(controller.getMood()).toMatchObject({ mood: 'agent', label: 'Awaiting approval' });
    controller.setApprovals({ server: false, local: true });
    expect(mood()).toBe('agent');
    controller.setApprovals({});
    expect(mood()).toBe('idle');
  });

  it('lets a transient mood briefly override a pending approval', () => {
    controller.setApprovals({ server: true });
    finish('s1', 'false', 1);
    expect(mood()).toBe('error');
    vi.advanceTimersByTime(TRANSIENT_MS);
    expect(mood()).toBe('agent');
  });

  it('forgets running blocks of closed sessions', () => {
    start('s1', 'npm run dev');
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    expect(mood()).toBe('server');
    controller.pruneSessions(['s2']);
    expect(mood()).toBe('idle');
  });

  it('drops running blocks of sessions the reconnect snapshot reports as not running', () => {
    start('s1', 'npm run build');
    start('s2', 'npm test');
    start('s3', 'npm run dev');
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    expect(mood()).toBe('building');
    controller.applySessionSnapshot([
      { id: 's1', running: false, exited: false, createdBy: 'ui' },
      { id: 's3', running: true, exited: false, createdBy: 'ui' },
      // s2 missing from the snapshot (e.g. server restarted)
    ]);
    expect(mood()).toBe('server');
    controller.applySessionSnapshot([{ id: 's3', running: true, exited: true }]);
    expect(mood()).toBe('idle');
    vi.advanceTimersByTime(10_000);
    expect(mood()).toBe('idle');
  });

  it('keeps running blocks the snapshot confirms and ignores malformed snapshots', () => {
    start('s1', 'npm run build');
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    controller.applySessionSnapshot(null);
    controller.applySessionSnapshot({ id: 's1' });
    controller.applySessionSnapshot([{ id: 's1', running: true, exited: false }]);
    expect(mood()).toBe('building');
  });

  it('drops a not-yet-visible block when the snapshot reports its session as idle', () => {
    start('s1', 'npm run build');
    controller.applySessionSnapshot([{ id: 's1', running: false, exited: false }]);
    vi.advanceTimersByTime(SHOW_DELAY_MS * 2);
    expect(mood()).toBe('idle');
    expect(changes).toEqual([]);
  });
});

describe('createMoodController session filtering', () => {
  let controller;
  const known = new Set(['mine']);

  beforeEach(() => {
    vi.useFakeTimers();
    controller = createMoodController({ isKnownSession: (id) => known.has(id) });
  });

  afterEach(() => {
    controller.dispose();
    vi.useRealTimers();
  });

  it('ignores blocks from sessions of other windows', () => {
    controller.blockStarted({ sessionId: 'other', command: 'npm run build' });
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    expect(controller.getMood().mood).toBe('idle');
    controller.blockFinished({ sessionId: 'other', command: 'false', exitCode: 1 });
    expect(controller.getMood().mood).toBe('idle');

    controller.blockStarted({ sessionId: 'mine', command: 'npm run build' });
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    expect(controller.getMood().mood).toBe('building');
    controller.blockFinished({ sessionId: 'mine', command: 'npm run build', exitCode: 1 });
    expect(controller.getMood().mood).toBe('error');
    vi.advanceTimersByTime(TRANSIENT_MS);
    expect(controller.getMood().mood).toBe('idle');
  });
});

describe('mood colors', () => {
  it('only use CSS variables that every theme defines', () => {
    const defined = Object.values(themes).map(t => new Set(Object.keys(t.ui)));
    for (const [name, def] of Object.entries(MOODS)) {
      expect(def.colorVar, name).not.toMatch(/#[0-9a-f]{3,8}/i);
      const vars = [...def.colorVar.matchAll(/--ctp-([a-z0-9]+)/g)].map(m => m[1]);
      expect(vars.length, name).toBeGreaterThan(0);
      for (const v of vars) {
        for (const set of defined) expect(set.has(v), `${name} uses --ctp-${v}`).toBe(true);
      }
    }
  });
});
