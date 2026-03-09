const { Resend } = require('resend');
const crypto = require('crypto');

let resend = null;

const initializeEmailTransport = () => {
    if (!process.env.RESEND_API_KEY) {
        console.warn('⚠️  RESEND_API_KEY not set — email features disabled');
        return null;
    }
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log('✅ Email ready (Resend)');
    return resend;
};

setTimeout(() => initializeEmailTransport(), 3000);

const generateVerificationCode = (length = 6) => {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return crypto.randomInt(min, max + 1).toString();
};

const FROM_ADDRESS = 'Daily Manorixia <onboarding@resend.dev>';

const getVerificationEmailHTML = (fullName, code) => `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Verify Email</title><style>*{margin:0;padding:0}body{font-family:Arial,sans-serif;background:#f5f5f5}.container{max-width:600px;margin:20px auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1)}.header{background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:40px 20px;text-align:center}.header h1{font-size:28px}.content{padding:40px 20px}.code-section{background:#f9f9f9;border:2px solid #667eea;border-radius:8px;padding:30px;text-align:center;margin:30px 0}.code{font-size:48px;font-weight:bold;color:#667eea;letter-spacing:8px;font-family:'Courier New',monospace}.footer{background:#f9f9f9;padding:20px;text-align:center;border-top:1px solid #eee;font-size:12px;color:#666}</style></head><body><div class="container"><div class="header"><h1>🧩 Daily Manorixia</h1><p>Email Verification</p></div><div class="content"><p>Hello <strong>${fullName}</strong>,</p><p>Welcome! To complete setup, verify with the code below.</p><div class="code-section"><div style="font-size:12px;color:#666;text-transform:uppercase;margin-bottom:10px;">Your Code</div><div class="code">${code}</div><div style="font-size:13px;color:#e74c3c;margin-top:15px;">⏰ Expires in 10 min</div></div><div style="background:#fff3cd;border-left:4px solid #ffc107;padding:12px;margin:20px 0;border-radius:4px;font-size:12px;color:#856404;"><strong>🔒 Security:</strong> Never share this code.</div></div><div class="footer"><p>&copy; 2026 Daily Manorixia</p></div></div></body></html>`;

