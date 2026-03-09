require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB, checkDBHealth } = require('./config/db');

const authRoutes = require('./routes/auth');
const analyticsRoutes = require('./routes/analytics');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ MUST be first — fixes rate limiter crash on Railway
app.set('trust proxy', 1);

connectDB();

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
    res.header('Access-Control-Allow-Headers', 'Origin,X-Requested-With,Content-Type,Accept,Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    next();
});

app.use(cors({ origin: true, credentials: true }));
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        console.log(`📡 ${req.method} ${req.url}`);
        next();
    });
}

app.use('/api/auth', authRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => {
    const dbHealth = checkDBHealth();
    res.json({
        success: true,
        message: '🧩 Daily Manorixia Backend is running!',
        database: dbHealth,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'production'
    });
});

app.use((req, res) => {
    res.status(404).json({ success: false, message: `Route ${req.method} ${req.url} not found.` });
});

app.use((err, req, res, next) => {
    console.error('🔥 Unhandled Error:', err);
    if (err.type === 'entity.too.large')
        return res.status(413).json({ success: false, message: 'Request payload too large.' });
    if (err.name === 'SyntaxError')
        return res.status(400).json({ success: false, message: 'Invalid JSON in request body.' });
    res.status(err.status || 500).json({
        success: false,
        message: 'Internal server error.',
        ...(process.env.NODE_ENV === 'development' && { error: err.message, stack: err.stack })
    });
});

const server = app.listen(PORT, () => {
    console.log('');
    console.log('🧩 ════════════════════════════════════════');
    console.log(`   Daily Manorixia Backend v1.0.0`);
    console.log(`   Server  → http://localhost:${PORT}`);
    console.log(`   Health  → http://localhost:${PORT}/api/health`);
    console.log(`   DB      → SQLite (manorixia.db)`);
    console.log(`   Env     → ${process.env.NODE_ENV || 'production'}`);
    console.log('🧩 ════════════════════════════════════════');
    console.log('');
});

const shutdown = (signal) => {
    console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('🔥 Uncaught Exception:', error);
    const nonFatal = ['timeout', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'];
    if (nonFatal.some(e => error.message?.includes(e) || error.code?.includes(e))) {
        console.warn('⚠️  Non-fatal network error — server continues running');
        return;
    }
    shutdown('uncaughtException');
});

module.exports = app;