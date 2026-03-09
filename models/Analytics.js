const { getDB } = require('../config/db');

class Analytics {

    // ================================
    // CREATE RECORD — always insert every attempt
    // ================================
    static create({
        userId,
        puzzleName,
        puzzleDate,
        difficulty,
        attempts = 1,
        timeTaken = 0,
        score = 0,
    }) {
        try {
            const db = getDB();

            const result = db.prepare(`
                INSERT INTO analytics (
                    user_id, puzzle_name, puzzle_date, difficulty,
                    attempts, time_taken, score,
                    completed_at, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `).run(
                userId,
                puzzleName,
                puzzleDate || new Date().toISOString().split('T')[0],
                difficulty,
                attempts,
                timeTaken,
                score
            );

            return {
                id: result.lastInsertRowid,
                userId,
                puzzleName,
                puzzleDate,
                difficulty,
                attempts,
                timeTaken,
                score
            };
        } catch (error) {
            console.error('Analytics.create error:', error);
            throw error;
        }
    }

    // ================================
    // OVERALL SUMMARY
    // ================================
    static getSummary(userId) {
        try {
            const db = getDB();

            const result = db.prepare(`
                SELECT
                    COUNT(*)                    AS total_submissions,
                    SUM(attempts)               AS total_attempts,
                    ROUND(AVG(score), 1)        AS avg_score,
                    MAX(score)                  AS max_score,
                    MIN(score)                  AS min_score,
                    ROUND(AVG(time_taken))      AS avg_time
                FROM analytics
                WHERE user_id = ?
            `).get(userId);

            return {
                totalSubmissions: result.total_submissions || 0,
                totalAttempts: result.total_attempts || 0,
                avgScore: result.avg_score || 0,
                maxScore: result.max_score || 0,
                minScore: result.min_score || 0,
                avgTime: result.avg_time || 0,
            };
        } catch (error) {
            console.error('Analytics.getSummary error:', error);
            throw error;
        }
    }

    // ================================
    // BY PUZZLE NAME
    // ================================
    static getByPuzzleName(userId) {
        try {
            const db = getDB();
            return db.prepare(`
                SELECT
                    puzzle_name                     AS puzzleName,
                    COUNT(*)                        AS totalSubmissions,
                    SUM(attempts)                   AS totalAttempts,
                    ROUND(AVG(score), 1)            AS avgScore,
                    MAX(score)                      AS bestScore,
                    ROUND(AVG(time_taken))          AS avgTime
                FROM analytics
                WHERE user_id = ?
                GROUP BY puzzle_name
                ORDER BY totalSubmissions DESC
            `).all(userId) || [];
        } catch (error) {
            console.error('Analytics.getByPuzzleName error:', error);
            throw error;
        }
    }

    // ================================
    // BY DIFFICULTY
    // ================================
    static getByDifficulty(userId) {
        try {
            const db = getDB();
            return db.prepare(`
                SELECT
                    difficulty,
                    COUNT(*)                        AS totalSubmissions,
                    SUM(attempts)                   AS totalAttempts,
                    ROUND(AVG(score), 1)            AS avgScore,
                    MAX(score)                      AS bestScore,
                    ROUND(AVG(time_taken))          AS avgTime
                FROM analytics
                WHERE user_id = ?
                GROUP BY difficulty
                ORDER BY
                    CASE difficulty
                        WHEN 'easy'   THEN 1
                        WHEN 'medium' THEN 2
                        WHEN 'hard'   THEN 3
                        ELSE 4
                    END
            `).all(userId) || [];
        } catch (error) {
            console.error('Analytics.getByDifficulty error:', error);
            throw error;
        }
    }

