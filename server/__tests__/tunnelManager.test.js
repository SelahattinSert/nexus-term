import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAvailableProviders, stopTunnel, getActiveTunnels, startTunnel } from '../services/tunnelManager.js';

describe('tunnelManager service', () => {
  it('should list available tunnel providers on the host', async () => {
    const providers = await getAvailableProviders();
    assert(Array.isArray(providers), 'providers should be an array');
  });

  it('should return empty active tunnels by default', () => {
    const tunnels = getActiveTunnels();
    assert.deepEqual(tunnels, {});
  });

  it('should safely return false when stopping a non-existent tunnel', async () => {
    const stopped = await stopTunnel(99999);
    assert.equal(stopped, false);
  });

  it('should reject startTunnel if no providers or invalid provider specified', async () => {
    await assert.rejects(
      async () => await startTunnel(8080, 'nonexistent_provider_foo'),
      /No tunnel providers found|not found or not installed/
    );
  });
});
