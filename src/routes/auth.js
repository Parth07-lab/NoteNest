const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const userService = require('../services/userService');
const { requireAuth } = require('../middleware/auth');
const { validateRegister, validateLogin } = require('../middleware/validate');

const router = express.Router();

// Rate limiter: max 20 auth requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts, please try again after 15 minutes'
    }
  }
});

// Helper to create a signed JWT
function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );
}

/**
 * POST /api/auth/register
 * Creates a new user account and returns a token.
 */
router.post('/register', authLimiter, validateRegister, async (req, res, next) => {
  try {
    const user = await userService.createUser(req.cleanBody);
    const token = createToken(user);

    res.status(201).json({
      success: true,
      data: {
        token,
        user
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 * Verifies email and password, returns token.
 */
router.post('/login', authLimiter, validateLogin, async (req, res, next) => {
  try {
    const user = await userService.authenticateUser(req.cleanBody);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        }
      });
    }

    const token = createToken(user);
    res.json({
      success: true,
      data: {
        token,
        user
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Retrieves current logged-in user profile.
 */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User profile not found'
        }
      });
    }

    res.json({
      success: true,
      data: {
        user
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
