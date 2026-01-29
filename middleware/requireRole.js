/**
 * Middleware to check if user has required role
 * Usage: requireRole(['admin']) or requireRole(['admin', 'support'])
 * @param {string[]} allowedRoles - Array of allowed roles
 */
module.exports = (allowedRoles) => {
  return (req, res, next) => {
    // First check if authenticated
    if (!req.session || !req.session.user) {
      return res.status(401).json({ ok: false, error: 'not_authenticated' });
    }

    const userRole = req.session.user.role || 'client';

    // Check if user's role is in allowed roles
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ ok: false, error: 'forbidden', message: 'No tienes permisos para acceder a este recurso' });
    }

    next();
  };
};
