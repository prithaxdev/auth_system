export function getResetPasswordHtml(resetLink) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset Your Password</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { border-collapse: collapse !important; }
    body { margin: 0; padding: 0; background-color: #f4f6f8; font-family: Arial, sans-serif; }
    .wrapper { width: 100%; table-layout: fixed; background-color: #f4f6f8; padding: 20px 0; }
    .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 480px; border-radius: 10px; overflow: hidden; }
    .header { background: #4f46e5; color: #ffffff; text-align: center; padding: 20px; font-size: 20px; font-weight: bold; }
    .content { padding: 30px; text-align: center; color: #333333; }
    .btn { display: inline-block; margin: 20px 0; padding: 12px 24px; font-size: 16px; font-weight: bold; color: #ffffff; background-color: #4f46e5; border-radius: 6px; text-decoration: none; }
    .footer { font-size: 12px; color: #888888; text-align: center; padding: 20px; }
  </style>
</head>
<body>
  <center class="wrapper">
    <table class="main" role="presentation">
      <tr><td class="header">Auth System</td></tr>
      <tr>
        <td class="content">
          <p>Hello,</p>
          <p>We received a request to reset your password. Click the button below to proceed:</p>
          <a href="${resetLink}" class="btn">Reset Password</a>
          <p>This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
        </td>
      </tr>
      <tr><td class="footer">If you didn't request this, you can safely ignore this email.</td></tr>
    </table>
  </center>
</body>
</html>
  `;
}

export function generateOTP() {
  const otp = Math.floor(100000 + Math.random() * 900000);
  return otp.toString();
}

export function getOtpHtml(otp) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OTP Verification</title>

  <style>
    /* Reset */
    body, table, td, a {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      border-collapse: collapse !important;
    }
    body {
      margin: 0;
      padding: 0;
      background-color: #f4f6f8;
      font-family: Arial, sans-serif;
    }

    /* Container */
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #f4f6f8;
      padding: 20px 0;
    }

    .main {
      background-color: #ffffff;
      margin: 0 auto;
      width: 100%;
      max-width: 480px;
      border-radius: 10px;
      overflow: hidden;
    }

    /* Header */
    .header {
      background: #4f46e5;
      color: #ffffff;
      text-align: center;
      padding: 20px;
      font-size: 20px;
      font-weight: bold;
    }

    /* Content */
    .content {
      padding: 30px;
      text-align: center;
      color: #333333;
    }

    .otp {
      display: inline-block;
      margin: 20px 0;
      padding: 12px 20px;
      font-size: 26px;
      font-weight: bold;
      letter-spacing: 5px;
      color: #4f46e5;
      background-color: #eef2ff;
      border-radius: 6px;
    }

    /* Footer */
    .footer {
      font-size: 12px;
      color: #888888;
      text-align: center;
      padding: 20px;
    }

    @media screen and (max-width: 480px) {
      .content {
        padding: 20px;
      }
      .otp {
        font-size: 22px;
        letter-spacing: 3px;
      }
    }
  </style>
</head>

<body>
  <center class="wrapper">
    <table class="main" role="presentation">
      <tr>
        <td class="header">
          Auth System
        </td>
      </tr>

      <tr>
        <td class="content">
          <p>Hello,</p>
          <p>Use the OTP below to complete your verification:</p>

          <div class="otp">${otp}</div>

          <p>This code will expire shortly. Do not share it with anyone.</p>
        </td>
      </tr>

      <tr>
        <td class="footer">
          If you didn’t request this, you can safely ignore this email.
        </td>
      </tr>
    </table>
  </center>
</body>
</html>
  `;
}
