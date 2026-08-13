const nodemailer = require("nodemailer");
require("dotenv").config();

// Using Gmail SMTP — free, no external service needed
// You need to set these in backend/.env:
// EMAIL_USER=your_gmail@gmail.com
// EMAIL_PASS=your_gmail_app_password
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendOTP(toEmail, otpCode) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: toEmail,
    subject: "Your E-Voting OTP Verification Code",
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
        <h2 style="color: #22d3ee;">E-Voting System</h2>
        <p>Your verification code is:</p>
        <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #22d3ee; padding: 20px; background: #0f172a; border-radius: 8px; text-align: center;">
          ${otpCode}
        </div>
        <p style="color: #888; font-size: 13px; margin-top: 16px;">
          This code expires in 10 minutes.<br/>
          If you did not request this, ignore this email.
        </p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = { sendOTP, generateOTP };