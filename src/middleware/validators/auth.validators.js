import AppError from "#utils/AppError";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function collectErrors(checks) {
  return (req, res, next) => {
    const errors = checks(req);
    if (errors.length > 0) return next(new AppError(errors.join(", "), 400));
    next();
  };
}

const validateRegister = collectErrors((req) => {
  const errors = [];
  const { username, email, password } = req.body;
  if (!username || typeof username !== "string" || username.length < 3 || username.length > 30)
    errors.push("Username must be between 3 and 30 characters");
  if (!email || !emailRegex.test(email)) errors.push("Valid email is required");
  if (!password || password.length < 8) errors.push("Password must be at least 8 characters");
  return errors;
});

const validateLogin = collectErrors((req) => {
  const errors = [];
  const { email, password } = req.body;
  if (!email) errors.push("Email is required");
  if (!password) errors.push("Password is required");
  return errors;
});

const validateVerifyEmail = collectErrors((req) => {
  const errors = [];
  const { otp, email } = req.body;
  if (!otp || !/^\d{6}$/.test(otp)) errors.push("OTP must be exactly 6 digits");
  if (!email) errors.push("Email is required");
  return errors;
});

const validateForgotPassword = collectErrors((req) => {
  const errors = [];
  const { email } = req.body;
  if (!email || !emailRegex.test(email)) errors.push("Valid email is required");
  return errors;
});

const validateResetPassword = collectErrors((req) => {
  const errors = [];
  if (!req.params.token) errors.push("Reset token is required");
  if (!req.body.password || req.body.password.length < 8)
    errors.push("Password must be at least 8 characters");
  return errors;
});

export {
  validateRegister,
  validateLogin,
  validateVerifyEmail,
  validateForgotPassword,
  validateResetPassword,
};
