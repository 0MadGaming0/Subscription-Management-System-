const nodemailer = require('nodemailer');

/**
 * Creates and caches Nodemailer transporter based on SMTP_* environment variables.
 * Never hardcodes any credentials.
 */
let cachedTransporter = null;

const createTransporter = async () => {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
    NODE_ENV,
  } = process.env;

  // Use configured SMTP server if host and user are specified
  const isSmtpConfigured = Boolean(
    SMTP_HOST &&
    SMTP_USER &&
    SMTP_PASS &&
    SMTP_USER !== 'your_smtp_username' &&
    SMTP_USER !== 'your_ethereal_or_smtp_user'
  );

  if (isSmtpConfigured) {
    const port = Number(SMTP_PORT) || 587;
    const isSecure = SMTP_SECURE === 'true' || port === 465;

    cachedTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: isSecure,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
    return cachedTransporter;
  }

  // Fallback in development mode when SMTP is not configured
  if (NODE_ENV !== 'production') {
    try {
      const testAccount = await nodemailer.createTestAccount();
      console.log('[EmailService] Created temporary Ethereal test account:', testAccount.user);

      cachedTransporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      return cachedTransporter;
    } catch (err) {
      console.warn('[EmailService] Could not initialize Ethereal test account. Falling back to console-only mode:', err.message);
    }
  }

  // Safe fallback transporter that outputs email details to console without failing
  return {
    sendMail: async (options) => {
      console.log('\n--- [EMAIL DISPATCHED (DEV CONSOLE PREVIEW)] ---');
      console.log(`From:    ${options.from}`);
      console.log(`To:      ${options.to}`);
      console.log(`Subject: ${options.subject}`);
      console.log(`Text:\n${options.text}`);
      console.log('-------------------------------------------------\n');
      return { messageId: 'console-mock-preview-id' };
    },
  };
};

/**
 * Sends a password reset email using configured SMTP settings.
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.name - Recipient user name
 * @param {string} options.resetToken - Raw unhashed reset token
 * @param {string} options.origin - Base URL of client or server
 * @returns {Promise<Object>} Send result
 */
const sendPasswordResetEmail = async ({ to, name, resetToken, origin }) => {
  const clientUrl = process.env.CLIENT_URL || origin || 'http://localhost:3000';
  const resetUrl = `${clientUrl}/reset-password/${resetToken}`;
  const from = process.env.EMAIL_FROM || '"Brightloop Software" <support@brightloop.com>';

  const subject = 'Brightloop Software - Password Reset Request';

  const textContent = `Hello ${name || 'User'},\n\n` +
    `You are receiving this email because you (or someone else) requested a password reset for your Brightloop Software account.\n\n` +
    `Please click the link below or paste it into your browser to complete the process:\n` +
    `${resetUrl}\n\n` +
    `Security notice: This link is single-use and will expire in 15 minutes.\n\n` +
    `If you did not request this, please ignore this email and your password will remain unchanged.\n\n` +
    `Warm regards,\n` +
    `The Brightloop Software Security Team`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Password Reset Request</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
          .header { background-color: #2563eb; color: #ffffff; padding: 24px; text-align: center; }
          .header h1 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.5px; }
          .content { padding: 32px 24px; line-height: 1.6; }
          .button-wrap { text-align: center; margin: 30px 0; }
          .button { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 15px; }
          .notice { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 20px 0; font-size: 13px; color: #92400e; }
          .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; font-size: 12px; color: #64748b; text-align: center; }
          .token-box { background: #f1f5f9; padding: 8px 12px; border-radius: 4px; font-family: monospace; word-break: break-all; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Brightloop Software</h1>
          </div>
          <div class="content">
            <p>Hello <strong>${name || 'Valued Customer'}</strong>,</p>
            <p>We received a request to reset the password for your Brightloop Software account associated with <strong>${to}</strong>.</p>
            <div class="button-wrap">
              <a href="${resetUrl}" class="button" target="_blank">Reset Password</a>
            </div>
            <div class="notice">
              <strong>Security Notice:</strong> This reset link is valid for <strong>15 minutes</strong> only and can be used once.
            </div>
            <p>If the button above does not work, copy and paste this URL into your browser:</p>
            <p class="token-box">${resetUrl}</p>
            <p>If you did not request this reset, please ignore this email or contact support if you suspect unauthorized activity.</p>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} Brightloop Software Inc. All rights reserved.
          </div>
        </div>
      </body>
    </html>
  `;

  const transporter = await createTransporter();

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text: textContent,
    html: htmlContent,
  });

  if (nodemailer.getTestMessageUrl && info && info.messageId && info.messageId !== 'console-mock-preview-id') {
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`[EmailService] Preview Ethereal email at: ${previewUrl}`);
    }
  }

  return info;
};

module.exports = {
  sendPasswordResetEmail,
};
