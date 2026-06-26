import crypto from 'crypto';

/**
 * Normalizes a raw error message by stripping variable parts (paths, versions, line numbers).
 * Used to cluster similar errors together.
 * 
 * @param {string} rawError - The raw error message from terminal stdout/stderr
 * @returns {string} The normalized, stable error string
 */
export function normalize(rawError) {
  if (!rawError || typeof rawError !== 'string') return '';

  let normalized = rawError.toLowerCase();

  // 1. Remove Windows absolute paths (e.g., C:\Users\name\project\file.js or C:/Users/...)
  normalized = normalized.replace(/[a-zA-Z]:[\\/][\w\-\.\s\\/]+/g, '<path>/');

  // 2. Remove Unix absolute paths (e.g., /home/user/project/file.js)
  normalized = normalized.replace(/\/[\w\-\.\s]+(?:\/[\w\-\.\s]+)+/g, '<path>/');

  // 3. Remove relative paths (e.g., ./node_modules/foo/bar, ../../bar, .\foo\bar)
  normalized = normalized.replace(/(?:\.\.?[\\/])+[\w\-\.\s\\/]+/g, '<path>/');

  // 4. Remove version numbers (e.g., v18.2.0, 1.0.4, @1.0.0-beta.1)
  normalized = normalized.replace(/\bv?\d+\.\d+\.\d+(?:-[\w\.]+)?\b/g, '<version>');

  // 5. Remove hexadecimal addresses (e.g., 0x7f8a2b4c, 0X1A2B)
  normalized = normalized.replace(/0x[0-9a-fA-F]+/g, '<addr>');

  // 6. Remove line/column numbers (e.g., at line 42, (42:8), :42:8, :42)
  normalized = normalized.replace(/at line \d+/g, 'at line <n>');
  normalized = normalized.replace(/\(\d+:\d+\)/g, 'at line <n>');
  normalized = normalized.replace(/:\d+:\d+/g, 'at line <n>');
  normalized = normalized.replace(/:\d+/g, 'at line <n>');

  // 7. Collapse multiple whitespaces to single spaces
  normalized = normalized.replace(/\s+/g, ' ');

  // 8. Trim and limit to 300 characters
  normalized = normalized.trim().substring(0, 300);

  return normalized;
}

/**
 * Generates a SHA-256 fingerprint for a raw error message.
 * 
 * @param {string} rawError - The raw error message
 * @returns {string} SHA-256 hex string
 */
export function fingerprint(rawError) {
  const normalized = normalize(rawError);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
