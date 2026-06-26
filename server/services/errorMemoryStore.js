import fs from 'fs';
import path from 'path';
import os from 'os';

const MEMORY_DIR = path.join(os.homedir(), '.nexusterm');
const MEMORY_FILE = path.join(MEMORY_DIR, 'error-memory.json');
const MAX_ENTRIES = 500;
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

let memoryCache = {
  version: 1,
  entries: []
};

let saveTimeout = null;
let lastSaveTime = 0;

/**
 * Loads the memory store from disk into the cache.
 */
export function load() {
  try {
    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }

    if (fs.existsSync(MEMORY_FILE)) {
      const content = fs.readFileSync(MEMORY_FILE, 'utf8');
      const data = JSON.parse(content);
      if (data && Array.isArray(data.entries)) {
        memoryCache = data;
        console.log(`[Memory Store] Loaded ${memoryCache.entries.length} memory entries from disk.`);
      }
    }
  } catch (err) {
    console.error('[Memory Store] Failed to load memory store:', err.message);
  }
}

/**
 * Enforces limits (LRU eviction based on lastUsedAt and file size limits).
 */
function enforceLimits() {
  // Sort entries: newest lastUsedAt first
  memoryCache.entries.sort((a, b) => new Date(b.lastUsedAt) - new Date(a.lastUsedAt));

  // 1. Evict entries over the maximum allowed count (500)
  if (memoryCache.entries.length > MAX_ENTRIES) {
    console.log(`[Memory Store] Evicting ${memoryCache.entries.length - MAX_ENTRIES} entries due to count limit.`);
    memoryCache.entries = memoryCache.entries.slice(0, MAX_ENTRIES);
  }

  // 2. Check estimated size and evict 50 oldest if it exceeds 2MB
  let serialized = JSON.stringify(memoryCache, null, 2);
  let size = Buffer.byteLength(serialized, 'utf8');

  while (size > MAX_FILE_SIZE_BYTES && memoryCache.entries.length > 50) {
    console.log(`[Memory Store] Evicting 50 oldest entries due to file size limit (${(size / 1024 / 1024).toFixed(2)}MB).`);
    // Evict 50 oldest (which are at the end of the array)
    memoryCache.entries = memoryCache.entries.slice(0, -50);
    serialized = JSON.stringify(memoryCache, null, 2);
    size = Buffer.byteLength(serialized, 'utf8');
  }
}

/**
 * Writes the memory cache to disk with debouncing (max once per 5 seconds).
 */
export function save() {
  enforceLimits();

  const now = Date.now();
  const timeSinceLastSave = now - lastSaveTime;

  const doWrite = () => {
    try {
      if (!fs.existsSync(MEMORY_DIR)) {
        fs.mkdirSync(MEMORY_DIR, { recursive: true });
      }
      fs.writeFileSync(MEMORY_FILE, JSON.stringify(memoryCache, null, 2), 'utf8');
      lastSaveTime = Date.now();
      saveTimeout = null;
      console.log('[Memory Store] Saved memory store to disk successfully.');
    } catch (err) {
      console.error('[Memory Store] Failed to save memory store:', err.message);
    }
  };

  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  if (timeSinceLastSave >= 5000) {
    doWrite();
  } else {
    saveTimeout = setTimeout(doWrite, 5000 - timeSinceLastSave);
  }
}

/**
 * Adds a new entry to the memory store and schedules a save.
 * 
 * @param {object} entry - The ErrorMemoryEntry object
 */
export function add(entry) {
  // Prevent duplicate additions of the same fingerprint
  const existingIdx = memoryCache.entries.findIndex(e => e.errorFingerprint === entry.errorFingerprint);
  if (existingIdx !== -1) {
    // Update existing entry with new counts/details
    memoryCache.entries[existingIdx] = {
      ...memoryCache.entries[existingIdx],
      ...entry,
      useCount: memoryCache.entries[existingIdx].useCount + 1,
      lastUsedAt: new Date().toISOString()
    };
  } else {
    memoryCache.entries.push(entry);
  }
  save();
}

/**
 * Finds an entry by exact fingerprint match.
 * Updates usage metrics if found.
 * 
 * @param {string} fp - The SHA-256 fingerprint hash
 * @returns {object|null} The matched entry, or null
 */
export function findByFingerprint(fp) {
  const entry = memoryCache.entries.find(e => e.errorFingerprint === fp);
  if (entry) {
    entry.useCount++;
    entry.lastUsedAt = new Date().toISOString();
    save();
    return entry;
  }
  return null;
}

/**
 * Finds up to 3 entries by keyword overlap.
 * Minimum score of 2 required. Sorted by score descending, then useCount descending.
 * 
 * @param {string[]} keywords - The keywords extracted from the search query
 * @returns {object[]} Array of matching entries with a 'score' property added
 */
export function findByKeywords(keywords) {
  if (!keywords || keywords.length === 0) return [];

  const querySet = new Set(keywords);
  const matches = [];

  for (const entry of memoryCache.entries) {
    let score = 0;
    if (Array.isArray(entry.errorKeywords)) {
      for (const kw of entry.errorKeywords) {
        if (querySet.has(kw)) {
          score++;
        }
      }
    }

    if (score >= 2) {
      matches.push({ ...entry, score });
    }
  }

  // Sort: score descending, then useCount descending
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.useCount - a.useCount;
  });

  return matches.slice(0, 3);
}

/**
 * Returns all memory entries.
 * 
 * @returns {object[]} All entries in memory
 */
export function getAll() {
  return memoryCache.entries;
}

/**
 * Deletes a memory entry by ID.
 * 
 * @param {string} id - The entry UUID
 */
export function deleteEntry(id) {
  const initialLen = memoryCache.entries.length;
  memoryCache.entries = memoryCache.entries.filter(e => e.id !== id);
  if (memoryCache.entries.length !== initialLen) {
    save();
  }
}

/**
 * Clears all entries from the memory store.
 */
export function clear() {
  memoryCache.entries = [];
  save();
}

// Automatically load on startup when imported
load();
