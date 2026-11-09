const fs = require('fs');
const path = require('path');
const config = require('../config');

// Default database structure for a fresh installation
const DEFAULT_DATA = { users: [], notes: [] };

// Write queue to ensure all disk modifications run one at a time (sequential)
let writeQueue = Promise.resolve();

/**
 * Ensures the data/ directory and db.json exist for local file mode.
 */
function initDb() {
  if (config.USE_GITHUB_DB) return;

  if (!fs.existsSync(config.DATA_DIR)) {
    fs.mkdirSync(config.DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(config.DB_PATH)) {
    fs.writeFileSync(config.DB_PATH, JSON.stringify(DEFAULT_DATA, null, 2), 'utf-8');
  }
}

/**
 * Reads data/db.json directly from GitHub repository for 24/7 cloud persistence.
 */
async function readFromGitHub() {
  const url = `https://api.github.com/repos/${config.GITHUB_REPO}/contents/${config.GITHUB_DB_PATH}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `token ${config.GITHUB_TOKEN}`,
      'User-Agent': 'NoteNest-App',
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (res.status === 404) {
    return { data: DEFAULT_DATA, sha: null };
  }

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`GitHub read failed (${res.status}): ${json.message || ''}`);
  }

  const raw = Buffer.from(json.content, 'base64').toString('utf-8');
  const parsed = JSON.parse(raw);
  return {
    data: {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : []
    },
    sha: json.sha
  };
}

/**
 * Writes data/db.json directly to GitHub repository using GitHub API.
 */
async function writeToGitHub(data) {
  const url = `https://api.github.com/repos/${config.GITHUB_REPO}/contents/${config.GITHUB_DB_PATH}`;

  // Get current SHA so GitHub accepts the update
  let sha = null;
  try {
    const cur = await readFromGitHub();
    sha = cur.sha;
  } catch (_) {}

  const contentBase64 = Buffer.from(JSON.stringify(data, null, 2), 'utf-8').toString('base64');
  const body = {
    message: 'Sync data/db.json [automated cloud database update]',
    content: contentBase64
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${config.GITHUB_TOKEN}`,
      'User-Agent': 'NoteNest-App',
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GitHub cloud DB update failed: ${err.message || res.status}`);
  }
}

/**
 * Internal function to read db.json with corruption recovery and cloud fallback.
 */
async function readDbInternal() {
  if (config.USE_GITHUB_DB && config.GITHUB_TOKEN) {
    try {
      const { data } = await readFromGitHub();
      return data;
    } catch (err) {
      console.error('[GitHub Cloud DB Read Error, falling back to local]:', err.message);
    }
  }

  initDb();
  try {
    const raw = await fs.promises.readFile(config.DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw);

    if (!parsed || !Array.isArray(parsed.users) || !Array.isArray(parsed.notes)) {
      throw new Error('Database file does not contain expected { users, notes } arrays');
    }
    return parsed;
  } catch (err) {
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

    const fresh = { users: [], notes: [] };
    await fs.promises.writeFile(config.DB_PATH, JSON.stringify(fresh, null, 2), 'utf-8');
    return fresh;
  }
}

/**
 * Internal function to write to db.json atomically.
 */
async function writeDbInternal(data) {
  if (config.USE_GITHUB_DB && config.GITHUB_TOKEN) {
    try {
      await writeToGitHub(data);
      return;
    } catch (err) {
      console.error('[GitHub Cloud DB Write Error, falling back to local]:', err.message);
    }
  }

  initDb();
  const tempPath = path.join(config.DATA_DIR, `db.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const jsonString = JSON.stringify(data, null, 2);

  await fs.promises.writeFile(tempPath, jsonString, 'utf-8');

  try {
    await fs.promises.rename(tempPath, config.DB_PATH);
  } catch (renameErr) {
    await fs.promises.copyFile(tempPath, config.DB_PATH);
    await fs.promises.unlink(tempPath).catch(() => {});
  }
}

async function readDb() {
  return readDbInternal();
}

function updateDb(updaterFn) {
  const operation = writeQueue.then(async () => {
    const data = await readDbInternal();
    const result = await updaterFn(data);
    await writeDbInternal(data);
    return result;
  });

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
