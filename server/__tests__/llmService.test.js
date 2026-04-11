import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as llmService from '../llmService.js';

describe('llmService', () => {
  it('should not throw an error if model is missing during init', async () => {
    await assert.doesNotReject(async () => {
      await llmService.initLlama();
    });
  });

  it('analyzeCommandError should return corrected command', async () => {
    let prompted = false;
    let chatHistoryCleared = false;

    const mockSession = {
      setChatHistory: (history) => {
        if (history.length === 0) chatHistoryCleared = true;
      },
      prompt: async (promptText) => {
        prompted = true;
        return '"git checkout main"';
      }
    };
    
    llmService.setSessionForTest(mockSession);

    const result = await llmService.analyzeCommandError({ 
      cmd: 'git checout main',
      closestCommands: ['git'] 
    });

    assert.strictEqual(prompted, true);
    assert.strictEqual(chatHistoryCleared, true);
    assert.strictEqual(result, 'git checkout main');
  });

  it('analyzeCommandError should return null if LLM outputs FAILED', async () => {
    const mockSession = {
      setChatHistory: () => {},
      prompt: async () => 'FAILED'
    };
    llmService.setSessionForTest(mockSession);

    const result = await llmService.analyzeCommandError({ cmd: 'invalid command' });
    assert.strictEqual(result, null);
  });
});
