const express = require('express');
const AnalyticsModel = require('../models/Analytics');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Protect all analytics routes
router.use(protect);

// =============================================
// CONSTANTS
// =============================================
const ALLOWED_DIFFICULTY = ['easy', 'medium', 'hard'];

// =============================================
// POST /api/analytics/submit
// Record every puzzle attempt — no duplicate blocking
// =============================================
router.post('/submit', (req, res) => {
    try {
        const {
            puzzleName,
            puzzleDate,
            difficulty,
            attempts,
            timeTaken,
            score,
        } = req.body;

        // --- Required field validation ---
        if (!puzzleName || !difficulty) {
            return res.status(400).json({
                success: false,
                message: 'Required: puzzleName, difficulty'
            });
        }

        if (!ALLOWED_DIFFICULTY.includes(difficulty)) {
            return res.status(400).json({
                success: false,
                message: `Invalid difficulty. Allowed: ${ALLOWED_DIFFICULTY.join(', ')}`
            });
        }

        // --- Sanitize numeric inputs ---
        const attemptsSafe = Math.max(1, Number(attempts) || 1);
        const timeTakenSafe = Math.max(0, Number(timeTaken) || 0);
        const scoreSafe = Math.max(0, Number(score) || 0);

        // Normalize puzzle date to YYYY-MM-DD
        const puzzleDateSafe = puzzleDate
            ? new Date(puzzleDate).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0];

        // --- Always create a new record (same puzzle can be submitted multiple times) ---
        const record = AnalyticsModel.create({
            userId: req.user.id,
            puzzleName,
            puzzleDate: puzzleDateSafe,
            difficulty,
            attempts: attemptsSafe,
            timeTaken: timeTakenSafe,
            score: scoreSafe,
        });

        return res.status(201).json({
            success: true,
            message: 'Puzzle attempt recorded.',
            data: { record }
        });

    } catch (error) {
        console.error('Submit analytics error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error.',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// =============================================
// GET /api/analytics/summary
// Performance summary for current user
// =============================================
router.get('/summary', (req, res) => {
    try {
        const userId = req.user.id;

        const [overview, byPuzzleName, byDifficulty, recentActivity] = [
            AnalyticsModel.getSummary(userId),
            AnalyticsModel.getByPuzzleName(userId),
            AnalyticsModel.getByDifficulty(userId),
            AnalyticsModel.getRecentActivity(userId, 7)
        ];

        return res.json({
            success: true,
            data: {
                overview,
                byPuzzleName,
                byDifficulty,
                recentActivity
            }
        });

    } catch (error) {
        console.error('Summary error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error.',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// =============================================
// GET /api/analytics/weekly-progress
// Weekly puzzle completion for current user
// =============================================
router.get('/weekly-progress', (req, res) => {
    try {
        const data = AnalyticsModel.getWeeklyProgress(req.user.id);
        return res.json({ success: true, data });
    } catch (error) {
        console.error('Weekly progress error:', error);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// =============================================
// GET /api/analytics/history
// Paginated history with optional filters
// =============================================
router.get('/history', (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

        const filters = {};

        if (req.query.puzzleName) {
            filters.puzzleName = req.query.puzzleName;
        }
        if (req.query.difficulty && ALLOWED_DIFFICULTY.includes(req.query.difficulty)) {
            filters.difficulty = req.query.difficulty;
        }
        if (req.query.puzzleDate) {
            filters.puzzleDate = req.query.puzzleDate;
        }

        const result = AnalyticsModel.getHistory(req.user.id, { page, limit, ...filters });

        return res.json({
            success: true,
            data: result || { records: [], page, limit, total: 0 }
        });

    } catch (error) {
        console.error('History error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error.',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// =============================================
// GET /api/analytics/streak
// Current streak based on puzzle_date
// =============================================
router.get('/streak', (req, res) => {
    try {
        const streak = AnalyticsModel.getStreak(req.user.id);

        return res.json({
            success: true,
            data: { streak }
        });

    } catch (error) {
        console.error('Streak error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error.',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// =============================================
// GET /api/analytics/leaderboard
// Top performers
// =============================================
router.get('/leaderboard', (req, res) => {
    try {
        const limit = Math.min(50, parseInt(req.query.limit) || 10);
        const leaderboard = AnalyticsModel.getLeaderboard(limit);

        return res.json({
            success: true,
            data: leaderboard
        });

    } catch (error) {
        console.error('Leaderboard error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error.',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// =============================================
// GET /api/analytics/progress
// Score progress over time
// =============================================
router.get('/progress', (req, res) => {
    try {
        const days = Math.min(365, parseInt(req.query.days) || 30);
        const progress = AnalyticsModel.getProgressOverTime(req.user.id, days);

        return res.json({
            success: true,
            data: progress
        });

    } catch (error) {
        console.error('Progress error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error.',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});


router.get('/solved', (req, res) => {
    try {
        const solved = AnalyticsModel.getSolvedCount(req.user.id);

        return res.json({
            success: true,
            data: { solved }
        });

    } catch (error) {
        console.error('Solved count error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error.',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

module.exports = router;