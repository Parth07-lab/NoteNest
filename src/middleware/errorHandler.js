/**
 * Global error handler middleware.
 * Ensures all errors return standard JSON responses and never expose stack traces to clients.
 */
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const code = err.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');
  const message = err.message || 'An unexpected server error occurred';

  // Log full error details on the server for debugging
  console.error(`[Error] ${req.method} ${req.url} - Status ${status}:`, err.message);

  res.status(status).json({
    success: false,
    error: {
      code,
      message
    }
  });
}

/**
 * 404 handler for unknown routes.
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.originalUrl} not found`
    }
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
