const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

// Set test environment variables before requiring app
const testDbPath = path.join(__dirname, 'test-db.json');
const testDataDir = __dirname;
process.env.DB_PATH = testDbPath;
process.env.DATA_DIR = testDataDir;
process.env.JWT_SECRET = 'super-test-secret-key-1234567890';
process.env.NODE_ENV = 'test';

const app = require('../src/app');

let server;
let baseUrl;

test.before(async () => {
  // Clean up any stale test database
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  fs.writeFileSync(testDbPath, JSON.stringify({ users: [], notes: [] }, null, 2), 'utf-8');

  // Start server on an ephemeral free port (port 0)
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

// Helper for making API requests
async function req(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, headers: res.headers };
}

test('API Test Suite', async (t) => {
  let userAToken = '';
  let userAId = '';
  let userBToken = '';
  let createdNoteId = '';

  await t.test('Health check: GET /api/health returns ok', async () => {
    const res = await req('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.data.status, 'ok');
  });

  await t.test('Auth: Register new user (User A)', async () => {
    const res = await req('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Alice Student',
        email: 'alice@example.com',
        password: 'password123'
      })
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.token);
    assert.equal(res.data.data.user.email, 'alice@example.com');
    assert.equal(res.data.data.user.name, 'Alice Student');
    assert.equal(res.data.data.user.passwordHash, undefined, 'passwordHash must never be exposed');

    userAToken = res.data.data.token;
    userAId = res.data.data.user.id;
  });

  await t.test('Auth: Reject duplicate email registration', async () => {
    const res = await req('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Alice Duplicate',
        email: 'alice@example.com',
        password: 'password123'
      })
    });
    assert.equal(res.status, 409);
    assert.equal(res.data.success, false);
    assert.equal(res.data.error.code, 'EMAIL_EXISTS');
  });

  await t.test('Auth: Login with valid credentials', async () => {
    const res = await req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'alice@example.com',
        password: 'password123'
      })
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.token);
    assert.equal(res.data.data.user.email, 'alice@example.com');
  });

  await t.test('Auth: Login with wrong password returns 401 generic error', async () => {
    const res = await req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'alice@example.com',
        password: 'wrongpassword'
      })
    });
    assert.equal(res.status, 401);
    assert.equal(res.data.success, false);
    assert.equal(res.data.error.code, 'INVALID_CREDENTIALS');
  });

  await t.test('Auth: Register second user (User B)', async () => {
    const res = await req('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Bob Student',
        email: 'bob@example.com',
        password: 'password456'
      })
    });
    assert.equal(res.status, 201);
    userBToken = res.data.data.token;
  });

  await t.test('Auth: GET /api/auth/me returns current user profile', async () => {
    const res = await req('/api/auth/me', {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.data.user.email, 'alice@example.com');
  });

  await t.test('Security: Unauthorised access to notes rejected with 401', async () => {
    const res = await req('/api/notes');
    assert.equal(res.status, 401);
    assert.equal(res.data.success, false);
    assert.equal(res.data.error.code, 'UNAUTHORIZED');
  });

  await t.test('Notes: Reject empty note (no title and no body)', async () => {
    const res = await req('/api/notes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ title: '', body: '', cat: 'Study', color: 'sky' })
    });
    assert.equal(res.status, 400);
    assert.equal(res.data.success, false);
    assert.equal(res.data.error.code, 'VALIDATION_ERROR');
  });

  await t.test('Notes: Create active note with valid fields', async () => {
    const res = await req('/api/notes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({
        title: 'Exam prep',
        body: 'Revise chapters 4-6',
        cat: 'Study',
        color: 'sky'
      })
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.title, 'Exam prep');
    assert.equal(res.data.data.body, 'Revise chapters 4-6');
    assert.equal(res.data.data.cat, 'Study');
    assert.equal(res.data.data.color, 'sky');
    assert.equal(res.data.data.pinned, false);
    assert.equal(res.data.data.status, 'active');
    assert.ok(res.data.data.id);
    assert.ok(typeof res.data.data.created === 'number');
    assert.ok(typeof res.data.data.updated === 'number');

    createdNoteId = res.data.data.id;
  });

  await t.test('Notes: Edit note content', async () => {
    const res = await req(`/api/notes/${createdNoteId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({
        title: 'Exam prep - Updated',
        body: 'Revise chapters 1-6 thoroughly',
        cat: 'Study',
        color: 'mint'
      })
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.data.title, 'Exam prep - Updated');
    assert.equal(res.data.data.color, 'mint');
  });

  await t.test('Notes: Pin and unpin note', async () => {
    // Pin note
    const pinRes = await req(`/api/notes/${createdNoteId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ pinned: true })
    });
    assert.equal(pinRes.status, 200);
    assert.equal(pinRes.data.data.pinned, true);

    // Verify pinned view includes it
    const listRes = await req('/api/notes?view=pinned', {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert.equal(listRes.status, 200);
    assert.equal(listRes.data.data.length, 1);
    assert.equal(listRes.data.data[0].id, createdNoteId);
  });

  await t.test('Notes: Trash note (auto-clears pin) then restore it', async () => {
    // Trash the note
    const trashRes = await req(`/api/notes/${createdNoteId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ status: 'trashed' })
    });
    assert.equal(trashRes.status, 200);
    assert.equal(trashRes.data.data.status, 'trashed');
    assert.equal(trashRes.data.data.pinned, false, 'Trashing must clear pin');

    // Editing a trashed note should return 409
    const editTrashRes = await req(`/api/notes/${createdNoteId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ title: 'Cannot edit' })
    });
    assert.equal(editTrashRes.status, 409);

    // Restore note
    const restoreRes = await req(`/api/notes/${createdNoteId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ status: 'active' })
    });
    assert.equal(restoreRes.status, 200);
    assert.equal(restoreRes.data.data.status, 'active');
  });

  await t.test('Notes: Archive note', async () => {
    const archiveRes = await req(`/api/notes/${createdNoteId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ status: 'archived' })
    });
    assert.equal(archiveRes.status, 200);
    assert.equal(archiveRes.data.data.status, 'archived');

    // Restore back to active
    await req(`/api/notes/${createdNoteId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ status: 'active' })
    });
  });

  await t.test('Notes: Search and sort', async () => {
    // Create second note
    await req('/api/notes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({
        title: 'Algorithm Design',
        body: 'Dynamic programming and greedy algorithms',
        cat: 'Computer Science',
        color: 'lilac'
      })
    });

    // Search query for "greedy"
    const searchRes = await req('/api/notes?q=greedy', {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert.equal(searchRes.status, 200);
    assert.equal(searchRes.data.data.length, 1);
    assert.equal(searchRes.data.data[0].title, 'Algorithm Design');

    // Sort by title A-Z
    const sortRes = await req('/api/notes?sort=title', {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert.equal(sortRes.status, 200);
    assert.equal(sortRes.data.data[0].title, 'Algorithm Design');
  });

  await t.test('Notes: Categories list and stats counts', async () => {
    const catsRes = await req('/api/notes/categories', {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert.equal(catsRes.status, 200);
    assert.ok(Array.isArray(catsRes.data.data));
    assert.ok(catsRes.data.data.some(c => c.name === 'Computer Science' && c.count === 1));

    const statsRes = await req('/api/notes/stats', {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert.equal(statsRes.status, 200);
    assert.equal(statsRes.data.data.all, 2);
  });

  await t.test('Notes: Duplicate note', async () => {
    const dupRes = await req(`/api/notes/${createdNoteId}/duplicate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert.equal(dupRes.status, 201);
    assert.equal(dupRes.data.data.title, 'Exam prep - Updated (copy)');
    assert.equal(dupRes.data.data.pinned, false);
  });

  await t.test('Notes: Permanent delete rules (409 if not trashed, 200 if trashed)', async () => {
    // 1. Try to delete active note -> 409 Conflict
    const delActiveRes = await req(`/api/notes/${createdNoteId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert.equal(delActiveRes.status, 409);

    // 2. Trash it first
    await req(`/api/notes/${createdNoteId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ status: 'trashed' })
    });

    // 3. Delete forever -> 200
    const delTrashRes = await req(`/api/notes/${createdNoteId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert.equal(delTrashRes.status, 200);
    assert.equal(delTrashRes.data.data.deleted, true);
  });

  await t.test('Notes: Empty trash deletes all trashed notes', async () => {
    // Create and trash a temporary note
    const tempRes = await req('/api/notes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ title: 'Temporary trash note', body: 'Trash me' })
    });
    await req(`/api/notes/${tempRes.data.data.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ status: 'trashed' })
    });

    // Empty trash
    const emptyRes = await req('/api/notes/trash', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert.equal(emptyRes.status, 200);
    assert.ok(emptyRes.data.data.deletedCount >= 1);
  });

  await t.test('Notes: Export backup as JSON', async () => {
    const res = await req('/api/notes/export', {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data));
    assert.ok(res.headers.get('content-disposition').includes('attachment; filename="notenest-backup.json"'));
  });

  await t.test('Notes: Import notes with duplicate id filtering and defaults', async () => {
    const importPayload = [
      {
        id: 'imported-note-1',
        title: 'Imported Note 1',
        body: 'Body text',
        cat: 'Imported',
        color: 'pink'
      },
      {
        id: 'imported-note-1', // Duplicate ID should be skipped
        title: 'Duplicate Note',
        body: 'Should skip',
        color: 'yellow'
      },
      {
        id: 'imported-note-2',
        title: 'Imported Note 2',
        body: 'Valid note',
        color: 'invalid-color' // Invalid color should be skipped
      }
    ];

    const res = await req('/api/notes/import', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify(importPayload)
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.data.added, 1);
    assert.equal(res.data.data.skipped, 2);
  });

  await t.test('Multi-user Isolation: User B cannot access or modify User A notes', async () => {
    // User B tries to view notes (should be empty for User B)
    const listRes = await req('/api/notes', {
      headers: { Authorization: `Bearer ${userBToken}` }
    });
    assert.equal(listRes.status, 200);
    assert.equal(listRes.data.data.length, 0);

    // User B tries to access User A's imported note by ID -> 404
    const getRes = await req('/api/notes/imported-note-1', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${userBToken}` },
      body: JSON.stringify({ title: 'Hacked by User B' })
    });
    assert.equal(getRes.status, 404);
  });
});
