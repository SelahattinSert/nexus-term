/**
 * Fixes words an offline speech recognizer typically mishears in a developer's speech, conservatively:
 *  1. Phonetic spellings of well-known tools (mostly how Turkish speakers' English terms come out:
 *     "en pi em" → npm, "doker" → docker, "es es eyç" → ssh).
 *  2. Near misses of words that really exist in this terminal's context: npm scripts, files, git
 *     branches, SSH profile names and well-known developer tools installed on this machine.
 * Ordinary words are never "corrected" into rare names: fuzzy matching only applies to tokens that
 * are not common words, and only within a small edit distance.
 */

// [pattern, replacement] — applied on the lower-cased text, word boundaries are explicit
const PHONETIC = [
  [/\b(?:pi|pe)\s*(?:en|n)\s*(?:pi|pe)\s*(?:em|m)\b/g, 'pnpm'],
  [/\b(?:en|n)\s*(?:pi|pe)\s*(?:em|m)\b|\benpiem\b|\benpeem\b/g, 'npm'],
  [/\b(?:en|n)\s*(?:pi|pe)\s*(?:eks|x)\b|\benpieks\b/g, 'npx'],
  [/\bdoker\b|\bdokır\b|\bdakır\b/g, 'docker'],
  [/\bdoker\s*kompoz\b|\bdocker\s*kompoz\b/g, 'docker compose'],
  [/\b(?:es\s*es\s*(?:eyç|eyc|ha|h))\b/g, 'ssh'],
  [/\b(?:si|se)\s*di\b/g, 'cd'],
  [/\bel\s*es\b/g, 'ls'],
  [/\bpi\s*dabılyu\s*di\b|\bpi\s*double\s*you\s*di\b/g, 'pwd'],
  [/\bpayton\b|\bpaytın\b|\bpaiton\b/g, 'python'],
  [/\bnoud\b|\bnodcey\s*es\b/g, 'node'],
  [/\bkubernetis\b|\bkübernetis\b|\bkubernetes\b/g, 'kubernetes'],
  [/\bkub\s*kontrol\b|\bkubektıl\b|\bkube\s*control\b/g, 'kubectl'],
  [/\bvi\s*es\s*kod\b/g, 'vscode'],
  [/\bgit\s*hab\b|\bgithab\b/g, 'github'],
  [/\bcomit\b|\bkomit\b|\bkommit\b/g, 'commit'],
  [/\bpuş\b|\bpuş\b/g, 'push'],
  [/\bpul\b/g, 'pull'],
  [/\bbranç\b|\bbranş\b/g, 'branch'],
  [/\bçekaut\b|\bçekout\b/g, 'checkout'],
  [/\binstol\b|\binstal\b/g, 'install'],
  [/\b(npm|pnpm|yarn|bun)\s+ran\b/g, '$1 run'],
  [/\b(run|ran)\s+bild\b/g, 'run build'],
  [/\b(npm|pnpm|yarn|bun|run)\s+tes\b/g, '$1 test'],
  [/\blokalhost\b|\blokal\s*host\b/g, 'localhost'],
  [/\bsudu\b|\bsu\s*du\b/g, 'sudo'],
];

// JavaScript's \b only knows ASCII letters, so "eyç" or "dokır" would never match: use a Unicode-aware boundary
const UNICODE_BOUNDARY = '(?:(?<=[\\p{L}\\p{N}])(?![\\p{L}\\p{N}])|(?<![\\p{L}\\p{N}])(?=[\\p{L}\\p{N}]))';

// Words that must never be replaced by a fuzzy match (frequent Turkish and English words)
const COMMON_WORDS = new Set(`
  bir iki üç bu şu o ve ile ya da de da mi mı mu mü ne neden nasıl hangi kim için gibi kadar daha çok az
  şimdi sonra önce tekrar lütfen tamam evet hayır var yok olan olarak oldu olsun yap yapar yaptı çalıştır
  çalıştı başlat durdur kapat aç sil ekle göster listele kontrol bak bul getir gönder kaydet yükle kur
  dosya klasör dizin proje sunucu port hata test derle komut terminal sekme
  the a an and or to of in on for with this that it is are was be run start stop open close show list
  make build test dev install update delete remove add check find get set new old all please now
`.split(/\s+/).filter(Boolean));

