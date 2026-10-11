const nodemailer = require("nodemailer");
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
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
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
  let apiKey = String(process.env.RESEND_API_KEY || "").trim().replace(/^["']|["']$/g, '');
  if (apiKey.toLowerCase().startsWith("bearer ")) {
    apiKey = apiKey.slice(7).trim();
  }
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY is empty or not configured" };

  // Resend free tier testing domain onboarding@resend.dev requires sender domain to be resend.dev.
  // If EMAIL_FROM is an unverified gmail.com address, Resend will reject with 403.
  let fromAddress = "TriVote <onboarding@resend.dev>";
  if (process.env.RESEND_FROM && !process.env.RESEND_FROM.includes("@gmail.com")) {
    fromAddress = process.env.RESEND_FROM;
  } else if (process.env.EMAIL_FROM && !process.env.EMAIL_FROM.includes("@gmail.com")) {
    fromAddress = process.env.EMAIL_FROM;
  }

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

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [toEmail],
        subject: "Your E-Voting OTP Verification Code",
        html: htmlContent
      }),
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined
    });

    const bodyText = await res.text();
    let bodyJson = null;
    try { bodyJson = JSON.parse(bodyText); } catch (e) {}

    if (res.ok) {
      console.log(`📧 Resend delivered OTP to ${toEmail}:`, bodyJson?.id || "OK");
      return { ok: true, data: bodyJson };
    } else {
      const errMsg = bodyJson?.message || bodyJson?.error || bodyText || `HTTP ${res.status}`;
      console.error(`❌ Resend rejected email to ${toEmail} (HTTP ${res.status}):`, errMsg);
      return { ok: false, status: res.status, error: errMsg };
    }
  } catch (err) {
    console.error(`❌ Resend network error to ${toEmail}:`, err.message);
    return { ok: false, error: err.message };
  }
}

// Send via Google Apps Script Webhook (HTTPS Port 443 — sends directly from Google Cloud without SMTP blocks)
async function sendViaWebhook(toEmail, otpCode, htmlContent) {
  const webhookUrl = process.env.EMAIL_WEBHOOK_URL || process.env.GOOGLE_SCRIPT_WEBHOOK_URL;
  if (!webhookUrl) return false;

  if (typeof fetch === "function") {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: toEmail,
        subject: "Your E-Voting OTP Verification Code",
        html: htmlContent,
        otp: otpCode
      }),
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined
    });
    return res.ok;
  }
  return false;
}

async function sendOTP(toEmail, otpCode) {
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

  // 1. Try Google Apps Script Webhook first if configured (HTTPS Port 443 — NEVER blocked on Render)
  if (process.env.EMAIL_WEBHOOK_URL || process.env.GOOGLE_SCRIPT_WEBHOOK_URL) {
    try {
      const webhookSuccess = await sendViaWebhook(toEmail, otpCode, mailOptions.html);
      if (webhookSuccess) {
        console.log(`📧 Voter OTP sent to ${toEmail} via HTTPS Google Webhook`);
        return { provider: "webhook" };
      }
    } catch (webhookErr) {
      console.warn("Webhook delivery error:", webhookErr.message);
    }
  }

  // 2. Try Resend HTTPS API if configured (HTTPS Port 443)
  const hasResend = !!(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim());
  if (hasResend) {
    const resendResult = await sendViaResend(toEmail, otpCode);
    if (resendResult.ok) {
      return { provider: "resend", data: resendResult.data };
    }
    // Resend was explicitly configured but rejected the email — report the exact error immediately!
    throw new Error(`Resend delivery failed: ${resendResult.error}`);
  }

  // 3. Fall back to SMTP (works locally and on unblocked hosts)
  const transporter = getSmtpTransporter();
  if (!transporter) {
    throw new Error("SMTP credentials not configured (EMAIL_USER & EMAIL_PASS or SMTP_HOST)");
  }

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("SMTP connection timed out after 5s (Render Free Tier blocks outbound SMTP ports 25, 465, 587; set RESEND_API_KEY for cloud delivery)")), 5000)
  );

  await Promise.race([
    transporter.sendMail(mailOptions),
    timeoutPromise
  ]);
  return { provider: "smtp" };
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = { sendOTP, generateOTP };