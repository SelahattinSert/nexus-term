/**
 * A robust state-machine parser for .env files.
 * Preserves comments, blank lines, and handles quoting and escaping.
 */

const MASK_PATTERNS = [
  'SECRET', 'PASSWORD', 'PASSWD', 'TOKEN', 'API_KEY', 'APIKEY', 
  'PRIVATE_KEY', 'AUTH', 'CREDENTIAL', 'ACCESS_KEY', 'PRIVATE'
];

export function isKeySensitive(key) {
  if (!key) return false;
  const upperKey = key.toUpperCase();
  return MASK_PATTERNS.some(p => upperKey.includes(p));
}

function detectType(value, isMasked) {
  if (isMasked) return 'secret';
  if (/^(true|false|yes|no)$/i.test(value)) return 'boolean';
  if (/^https?:\/\//i.test(value)) return 'url';
  if (/^\d{2,5}$/.test(value)) return 'port';
  if (/^-?\d+(\.\d+)?$/.test(value)) return 'number';
  return 'string';
}

export function parseEnv(content) {
  const variables = [];
  const lines = content.split('\n');
  
  let currentKey = '';
  let currentValue = '';
  let currentComment = '';
  let inMultilineQuote = null; // '"' or "'"
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // If we are continuing a multiline string from previous line
    if (inMultilineQuote) {
      const quoteIndex = line.indexOf(inMultilineQuote);
      if (quoteIndex !== -1 && (quoteIndex === 0 || line[quoteIndex - 1] !== '\\')) {
        // End of multiline string
        currentValue += '\n' + line.substring(0, quoteIndex);
        
        // Check for inline comment after the quote
        const rest = line.substring(quoteIndex + 1).trim();
        if (rest.startsWith('#')) {
          currentComment = rest.substring(1).trim();
        }
        
        variables.push(buildVariable(currentKey, currentValue, currentComment, variables));
        inMultilineQuote = null;
        currentKey = ''; currentValue = ''; currentComment = '';
      } else {
        currentValue += '\n' + line;
      }
      continue;
    }

    const trimmed = line.trim();

    // Blank line
    if (trimmed === '') {
      variables.push({ isBlank: true, raw: line });
      continue;
    }

    // Full line comment
    if (trimmed.startsWith('#')) {
      variables.push({ isComment: true, raw: line, value: trimmed.substring(1).trim() });
      continue;
    }

    // Remove 'export ' prefix if exists
    let processLine = line;
    if (trimmed.startsWith('export ')) {
      processLine = line.replace(/^\s*export\s+/, '');
    }

    // Find equal sign (or lack thereof)
    const eqIndex = processLine.indexOf('=');
    
    if (eqIndex === -1) {
      // KEY_WITHOUT_VALUE
      const keyMatch = processLine.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(#.*)?$/);
      if (keyMatch) {
        currentKey = keyMatch[1];
        currentComment = keyMatch[2] ? keyMatch[2].substring(1).trim() : '';
        variables.push(buildVariable(currentKey, '', currentComment, variables));
        currentKey = ''; currentComment = '';
      } else {
        // Malformed
        variables.push({ isMalformed: true, raw: line });
      }
      continue;
    }

    currentKey = processLine.substring(0, eqIndex).trim();
    const restOfLine = processLine.substring(eqIndex + 1).trim();
    
    // Check if value starts with quote
    if (restOfLine.startsWith('"') || restOfLine.startsWith("'")) {
      const quoteChar = restOfLine[0];
      // Search for ending quote that is not escaped
      let endQuoteIndex = -1;
      for (let j = 1; j < restOfLine.length; j++) {
        if (restOfLine[j] === quoteChar && restOfLine[j-1] !== '\\') {
          endQuoteIndex = j;
          break;
        }
      }

      if (endQuoteIndex !== -1) {
        // Closed on same line
        currentValue = restOfLine.substring(1, endQuoteIndex);
        const afterQuote = restOfLine.substring(endQuoteIndex + 1).trim();
        if (afterQuote.startsWith('#')) {
          currentComment = afterQuote.substring(1).trim();
        }
        variables.push(buildVariable(currentKey, currentValue, currentComment, variables));
        currentKey = ''; currentValue = ''; currentComment = '';
      } else {
        // Multiline string started
        currentValue = restOfLine.substring(1); // skip opening quote
        // If line ends with '\', remove it because it's a bash continuation
        if (currentValue.endsWith('\\')) currentValue = currentValue.slice(0, -1);
        inMultilineQuote = quoteChar;
      }
    } else {
      // Unquoted value. Read until '#'
      const commentIndex = restOfLine.indexOf(' #'); // Require space before # for inline comments in unquoted values
      if (commentIndex !== -1) {
        currentValue = restOfLine.substring(0, commentIndex).trim();
        currentComment = restOfLine.substring(commentIndex + 2).trim();
      } else {
        // Might start with # directly without space if it's the only thing after =
        if (restOfLine.startsWith('#')) {
           currentValue = '';
           currentComment = restOfLine.substring(1).trim();
        } else {
           currentValue = restOfLine;
           currentComment = '';
        }
      }
      variables.push(buildVariable(currentKey, currentValue, currentComment, variables));
      currentKey = ''; currentValue = ''; currentComment = '';
    }
  }

  // Check duplicates
  const keyCounts = {};
  for (const v of variables) {
    if (v.key) {
      keyCounts[v.key] = (keyCounts[v.key] || 0) + 1;
    }
  }
  
  for (const v of variables) {
    if (v.key && keyCounts[v.key] > 1) {
      v.isDuplicate = true;
    }
  }

  return variables;
}

function buildVariable(key, value, comment, existingVars) {
  // Unescape \n, \r, \t if they are literal in the file
  const unescapedValue = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
  const isMasked = isKeySensitive(key);
  
  return {
    key,
    value: unescapedValue,
    isMasked,
    comment,
    isEmpty: unescapedValue.length === 0,
    isDuplicate: false, // will check at end
    type: detectType(unescapedValue, isMasked)
  };
}

export function serializeEnv(variables) {
  let out = '';
  for (const v of variables) {
    if (v.isBlank) {
      out += '\n';
    } else if (v.isComment) {
      out += `# ${v.value}\n`;
    } else if (v.isMalformed) {
      out += `${v.raw}\n`;
    } else if (v.key) {
      let line = `${v.key}=`;
      
      // Quote if multiline or contains spaces/hash
      if (v.value.includes('\n') || v.value.includes(' ') || v.value.includes('#')) {
        const escaped = v.value.replace(/\n/g, '\\n').replace(/"/g, '\\"');
        line += `"${escaped}"`;
      } else {
        line += v.value;
      }

      if (v.comment) {
        line += ` # ${v.comment}`;
      }
      out += line + '\n';
    }
  }
  return out;
}