const nodemailer = require('nodemailer');
const crypto = require('crypto');

let transporter;



const initializeEmailTransport = () => {
    try {
        if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.warn('⚠️  Email configuration incomplete');
            return null;
        }
        transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: Number(process.env.EMAIL_PORT) || 587,
            secure: process.env.EMAIL_SECURE == 465,
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
            connectionTimeout: 5000,
            socketTimeout: 5000,
            pool: { maxConnections: 5, maxMessages: 100, rateDelta: 4000, rateLimit: 14 }
        });
        transporter.verify((error) => {
            if (error) { console.error('❌ Email error:', error.message); transporter = null; }
            else console.log('✅ Email ready');
        });
        return transporter;
    } catch (error) {
        console.error('❌ Email init error:', error.message);
        return null;
    }
};

initializeEmailTransport();

const generateVerificationCode = (length = 6) => {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return crypto.randomInt(min, max + 1).toString();
};

const getVerificationEmailHTML = (fullName, code) => `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Verify Email</title><style>*{margin:0;padding:0}body{font-family:Arial,sans-serif;background:#f5f5f5}.container{max-width:600px;margin:20px auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1)}.header{background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:40px 20px;text-align:center}.header h1{font-size:28px}.content{padding:40px 20px}.code-section{background:#f9f9f9;border:2px solid #667eea;border-radius:8px;padding:30px;text-align:center;margin:30px 0}.code{font-size:48px;font-weight:bold;color:#667eea;letter-spacing:8px;font-family:'Courier New',monospace}.instructions{background:#eff6ff;border-left:4px solid #667eea;padding:15px;margin:20px 0}.instructions ul{list-style:none;margin:10px 0 0 20px}.instructions li{margin:8px 0;padding-left:20px;position:relative}.instructions li:before{content:"✓";position:absolute;left:0;color:#667eea}.footer{background:#f9f9f9;padding:20px;text-align:center;border-top:1px solid #eee;font-size:12px;color:#666}@media(max-width:600px){.code{font-size:36px}.header h1{font-size:24px}}</style></head><body><div class="container"><div class="header"><h1>🧩 Daily Manorixia</h1><p>Email Verification</p></div><div class="content"><p>Hello <strong>${fullName}</strong>,</p><p>Welcome! To complete setup, verify with the code below.</p><div class="code-section"><div style="font-size:12px;color:#666;text-transform:uppercase;margin-bottom:10px;">Code</div><div class="code">${code}</div><div style="font-size:13px;color:#e74c3c;margin-top:15px;">⏰ Expires in 10 min</div></div><div class="instructions"><strong>How to verify:</strong><ul>>Copy code above</li>>Go to Daily Manorixia</li>>Paste code</li>>Start solving!</li></ul></div><div style="background:#fff3cd;border-left:4px solid #ffc107;padding:12px;margin:20px 0;border-radius:4px;font-size:12px;color:#856404;"><strong>🔒 Security:</strong> Never share this code.</div></div><div class="footer"><p>&copy; 2026 Daily Manorixia</p></div></div></body></html>`;