// Developer tools worth matching against when they are installed (keeps PATH noise out)
const DEV_TOOLS = new Set([
  'npm', 'npx', 'pnpm', 'yarn', 'bun', 'node', 'deno', 'git', 'docker', 'podman', 'kubectl', 'helm',
  'python', 'python3', 'pip', 'pip3', 'uv', 'poetry', 'cargo', 'rustc', 'go', 'java', 'mvn', 'gradle',
  'dotnet', 'make', 'cmake', 'ssh', 'scp', 'rsync', 'curl', 'wget', 'grep', 'find', 'tail', 'less',
  'htop', 'top', 'systemctl', 'journalctl', 'code', 'vim', 'nvim', 'nano', 'tmux', 'terraform', 'ansible',
  'flutter', 'dart', 'composer', 'php', 'ruby', 'gem', 'bundle', 'rails', 'psql', 'mysql', 'redis-cli',
]);

/** Damerau–Levenshtein (optimal string alignment) distance, small inputs only. */
export function editDistance(a, b) {
  const n = a.length;
  const m = b.length;
  if (Math.abs(n - m) > 2) return 3;
  const d = Array.from({ length: n + 1 }, (_, i) => [i, ...new Array(m).fill(0)]);
  for (let j = 1; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[n][m];
}

/**
 * Builds the vocabulary of names that exist in this terminal's context.
 * @param {{scripts?:string[], files?:string[], branches?:string[], sshProfiles?:string[], executables?:string[]}} context
 */
export function buildVocabulary(context = {}) {
  const words = new Set();
  const add = (w) => {
    const v = String(w || '').trim();
    if (v.length >= 3 && v.length <= 40 && !/\s/.test(v)) words.add(v);
  };
  (context.scripts || []).forEach(add);
  (context.files || []).forEach(add);
  (context.branches || []).forEach(b => add(String(b).replace(/^origin\//, '')));
  (context.sshProfiles || []).forEach(add);
  (context.executables || []).filter(e => DEV_TOOLS.has(e)).forEach(add);
  return [...words];
}

/** Short list of expected words for Whisper prompt conditioning (most specific first). */
export function buildHints(context = {}) {
  const base = ['npm', 'git', 'docker', 'localhost', 'sudo', 'cd', 'ls'];
  return [...new Set([
    ...(context.scripts || []).slice(0, 15),
    ...(context.sshProfiles || []).slice(0, 10),
    ...(context.branches || []).map(b => String(b).replace(/^origin\//, '')).slice(0, 10),
    ...(context.files || []).slice(0, 20),
    ...base,
  ])].filter(w => w && w.length <= 40).slice(0, 60);
}

/**
 * @returns {{ text: string, corrections: Array<{from: string, to: string}> }}
 */
export function correctTranscript(input, context = {}) {
  const corrections = [];
  let text = String(input || '').trim();
  if (!text) return { text: '', corrections };

  // 1. phonetic spellings (case-insensitive, keep the rest of the sentence untouched)
  for (const [pattern, replacement] of PHONETIC) {
    text = text.replace(new RegExp(pattern.source.replaceAll('\\b', UNICODE_BOUNDARY), 'giu'), (match, ...groups) => {
      const to = replacement.replace(/\$(\d)/g, (_, i) => groups[Number(i) - 1] || '');
      if (match.toLowerCase() !== to.toLowerCase()) corrections.push({ from: match, to });
      return to;
    });
  }

  // 2. near misses of names that exist here
  const vocabulary = buildVocabulary(context);
  if (vocabulary.length) {
    const lowerVocab = vocabulary.map(v => v.toLowerCase());
    text = text.replace(/[\p{L}\p{N}][\p{L}\p{N}._-]*/gu, (token) => {
      const lower = token.toLowerCase();
      if (lower.length < 4 || COMMON_WORDS.has(lower) || lowerVocab.includes(lower)) return token;
      const maxDistance = lower.length >= 8 ? 2 : 1;
      let best = null;
      let bestDistance = maxDistance + 1;
      let tie = false;
      lowerVocab.forEach((cand, i) => {
        const dist = editDistance(lower, cand);
        if (dist < bestDistance) { best = vocabulary[i]; bestDistance = dist; tie = false; }
        else if (dist === bestDistance) tie = true;
      });
      if (!best || bestDistance > maxDistance || tie) return token; // ambiguous: leave it
      corrections.push({ from: token, to: best });
      return best;
    });
  }

  return { text, corrections };
}
