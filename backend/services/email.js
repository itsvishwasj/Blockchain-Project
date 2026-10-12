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
async function sendViaResend(toEmail, subject, htmlContent) {
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
        subject: subject || "TriVote E-Voting System",
        html: htmlContent
      }),
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined
    });

    const bodyText = await res.text();
    let bodyJson = null;
    try { bodyJson = JSON.parse(bodyText); } catch (e) {}

    if (res.ok) {
      console.log(`📧 Resend delivered email to ${toEmail}:`, bodyJson?.id || "OK");
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

// Send via Google Apps Script Webhook (HTTPS Port 443 — sends directly from Google Cloud to ANY email, NO domain needed)
async function sendViaWebhook(toEmail, subject, htmlContent) {
  let webhookUrl = process.env.EMAIL_WEBHOOK_URL || process.env.GOOGLE_SCRIPT_WEBHOOK_URL;
  if (!webhookUrl) return { ok: false, error: "EMAIL_WEBHOOK_URL is not configured" };
  webhookUrl = String(webhookUrl).trim().replace(/^["']|["']$/g, '');

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        to: toEmail,
        subject: subject || "TriVote E-Voting System",
        html: htmlContent
      }),
      redirect: "follow",
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined
    });

    const bodyText = await res.text();
    let bodyJson = null;
    try { bodyJson = JSON.parse(bodyText); } catch (e) {}

    if (res.ok || res.status === 302 || res.status === 200) {
      console.log(`📧 Google Webhook delivered email to ${toEmail}`);
      return { ok: true, data: bodyJson || bodyText };
    } else {
      return { ok: false, error: `Webhook returned HTTP ${res.status}` };
    }
  } catch (err) {
    console.error(`❌ Google Webhook error for ${toEmail}:`, err.message);
    return { ok: false, error: err.message };
  }
}

// Send via Brevo REST API (HTTPS Port 443 — sends to ANY email, 300 free emails/day, no custom domain required)
async function sendViaBrevo(toEmail, subject, htmlContent) {
  let apiKey = String(process.env.BREVO_API_KEY || "").trim().replace(/^["']|["']$/g, '');
  if (!apiKey) return { ok: false, error: "BREVO_API_KEY is not configured" };

  const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_USER || DEFAULT_EMAIL_USER;
  const senderName = process.env.BREVO_SENDER_NAME || "TriVote System";

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: toEmail }],
        subject: subject || "TriVote E-Voting System",
        htmlContent: htmlContent
      }),
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined
    });

    const bodyText = await res.text();
    let bodyJson = null;
    try { bodyJson = JSON.parse(bodyText); } catch (e) {}

    if (res.ok) {
      console.log(`📧 Brevo delivered email to ${toEmail}:`, bodyJson?.messageId || "OK");
      return { ok: true, data: bodyJson };
    } else {
      const errMsg = bodyJson?.message || bodyText || `HTTP ${res.status}`;
      console.error(`❌ Brevo rejected email to ${toEmail}:`, errMsg);
      return { ok: false, error: errMsg };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Universal multi-tier email dispatcher
async function sendEmail({ to, subject, html }) {
  const rawUser = process.env.EMAIL_USER || DEFAULT_EMAIL_USER;
  const fromAddress = (process.env.EMAIL_FROM || rawUser || DEFAULT_EMAIL_USER).trim();

  // 1. Google Apps Script Webhook (Sends to ANY email via Gmail on HTTPS)
  if (process.env.EMAIL_WEBHOOK_URL || process.env.GOOGLE_SCRIPT_WEBHOOK_URL) {
    const webhookRes = await sendViaWebhook(to, subject, html);
    if (webhookRes.ok) {
      console.log(`📧 Email sent to ${to} via HTTPS Google Webhook`);
      return { provider: "webhook", data: webhookRes.data };
    }
    console.warn(`Webhook failed (${webhookRes.error}), falling back to next provider...`);
  }

  // 2. Brevo API (Sends to ANY email via HTTPS API)
  if (process.env.BREVO_API_KEY && process.env.BREVO_API_KEY.trim()) {
    const brevoRes = await sendViaBrevo(to, subject, html);
    if (brevoRes.ok) {
      console.log(`📧 Email sent to ${to} via Brevo REST API`);
      return { provider: "brevo", data: brevoRes.data };
    }
    console.warn(`Brevo failed (${brevoRes.error}), falling back to next provider...`);
  }

  // 3. Resend HTTPS API (Sends to account owner on sandbox, or to anyone on verified domain)
  const hasResend = !!(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim());
  if (hasResend) {
    const resendResult = await sendViaResend(to, subject, html);
    if (resendResult.ok) {
      console.log(`📧 Email sent to ${to} via Resend REST API`);
      return { provider: "resend", data: resendResult.data };
    }
    console.warn(`Resend failed (${resendResult.error}), falling back to SMTP...`);
  }

  // 4. Fall back to SMTP
  const transporter = getSmtpTransporter();
  if (!transporter) {
    throw new Error("SMTP credentials not configured (EMAIL_USER & EMAIL_PASS or SMTP_HOST)");
  }

  const mailOptions = {
    from: `"TriVote E-Voting System" <${fromAddress}>`,
    to,
    subject,
    html
  };

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("SMTP connection timed out after 5s (Render Free Tier blocks outbound SMTP ports 25, 465, 587; set EMAIL_WEBHOOK_URL, BREVO_API_KEY or RESEND_API_KEY for cloud delivery)")), 5000)
  );

  await Promise.race([
    transporter.sendMail(mailOptions),
    timeoutPromise
  ]);
  console.log(`📧 Email delivered to ${to} via direct SMTP`);
  return { provider: "smtp" };
}