const sendVerificationEmail = async (email, fullName, code) => {
    try {
        if (!transporter) throw new Error('Email service not configured');
        if (!email || !fullName || !code) throw new Error('Missing parameters');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) throw new Error('Invalid email');

        const mailOptions = {
            from: `"Daily Manorixia 🧩" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: '🔐 Verify Your Email',
            text: `Hello ${fullName}, your code is: ${code}. Expires in 10 minutes.`,
            html: getVerificationEmailHTML(fullName, code)
        };

        for (let i = 0; i < 3; i++) {
            try {
                const info = await transporter.sendMail(mailOptions);
                console.log(`✅ Email sent to ${email}`);
                return { success: true, messageId: info.messageId };
            } catch (error) {
                if (i === 2) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
    } catch (error) {
        console.error('❌ Email failed:', error.message);
        throw new Error(`Email delivery failed: ${error.message}`);
    }
};

const sendPasswordResetEmail = async (email, fullName, resetToken) => {
    try {
        if (!transporter) throw new Error('Email service not configured');
        const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
        const info = await transporter.sendMail({
            from: `"Daily Manorixia" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: '🔑 Password Reset',
            html: `<div style="max-width:600px;margin:0 auto;padding:20px;font-family:Arial,sans-serif;"><h2>🔑 Reset Password</h2><p>Hello ${fullName},</p><p>Click below to reset password:</p><p style="text-align:center;margin:30px 0;"><a href="${resetLink}" style="background:#667eea;color:white;padding:12px 30px;text-decoration:none;border-radius:5px;display:inline-block;">Reset Password</a></p><p>Or: <a href="${resetLink}">${resetLink}</a></p><p style="color:#666;font-size:12px;">Expires in 1 hour. Ignore if not requested.</p></div>`,
            text: `Reset link: ${resetLink}`
        });
        console.log(`✅ Password reset email sent to ${email}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Password reset error:', error.message);
        throw error;
    }
};

const sendPasswordResetOTPEmail = async (email, fullName, code) => {
    try {
        if (!transporter) throw new Error('Email service not configured');
        if (!email || !fullName || !code) throw new Error('Missing parameters');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) throw new Error('Invalid email');

        const mailOptions = {
            from: `"Daily Manorixia 🧩" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: '🔑 Password Reset Code',
            text: `Hello ${fullName}, your password reset code is: ${code}. Expires in 10 minutes.`,
            html: `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0}body{font-family:Arial,sans-serif;background:#f5f5f5}.container{max-width:600px;margin:20px auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1)}.header{background:linear-gradient(135deg,#e74c3c,#c0392b);color:white;padding:40px 20px;text-align:center}.header h1{font-size:28px}.content{padding:40px 30px;color:#333;line-height:1.6}.code-box{background:#f9f9f9;border:2px solid #e74c3c;border-radius:8px;padding:30px;text-align:center;margin:30px 0}.code{font-size:48px;font-weight:bold;color:#e74c3c;letter-spacing:8px;font-family:'Courier New',monospace}.expires{font-size:13px;color:#e74c3c;margin-top:15px}.warning{background:#fff3cd;border-left:4px solid #ffc107;padding:12px;margin:20px 0;border-radius:4px;font-size:12px;color:#856404}.footer{background:#f9f9f9;padding:20px;text-align:center;border-top:1px solid #eee;font-size:12px;color:#666}</style></head><body><div class="container"><div class="header"><h1>🔑 Password Reset</h1><p>Daily Manorixia</p></div><div class="content"><p>Hello <strong>${fullName}</strong>,</p><p>We received a request to reset your password. Use the code below:</p><div class="code-box"><div style="font-size:12px;color:#666;text-transform:uppercase;margin-bottom:10px;">Reset Code</div><div class="code">${code}</div><div class="expires">⏰ Expires in 10 minutes</div></div><div class="warning"><strong>🔒 Security:</strong> If you didn't request this, ignore this email. Your password won't change.</div></div><div class="footer"><p>&copy; 2026 Daily Manorixia</p></div></div></body></html>`
        };

        for (let i = 0; i < 3; i++) {
            try {
                const info = await transporter.sendMail(mailOptions);
                console.log(`✅ Password reset email sent to ${email}`);
                return { success: true, messageId: info.messageId };
            } catch (error) {
                if (i === 2) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
    } catch (error) {
        console.error('❌ Password reset email failed:', error.message);
        throw new Error(`Email delivery failed: ${error.message}`);
    }
};

const sendWelcomeEmail = async (email, fullName) => {
    try {
        if (!transporter) throw new Error('Email service not configured');
        const info = await transporter.sendMail({
            from: `"Daily Manorixia" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: '🎉 Welcome to Daily Manorixia!',
            html: `<div style="max-width:600px;margin:0 auto;padding:20px;font-family:Arial,sans-serif;"><h2>🎉 Welcome!</h2><p>Hello ${fullName},</p><p>Your account is verified! Ready to solve puzzles.</p><div style="background:#f0f7ff;border-left:4px solid #667eea;padding:15px;margin:20px 0;"><h3 style="color:#667eea;">Getting Started:</h3><ul style="list-style:none;padding:0;">>✅ Solve puzzles daily</li>>✅ Build streak</li>>✅ Track progress</li>>✅ Climb leaderboard</li></ul></div><p>Happy solving! 🧩</p></div>`,
            text: `Welcome ${fullName}! Account verified. Start solving!`
        });
        console.log(`✅ Welcome email sent to ${email}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Welcome email error:', error.message);
        throw error;
    }
};

const sendStreakMilestoneEmail = async (email, fullName, streakCount) => {
    try {
        if (!transporter) throw new Error('Email service not configured');
        const emoji = streakCount >= 30 ? '🔥' : '⭐';
        const message = streakCount >= 30 ? `AMAZING! ${streakCount} day streak!` : `Great! ${streakCount} day streak!`;
        const info = await transporter.sendMail({
            from: `"Daily Manorixia" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `${emoji} Streak Milestone - ${streakCount} Days!`,
            html: `<div style="max-width:600px;margin:0 auto;padding:20px;font-family:Arial,sans-serif;"><h2>${emoji} ${message}</h2><p>Hello ${fullName},</p><p>Congratulations! You reached a ${streakCount} day streak!</p><p>Keep it up! 💪</p></div>`,
            text: `${emoji} ${message}`
        });
        console.log(`✅ Milestone email sent to ${email}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Milestone email error:', error.message);
        throw error;
    }
};

module.exports = {
    generateVerificationCode,
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendPasswordResetOTPEmail,
    sendWelcomeEmail,
    sendStreakMilestoneEmail
};
