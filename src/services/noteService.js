const crypto = require('crypto');
const db = require('./db');

const ALLOWED_COLORS = ['yellow', 'pink', 'mint', 'sky', 'lilac', 'white'];
const ALLOWED_STATUSES = ['active', 'archived', 'trashed'];

/**
 * Validates that note data contains valid color and status, and non-empty content.
 */
function validateNotePayload({ title = '', body = '', cat = '', color = 'yellow' }) {
  const trimmedTitle = String(title || '').trim();
  const trimmedBody = String(body || '').trim();
  const trimmedCat = String(cat || '').trim();

  // Reject note if both title and body are completely empty
  if (!trimmedTitle && !trimmedBody) {
    const err = new Error('Note must have a title or body');
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }

  if (trimmedTitle.length > 80) {
    const err = new Error('Title must not exceed 80 characters');
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }

  if (trimmedCat.length > 20) {
    const err = new Error('Category must not exceed 20 characters');
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }

  if (trimmedBody.length > 20000) {
    const err = new Error('Body must not exceed 20,000 characters');
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }

  if (!ALLOWED_COLORS.includes(color)) {
    const err = new Error(`Color must be one of: ${ALLOWED_COLORS.join(', ')}`);
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }

  return {
    title: trimmedTitle,
    body: trimmedBody,
    cat: trimmedCat,
    color
  };
}

/**
 * Gets notes belonging to the user, with filtering, searching, and sorting.
 */
async function getNotes(userId, { view = 'all', cat = '', q = '', sort = 'updated' } = {}) {
  const data = await db.readDb();

  // 1. Strictly filter by user ID so notes are private
  let userNotes = data.notes.filter(n => n.userId === userId);

  // 2. View filter
  if (view === 'pinned') {
    userNotes = userNotes.filter(n => n.status === 'active' && n.pinned === true);
  } else if (view === 'archive') {
    userNotes = userNotes.filter(n => n.status === 'archived');
  } else if (view === 'trash') {
    userNotes = userNotes.filter(n => n.status === 'trashed');
  } else {
    // Default 'all' view shows only active notes
    userNotes = userNotes.filter(n => n.status === 'active');
  }

  // 3. Category filter
  if (cat && cat.trim()) {
    userNotes = userNotes.filter(n => n.cat.toLowerCase() === cat.trim().toLowerCase());
  }

  // 4. Live search across title, body, and category
  if (q && q.trim()) {
    const query = q.trim().toLowerCase();
    userNotes = userNotes.filter(n =>
      (n.title && n.title.toLowerCase().includes(query)) ||
      (n.body && n.body.toLowerCase().includes(query)) ||
      (n.cat && n.cat.toLowerCase().includes(query))
    );
  }

  // 5. Sorting
  userNotes.sort((a, b) => {
    // In "all" view, pinned notes always come first
    if (view === 'all' && a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }

    if (sort === 'title') {
      return (a.title || '').localeCompare(b.title || '');
    }
    if (sort === 'created') {
      return Number(b.created) - Number(a.created);
    }
    // Default: 'updated'
    return Number(b.updated) - Number(a.updated);
  });

  return userNotes;
}

/**
 * Calculates sidebar stats for the user's notes.
 */
async function getStats(userId) {
  const data = await db.readDb();
  const userNotes = data.notes.filter(n => n.userId === userId);

  return {
    all: userNotes.filter(n => n.status === 'active').length,
    pinned: userNotes.filter(n => n.status === 'active' && n.pinned === true).length,
    archive: userNotes.filter(n => n.status === 'archived').length,
    trash: userNotes.filter(n => n.status === 'trashed').length
  };
}

/**
 * Returns a list of categories with counts for non-trashed notes, sorted A-Z.
 */
async function getCategories(userId) {
  const data = await db.readDb();
  const activeNotes = data.notes.filter(n => n.userId === userId && n.status !== 'trashed' && n.cat && n.cat.trim());

  const counts = {};
  for (const note of activeNotes) {
    const category = note.cat.trim();
    counts[category] = (counts[category] || 0) + 1;
  }

  return Object.keys(counts)
    .sort((a, b) => a.localeCompare(b))
    .map(name => ({ name, count: counts[name] }));
}

/**
 * Creates a new note for the user.
 */
async function createNote(userId, payload) {
  const clean = validateNotePayload(payload);
  const now = Date.now();

  const newNote = {
    id: crypto.randomUUID(),
    userId,
    title: clean.title,
    body: clean.body,
    cat: clean.cat,
    color: clean.color,
    pinned: false,
    status: 'active',
    created: now,
    updated: now
  };

  return db.updateDb((data) => {
    data.notes.push(newNote);
    return newNote;
  });
}

/**
 * Updates note content (title, body, cat, color).
 * Rejects if note is in trash with 409 Conflict.
 */
