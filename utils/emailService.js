const crypto = require('crypto');
const https = require('https');

// =============================================
// Brevo (formerly Sendinblue) HTTP API
// Free tier: 300 emails/day, no domain needed
// Works on Railway (HTTP, not SMTP)
// =============================================

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'dailymanorixiagames@gmail.com';
const SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Daily Manorixia';

const sendBrevoEmail = ({ to, subject, html, text }) => {
    return new Promise((resolve, reject) => {
        if (!BREVO_API_KEY) {
            return reject(new Error('BREVO_API_KEY not set'));
        }

        const payload = JSON.stringify({
            sender: { name: SENDER_NAME, email: SENDER_EMAIL },
            to: [{ email: to }],
            subject,
            htmlContent: html,
            textContent: text
        });

        const options = {
            hostname: 'api.brevo.com',
            path: '/v3/smtp/email',
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': BREVO_API_KEY,
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`Brevo API error ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
};

// Test connection on startup
if (BREVO_API_KEY) {
    console.log('✅ Email ready (Brevo)');
} else {
    console.warn('⚠️  BREVO_API_KEY not set — email features disabled');
}

// =============================================
// Helpers
// =============================================
const generateVerificationCode = (length = 6) => {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return crypto.randomInt(min, max + 1).toString();
};

const getVerificationEmailHTML = (fullName, code) => `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Verify Email</title><style>*{margin:0;padding:0}body{font-family:Arial,sans-serif;background:#f5f5f5}.container{max-width:600px;margin:20px auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1)}.header{background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:40px 20px;text-align:center}.header h1{font-size:28px}.content{padding:40px 20px}.code-section{background:#f9f9f9;border:2px solid #667eea;border-radius:8px;padding:30px;text-align:center;margin:30px 0}.code{font-size:48px;font-weight:bold;color:#667eea;letter-spacing:8px;font-family:'Courier New',monospace}.footer{background:#f9f9f9;padding:20px;text-align:center;border-top:1px solid #eee;font-size:12px;color:#666}</style></head><body><div class="container"><div class="header"><h1>🧩 Daily Manorixia</h1><p>Email Verification</p></div><div class="content"><p>Hello <strong>${fullName}</strong>,</p><p>Welcome! To complete setup, verify with the code below.</p><div class="code-section"><div style="font-size:12px;color:#666;text-transform:uppercase;margin-bottom:10px;">Your Code</div><div class="code">${code}</div><div style="font-size:13px;color:#e74c3c;margin-top:15px;">⏰ Expires in 10 min</div></div><div style="background:#fff3cd;border-left:4px solid #ffc107;padding:12px;margin:20px 0;border-radius:4px;font-size:12px;color:#856404;"><strong>🔒 Security:</strong> Never share this code.</div></div><div class="footer"><p>&copy; 2026 Daily Manorixia</p></div></div></body></html>`;

// =============================================
// Email Functions
// =============================================

const sendVerificationEmail = async (email, fullName, code) => {
    try {
        if (!BREVO_API_KEY) throw new Error('Email service not configured');
        if (!email || !fullName || !code) throw new Error('Missing parameters');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) throw new Error('Invalid email');

        for (let i = 0; i < 3; i++) {
            try {
                const result = await sendBrevoEmail({
                    to: email,
                    subject: '🔐 Verify Your Email - Daily Manorixia',
                    text: `Hello ${fullName}, your verification code is: ${code}. Expires in 10 minutes.`,
                    html: getVerificationEmailHTML(fullName, code)
                });
                console.log(`✅ Verification email sent to ${email} | id: ${result.messageId}`);
                return { success: true, messageId: result.messageId };
            } catch (err) {
                console.error(`❌ Email attempt ${i + 1} failed:`, err.message);
                if (i === 2) throw err;
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
        if (!BREVO_API_KEY) throw new Error('Email service not configured');
        const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
        const result = await sendBrevoEmail({
            to: email,
            subject: '🔑 Password Reset - Daily Manorixia',
            html: `<div style="max-width:600px;margin:0 auto;padding:20px;font-family:Arial,sans-serif;"><h2>🔑 Reset Password</h2><p>Hello ${fullName},</p><p>Click below to reset your password:</p><p style="text-align:center;margin:30px 0;"><a href="${resetLink}" style="background:#667eea;color:white;padding:12px 30px;text-decoration:none;border-radius:5px;display:inline-block;">Reset Password</a></p><p>Or copy: <a href="${resetLink}">${resetLink}</a></p><p style="color:#666;font-size:12px;">Expires in 1 hour. Ignore if not requested.</p></div>`,
            text: `Reset link: ${resetLink}`
        });
        console.log(`✅ Password reset email sent to ${email}`);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('Password reset error:', error.message);
        throw error;
    }
};

const sendPasswordResetOTPEmail = async (email, fullName, code) => {
    try {
        if (!BREVO_API_KEY) throw new Error('Email service not configured');
        if (!email || !fullName || !code) throw new Error('Missing parameters');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) throw new Error('Invalid email');

        for (let i = 0; i < 3; i++) {
            try {
                const result = await sendBrevoEmail({
                    to: email,
                    subject: '🔑 Password Reset Code - Daily Manorixia',
                    text: `Hello ${fullName}, your password reset code is: ${code}. Expires in 10 minutes.`,
                    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;background:#f5f5f5}.container{max-width:600px;margin:20px auto;background:#fff;border-radius:8px}.header{background:linear-gradient(135deg,#e74c3c,#c0392b);color:white;padding:40px 20px;text-align:center}.content{padding:40px 30px}.code-box{background:#f9f9f9;border:2px solid #e74c3c;border-radius:8px;padding:30px;text-align:center;margin:30px 0}.code{font-size:48px;font-weight:bold;color:#e74c3c;letter-spacing:8px;font-family:'Courier New',monospace}.footer{background:#f9f9f9;padding:20px;text-align:center;border-top:1px solid #eee;font-size:12px;color:#666}</style></head><body><div class="container"><div class="header"><h1>🔑 Password Reset</h1></div><div class="content"><p>Hello <strong>${fullName}</strong>,</p><p>Your password reset code:</p><div class="code-box"><div class="code">${code}</div><div style="font-size:13px;color:#e74c3c;margin-top:15px;">⏰ Expires in 10 minutes</div></div></div><div class="footer"><p>&copy; 2026 Daily Manorixia</p></div></div></body></html>`
                });
                console.log(`✅ Password reset OTP sent to ${email}`);
                return { success: true, messageId: result.messageId };
            } catch (err) {
                console.error(`❌ Reset email attempt ${i + 1} failed:`, err.message);
                if (i === 2) throw err;
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
        if (!BREVO_API_KEY) throw new Error('Email service not configured');
        const result = await sendBrevoEmail({
            to: email,
            subject: '🎉 Welcome to Daily Manorixia!',
            html: `<div style="max-width:600px;margin:0 auto;padding:20px;font-family:Arial,sans-serif;"><h2>🎉 Welcome!</h2><p>Hello ${fullName},</p><p>Your account is verified! Ready to solve puzzles.</p><p>Happy solving! 🧩</p></div>`,
            text: `Welcome ${fullName}! Your account is verified. Start solving!`
        });
        console.log(`✅ Welcome email sent to ${email}`);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('Welcome email error:', error.message);
        throw error;
    }
};

const sendStreakMilestoneEmail = async (email, fullName, streakCount) => {
    try {
        if (!BREVO_API_KEY) throw new Error('Email service not configured');
        const emoji = streakCount >= 30 ? '🔥' : '⭐';
        const message = streakCount >= 30 ? `AMAZING! ${streakCount} day streak!` : `Great! ${streakCount} day streak!`;
        const result = await sendBrevoEmail({
            to: email,
            subject: `${emoji} Streak Milestone - ${streakCount} Days!`,
            html: `<div style="max-width:600px;margin:0 auto;padding:20px;font-family:Arial,sans-serif;"><h2>${emoji} ${message}</h2><p>Hello ${fullName},</p><p>Congratulations on your ${streakCount} day streak! Keep it up! 💪</p></div>`,
            text: `${emoji} ${message}`
        });
        console.log(`✅ Milestone email sent to ${email}`);
        return { success: true, messageId: result.messageId };
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