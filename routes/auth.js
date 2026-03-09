const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const {
    generateVerificationCode,
    sendVerificationEmail,
    sendPasswordResetOTPEmail,  // ✅ updated import
    sendPasswordResetEmail,
    sendWelcomeEmail
} = require('../utils/emailService');
const verificationStore = require('../utils/verificationStore');

// ================================
// HELPERS
// ================================
const generateToken = (userId) => {
    return jwt.sign(
        { id: userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
    );
};

const sendTokenResponse = (res, statusCode, user, token) => {
    return res.status(statusCode).json({
        success: true,
        token,
        user: {
            id: user.id,
            studentId: user.student_id,
            fullName: user.full_name,
            email: user.email,
            role: user.role,
            institution: user.institution,
            createdAt: user.created_at
        }
    });
};

// ================================
// RATE LIMITERS
// ================================
const verifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,                   // 20 attempts per 15 min
    validate: { xForwardedForHeader: false },
    message: { success: false, message: 'Too many verification attempts, please try again after 15 minutes' }
});
// ================================
// POST /api/auth/register
// ================================
router.post('/register', authLimiter, (req, res) => {
    try {
        const { studentId, fullName, email, password, institution } = req.body;

        if (!studentId || !fullName || !email || !password || !institution)
            return res.status(400).json({ success: false, message: 'All fields are required' });

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email))
            return res.status(400).json({ success: false, message: 'Invalid email format' });

        if (password.length < 8)
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });

        // ✅ Check for duplicates before creating anything
        const existing = User.findByStudentIdOrEmail(studentId, email);
        if (existing) {
            const conflict = existing.student_id === studentId.trim().toLowerCase() ? 'Student ID' : 'Email';
            return res.status(409).json({ success: false, message: `${conflict} already registered` });
        }

        // ✅ Generate a temp ID to track this pending registration
        const tempId = `pending_${Date.now()}_${Math.random().toString(36).slice(2)}`;

        const code = generateVerificationCode();

        // ✅ Store both the code AND user details — no DB write yet
        verificationStore.set(tempId, code, { studentId, fullName, email, password, institution });

        sendVerificationEmail(email, fullName, code).catch(err =>
            console.error('Failed to send verification email:', err.message)
        );

        return res.status(201).json({
            success: true,
            message: 'Please check your email for a verification code.',
            userId: tempId   // ← send tempId instead of real DB id
        });

    } catch (error) {
        console.error('Register error:', error);
        return res.status(500).json({ success: false, message: 'Server error during registration' });
    }
});

// ================================
// POST /api/auth/verify
// ================================
router.post('/verify', authLimiter, (req, res) => {
    try {
        const { userId, code } = req.body;

        if (!userId || !code)
            return res.status(400).json({ success: false, message: 'userId and code are required' });

        // ✅ Pull the stored user details and create the DB record NOW
        const pendingData = verificationStore.getData(userId);
        if (!pendingData)
            return res.status(400).json({ success: false, message: 'Registration session expired. Please register again.' });


        // ✅ Handle pending (pre-DB) registrations
        if (userId.startsWith('pending_')) {
            const result = verificationStore.verify(userId, code);
            if (!result.valid)
                return res.status(400).json({ success: false, message: result.reason });


            const newUser = User.create(pendingData);
            User.markVerified(newUser.id);
            verificationStore.delete(userId); // cleanup

            sendWelcomeEmail(newUser.email, newUser.full_name).catch(err =>
                console.error('Failed to send welcome email:', err.message)
            );

            const token = generateToken(newUser.id);
            return res.status(200).json({
                success: true,
                message: 'Email verified successfully!',
                token,
                user: {
                    id: newUser.id,
                    studentId: newUser.student_id,
                    fullName: newUser.full_name,
                    email: newUser.email,
                    role: newUser.role,
                    institution: newUser.institution,
                    isVerified: true
                }
            });
        }

        // ✅ Fallback: already-in-DB users (e.g. admin-created accounts)
        const user = User.findById(userId);
        if (!user)
            return res.status(404).json({ success: false, message: 'User not found' });

        if (user.is_verified)
            return res.status(400).json({ success: false, message: 'Account already verified' });

        const result = verificationStore.verify(userId, code);
        if (!result.valid)
            return res.status(400).json({ success: false, message: result.reason });

        User.markVerified(userId);

        sendWelcomeEmail(user.email, user.full_name).catch(err =>
            console.error('Failed to send welcome email:', err.message)
        );

        const token = generateToken(userId);
        return res.status(200).json({
            success: true,
            message: 'Email verified successfully!',
            token,
            user: {
                id: user.id,
                studentId: user.student_id,
                fullName: user.full_name,
                email: user.email,
                role: user.role,
                institution: user.institution,
                isVerified: true
            }
        });

    } catch (error) {
        console.error('Verify error:', error);
        return res.status(500).json({ success: false, message: 'Server error during verification' });
    }
});

