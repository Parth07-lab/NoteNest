const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Checks that an object only contains allowed keys.
 */
function assertNoUnknownFields(body, allowedKeys) {
  const extraKeys = Object.keys(body).filter(key => !allowedKeys.includes(key));
  if (extraKeys.length > 0) {
    const err = new Error(`Unknown field(s) not allowed: ${extraKeys.join(', ')}`);
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }
}

/**
 * Validates registration input.
 */
function validateRegister(req, res, next) {
  try {
    const body = req.body || {};
    assertNoUnknownFields(body, ['name', 'email', 'password']);

    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!name || name.length < 2) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name must be at least 2 characters' }
      });
    }

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Please provide a valid email address' }
      });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters long' }
      });
    }

    req.cleanBody = { name, email, password };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Validates login input.
 */
function validateLogin(req, res, next) {
  try {
    const body = req.body || {};
    assertNoUnknownFields(body, ['email', 'password']);

    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' }
      });
    }

    req.cleanBody = { email, password };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Validates create/update note body.
 */
function validateNoteBody(req, res, next) {
  try {
    const body = req.body || {};
    assertNoUnknownFields(body, ['title', 'body', 'cat', 'color']);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Validates PATCH note body (accepts ONLY pinned and/or status).
 */
function validatePatchBody(req, res, next) {
  try {
    const body = req.body || {};
    assertNoUnknownFields(body, ['pinned', 'status']);

    if (body.pinned === undefined && body.status === undefined) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Must provide pinned or status to update' }
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  validateRegister,
  validateLogin,
  validateNoteBody,
  validatePatchBody
};
