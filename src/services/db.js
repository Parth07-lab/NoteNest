const fs = require('fs');
const path = require('path');
const config = require('../config');

// Default database structure for a fresh installation
const DEFAULT_DATA = { users: [], notes: [] };

// Write queue to ensure all disk modifications run one at a time (sequential)
let writeQueue = Promise.resolve();

/**
 * Ensures the data/ directory and db.json exist.
 * Called on server startup.
 */
function initDb() {
  if (!fs.existsSync(config.DATA_DIR)) {
    fs.mkdirSync(config.DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(config.DB_PATH)) {
    fs.writeFileSync(config.DB_PATH, JSON.stringify(DEFAULT_DATA, null, 2), 'utf-8');
  }
}

/**
 * Internal function to read db.json with corruption recovery.
 */
async function readDbInternal() {
  initDb();
  try {
    const raw = await fs.promises.readFile(config.DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw);

    // Validate that the basic structure is intact
    if (!parsed || !Array.isArray(parsed.users) || !Array.isArray(parsed.notes)) {
      throw new Error('Database file does not contain expected { users, notes } arrays');
    }
    return parsed;
  } catch (err) {
    // If the file is corrupted, preserve it for debugging and start fresh
    const timestamp = Date.now();
    const corruptPath = path.join(config.DATA_DIR, `db.corrupt-${timestamp}.json`);
    console.error(`[DB Warning] db.json was unreadable or corrupted. Archiving to ${corruptPath}`);

    try {
      if (fs.existsSync(config.DB_PATH)) {
        await fs.promises.copyFile(config.DB_PATH, corruptPath);
      }
    } catch (copyErr) {
      console.error('[DB Warning] Failed to create backup of corrupted file:', copyErr.message);
    }

    // Reset with fresh data
    const fresh = { users: [], notes: [] };
    await fs.promises.writeFile(config.DB_PATH, JSON.stringify(fresh, null, 2), 'utf-8');
    return fresh;
  }
}

/**
 * Internal function to write to db.json atomically.
 * Writes to a temporary file first, then renames it over the target file.
 */
async function writeDbInternal(data) {
  initDb();
  const tempPath = path.join(config.DATA_DIR, `db.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const jsonString = JSON.stringify(data, null, 2);

  // 1. Write data safely to the temp file
  await fs.promises.writeFile(tempPath, jsonString, 'utf-8');

  // 2. Atomically rename temp file over db.json
  try {
    await fs.promises.rename(tempPath, config.DB_PATH);
  } catch (renameErr) {
    // Windows fallback: if rename fails due to file locking, copy and unlink
    await fs.promises.copyFile(tempPath, config.DB_PATH);
    await fs.promises.unlink(tempPath).catch(() => {});
  }
}

/**
 * Public method to read database contents.
 */
async function readDb() {
  return readDbInternal();
}

/**
 * Public method to perform atomic read-modify-write operations through the queue.
 * @param {Function} updaterFn - Receives current data, mutates or processes it, optionally returns a value
 * @returns {Promise<any>} The value returned by updaterFn
 */
function updateDb(updaterFn) {
  // Chain the new operation onto the existing writeQueue promise
  const operation = writeQueue.then(async () => {
    const data = await readDbInternal();
    const result = await updaterFn(data);
    await writeDbInternal(data);
    return result;
  });

  // Keep queue alive even if an individual operation throws an error
  writeQueue = operation.catch(err => {
    console.error('[DB Queue Error]:', err.message);
  });

  return operation;
}

module.exports = {
  initDb,
  readDb,
  updateDb
};
