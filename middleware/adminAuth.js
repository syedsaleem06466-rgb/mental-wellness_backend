/**
 * Admin Middleware
 * Checks if the authenticated user has the 'admin' role.
 * Must be used AFTER the 'protect' middleware.
 */
const admin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({
            success: false,
            message: 'Forbidden: Admin access required'
        });
    }
};

module.exports = { admin };
