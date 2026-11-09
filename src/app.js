const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const authRoutes = require('./routes/auth');
const noteRoutes = require('./routes/notes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

// Security headers with Content Security Policy allowing Google Fonts
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"]
    }
  }
}));

// Cross-Origin Resource Sharing
app.use(cors({
  origin: config.CORS_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
}));

// Standard JSON body parser limited to 1 MB
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Serve static frontend files from public/ folder
app.use(express.static(path.join(__dirname, '..', 'public')));

// Public health check route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now()
  });
});

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/notes', noteRoutes);

// Catch 404 for undefined API endpoints
app.use('/api', notFoundHandler);

// Catch-all for frontend SPA routing: send index.html if request is not an API call
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  }
  next();
});

// Global error handling middleware
app.use(errorHandler);

module.exports = app;
