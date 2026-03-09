require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB, checkDBHealth } = require('./config/db');

// Import Routes
const authRoutes = require('./routes/auth');
const analyticsRoutes = require('./routes/analytics');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

// =============================================
// Initialize Database
// =============================================
connectDB();

// =============================================
// Middleware
// =============================================

// CORS Configuration
const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(o => o.trim())
    : '*';

app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());
// Body Parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request Logger (development only)
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        console.log(`📡 ${req.method} ${req.url}`);
        next();
    });
}

// =============================================
// Routes
// =============================================
app.use('/api/auth', authRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);

// Health Check
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

// =============================================
// Error Handlers
// =============================================

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ success: false, message: `Route ${req.method} ${req.url} not found.` });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('🔥 Unhandled Error:', err);

    // Handle specific known errors
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ success: false, message: 'Request payload too large.' });
    }

    if (err.name === 'SyntaxError') {
        return res.status(400).json({ success: false, message: 'Invalid JSON in request body.' });
    }

    res.status(err.status || 500).json({
        success: false,
        message: 'Internal server error.',
        ...(process.env.NODE_ENV === 'development' && { error: err.message, stack: err.stack })
    });
});

// =============================================
// Start Server
// =============================================
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

// Graceful Shutdown
const shutdown = (signal) => {
    console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
});

// Catch uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('🔥 Uncaught Exception:', error);
    shutdown('uncaughtException');
});

module.exports = app;