async function updateNote(userId, noteId, payload) {
  const clean = validateNotePayload(payload);

  return db.updateDb((data) => {
    const note = data.notes.find(n => n.id === noteId && n.userId === userId);
    if (!note) {
      const err = new Error('Note not found');
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (note.status === 'trashed') {
      const err = new Error('Cannot edit a note that is in the trash');
      err.code = 'NOTE_TRASHED';
      err.status = 409;
      throw err;
    }

    note.title = clean.title;
    note.body = clean.body;
    note.cat = clean.cat;
    note.color = clean.color;
    note.updated = Date.now();

    return note;
  });
}

/**
 * Patches pinned and/or status flags.
 */
async function patchNote(userId, noteId, { pinned, status }) {
  return db.updateDb((data) => {
    const note = data.notes.find(n => n.id === noteId && n.userId === userId);
    if (!note) {
      const err = new Error('Note not found');
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (status !== undefined) {
      if (!ALLOWED_STATUSES.includes(status)) {
        const err = new Error(`Status must be one of: ${ALLOWED_STATUSES.join(', ')}`);
        err.code = 'VALIDATION_ERROR';
        err.status = 400;
        throw err;
      }
      note.status = status;

      // Rule: Trashing a note automatically removes its pin
      if (status === 'trashed') {
        note.pinned = false;
      }
    }

    if (pinned !== undefined) {
      // Cannot pin a trashed note
      if (note.status === 'trashed' && pinned === true) {
        const err = new Error('Cannot pin a trashed note');
        err.code = 'VALIDATION_ERROR';
        err.status = 400;
        throw err;
      }
      note.pinned = Boolean(pinned);
    }

    note.updated = Date.now();
    return note;
  });
}

/**
 * Duplicates a note with "<title> (copy)", not pinned, fresh timestamps.
 */
async function duplicateNote(userId, noteId) {
  const now = Date.now();

  return db.updateDb((data) => {
    const original = data.notes.find(n => n.id === noteId && n.userId === userId);
    if (!original) {
      const err = new Error('Note not found');
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const copy = {
      id: crypto.randomUUID(),
      userId,
      title: `${original.title || ''} (copy)`.trim(),
      body: original.body || '',
      cat: original.cat || '',
      color: original.color || 'yellow',
      pinned: false,
      status: 'active',
      created: now,
      updated: now
    };

    data.notes.push(copy);
    return copy;
  });
}

/**
 * Permanently deletes a single note.
 * Only allowed if note status is 'trashed'.
 */
async function deleteNote(userId, noteId) {
  return db.updateDb((data) => {
    const index = data.notes.findIndex(n => n.id === noteId && n.userId === userId);
    if (index === -1) {
      const err = new Error('Note not found');
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const note = data.notes[index];
    if (note.status !== 'trashed') {
      const err = new Error('Only notes in the trash can be permanently deleted');
      err.code = 'CONFLICT';
      err.status = 409;
      throw err;
    }

    data.notes.splice(index, 1);
    return { deleted: true, id: noteId };
  });
}

/**
 * Permanently deletes all trashed notes for the user.
 */
async function emptyTrash(userId) {
  return db.updateDb((data) => {
    const initialCount = data.notes.length;
    data.notes = data.notes.filter(n => !(n.userId === userId && n.status === 'trashed'));
    const deletedCount = initialCount - data.notes.length;
    return { deletedCount };
  });
}

/**
 * Exports all user notes (active, archived, trashed) for backup.
 */
async function exportNotes(userId) {
  const data = await db.readDb();
  // Return user's notes without the internal userId
  return data.notes
    .filter(n => n.userId === userId)
    .map(({ userId: _, ...note }) => note);
}

/**
 * Imports an array of notes, skipping invalid items and existing duplicate IDs.
 */
async function importNotes(userId, notesArray) {
  if (!Array.isArray(notesArray)) {
    const err = new Error('Import data must be a JSON array of notes');
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }

  return db.updateDb((data) => {
    const existingIds = new Set(data.notes.filter(n => n.userId === userId).map(n => n.id));
    let added = 0;
    let skipped = 0;
    const now = Date.now();

    for (const raw of notesArray) {
      if (!raw || typeof raw !== 'object') {
        skipped++;
        continue;
      }

      // Check id
      const id = String(raw.id || '').trim();
      if (!id || existingIds.has(id)) {
        skipped++;
        continue;
      }

      // Check color
      const color = ALLOWED_COLORS.includes(raw.color) ? raw.color : null;
      if (!color) {
        skipped++;
        continue;
      }

      const status = ALLOWED_STATUSES.includes(raw.status) ? raw.status : 'active';
      const title = String(raw.title || '').trim().slice(0, 80);
      const cat = String(raw.cat || '').trim().slice(0, 20);
      const body = String(raw.body || '').trim().slice(0, 20000);

      // Must have at least title or body
      if (!title && !body) {
        skipped++;
        continue;
      }

      const note = {
        id,
        userId,
        title,
        body,
        cat,
        color,
        pinned: Boolean(raw.pinned),
        status,
        created: typeof raw.created === 'number' ? raw.created : now,
        updated: typeof raw.updated === 'number' ? raw.updated : now
      };

      data.notes.push(note);
      existingIds.add(id);
      added++;
    }

    return { added, skipped };
  });
}

module.exports = {
  getNotes,
  getStats,
  getCategories,
  createNote,
  updateNote,
  patchNote,
  duplicateNote,
  deleteNote,
  emptyTrash,
  exportNotes,
  importNotes,
  ALLOWED_COLORS,
  ALLOWED_STATUSES
};
