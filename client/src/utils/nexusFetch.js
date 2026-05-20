// NexusTerm Global Fetch Wrapper — Centralized error handling
// Replaces raw fetch() calls with categorized, user-friendly error management

export class NexusError extends Error {
  constructor(category, message, statusCode = null) {
    super(message);
    this.name = 'NexusError';
    this.category = category; // 'NETWORK' | 'AUTH' | 'RATE_LIMIT' | 'SERVER' | 'PARSE'
    this.statusCode = statusCode;
    this.timestamp = Date.now();
  }

  get userMessage() {
    switch (this.category) {
      case 'NETWORK':
        return 'Connection lost. Please check if the backend server is running and your network is active.';
      case 'AUTH':
        return 'Authentication failed. Your session may have expired — please reload the page.';
      case 'RATE_LIMIT':
        return 'Too many requests. Please wait a moment and try again.';
      case 'SERVER':
        return `Server error (${this.statusCode}). Something went wrong on the backend.`;
      case 'PARSE':
        return 'Received an unexpected response from the server.';
      default:
        return this.message;
    }
  }
}

function getApiBase() {
  return import.meta.env.DEV ? 'http://127.0.0.1:4000' : '';
}

function getToken() {
  return new URLSearchParams(window.location.search).get('token');
}

/**
 * Centralized fetch wrapper with automatic token injection and error categorization.
 * @param {string} path - API path (e.g., '/api/files')
 * @param {RequestInit} options - Standard fetch options
 * @returns {Promise<Response>} The fetch response
 */
export async function nexusFetch(path, options = {}) {
  const token = getToken();
  const base = getApiBase();

  // Inject token into URL
  const separator = path.includes('?') ? '&' : '?';
  const url = `${base}${path}${separator}token=${token}`;

  let res;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
      },
    });
  } catch (err) {
    // TypeError = network failure (offline, server down, CORS, DNS fail)
    if (err instanceof TypeError) {
      throw new NexusError('NETWORK', err.message);
    }
    throw err;
  }

  if (res.status === 401 || res.status === 403) {
    throw new NexusError('AUTH', 'Unauthorized', res.status);
  }
  if (res.status === 429) {
    throw new NexusError('RATE_LIMIT', 'Rate limited', 429);
  }
  if (res.status >= 500) {
    throw new NexusError('SERVER', `Server error`, res.status);
  }

  return res;
}

/**
 * Convenience: fetch JSON with automatic parsing and error handling.
 */
export async function nexusFetchJSON(path, options = {}) {
  const res = await nexusFetch(path, options);
  try {
    return await res.json();
  } catch {
    throw new NexusError('PARSE', 'Failed to parse JSON response');
  }
}
