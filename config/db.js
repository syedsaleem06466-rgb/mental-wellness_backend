const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'manorixia.db');

let db;

const connectDB = () => {
    try {
        console.log(`🔌 Connecting to SQLite database at: ${DB_PATH}`);

        // Ensure the directory exists
        if (!fs.existsSync(DB_DIR)) {
            fs.mkdirSync(DB_DIR, { recursive: true });
            console.log(`📁 Created database directory: ${DB_DIR}`);
        }

        db = new Database(DB_PATH, {
            verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
        });

        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        db.pragma('synchronous = NORMAL');
        db.pragma('cache_size = -64000');
        db.pragma('temp_store = MEMORY');

        createTables();

        console.log(`✅ SQLite Database Connected: ${DB_PATH}`);
        return db;

    } catch (error) {
        console.error(`❌ SQLite Connection Error: ${error.message}`);
        process.exit(1);
    }
};

const createTables = () => {
    try {
        db.exec(`
            -- USERS TABLE
            CREATE TABLE IF NOT EXISTS users (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id  TEXT UNIQUE NOT NULL,
                full_name   TEXT NOT NULL,
                email       TEXT UNIQUE NOT NULL,
                password    TEXT NOT NULL,
                role        TEXT DEFAULT 'user',
                is_verified INTEGER DEFAULT 0,
                institution TEXT,
                created_at  TEXT DEFAULT (datetime('now'))
            );

            -- ANALYTICS TABLE
            CREATE TABLE IF NOT EXISTS analytics (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id      INTEGER NOT NULL,
                puzzle_name  TEXT NOT NULL,
                puzzle_date  TEXT NOT NULL,
                difficulty   TEXT CHECK(difficulty IN ('easy', 'medium', 'hard')) NOT NULL,
                attempts     INTEGER NOT NULL DEFAULT 1,
                time_taken   INTEGER NOT NULL DEFAULT 0,
                score        REAL NOT NULL DEFAULT 0,
                completed_at TEXT NOT NULL DEFAULT (datetime('now')),
                created_at   TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            -- VERIFICATION CODES TABLE
            CREATE TABLE IF NOT EXISTS verification_codes (
                key        TEXT PRIMARY KEY,
                code       TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                attempts   INTEGER DEFAULT 0,
                data       TEXT DEFAULT NULL,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            );

            -- INDEXES
            CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
            CREATE INDEX IF NOT EXISTS idx_users_student_id     ON users(student_id);
            CREATE INDEX IF NOT EXISTS idx_analytics_user       ON analytics(user_id, completed_at DESC);
            CREATE INDEX IF NOT EXISTS idx_analytics_puzzle     ON analytics(user_id, puzzle_name);
            CREATE INDEX IF NOT EXISTS idx_analytics_difficulty ON analytics(user_id, difficulty);
        `);

        // ✅ FIX: Migration for old DBs where verification_codes table was never created
        const vcExists = db.prepare(
            `SELECT name FROM sqlite_master WHERE type='table' AND name='verification_codes'`
        ).get();
        if (!vcExists) {
            console.log('🔄 Migrating: Creating verification_codes table...');
            db.exec(`
                CREATE TABLE verification_codes (
                    key        TEXT PRIMARY KEY,
                    code       TEXT NOT NULL,
                    expires_at INTEGER NOT NULL,
                    attempts   INTEGER DEFAULT 0,
                    data       TEXT DEFAULT NULL,
                    created_at INTEGER DEFAULT (strftime('%s', 'now'))
                )
            `);
            console.log('✅ verification_codes table created');
        }

        // Migrations: add missing columns to users
        const tableInfo = db.prepare("PRAGMA table_info(users)").all();

        if (!tableInfo.some(col => col.name === 'role')) {
            console.log('🔄 Migrating: Adding role column...');
            db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
        }

        if (!tableInfo.some(col => col.name === 'institution')) {
            console.log('🔄 Migrating: Adding institution column...');
            db.exec("ALTER TABLE users ADD COLUMN institution TEXT");
        }

        // Migration: add data column to verification_codes if missing
        const vcInfo = db.prepare("PRAGMA table_info(verification_codes)").all();
        if (!vcInfo.some(col => col.name === 'data')) {
            console.log('🔄 Migrating: Adding data column to verification_codes...');
            db.exec("ALTER TABLE verification_codes ADD COLUMN data TEXT DEFAULT NULL");
        }

        // Clean up expired verification codes on startup
        const cleaned = db.prepare('DELETE FROM verification_codes WHERE expires_at < ?').run(Date.now());
        if (cleaned.changes > 0) console.log(`🧹 Cleaned ${cleaned.changes} expired verification codes`);
        // Seed admin user if not exists


        const adminExists = db.prepare(
            `SELECT id FROM users WHERE student_id = ?`
        ).get('admin_test');

        if (!adminExists) {
            const hashedPassword = bcrypt.hashSync('admin_pass123', 10);
            db.prepare(`
        INSERT INTO users (student_id, full_name, email, password, role, is_verified)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run('admin_test', 'Admin User', 'admin@manorixia.com', hashedPassword, 'admin', 1);
            console.log('✅ Admin user seeded');
        } else {
            console.log('ℹ️  Admin user already exists, skipping seed');
        }
        console.log('✅ Database tables created/verified');
    } catch (error) {
        console.error('❌ Table creation error:', error.message);
        throw error;
    }
};

const getDB = () => {
    if (!db) throw new Error('Database not initialized. Call connectDB() first.');
    return db;
};

const checkDBHealth = () => {
    try {
        const db = getDB();
        const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
        const analyticsCount = db.prepare('SELECT COUNT(*) as count FROM analytics').get();
        return {
            connected: true,
            database: DB_PATH,
            tables: {
                users: userCount.count || 0,
                analytics: analyticsCount.count || 0
            },
            mode: db.pragma('journal_mode', { simple: true }),
            foreignKeys: db.pragma('foreign_keys', { simple: true })
        };
    } catch (error) {
        console.error('DB health check error:', error);
        return { connected: false, error: error.message };
    }
};

const backupDB = async (backupPath) => {
    try {
        const db = getDB();
        await db.backup(backupPath);
        console.log(`✅ Database backed up to: ${backupPath}`);
        return true;
    } catch (error) {
        console.error('Backup error:', error.message);
        return false;
    }
};

const closeDB = () => {
    try {
        if (db) {
            db.close();
            db = null;
            console.log('✅ Database connection closed');
        }
    } catch (error) {
        console.error('Error closing database:', error.message);
    }
};

process.on('SIGINT', () => { console.log('\n🛑 SIGINT received'); closeDB(); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n🛑 SIGTERM received'); closeDB(); process.exit(0); });

module.exports = { connectDB, getDB, checkDBHealth, backupDB, closeDB };