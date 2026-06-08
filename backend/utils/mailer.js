let nodemailer = null;

try {
  nodemailer = require('nodemailer');
} catch {
  nodemailer = null;
}

function isEmailConfigured() {
  return Boolean(
    nodemailer &&
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.MAIL_FROM
  );
}

async function sendInviteEmail({ to, name, inviteUrl, expiresAt }) {
  if (!isEmailConfigured()) {
    return { sent: false, reason: nodemailer ? 'Email settings are incomplete' : 'nodemailer is not installed' };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
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

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
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

function friendlyMailError(err) {
  const message = err?.message || '';
  if (message.includes('535') || message.toLowerCase().includes('badcredentials') || message.toLowerCase().includes('username and password not accepted')) {
    return 'Gmail rejected the SMTP login. Use a Google App Password in SMTP_PASS, not the normal Gmail password.';
  }
  if (message.toLowerCase().includes('less secure')) {
    return 'Gmail blocked SMTP access. Enable 2-Step Verification and use a Google App Password.';
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

module.exports = { sendInviteEmail, sendPasswordResetCodeEmail, isEmailConfigured };
