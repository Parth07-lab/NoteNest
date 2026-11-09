const app = require('../src/app');
const { initDb } = require('../src/services/db');

// Initialize database storage on cold start
initDb();

module.exports = app;
