// Map structure: userId -> { code, expires, attempts, data }
const store = new Map();

const EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

const set = (userId, code, data = null) => {  // ✅ added optional data param
    store.set(userId, {
        code,
        expires: Date.now() + EXPIRY_MS,
        attempts: 0,
        data  // ✅ stores pending registration details (null for normal verify flows)
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

const getData = (userId) => store.get(userId)?.data ?? null;  // ✅ retrieve pending user details

const remove = (userId) => store.delete(userId);

const has = (userId) => store.has(userId);

module.exports = { set, verify, getData, remove, has };  // ✅ export getData