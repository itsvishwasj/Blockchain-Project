const nodemailer = require("nodemailer");
require("dotenv").config();

// Dedicated bot Google account for TriVote system notifications
const DEFAULT_EMAIL_USER = "majorproject382027@gmail.com";
const DEFAULT_EMAIL_PASS = "tirofssbqcvinspk";

function getTransporter() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: (process.env.SMTP_USER || process.env.EMAIL_USER || DEFAULT_EMAIL_USER).trim(),
        pass: (process.env.SMTP_PASS || process.env.EMAIL_PASS || DEFAULT_EMAIL_PASS).replace(/\s+/g, "")
      }
    });
  }

  const rawUser = process.env.EMAIL_USER || DEFAULT_EMAIL_USER;
  const rawPass = process.env.EMAIL_PASS || DEFAULT_EMAIL_PASS;

  const user = String(rawUser).trim();
  const pass = String(rawPass).replace(/\s+/g, "");

  if (user && pass) {
    // Port 465 SSL is direct and reliable across all cloud hosting providers (Render, AWS, GCP)
    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user,
        pass
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }
  return null;
}

async function sendOTP(toEmail, otpCode) {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error("SMTP credentials not configured (EMAIL_USER & EMAIL_PASS or SMTP_HOST)");
  }

  const rawUser = process.env.EMAIL_USER || DEFAULT_EMAIL_USER;
  const fromAddress = (process.env.EMAIL_FROM || rawUser || DEFAULT_EMAIL_USER).trim();

  const mailOptions = {
    from: `"TriVote E-Voting System" <${fromAddress}>`,
    to: toEmail,
    subject: "Your E-Voting OTP Verification Code",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
        <h2 style="color: #2563eb; margin-top: 0; font-size: 22px;">TriVote E-Voting System</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          Your one-time voter verification passcode (OTP) is:
        </p>
        <div style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #0f172a; padding: 18px 24px; background: #f8fafc; border: 2px dashed #93c5fd; border-radius: 12px; text-align: center; margin: 24px 0; font-family: monospace;">
          ${otpCode}
        </div>
        <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
          This code expires in <strong>10 minutes</strong>.<br/>
          If you did not request this verification code, please ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 11px;">
          Secured by Zero-Knowledge Proofs &amp; Cryptographic Voter Whitelist Verification.
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (primaryErr) {
    // If port 465 had an issue, fallback to port 587
    console.warn("Primary SMTP delivery attempt failed, trying fallback port 587:", primaryErr.message);
    const rawPass = process.env.EMAIL_PASS || DEFAULT_EMAIL_PASS;
    const fallbackTransporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: (process.env.EMAIL_USER || DEFAULT_EMAIL_USER).trim(),
        pass: String(rawPass).replace(/\s+/g, "")
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    await fallbackTransporter.sendMail(mailOptions);
  }
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = { sendOTP, generateOTP };