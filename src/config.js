const path = require('path');
require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'notenest-dev-secret-key-123456789',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  DB_PATH: process.env.DB_PATH || (process.env.VERCEL ? '/tmp/data/db.json' : path.join(__dirname, '..', 'data', 'db.json')),
  DATA_DIR: process.env.DATA_DIR || (process.env.VERCEL ? '/tmp/data' : path.join(__dirname, '..', 'data')),
  NODE_ENV: process.env.NODE_ENV || 'development'
};