async function sendOTP(toEmail, otpCode) {
  const subject = "Your E-Voting OTP Verification Code";
  const html = `
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

  return sendEmail({ to: toEmail, subject, html });
}

async function sendVoterCredentials(toEmail, { fullName, voterId, electionTitle, electionId }) {
  const displayElection = electionTitle || (electionId ? `Election #${electionId}` : "Upcoming Election");
  const subject = `Official E-Voting Credentials: Your Voter ID for ${displayElection}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 28px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff; color: #1e293b;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #2563eb; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">TriVote E-Voting System</h2>
        <span style="display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #059669; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 3px 10px; border-radius: 20px; margin-top: 8px;">Official Voter Enrollment</span>
      </div>

      <p style="font-size: 15px; line-height: 1.5; color: #334155;">
        Hello <strong>${fullName || 'Voter'}</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #475569;">
        You have been registered and whitelisted as an eligible voter for <strong>${displayElection}</strong>${electionId ? ` (Election ID: #${electionId})` : ''}.
      </p>

      <div style="background: #f8fafc; border: 2px dashed #3b82f6; border-radius: 14px; padding: 20px; text-align: center; margin: 24px 0;">
        <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #64748b; display: block; margin-bottom: 6px;">Your Assigned Voter ID</span>
        <div style="font-size: 32px; font-weight: 900; letter-spacing: 4px; color: #1d4ed8; font-family: 'Courier New', monospace;">
          ${voterId}
        </div>
        <span style="font-size: 12px; color: #64748b; display: block; margin-top: 6px;">Registered Email: <strong>${toEmail}</strong></span>
      </div>

      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
        <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #166534; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">How to Cast Your Anonymous Vote:</h4>
        <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #15803d; line-height: 1.6;">
          <li>Open the Voting Portal: <a href="https://blockchain-project-sable-nine.vercel.app/voter" style="color: #2563eb; font-weight: 600;">blockchain-project-sable-nine.vercel.app/voter</a></li>
          <li>Enter your Voter ID (<strong>${voterId}</strong>) and your registered email (<strong>${toEmail}</strong>).</li>
          <li>Enter the 6-digit one-time passcode sent to this email to authenticate.</li>
          <li>Review candidate manifestos, evaluate your policy alignment match, and cast your cryptographic Zero-Knowledge ballot.</li>
        </ol>
      </div>

      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 12px 16px; margin-bottom: 24px; font-size: 12px; color: #92400e; line-height: 1.5;">
        ⚠️ <strong>Important Security Notice:</strong> Keep your Voter ID confidential. You may only cast <strong>ONE ballot</strong> in this election window. Double-voting is strictly prevented and permanently locked on the blockchain.
      </div>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
        Secured by Groth16 Zero-Knowledge Proofs &amp; Merkle Tree Cryptographic Whitelists.
      </p>
    </div>
  `;

  return sendEmail({ to: toEmail, subject, html });
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = { sendOTP, generateOTP, sendVoterCredentials, sendEmail };