import pty from 'node-pty';
import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'events';
import { handleConnection } from '../ptyManager.js';
import * as llmService from '../llmService.js';

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

    llmService.setSessionForTest({
      setChatHistory: () => {},
      prompt: async () => 'fixed cmd'
    });
  });

  afterEach(() => {
    pty.spawn = originalSpawn;
    llmService.setSessionForTest(null);
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
    assert.strictEqual(closeReason, 'sessionId is required');
  });
  
  it('should handle terminal data, OSC 7 and OSC 999 events', async () => {
    return new Promise((resolve) => {
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      const messages = [];
      mockWs.send = (msg) => messages.push(msg);
      mockWs.close = () => {};

      const mockReq = { url: '/?token=token&sessionId=test-osc' };
      handleConnection(mockWs, mockReq, { getCpuUsage: () => 10 });
      
      // Simulate raw data
      ptyProcessMock.emit('data', 'hello');
      assert.ok(messages.includes('hello'));
      
      // Simulate OSC 7
      ptyProcessMock.emit('data', '\x1b]7;file://hostname/test/dir\x07');
      assert.ok(messages.some(m => m.includes('DIR_CHANGE')));

      // Simulate OSC 999
      ptyProcessMock.emit('data', '\x1b]999;{"type":"COMMAND_FAILED","cmd":"nmp i","exitCode":1}\x07');
      
      setTimeout(() => {
        assert.ok(messages.some(m => m.includes('ERROR')));
        resolve();
      }, 50);
    });
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
