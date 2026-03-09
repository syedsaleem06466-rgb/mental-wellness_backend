// =============================================
// Verification Store — SQLite backed
// Survives server restarts and redeploys
// =============================================
const { getDB } = require('../config/db');

// Create table if it doesn't exist
const initTable = () => {
    try {
        const db = getDB();
        db.exec(`
            CREATE TABLE IF NOT EXISTS verification_codes (
                key TEXT PRIMARY KEY,
                code TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                attempts INTEGER DEFAULT 0,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);
        // Clean up expired codes on startup
        db.prepare('DELETE FROM verification_codes WHERE expires_at < ?').run(Date.now());
        console.log('✅ Verification store ready (SQLite)');
    } catch (err) {
        console.error('❌ Failed to init verification_codes table:', err.message);
    }
};

initTable();

const EXPIRY_MS = 30 * 60 * 1000; // 30 minutes — generous window
const MAX_ATTEMPTS = 5;

const set = (key, code) => {
    try {
        const db = getDB();
        const expiresAt = Date.now() + EXPIRY_MS;
        db.prepare(`
            INSERT INTO verification_codes (key, code, expires_at, attempts)
            VALUES (?, ?, ?, 0)
            ON CONFLICT(key) DO UPDATE SET
                code = excluded.code,
                expires_at = excluded.expires_at,
                attempts = 0
        `).run(String(key), String(code), expiresAt);
    } catch (err) {
        console.error('❌ verificationStore.set error:', err.message);
    }
};

const verify = (key, code) => {
    try {
        const db = getDB();
        const entry = db.prepare('SELECT * FROM verification_codes WHERE key = ?').get(String(key));

        if (!entry) {
            return { valid: false, reason: 'Verification code not found. Please request a new one.' };
        }

        if (Date.now() > entry.expires_at) {
            db.prepare('DELETE FROM verification_codes WHERE key = ?').run(String(key));
            return { valid: false, reason: 'Verification code has expired. Please request a new one.' };
        }

        if (entry.attempts >= MAX_ATTEMPTS) {
            db.prepare('DELETE FROM verification_codes WHERE key = ?').run(String(key));
            return { valid: false, reason: 'Too many failed attempts. Please request a new code.' };
        }

        if (String(entry.code) !== String(code)) {
            db.prepare('UPDATE verification_codes SET attempts = attempts + 1 WHERE key = ?').run(String(key));
            const remaining = MAX_ATTEMPTS - entry.attempts - 1;
            return { valid: false, reason: `Incorrect code. ${remaining} attempt(s) remaining.` };
        }

        // ✅ Valid — delete so it can't be reused
        db.prepare('DELETE FROM verification_codes WHERE key = ?').run(String(key));
        return { valid: true };

    } catch (err) {
        console.error('❌ verificationStore.verify error:', err.message);
        return { valid: false, reason: 'Verification error. Please try again.' };
    }
};

const remove = (key) => {
    try {
        const db = getDB();
        db.prepare('DELETE FROM verification_codes WHERE key = ?').run(String(key));
    } catch (err) {
        console.error('❌ verificationStore.remove error:', err.message);
    }
};

module.exports = { set, verify, remove };