// ================================
// POST /api/auth/resend-code
// ================================
router.post('/resend-code', authLimiter, (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId)
            return res.status(400).json({ success: false, message: 'userId is required' });

        // ✅ Handle pending registrations
        if (userId.startsWith('pending_')) {
            const pendingData = verificationStore.getData(userId);
            if (!pendingData)
                return res.status(400).json({ success: false, message: 'Registration session expired. Please register again.' });

            const code = generateVerificationCode();
            verificationStore.set(newUser.id, code, {
                studentId: newUser.student_id,
                fullName: newUser.full_name,
                email: newUser.email,
                institution: newUser.institution
            }); // refresh code, keep user data

            sendVerificationEmail(pendingData.email, pendingData.fullName, code).catch(err =>
                console.error('Failed to resend verification email:', err.message)
            );

            return res.status(200).json({ success: true, message: 'New verification code sent!' });
        }

        // ✅ Fallback for DB users
        const user = User.findById(userId);
        if (!user)
            return res.status(404).json({ success: false, message: 'User not found' });

        if (user.is_verified)
            return res.status(400).json({ success: false, message: 'Account already verified' });

        const code = generateVerificationCode();
        verificationStore.set(userId, code);

        sendVerificationEmail(user.email, user.full_name, code).catch(err =>
            console.error('Failed to resend verification email:', err.message)
        );

        return res.status(200).json({ success: true, message: 'New verification code sent!' });

    } catch (error) {
        console.error('Resend code error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});
// ================================
// POST /api/auth/login
// ================================
router.post('/login', authLimiter, (req, res) => {
    try {
        const { studentId, password, role } = req.body;

        if (!studentId || !password)
            return res.status(400).json({ success: false, message: 'Student ID / Email and password are required' });

        // ✅ Try finding by studentId first, then by email
        const user = User.findByStudentId(studentId) || User.findByEmail(studentId);

        if (!user)
            return res.status(401).json({ success: false, message: 'No account found with that Student ID or Email' });

        // Check role if provided (e.g. from specific login types)
        if (role && user.role !== role) {
            return res.status(403).json({
                success: false,
                message: `This account does not have ${role === 'admin' ? 'Administrative' : 'Student'} access.`
            });
        }

        const isMatch = User.comparePassword(password, user.password);
        if (!isMatch)
            return res.status(401).json({ success: false, message: 'Incorrect password' });

        if (!user.is_verified)
            return res.status(403).json({
                success: false,
                message: 'Please verify your email first.',
                userId: user.id
            });

        const token = generateToken(user.id);
        return sendTokenResponse(res, 200, user, token);

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ success: false, message: 'Server error during login' });
    }
});

// ================================
// POST /api/auth/forgot-password  ✅ NEW
// ================================
router.post('/forgot-password', authLimiter, (req, res) => {
    try {
        const { email } = req.body;

        if (!email)
            return res.status(400).json({ success: false, message: 'Email is required' });

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email))
            return res.status(400).json({ success: false, message: 'Invalid email format' });

        const user = User.findByEmail(email);

        // ✅ Security: always return same message whether email exists or not
        if (!user) {
            return res.status(200).json({
                success: true,
                message: 'If that email is registered, a reset code has been sent.'
            });
        }

        // Use 'reset_' prefix to keep reset codes separate from verify codes
        const code = generateVerificationCode();
        verificationStore.set(`reset_${user.id}`, code);

        sendPasswordResetOTPEmail(user.email, user.full_name, code).catch(err =>
            console.error('Failed to send reset email:', err.message)
        );

        return res.status(200).json({
            success: true,
            message: 'If that email is registered, a reset code has been sent.',
            userId: user.id  // needed for /reset-password
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ================================
// POST /api/auth/reset-password  ✅ NEW
// ================================
router.post('/reset-password', authLimiter, (req, res) => {
    try {
        const { userId, code, newPassword } = req.body;

        console.log('🔐 Reset attempt — userId:', userId, '| code:', code, '| newPassword length:', newPassword?.length);

        if (!userId || !code || !newPassword)
            return res.status(400).json({ success: false, message: 'userId, code and newPassword are required' });

        if (newPassword.length < 8)
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });

        const user = User.findById(userId);
        if (!user)
            return res.status(404).json({ success: false, message: 'User not found' });

        console.log('👤 Found user:', user.student_id, '| email:', user.email);

        const result = verificationStore.verify(`reset_${userId}`, code);
        console.log('🔑 OTP verify result:', result);

        if (!result.valid)
            return res.status(400).json({ success: false, message: result.reason });

        User.resetPassword(userId, newPassword);
        console.log('✅ Password updated for userId:', userId);

        // ✅ Verify the new hash actually works
        const updatedUser = User.findById(userId);
        const testMatch = User.comparePassword(newPassword, updatedUser.password);
        console.log('🧪 Hash verify test (should be true):', testMatch);

        return res.status(200).json({
            success: true,
            message: 'Password reset successfully! You can now log in.'
        });

    } catch (error) {
        console.error('Reset password error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});
// ================================
// POST /api/auth/logout
// ================================
router.post('/logout', protect, (req, res) => {
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
});

// ================================
// GET /api/auth/me
// ================================
router.get('/me', protect, (req, res) => {
    try {
        const user = User.publicProfile(req.user.id);
        if (!user)
            return res.status(404).json({ success: false, message: 'User not found' });
        return res.status(200).json({ success: true, user });
    } catch (error) {
        console.error('Get me error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;