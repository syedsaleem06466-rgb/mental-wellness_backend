// Map structure: userId -> { code, expires }
const store = new Map();

const EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

const set = (userId, code) => {
    store.set(userId, {
        code,
        expires: Date.now() + EXPIRY_MS,
        attempts: 0
    });
};

const verify = (userId, inputCode) => {
    const entry = store.get(userId);

    if (!entry) return { valid: false, reason: 'No code found. Please request a new one.' };
    if (Date.now() > entry.expires) { store.delete(userId); return { valid: false, reason: 'Code expired. Please request a new one.' }; }
    if (entry.attempts >= 5) return { valid: false, reason: 'Too many attempts. Please request a new one.' };

    entry.attempts++;

    if (entry.code !== inputCode) return { valid: false, reason: 'Invalid code.' };

    store.delete(userId); // ✅ used — remove immediately
    return { valid: true };
};

const remove = (userId) => store.delete(userId);

const has = (userId) => store.has(userId);

module.exports = { set, verify, remove, has };