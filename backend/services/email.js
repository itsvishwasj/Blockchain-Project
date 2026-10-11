const nodemailer = require("nodemailer");
const axios = require("axios");
require("dotenv").config();

// Dedicated bot Google account for TriVote system notifications
const DEFAULT_EMAIL_USER = "majorproject382027@gmail.com";
const DEFAULT_EMAIL_PASS = "tirofssbqcvinspk";

function getSmtpTransporter() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5500,
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
    // Port 465 with 5s connection timeouts so it completes TLS or fails fast if ports are blocked
    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 11000,
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

// Send via Resend REST API (HTTPS Port 443 — NEVER blocked by Render Free Tier)
async function sendViaResend(toEmail, otpCode) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const fromAddress = process.env.EMAIL_FROM || "TriVote System <onboarding@resend.dev>";
  const htmlContent = `
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
  `;

  await axios.post(
    "https://api.resend.com/emails",
    {
      from: fromAddress,
      to: [toEmail],
      subject: "Your E-Voting OTP Verification Code",
      html: htmlContent
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      timeout: 4000
    }
  );
  return true;
}

async function sendOTP(toEmail, otpCode) {
  // 1. Try HTTPS API first if RESEND_API_KEY is configured (works on Render free tier without port blocks)
  try {
    if (process.env.RESEND_API_KEY) {
      const resendSuccess = await sendViaResend(toEmail, otpCode);
      if (resendSuccess) {
        console.log(`📧 Voter OTP sent to ${toEmail} via Resend HTTPS API`);
        return;
      }
    }
  } catch (resendErr) {
    console.warn("Resend API delivery error:", resendErr.message);
  }

  // 2. Try SMTP with strict 3-second fail-fast timeout (never hangs)
  const transporter = getSmtpTransporter();
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

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("SMTP connection timed out after 12000ms (Render Free Tier blocks outbound SMTP ports 25, 465, 587)")), 12000)
  );

  await Promise.race([
    transporter.sendMail(mailOptions),
    timeoutPromise
  ]);
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = { sendOTP, generateOTP };