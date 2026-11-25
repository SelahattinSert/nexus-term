import { describe, it, expect } from 'vitest';
import { correctTranscript, buildHints, editDistance } from '../voice/voiceCorrection';

const context = {
  scripts: ['dev', 'build', 'test:e2e', 'storybook'],
  files: ['package.json', 'docker-compose.yml', 'README.md'],
  branches: ['main', 'origin/feature-login'],
  sshProfiles: ['production-api'],
  executables: ['npm', 'git', 'docker', 'kubectl', 'zzz-random-binary'],
};

describe('voice transcript correction', () => {
  it('fixes phonetic spellings of tools', () => {
    expect(correctTranscript('En pi em ran dev çalıştır', context).text).toBe('npm run dev çalıştır');
    expect(correctTranscript('doker kompoz up yap', context).text).toBe('docker compose up yap');
    expect(correctTranscript('es es eyç ile bağlan', context).text).toBe('ssh ile bağlan');
  });

  it('snaps near misses to names that exist in this terminal', () => {
    const r = correctTranscript('npm run storybok', context);
    expect(r.text).toBe('npm run storybook');
    expect(r.corrections).toContainEqual({ from: 'storybok', to: 'storybook' });
    expect(correctTranscript('production-apı sunucusuna bağlan', context).text).toContain('production-api');
  });

  it('leaves ordinary words alone', () => {
    const sentence = 'lütfen testleri tekrar çalıştır ve sonucu göster';
    expect(correctTranscript(sentence, context).text).toBe(sentence);
    expect(correctTranscript('make the build faster', context).text).toBe('make the build faster');
  });

  it('only uses known developer tools from PATH, not every binary', () => {
    expect(correctTranscript('zzz-random-binar', context).text).toBe('zzz-random-binar');
  });

  it('builds a short hint list with project words first', () => {
    const hints = buildHints(context);
    expect(hints[0]).toBe('dev');
    expect(hints).toContain('feature-login');
    expect(hints).toContain('npm');
    expect(hints.length).toBeLessThanOrEqual(60);
  });

  it('computes transposition-aware edit distance', () => {
    expect(editDistance('dokcer', 'docker')).toBe(1);
    expect(editDistance('abc', 'abcdefg')).toBe(3);
  });
});