    // ================================
    // RECENT ACTIVITY (last N days)
    // ================================
    static getRecentActivity(userId, days = 7) {
        try {
            const db = getDB();
            return db.prepare(`
                SELECT
                    DATE(completed_at)              AS date,
                    COUNT(*)                        AS totalSubmissions,
                    SUM(attempts)                   AS totalAttempts,
                    ROUND(AVG(score), 1)            AS avgScore,
                    MAX(score)                      AS bestScore
                FROM analytics
                WHERE user_id = ?
                  AND completed_at >= datetime('now', '-' || ? || ' days')
                GROUP BY DATE(completed_at)
                ORDER BY date DESC
            `).all(userId, days) || [];
        } catch (error) {
            console.error('Analytics.getRecentActivity error:', error);
            throw error;
        }
    }

    // ================================
    // STREAK (based on puzzle_date)
    // ================================
    // static getStreak(userId) {
    //     try {
    //         const db = getDB();

    //         const dates = db.prepare(`
    //             SELECT DISTINCT puzzle_date AS day
    //             FROM analytics
    //             WHERE user_id = ?
    //             ORDER BY day DESC
    //         `).all(userId);

    //         if (!dates.length) return 0;

    //         let streak = 0;
    //         let current = new Date();
    //         current.setHours(0, 0, 0, 0);

    //         for (const { day } of dates) {
    //             const date = new Date(day);
    //             date.setHours(0, 0, 0, 0);

    //             const diffDays = Math.round((current - date) / (1000 * 60 * 60 * 24));

    //             if (diffDays === 0 || diffDays === 1) {
    //                 streak++;
    //                 current = date;
    //             } else {
    //                 break;
    //             }
    //         }

    //         return streak;
    //     } catch (error) {
    //         console.error('Analytics.getStreak error:', error);
    //         return 0;
    //     }
    // }

