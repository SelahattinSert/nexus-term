/**
 * Extracts meaningful keywords from a normalized error string.
 * Used for fuzzy/partial matching when fingerprint lookup fails.
 * 
 * @param {string} normalizedError - The normalized error string
 * @returns {string[]} An array of up to 12 distinct keywords
 */
export function extractKeywords(normalizedError) {
  if (!normalizedError || typeof normalizedError !== 'string') return [];

  // Split on spaces, colons, semi-colons, newlines, backslashes, slashes, parentheses, brackets, and quotes
  const tokens = normalizedError.split(/[\s:;\n\\\/()[\]"']+/);

  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'at', 'in', 'of', 'to', 'for', 'and', 'or', 'with', 
    'by', 'from', 'on', 'this', 'that', 'it', 'be', 'are', 'was', 'were', 'been',
    'has', 'have', 'had', 'do', 'does', 'did', 'but', 'as', 'if', 'then', 'else'
  ]);

  const errorKeywords = new Set([
    'error', 'exception', 'failed', 'cannot', 'undefined', 'null', 'enoent', 
    'eacces', 'econnrefused', 'fatal', 'panic', 'traceback', 'denied', 'permission',
    'missing', 'invalid', 'timeout', 'refused', 'rejected', 'unauthorized'
  ]);

  const extracted = [];
  const seen = new Set();

  for (let token of tokens) {
    // Basic sanitization
    token = token.trim().toLowerCase();
    
    // Skip empty, short tokens (less than 3 chars) or pure numbers
    if (!token || token.length < 3 || /^\d+$/.test(token)) continue;

    // Skip generic stop words unless they are specifically in our error list
    if (stopWords.has(token) && !errorKeywords.has(token)) continue;

    // Skip placeholders generated during normalization
    if (token === '<path>' || token === '<version>' || token === '<addr>' || token === '<n>') continue;

    if (!seen.has(token)) {
      seen.add(token);
      extracted.push(token);
    }
  }

  // Limit to top 12 keywords
  return extracted.slice(0, 12);
}
