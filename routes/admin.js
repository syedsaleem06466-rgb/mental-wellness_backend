const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { admin } = require('../middleware/adminAuth');
const { getDB } = require('../config/db');

// @desc    Get global statistics for admin dashboard
// @route   GET /api/admin/stats
// @access  Private/Admin
router.get('/stats', protect, admin, (req, res) => {
    try {
        const db = getDB();
        if (!db) throw new Error('DB not available');

        // 1. Total User Count
        const userRes = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'user'").get();
        const userCount = userRes ? userRes.count : 0;

        // 2. Platform-wide Puzzle Success Rate (%)
        // We'll define "success" as any record in analytics (since every record is a "solve" in this app's current logic)
        // But for a more interesting stat, let's look at total attempts vs total puzzles.
        // If attempts = 1, it's a first-try success.
        const puzzleStats = db.prepare(`
            SELECT 
                COUNT(*) as totalSolved,
                SUM(CASE WHEN attempts = 1 THEN 1 ELSE 0 END) as firstTrySolved
            FROM analytics
        `).get();

        const successRate = puzzleStats.totalSolved > 0
            ? Math.round((puzzleStats.firstTrySolved / puzzleStats.totalSolved) * 100)
            : 0;

        // 3. Top Performer Spotlight
        // Performance Ranking: Weighted score = (score * 10) - (time_taken / 10) - (attempts * 5)
        // But let's use a simpler total score + solved count for now.
        const topPerformer = db.prepare(`
            SELECT 
                u.id, 
                u.student_id as studentId, 
                u.full_name as fullName,
                SUM(a.score) as totalScore,
                COUNT(a.id) as puzzlesSolved
            FROM users u
            JOIN analytics a ON u.id = a.user_id
            GROUP BY u.id
            ORDER BY totalScore DESC, puzzlesSolved DESC
            LIMIT 1
        `).get();

        res.json({
            success: true,
            data: {
                totalUsers: userCount,
                successRate: successRate,
                topPerformer: topPerformer || null
            }
        });
    } catch (error) {
        console.error('Admin Stats Error:', error.message, error.stack);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @desc    Get master user list with summaries
// @route   GET /api/admin/users
// @access  Private/Admin
router.get('/users', protect, admin, (req, res) => {
    try {
        const db = getDB();

        const users = db.prepare(`
            SELECT 
                u.id, 
                u.student_id as studentId, 
                u.full_name as fullName,
                u.email,
                u.institution,
                COUNT(a.id) as puzzlesSolved,
                ROUND(AVG(a.time_taken)) as avgSolveTime,
                (
                    SELECT puzzle_name 
                    FROM analytics 
                    WHERE user_id = u.id 
                    GROUP BY puzzle_name 
                    ORDER BY AVG(score) DESC, COUNT(*) DESC 
                    LIMIT 1
                ) as topSkill
            FROM users u
            LEFT JOIN analytics a ON u.id = a.user_id
            WHERE u.role = 'user'
            GROUP BY u.id
            ORDER BY u.created_at DESC
        `).all();

        res.json({
            success: true,
            data: users
        });
    } catch (error) {
        console.error('Admin Users Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @desc    Get individual user deep-dive
// @route   GET /api/admin/users/:id
// @access  Private/Admin
router.get('/users/:id', protect, admin, (req, res) => {
    try {
        const db = getDB();
        const userId = req.params.id;

        const user = db.prepare(`
            SELECT id, student_id as studentId, full_name as fullName, email, institution, created_at as createdAt
            FROM users WHERE id = ?
        `).get(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Skill Distribution (by puzzle type)
        const skills = db.prepare(`
            SELECT 
                puzzle_name as name,
                ROUND(AVG(score), 1) as avgScore,
                COUNT(*) as count
            FROM analytics
            WHERE user_id = ?
            GROUP BY puzzle_name
        `).all(userId);

        // Difficulty Performance (Easy, Medium, Hard)
        const difficultyPerformance = db.prepare(`
            SELECT 
                difficulty,
                COUNT(*) as count,
                ROUND(AVG(score), 1) as avgScore,
                SUM(time_taken) as totalTime
            FROM analytics
            WHERE user_id = ?
            GROUP BY difficulty
        `).all(userId);

        // Time Allocation (By Puzzle Name)
        const timeAllocation = db.prepare(`
            SELECT 
                puzzle_name as name,
                SUM(time_taken) as totalTime
            FROM analytics
            WHERE user_id = ?
            GROUP BY puzzle_name
        `).all(userId);

        // Activity Log
        const activity = db.prepare(`
            SELECT 
                puzzle_name as puzzleName,
                puzzle_date as puzzleDate,
                difficulty,
                attempts,
                time_taken as duration,
                score,
                completed_at as timestamp
            FROM analytics
            WHERE user_id = ?
            ORDER BY completed_at DESC
            LIMIT 50
        `).all(userId);

        // Best Performance Day
        const bestDay = db.prepare(`
            SELECT 
                CASE CAST(strftime('%w', completed_at) AS INT)
                    WHEN 0 THEN 'Sunday' WHEN 1 THEN 'Monday' WHEN 2 THEN 'Tuesday'
                    WHEN 3 THEN 'Wednesday' WHEN 4 THEN 'Thursday' WHEN 5 THEN 'Friday'
                    WHEN 6 THEN 'Saturday'
                END as dayName
            FROM analytics
            WHERE user_id = ?
            GROUP BY dayName
            ORDER BY AVG(score) DESC, COUNT(*) DESC
            LIMIT 1
        `).get(userId);

        res.json({
            success: true,
            data: {
                profile: user,
                skills,
                difficultyPerformance,
                timeAllocation,
                bestDay: bestDay ? bestDay.dayName : 'N/A',
                activity
            }
        });
    } catch (error) {
        console.error('Admin User Detail Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @desc    Get platform-wide daily activity for the last N days
// @route   GET /api/admin/activity?days=30
// @access  Private/Admin
router.get('/activity', protect, admin, (req, res) => {
    try {
        const db = getDB();
        const days = Math.min(365, parseInt(req.query.days) || 30);

        const rows = db.prepare(`
            SELECT
                DATE(completed_at) as date,
                COUNT(*) as totalSubmissions,
                SUM(CASE WHEN attempts = 1 THEN 1 ELSE 0 END) as successCount
            FROM analytics
            WHERE completed_at >= DATE('now', '-' || ? || ' days')
            GROUP BY DATE(completed_at)
            ORDER BY date ASC
        `).all(days);

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Admin Activity Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @desc    Get platform-wide difficulty distribution stats
// @route   GET /api/admin/difficulty-stats
// @access  Private/Admin
router.get('/difficulty-stats', protect, admin, (req, res) => {
    try {
        const db = getDB();

        const rows = db.prepare(`
            SELECT
                difficulty,
                COUNT(*) as count,
                ROUND(AVG(score), 1) as avgScore,
                SUM(CASE WHEN attempts = 1 THEN 1 ELSE 0 END) as firstTrySolves
            FROM analytics
            GROUP BY difficulty
            ORDER BY CASE difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 WHEN 'hard' THEN 3 END
        `).all();

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Admin Difficulty Stats Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @desc    Get per-user daily performance over the last 30 days
// @route   GET /api/admin/users/:id/daily
// @access  Private/Admin
router.get('/users/:id/daily', protect, admin, (req, res) => {
    try {
        const db = getDB();
        const userId = req.params.id;

        const rows = db.prepare(`
            SELECT
                DATE(completed_at) as date,
                ROUND(AVG(score), 1) as avgScore,
                COUNT(*) as attempts
            FROM analytics
            WHERE user_id = ?
              AND completed_at >= DATE('now', '-30 days')
            GROUP BY DATE(completed_at)
            ORDER BY date ASC
        `).all(userId);

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Admin User Daily Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
