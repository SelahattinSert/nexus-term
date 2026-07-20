import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scanPorts, killProcess } from '../services/portScanner.js';

describe('portScanner service', () => {
  it('should scan ports and return a sorted array of port objects', async () => {
    const ports = await scanPorts(true);
    assert(Array.isArray(ports), 'ports should be an array');
    
    for (let i = 0; i < ports.length - 1; i++) {
      assert(ports[i].port <= ports[i + 1].port, 'ports must be sorted ascending by port number');
    }

    if (ports.length > 0) {
      const p = ports[0];
      assert(typeof p.port === 'number', 'port must be a number');
      assert(typeof p.protocol === 'string', 'protocol must be a string');
      assert(typeof p.state === 'string', 'state must be a string');
    }
  });

  it('should filter out ephemeral ports when includeEphemeral is false', async () => {
    const portsWithoutEphemeral = await scanPorts(false);
    const hasEphemeral = portsWithoutEphemeral.some(p => p.port > 49151);
    assert.equal(hasEphemeral, false, 'Ephemeral ports (>49151) must be excluded when flag is false');
  });

  it('should enforce security guards in killProcess', async () => {
    await assert.rejects(
      async () => await killProcess(process.pid),
      /Cannot kill the NexusTerm server process/,
      'Must reject killing current process'
    );

    await assert.rejects(
      async () => await killProcess(1),
      /Cannot kill init process/,
      'Must reject killing PID 1'
    );

    await assert.rejects(
      async () => await killProcess(null),
      /Invalid PID/,
      'Must reject invalid PID'
    );
  });
});
