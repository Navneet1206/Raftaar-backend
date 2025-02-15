const nodemailer = require('nodemailer');
const twilio = require('twilio');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Helper: Create a styled HTML email template
const createEmailTemplate = (heading, messageBody) => {
  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f2f2f2; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; padding: 20px; border: 1px solid #dddddd; }
          .header { background: #007BFF; color: #ffffff; padding: 10px; text-align: center; }
          .content { margin: 20px 0; font-size: 16px; color: #333333; line-height: 1.5; }
          .footer { text-align: center; font-size: 12px; color: #888888; margin-top: 20px; }
          a { color: #007BFF; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>${heading}</h2>
          </div>
          <div class="content">
            ${messageBody}
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Your Company Name. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
};

// Send OTP via email with HTML template
module.exports.sendEmailOTP = async (email, otp) => {
  const htmlContent = createEmailTemplate(
    'Your OTP for Signup',
    `<p>Hello,</p>
     <p>Your OTP for signup is: <strong>${otp}</strong></p>
     <p>Please use this OTP to complete your registration.</p>`
  );

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Your OTP for Signup',
    html: htmlContent,
  };

  await transporter.sendMail(mailOptions);
};

// Send OTP via SMS with clear message formatting
module.exports.sendSMSOTP = async (mobileNumber, otp) => {
  // Ensure mobile number starts with +91
  if (!mobileNumber.startsWith('+91')) {
    mobileNumber = `+91${mobileNumber}`;
  }

  await twilioClient.messages.create({
    body: `Your OTP for signup is: ${otp}. Please use this OTP to complete your registration.`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: mobileNumber,
  });
};

// Send a generic email using HTML content and styled template if needed
module.exports.sendEmail = async (to, subject, html) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    html,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send email');
  }
};
