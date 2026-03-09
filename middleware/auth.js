const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'Not authorized, no token' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ success: false, message: 'User no longer exists' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Not authorized, invalid token' });
    }
};

module.exports = { protect };