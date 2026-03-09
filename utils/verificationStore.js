const { getDB } = require('../config/db');

const EXPIRY_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const set = (key, code, data = null) => {
    try {
        const db = getDB();
        const expiresAt = Date.now() + EXPIRY_MS;
        db.prepare(`
            INSERT INTO verification_codes (key, code, expires_at, attempts, data)
            VALUES (?, ?, ?, 0, ?)
            ON CONFLICT(key) DO UPDATE SET
                code = excluded.code,
                expires_at = excluded.expires_at,
                attempts = 0,
                data = excluded.data
        `).run(String(key), String(code), expiresAt, data ? JSON.stringify(data) : null);
        console.log(`📝 Code stored for key: ${key}`);
    } catch (err) {
        console.error('❌ verificationStore.set error:', err.message);
    }
};

const getData = (key) => {
    try {
        const db = getDB();
        const entry = db.prepare('SELECT data FROM verification_codes WHERE key = ?').get(String(key));
        if (!entry || !entry.data) return null;
        return JSON.parse(entry.data);
    } catch (err) {
        console.error('❌ verificationStore.getData error:', err.message);
        return null;
    }
};

const verify = (key, code) => {
    try {
        const db = getDB();
        console.log(`🔍 Verifying key: ${key} | code: ${code}`);

        const entry = db.prepare('SELECT * FROM verification_codes WHERE key = ?').get(String(key));
        console.log(`🔍 Entry:`, entry
            ? `code=${entry.code} expires=${entry.expires_at} attempts=${entry.attempts}`
            : 'NOT FOUND'
        );

        if (!entry)
            return { valid: false, reason: 'Verification code not found. Please request a new one.' };

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
        console.log(`✅ Code verified for key: ${key}`);
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

module.exports = { set, verify, remove, delete: remove, getData };