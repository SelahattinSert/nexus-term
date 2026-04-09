import { test } from 'node:test';
import assert from 'node:assert';
import { getSystemExecutables } from './pathScanner.js';

test('getSystemExecutables returns an array including builtins asynchronously', async () => {
  const execs = await getSystemExecutables();
  assert.ok(Array.isArray(execs), 'Should return an array');
  assert.ok(execs.includes('cd'), 'Should include builtin cd');
  assert.ok(execs.includes('ls'), 'Should include builtin ls');
  assert.ok(execs.length > 10, 'Should have multiple executables');
});