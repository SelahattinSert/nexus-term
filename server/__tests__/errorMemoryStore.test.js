import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { add, findByFingerprint, findByKeywords, getAll, deleteEntry, clear } from '../services/errorMemoryStore.js';

describe('errorMemoryStore', () => {
  beforeEach(() => {
    clear();
  });

  afterEach(() => {
    clear();
  });

  it('should add memory entry and retrieve it by exact fingerprint', () => {
    const entry = {
      id: 'mem-101',
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      useCount: 1,
      errorFingerprint: 'hash-abc-123',
      errorPattern: 'Error: Cannot find module express',
      errorKeywords: ['cannot', 'find', 'module', 'express'],
      solutionSummary: 'Install express package via npm install express',
      commandChain: ['npm install express']
    };

    add(entry);

    const found = findByFingerprint('hash-abc-123');
    assert(found, 'Should find entry by exact fingerprint');
    assert.equal(found.solutionSummary, 'Install express package via npm install express');
    assert.equal(found.useCount, 2, 'useCount should increment on findByFingerprint');
  });

  it('should find entries by keyword overlap with minimum score threshold', () => {
    add({
      id: 'mem-201',
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      useCount: 1,
      errorFingerprint: 'fp-201',
      errorPattern: 'EADDRINUSE: address already in use :::3000',
      errorKeywords: ['eaddrinuse', 'address', 'in', 'use', '3000'],
      solutionSummary: 'Kill process on port 3000',
      commandChain: ['npx kill-port 3000']
    });

    // Search with 3 matching keywords
    const matches = findByKeywords(['eaddrinuse', '3000', 'use']);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].score, 3);

    // Search with only 1 matching keyword (should be filtered out because score < 2)
    const noMatches = findByKeywords(['3000']);
    assert.equal(noMatches.length, 0);
  });

  it('should list all entries and delete specific entry or clear all', () => {
    add({ id: 'm1', errorFingerprint: 'fp1', errorKeywords: ['a', 'b'], solutionSummary: 's1' });
    add({ id: 'm2', errorFingerprint: 'fp2', errorKeywords: ['c', 'd'], solutionSummary: 's2' });

    assert.equal(getAll().length, 2);

    deleteEntry('m1');
    assert.equal(getAll().length, 1);
    assert.equal(getAll()[0].id, 'm2');

    clear();
    assert.equal(getAll().length, 0);
  });
});
