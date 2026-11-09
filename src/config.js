const path = require('path');
require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'notenest-dev-secret-key-123456789',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  DB_PATH: process.env.DB_PATH || (process.env.VERCEL ? '/tmp/data/db.json' : path.join(__dirname, '..', 'data', 'db.json')),
  DATA_DIR: process.env.DATA_DIR || (process.env.VERCEL ? '/tmp/data' : path.join(__dirname, '..', 'data')),
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Cloud GitHub Database Integration for 24/7 Serverless Persistence (Vercel)
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
  GITHUB_REPO: process.env.GITHUB_REPO || 'Parth07-lab/NoteNest',
  GITHUB_DB_PATH: process.env.GITHUB_DB_PATH || 'data/db.json',
  USE_GITHUB_DB: Boolean(process.env.VERCEL || process.env.USE_GITHUB_DB)
};
