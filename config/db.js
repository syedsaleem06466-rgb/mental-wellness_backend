const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join('/data', 'manorixia.db');

let db;

// =============================================
// INITIALIZE DATABASE
// =============================================
const connectDB = () => {
    try {
        console.log(`🔌 Connecting to SQLite database at: ${DB_PATH}`);

        db = new Database(DB_PATH, {
            verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
        });

        // Performance pragmas
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

// =============================================
// CREATE TABLES
// =============================================
const createTables = () => {
    try {
        db.exec(`
            -- =============================================
            -- USERS TABLE
            -- =============================================
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

            -- =============================================
            -- ANALYTICS TABLE
            -- =============================================
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

            -- =============================================
            -- INDEXES
            -- =============================================
            CREATE INDEX IF NOT EXISTS idx_users_email      ON users(email);
            CREATE INDEX IF NOT EXISTS idx_users_student_id ON users(student_id);

            CREATE INDEX IF NOT EXISTS idx_analytics_user       ON analytics(user_id, completed_at DESC);
            CREATE INDEX IF NOT EXISTS idx_analytics_puzzle     ON analytics(user_id, puzzle_name);
            CREATE INDEX IF NOT EXISTS idx_analytics_difficulty ON analytics(user_id, difficulty);
        `);

        // Migration: Add role column if it doesn't exist
        const tableInfo = db.prepare("PRAGMA table_info(users)").all();
        const hasRole = tableInfo.some(col => col.name === 'role');
        if (!hasRole) {
            console.log('🔄 Migrating: Adding role column to users table...');
            db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
        }

        const hasInstitution = tableInfo.some(col => col.name === 'institution');
        if (!hasInstitution) {
            console.log('🔄 Migrating: Adding institution column to users table...');
            db.exec("ALTER TABLE users ADD COLUMN institution TEXT");
        }

        console.log('✅ Database tables created/verified');
    } catch (error) {
        console.error('❌ Table creation error:', error.message);
        throw error;
    }
};

// =============================================
// GET DATABASE INSTANCE
// =============================================
const getDB = () => {
    if (!db) {
        throw new Error('Database not initialized. Call connectDB() first.');
    }
    return db;
};

// =============================================
// HEALTH CHECK
// =============================================
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

// =============================================
// BACKUP DATABASE
// =============================================
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

// =============================================
// CLOSE DATABASE
// =============================================
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

// =============================================
// GRACEFUL SHUTDOWN
// =============================================
process.on('SIGINT', () => { console.log('\n🛑 SIGINT received'); closeDB(); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n🛑 SIGTERM received'); closeDB(); process.exit(0); });

module.exports = { connectDB, getDB, checkDBHealth, backupDB, closeDB };