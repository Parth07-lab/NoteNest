const express = require('express');
const noteService = require('../services/noteService');
const { requireAuth } = require('../middleware/auth');
const { validateNoteBody, validatePatchBody } = require('../middleware/validate');

const router = express.Router();

// All note routes require valid user authentication
router.use(requireAuth);

/**
 * GET /api/notes/stats
 * Must be registered before /:id routes so "stats" is not interpreted as an ID.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await noteService.getStats(req.user.id);
    res.json({
      success: true,
      data: stats
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/notes/categories
 * Alphabetical list of categories for non-trashed notes with counts.
 */
router.get('/categories', async (req, res, next) => {
  try {
    const categories = await noteService.getCategories(req.user.id);
    res.json({
      success: true,
      data: categories
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/notes/export
 * Downloads all notes as a JSON file backup.
 */
router.get('/export', async (req, res, next) => {
  try {
    const notes = await noteService.exportNotes(req.user.id);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="notenest-backup.json"');
    res.send(JSON.stringify(notes, null, 2));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/notes/import
 * Imports notes from a backup, skipping duplicates and invalid entries.
 * Allows body up to 2MB.
 */
router.post('/import', express.json({ limit: '2mb' }), async (req, res, next) => {
  try {
    const notesArray = req.body && req.body.notes ? req.body.notes : req.body;
    const result = await noteService.importNotes(req.user.id, notesArray);
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/notes/trash
 * Empties all trashed notes for the user.
 * Must be placed BEFORE /:id route so 'trash' is not treated as an ID.
 */
router.delete('/trash', async (req, res, next) => {
  try {
    const result = await noteService.emptyTrash(req.user.id);
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/notes
 * Query params: view (all|pinned|archive|trash), cat, q, sort (updated|created|title)
 */
router.get('/', async (req, res, next) => {
  try {
    const { view, cat, q, sort } = req.query;
    const notes = await noteService.getNotes(req.user.id, { view, cat, q, sort });
    res.json({
      success: true,
      data: notes
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/notes
 * Creates a new note.
 */
router.post('/', validateNoteBody, async (req, res, next) => {
  try {
    const note = await noteService.createNote(req.user.id, req.body);
    res.status(201).json({
      success: true,
      data: note
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/notes/:id
 * Replaces note content (title, body, cat, color).
 */
router.put('/:id', validateNoteBody, async (req, res, next) => {
  try {
    const note = await noteService.updateNote(req.user.id, req.params.id, req.body);
    res.json({
      success: true,
      data: note
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/notes/:id
 * Updates pinned and/or status.
 */
router.patch('/:id', validatePatchBody, async (req, res, next) => {
  try {
    const note = await noteService.patchNote(req.user.id, req.params.id, req.body);
    res.json({
      success: true,
      data: note
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/notes/:id/duplicate
 * Duplicates a note.
 */
router.post('/:id/duplicate', async (req, res, next) => {
  try {
    const copy = await noteService.duplicateNote(req.user.id, req.params.id);
    res.status(201).json({
      success: true,
      data: copy
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/notes/:id
 * Permanently deletes a single trashed note.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await noteService.deleteNote(req.user.id, req.params.id);
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
