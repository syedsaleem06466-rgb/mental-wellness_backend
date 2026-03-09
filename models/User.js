const bcrypt = require('bcryptjs');
const { getDB } = require('../config/db');

class User {

    // ================================
    // CREATE USER
    // ================================
    static create({ studentId, fullName, email, password, institution }) {
        try {
            const db = getDB();

            const normalizedStudentId = studentId.trim().toLowerCase();
            const normalizedEmail = email.trim().toLowerCase();
            const hashedPassword = bcrypt.hashSync(password, 12);

            const result = db.prepare(`
                INSERT INTO users (student_id, full_name, email, password, role, institution, created_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(normalizedStudentId, fullName.trim(), normalizedEmail, hashedPassword, 'user', institution ? institution.trim() : null);

            return {
                id: result.lastInsertRowid,
                student_id: normalizedStudentId,
                full_name: fullName.trim(),
                email: normalizedEmail,
                role: 'user',
                is_verified: 0,
                institution: institution ? institution.trim() : null
            };
        } catch (error) {
            console.error('User.create error:', error);
            throw error;
        }
    }


    // ================================
    // FINDERS
    // ================================
    static findById(id) {
        try {
            const db = getDB();
            return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
        } catch (error) {
            console.error('User.findById error:', error);
            throw error;
        }
    }

    static findByStudentId(studentId) {
        try {
            const db = getDB();
            return db.prepare('SELECT * FROM users WHERE student_id = ?')
                .get(studentId.trim().toLowerCase()) || null;
        } catch (error) {
            console.error('User.findByStudentId error:', error);
            throw error;
        }
    }

    static findByEmail(email) {
        try {
            const db = getDB();
            return db.prepare('SELECT * FROM users WHERE email = ?')
                .get(email.trim().toLowerCase()) || null;
        } catch (error) {
            console.error('User.findByEmail error:', error);
            throw error;
        }
    }

    static findByStudentIdOrEmail(studentId, email) {
        try {
            const db = getDB();
            return db.prepare(`
                SELECT * FROM users WHERE student_id = ? OR email = ?
            `).get(
                studentId.trim().toLowerCase(),
                email.trim().toLowerCase()
            ) || null;
        } catch (error) {
            console.error('User.findByStudentIdOrEmail error:', error);
            throw error;
        }
    }

    // ================================
    // PASSWORD
    // ================================
    static comparePassword(plainPassword, hashedPassword) {
        try {
            return bcrypt.compareSync(plainPassword, hashedPassword);
        } catch (error) {
            console.error('User.comparePassword error:', error);
            return false;
        }
    }


    // ================================
    // PUBLIC PROFILE (no password)
    // ================================
    static publicProfile(userId) {
        const db = getDB();
        return db.prepare(`
        SELECT
            id,
            student_id  AS studentId,
            full_name   AS fullName,
            email,
            role,
            is_verified AS isVerified,
            institution,
            created_at  AS createdAt
        FROM users WHERE id = ?
    `).get(userId) || null;
    }

    // ================================
    // DELETE
    // ================================
    static delete(userId) {
        try {
            const db = getDB();
            db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        } catch (error) {
            console.error('User.delete error:', error);
            throw error;
        }
    }
    // ✅ Reset password with new hash
    static resetPassword(userId, newPassword) {
        try {
            const db = getDB();
            const hashedPassword = bcrypt.hashSync(newPassword, 12);
            db.prepare('UPDATE users SET password = ? WHERE id = ?')
                .run(hashedPassword, userId);
        } catch (error) {
            console.error('User.resetPassword error:', error);
            throw error;
        }
    }

    // ================================
    // EMAIL VERIFICATION
    // ================================

    // ✅ Mark user as verified
    static markVerified(userId) {
        try {
            const db = getDB();
            db.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userId);
        } catch (error) {
            console.error('User.markVerified error:', error);
            throw error;
        }
    }

    // ================================
    // DELETE
    // ================================
    static delete(userId) {
        try {
            const db = getDB();
            db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        } catch (error) {
            console.error('User.delete error:', error);
            throw error;
        }
    }


}

module.exports = User;