    static getStreak(userId) {
        try {
            const db = getDB();

            const dates = db.prepare(`
            SELECT DISTINCT puzzle_date AS day
            FROM analytics
            WHERE user_id = ?
            ORDER BY day DESC
        `).all(userId);

            if (!dates.length) return 0;

            let streak = 0;
            let current = new Date();
            current.setHours(0, 0, 0, 0);

            for (const { day } of dates) {
                const date = new Date(day + 'T00:00:00'); // safe parse
                date.setHours(0, 0, 0, 0);

                if (date > current) continue; // guard future dates

                const diffDays = Math.floor((current - date) / 86400000);

                if (diffDays === 0 || diffDays === 1) {
                    streak++;
                    current = date;
                } else {
                    break;
                }
            }

            return streak;
        } catch (error) {
            console.error('Analytics.getStreak error:', error);
            return 0;
        }
    }
    // ================================
    // PAGINATED HISTORY WITH FILTERS
    // ================================
    static getHistory(userId, options = {}) {
        try {
            const db = getDB();

            const page = Math.max(1, options.page || 1);
            const limit = Math.min(100, options.limit || 20);
            const offset = (page - 1) * limit;

            let where = 'WHERE user_id = ?';
            const params = [userId];

            if (options.puzzleName) {
                where += ' AND puzzle_name = ?';
                params.push(options.puzzleName);
            }
            if (options.difficulty) {
                where += ' AND difficulty = ?';
                params.push(options.difficulty);
            }
            if (options.puzzleDate) {
                where += ' AND puzzle_date = ?';
                params.push(options.puzzleDate);
            }

            const total = db.prepare(
                `SELECT COUNT(*) AS count FROM analytics ${where}`
            ).get(...params).count || 0;

            const records = db.prepare(`
                SELECT
                    id,
                    puzzle_name     AS puzzleName,
                    puzzle_date     AS puzzleDate,
                    difficulty,
                    attempts,
                    time_taken      AS timeTaken,
                    score,
                    completed_at    AS completedAt,
                    created_at      AS createdAt
                FROM analytics
                ${where}
                ORDER BY completed_at DESC
                LIMIT ? OFFSET ?
            `).all(...params, limit, offset);

            return {
                records: records || [],
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                    hasNextPage: offset + limit < total,
                    hasPrevPage: page > 1
                }
            };
        } catch (error) {
            console.error('Analytics.getHistory error:', error);
            throw error;
        }
    }

    // ================================
    // LEADERBOARD
    // ================================
    static getLeaderboard(limit = 10) {
        try {
            const db = getDB();
            return db.prepare(`
                SELECT
                    u.id,
                    u.student_id                        AS studentId,
                    u.full_name                         AS fullName,
                    COUNT(a.id)                         AS totalSubmissions,
                    SUM(a.attempts)                     AS totalAttempts,
                    ROUND(AVG(a.score), 1)              AS avgScore,
                    MAX(a.score)                        AS maxScore
                FROM users u
                LEFT JOIN analytics a ON u.id = a.user_id
                GROUP BY u.id
                ORDER BY avgScore DESC, maxScore DESC, totalSubmissions DESC
                LIMIT ?
            `).all(Math.min(100, limit)) || [];
        } catch (error) {
            console.error('Analytics.getLeaderboard error:', error);
            throw error;
        }
    }

    // ================================
    // PROGRESS OVER TIME
    // ================================
    static getProgressOverTime(userId, days = 30) {
        try {
            const db = getDB();
            return db.prepare(`
                SELECT
                    DATE(completed_at)              AS date,
                    COUNT(*)                        AS totalSubmissions,
                    SUM(attempts)                   AS totalAttempts,
                    ROUND(AVG(score), 1)            AS avgScore,
                    MAX(score)                      AS bestScore
                FROM analytics
                WHERE user_id = ?
                  AND completed_at >= datetime('now', '-' || ? || ' days')
                GROUP BY DATE(completed_at)
                ORDER BY date ASC
            `).all(userId, days) || [];
        } catch (error) {
            console.error('Analytics.getProgressOverTime error:', error);
            throw error;
        }
    }

    // ================================
    // DELETE USER ANALYTICS
    // ================================
    static deleteByUserId(userId) {
        try {
            const db = getDB();
            db.prepare('DELETE FROM analytics WHERE user_id = ?').run(userId);
        } catch (error) {
            console.error('Analytics.deleteByUserId error:', error);
            throw error;
        }
    }
    // ================================
    // SOLVED COUNT
    // ================================

    static getSolvedCount(userId) {
        const db = getDB();

        const result = db.prepare(`
        SELECT COUNT(DISTINCT puzzle_name || puzzle_date) AS solved
        FROM analytics
        WHERE user_id = ?
    `).get(userId);

        return result.solved || 0;
    }

    // ================================
    // WEEKLY PROGRESS (Mon–Sun)
    // ================================
    static getWeeklyProgress(userId) {
        try {
            const db = getDB();

            // Calculate current week's Monday (ISO week starts Monday)
            const now = new Date();
            const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
            const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            const monday = new Date(now);
            monday.setDate(now.getDate() - diffToMonday);
            monday.setHours(0, 0, 0, 0);
            const mondayStr = monday.toISOString().split('T')[0];

            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            const sundayStr = sunday.toISOString().split('T')[0];

            // Count distinct days the user solved at least one puzzle this week
            const result = db.prepare(`
                SELECT COUNT(DISTINCT puzzle_date) AS days_completed
                FROM analytics
                WHERE user_id = ?
                  AND puzzle_date >= ?
                  AND puzzle_date <= ?
            `).get(userId, mondayStr, sundayStr);

            const daysCompleted = result?.days_completed || 0;
            const totalDays = 7;
            const percentage = Math.round((daysCompleted / totalDays) * 100);

            return {
                daysCompleted,
                totalDays,
                percentage,
                weekStart: mondayStr,
                weekEnd: sundayStr
            };
        } catch (error) {
            console.error('Analytics.getWeeklyProgress error:', error);
            return { daysCompleted: 0, totalDays: 7, percentage: 0 };
        }
    }
}

module.exports = Analytics;