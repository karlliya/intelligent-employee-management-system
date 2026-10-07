require('./db');
const { transporter } = require('./email');

async function main() {
  const sender = process.env.GMAIL_USER || '';
  const password = process.env.GMAIL_PASSWORD || '';
  if (!sender || !password || password === 'your-app-password-here') {
    console.error('Gmail SMTP is not configured. Set GMAIL_USER and GMAIL_PASSWORD in the root .env file.');
    process.exitCode = 1;
    return;
  }

  try {
    await transporter.verify();
    console.log('Gmail SMTP authentication succeeded. Real email addresses can receive OTP.');
  } catch (error) {
    console.error(`Gmail SMTP authentication failed (${error.code || 'UNKNOWN'}${error.responseCode ? ` ${error.responseCode}` : ''}).`);
    if (error.code === 'EAUTH') console.error('Check that GMAIL_PASSWORD is a current Google App Password for GMAIL_USER.');
    process.exitCode = 1;
  } finally {
    transporter.close();
  }
}

main();
