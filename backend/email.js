const nodemailer = require('nodemailer');

// Create SMTP transporter for Gmail
const createEmailTransporter = () => {
  const gmailUser = process.env.GMAIL_USER || '';
  const gmailPassword = process.env.GMAIL_PASSWORD || '';

  if (!gmailUser || !gmailPassword) {
    console.warn('Warning: Gmail credentials not configured in environment variables');
  }

  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    requireTLS: port === 587,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: {
      user: gmailUser,
      pass: gmailPassword
    }
  });
};

const transporter = createEmailTransporter();

// Send OTP email
async function sendOTPEmail(email, employeeName, otpCode) {
  try {
    const safeName = String(employeeName || 'Employee').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
    const mailOptions = {
      from: { name: process.env.SMTP_FROM_NAME || 'HAMARISA Security Team', address: process.env.GMAIL_USER },
      to: email,
      subject: 'HAMARISA IEMS Login Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #080706; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; border-bottom: 3px solid #f2aa45;">
            <h1 style="color: #f2aa45; margin: 0; letter-spacing: 3px;">HAMARISA</h1>
            <p style="color: #fff8e8; margin: 5px 0;">Intelligent Employee Management System</p>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="color: #1f2937; font-size: 16px; margin-bottom: 10px;">Hello <strong>${safeName}</strong>,</p>
            
            <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">
              Your HAMARISA IEMS login verification code is:
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 6px; text-align: center; margin: 20px 0; border: 2px dashed #f2aa45;">
              <p style="font-size: 36px; font-weight: bold; color: #b66d19; letter-spacing: 8px; margin: 0;">${otpCode}</p>
            </div>
            
            <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">
              This code will expire in <strong>5 minutes</strong>. 
              Do not share this code with anyone.
            </p>
            
            <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-top: 20px;">
              If you did not request this login, please contact your administrator immediately.
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0;">
              HAMARISA Security Team<br>
              This is an automated message, please do not reply.
            </p>
          </div>
        </div>
      `,
      text: `Hello ${employeeName || 'Employee'},

Your HAMARISA IEMS login verification code is:

${otpCode}

This code will expire in 5 minutes.

If you did not request this login, please contact your administrator immediately.

HAMARISA Security Team`
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`OTP email sent to ${email}: ${result.messageId}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Failed to send OTP email:', error.code || error.name, error.responseCode || '');
    return { success: false, error: error.code || 'EMAIL_DELIVERY_FAILED' };
  }
}

async function sendPlainEmail(email, subject, body) {
  try {
    const result = await transporter.sendMail({
      from: process.env.GMAIL_USER || 'noreply@iems.local',
      to: email,
      subject,
      text: body
    });
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { success: false, error: error.message };
  }
}

// Test email connection
async function testEmailConnection() {
  try {
    await transporter.verify();
    console.log('Email configuration verified successfully');
    return true;
  } catch (error) {
    console.error('Email configuration error:', error.message);
    return false;
  }
}

module.exports = {
  sendOTPEmail,
  sendPlainEmail,
  testEmailConnection,
  transporter
};
