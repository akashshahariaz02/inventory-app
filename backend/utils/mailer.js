let nodemailer = null;
const fs = require('fs');

try {
  nodemailer = require('nodemailer');
} catch {
  nodemailer = null;
}

function isEmailConfigured() {
  return Boolean(
    (
      process.env.BREVO_API_KEY ||
      (
        nodemailer &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASS
      )
    ) &&
    process.env.MAIL_FROM
  );
}

function smtpOptions() {
  return {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    connectionTimeout: Number(process.env.SMTP_TIMEOUT_MS || 8000),
    greetingTimeout: Number(process.env.SMTP_TIMEOUT_MS || 8000),
    socketTimeout: Number(process.env.SMTP_TIMEOUT_MS || 8000),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  };
}

async function sendInviteEmail({ to, name, inviteUrl, expiresAt }) {
  if (!isEmailConfigured()) {
    return { sent: false, reason: nodemailer ? 'Email settings are incomplete' : 'nodemailer is not installed' };
  }

  try {
    await sendEmail({
      to,
      subject: 'HICC-SRC JV Inventory Account Verification',
      html: `
        <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.6">
          <h2 style="color:#2563eb;margin-bottom:8px">HICC-SRC JV Inventory</h2>
          <p>Hello ${escapeHtml(name)},</p>
          <p>An account has been created for you. Please verify your account and set your password using the button below.</p>
          <p>
            <a href="${escapeHtml(inviteUrl)}" style="background:#2563eb;color:white;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600">
              Verify Account
            </a>
          </p>
          <p>If the button does not work, open this link:</p>
          <p style="word-break:break-all;color:#2563eb">${escapeHtml(inviteUrl)}</p>
          <p style="color:#6b7280;font-size:12px">This invite expires at ${escapeHtml(expiresAt)}.</p>
        </div>
      `,
    });

    return { sent: true };
  } catch (err) {
    return { sent: false, reason: friendlyMailError(err) };
  }
}

async function sendPasswordResetCodeEmail({ to, name, code, expiresAt }) {
  if (!isEmailConfigured()) {
    return { sent: false, reason: nodemailer ? 'Email settings are incomplete' : 'nodemailer is not installed' };
  }

  try {
    await sendEmail({
      to,
      subject: 'HICC-SRC JV Inventory Password Reset Code',
      html: `
        <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.6">
          <h2 style="color:#2563eb;margin-bottom:8px">HICC-SRC JV Inventory</h2>
          <p>Hello ${escapeHtml(name)},</p>
          <p>Use this code to reset your password:</p>
          <div style="font-size:26px;font-weight:700;letter-spacing:6px;color:#111827;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;display:inline-block">
            ${escapeHtml(code)}
          </div>
          <p style="color:#6b7280;font-size:12px">This code expires at ${escapeHtml(expiresAt)}.</p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
      `,
    });

    return { sent: true };
  } catch (err) {
    return { sent: false, reason: friendlyMailError(err) };
  }
}

async function sendBackupEmail({ to, filePath, fileName }) {
  if (!isEmailConfigured()) {
    return { sent: false, reason: nodemailer ? 'Email settings are incomplete' : 'nodemailer is not installed' };
  }

  try {
    await sendEmail({
      to,
      subject: `HICC-SRC JV Inventory Backup - ${fileName}`,
      html: `
        <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.6">
          <h2 style="color:#2563eb;margin-bottom:8px">HICC-SRC JV Inventory Backup</h2>
          <p>A PostgreSQL database backup has been generated and attached.</p>
          <p><strong>File:</strong> ${escapeHtml(fileName)}</p>
          <p style="color:#6b7280;font-size:12px">Keep this file private. It contains inventory and user data.</p>
        </div>
      `,
      attachments: [{ filename: fileName, path: filePath }],
    });

    return { sent: true };
  } catch (err) {
    return { sent: false, reason: friendlyMailError(err) };
  }
}

async function sendEmail({ to, subject, html, attachments = [] }) {
  if (process.env.BREVO_API_KEY) {
    return sendBrevoApiEmail({ to, subject, html, attachments });
  }

  const transporter = nodemailer.createTransport(smtpOptions());
  return transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    html,
    attachments,
  });
}

async function sendBrevoApiEmail({ to, subject, html, attachments = [] }) {
  const payload = {
    sender: parseSender(process.env.MAIL_FROM),
    to: [{ email: to }],
    subject,
    htmlContent: html,
  };

  if (attachments.length) {
    payload.attachment = attachments.map(attachment => ({
      name: attachment.filename,
      content: fs.readFileSync(attachment.path).toString('base64'),
    }));
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorText = await response.text();
    try {
      const parsed = JSON.parse(errorText);
      errorText = parsed.message || parsed.code || errorText;
    } catch {
      // Keep raw response text.
    }
    throw new Error(`Brevo API error (${response.status}): ${errorText}`);
  }
}

function parseSender(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(.*?)<(.+?)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() };
  }
  return { email: text };
}

function friendlyMailError(err) {
  const message = err?.message || '';
  if (message.includes('535') || message.toLowerCase().includes('badcredentials') || message.toLowerCase().includes('username and password not accepted')) {
    return 'Gmail rejected the SMTP login. Use a Google App Password in SMTP_PASS, not the normal Gmail password.';
  }
  if (message.toLowerCase().includes('unauthorized') || message.includes('401')) {
    return 'Brevo rejected the API key. Check BREVO_API_KEY in Render.';
  }
  if (message.toLowerCase().includes('less secure')) {
    return 'Gmail blocked SMTP access. Enable 2-Step Verification and use a Google App Password.';
  }
  if (message.toLowerCase().includes('timeout') || message.toLowerCase().includes('timed out') || message.includes('ETIMEDOUT')) {
    return 'Email server timed out. On free hosting, SMTP may be blocked or slow. Share the invite link manually or use a transactional email service.';
  }
  if (message.includes('ECONNREFUSED') || message.includes('ECONNRESET') || message.includes('ENETUNREACH')) {
    return 'Email server connection failed. Check SMTP settings or use a transactional email service for hosted deployment.';
  }
  return message || 'Email delivery failed';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

module.exports = { sendInviteEmail, sendPasswordResetCodeEmail, sendBackupEmail, isEmailConfigured };
