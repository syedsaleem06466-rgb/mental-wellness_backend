const User = require('./models/User');
const { connectDB } = require('./config/db');

async function reset() {
    connectDB();
    const studentId = 'admin_test';
    const newPassword = 'admin_pass123';

    const user = User.findByStudentId(studentId);
    if (user) {
        User.resetPassword(user.id, newPassword);
        console.log(`Password reset for ${studentId} successful!`);
    } else {
        console.log(`User ${studentId} not found.`);
    }
}

reset();
