const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

/**
 * Removes sensitive fields (like passwordHash) before sending user data.
 */
function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

/**
 * Creates a new user record.
 * Throws an error with code 'EMAIL_EXISTS' if email is already taken.
 */
async function createUser({ name, email, password }) {
  const normalizedEmail = email.trim().toLowerCase();

  return db.updateDb(async (data) => {
    // Check if an account already exists with this email
    const exists = data.users.some(u => u.email === normalizedEmail);
    if (exists) {
      const err = new Error('An account with this email already exists');
      err.code = 'EMAIL_EXISTS';
      err.status = 409;
      throw err;
    }

    // Hash the password with bcrypt (salt rounds = 10)
    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = {
      id: crypto.randomUUID(),
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      createdAt: Date.now()
    };

    data.users.push(newUser);
    return sanitizeUser(newUser);
  });
}

/**
 * Authenticates user credentials.
 * Returns safe user object if valid, or null if invalid.
 */
async function authenticateUser({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const data = await db.readDb();

  const user = data.users.find(u => u.email === normalizedEmail);
  if (!user) {
    return null;
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    return null;
  }

  return sanitizeUser(user);
}

/**
 * Looks up user by ID.
 */
async function getUserById(id) {
  const data = await db.readDb();
  const user = data.users.find(u => u.id === id);
  return sanitizeUser(user);
}

module.exports = {
  createUser,
  authenticateUser,
  getUserById,
  sanitizeUser
};