const sendVerificationEmail = async (email, fullName, code) => {
    try {
        if (!resend) throw new Error('Email service not configured');
        if (!email || !fullName || !code) throw new Error('Missing parameters');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) throw new Error('Invalid email');

        for (let i = 0; i < 3; i++) {
            try {
                const { data, error } = await resend.emails.send({
                    from: FROM_ADDRESS,
                    to: email,
                    subject: '🔐 Verify Your Email - Daily Manorixia',
                    text: `Hello ${fullName}, your verification code is: ${code}. Expires in 10 minutes.`,
                    html: getVerificationEmailHTML(fullName, code)
                });
                if (error) throw new Error(error.message);
                console.log(`✅ Verification email sent to ${email}`);
                return { success: true, messageId: data?.id };
            } catch (err) {
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
        if (!resend) throw new Error('Email service not configured');
        const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
        const { data, error } = await resend.emails.send({
            from: FROM_ADDRESS,
            to: email,
            subject: '🔑 Password Reset - Daily Manorixia',
            html: `<div style="max-width:600px;margin:0 auto;padding:20px;font-family:Arial,sans-serif;"><h2>🔑 Reset Password</h2><p>Hello ${fullName},</p><p>Click below to reset your password:</p><p style="text-align:center;margin:30px 0;"><a href="${resetLink}" style="background:#667eea;color:white;padding:12px 30px;text-decoration:none;border-radius:5px;display:inline-block;">Reset Password</a></p><p>Or copy: <a href="${resetLink}">${resetLink}</a></p><p style="color:#666;font-size:12px;">Expires in 1 hour. Ignore if not requested.</p></div>`,
            text: `Reset link: ${resetLink}`
        });
        if (error) throw new Error(error.message);
        console.log(`✅ Password reset email sent to ${email}`);
        return { success: true, messageId: data?.id };
    } catch (error) {
        console.error('Password reset error:', error.message);
        throw error;
    }
};

const sendPasswordResetOTPEmail = async (email, fullName, code) => {
    try {
        if (!resend) throw new Error('Email service not configured');
        if (!email || !fullName || !code) throw new Error('Missing parameters');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) throw new Error('Invalid email');

        for (let i = 0; i < 3; i++) {
            try {
                const { data, error } = await resend.emails.send({
                    from: FROM_ADDRESS,
                    to: email,
                    subject: '🔑 Password Reset Code - Daily Manorixia',
                    text: `Hello ${fullName}, your password reset code is: ${code}. Expires in 10 minutes.`,
                    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;background:#f5f5f5}.container{max-width:600px;margin:20px auto;background:#fff;border-radius:8px}.header{background:linear-gradient(135deg,#e74c3c,#c0392b);color:white;padding:40px 20px;text-align:center}.content{padding:40px 30px}.code-box{background:#f9f9f9;border:2px solid #e74c3c;border-radius:8px;padding:30px;text-align:center;margin:30px 0}.code{font-size:48px;font-weight:bold;color:#e74c3c;letter-spacing:8px;font-family:'Courier New',monospace}.footer{background:#f9f9f9;padding:20px;text-align:center;border-top:1px solid #eee;font-size:12px;color:#666}</style></head><body><div class="container"><div class="header"><h1>🔑 Password Reset</h1></div><div class="content"><p>Hello <strong>${fullName}</strong>,</p><p>Your password reset code:</p><div class="code-box"><div class="code">${code}</div><div style="font-size:13px;color:#e74c3c;margin-top:15px;">⏰ Expires in 10 minutes</div></div></div><div class="footer"><p>&copy; 2026 Daily Manorixia</p></div></div></body></html>`
                });
                if (error) throw new Error(error.message);
                console.log(`✅ Password reset OTP sent to ${email}`);
                return { success: true, messageId: data?.id };
            } catch (err) {
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
        if (!resend) throw new Error('Email service not configured');
        const { data, error } = await resend.emails.send({
            from: FROM_ADDRESS,
            to: email,
            subject: '🎉 Welcome to Daily Manorixia!',
            html: `<div style="max-width:600px;margin:0 auto;padding:20px;font-family:Arial,sans-serif;"><h2>🎉 Welcome!</h2><p>Hello ${fullName},</p><p>Your account is verified! Ready to solve puzzles.</p><p>Happy solving! 🧩</p></div>`,
            text: `Welcome ${fullName}! Your account is verified. Start solving!`
        });
        if (error) throw new Error(error.message);
        console.log(`✅ Welcome email sent to ${email}`);
        return { success: true, messageId: data?.id };
    } catch (error) {
        console.error('Welcome email error:', error.message);
        throw error;
    }
};

const sendStreakMilestoneEmail = async (email, fullName, streakCount) => {
    try {
        if (!resend) throw new Error('Email service not configured');
        const emoji = streakCount >= 30 ? '🔥' : '⭐';
        const message = streakCount >= 30 ? `AMAZING! ${streakCount} day streak!` : `Great job! ${streakCount} day streak!`;
        const { data, error } = await resend.emails.send({
            from: FROM_ADDRESS,
            to: email,
            subject: `${emoji} Streak Milestone - ${streakCount} Days!`,
            html: `<div style="max-width:600px;margin:0 auto;padding:20px;font-family:Arial,sans-serif;"><h2>${emoji} ${message}</h2><p>Hello ${fullName},</p><p>Congratulations on your ${streakCount} day streak! Keep it up! 💪</p></div>`,
            text: `${emoji} ${message}`
        });
        if (error) throw new Error(error.message);
        console.log(`✅ Milestone email sent to ${email}`);
        return { success: true, messageId: data?.id };
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