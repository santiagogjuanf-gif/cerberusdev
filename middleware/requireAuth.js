/**
 * Middleware to check if user is authenticated
 * Redirects to login for page requests, returns 401 for API requests
 */
module.exports = (req, res, next) => {
  if (!req.session || !req.session.user) {
    // Check if it's an API request
    if (req.path.startsWith('/api/') || req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ ok: false, error: 'not_authenticated' });
    }
    // Redirect to appropriate login based on request path
    if (req.baseUrl === '/cliente' || req.path.startsWith('/cliente')) {
      return res.redirect('/portal-cliente');
    }
    return res.redirect('/portal-admin');
  }
  next();
};
