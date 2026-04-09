import crypto from "crypto";
import bcrypt from "bcrypt";
import userModel from "#models/user.model";
import sessionModel from "#models/session.model";
import otpModel from "#models/otp.model";
import { sendEmail } from "#services/email.service";
import { generateOTP, getOtpHtml, getResetPasswordHtml } from "#utils/utils";
import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  hashToken,
  createSession,
  rotateSession,
} from "#services/token.service";
import AppError from "#utils/AppError";
import config from "#config/config";

async function registerUser({ username, email, password }) {
  const existing = await userModel.findOne({ $or: [{ username }, { email }] });
  if (existing) throw new AppError("Username or email already exists", 409);

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await userModel.create({ username, email, password: hashedPassword });

  const otp = generateOTP();
  const otpHash = hashToken(otp);
  await otpModel.create({ email, user: user._id, otpHash });

  try {
    await sendEmail(
      email,
      "OTP Verification",
      `Your OTP code is ${otp}`,
      getOtpHtml(otp),
    );
  } catch (err) {
    console.warn("Registration email failed to send:", err.message);
  }

  return { username: user.username, email: user.email, isVerified: user.isVerified };
}

async function loginUser({ email, password }, req) {
  const user = await userModel.findOne({ email });
  if (!user) throw new AppError("Invalid email or password", 401);
  if (!user.isVerified) throw new AppError("Email is not verified", 401);

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) throw new AppError("Invalid email or password", 401);

  const refreshToken = signRefreshToken(user._id);
  const session = await createSession(user._id, refreshToken, req);
  const accessToken = signAccessToken(user._id, session._id);

  return { user, refreshToken, accessToken };
}

async function verifyUserEmail({ otp, email }) {
  const otpDoc = await otpModel.findOne({ email, otpHash: hashToken(otp) });
  if (!otpDoc) throw new AppError("Invalid OTP", 400);
  if (otpDoc.expiresAt < new Date()) throw new AppError("OTP has expired", 400);

  await userModel.findByIdAndUpdate(otpDoc.user, { isVerified: true });
  await otpModel.deleteMany({ user: otpDoc.user });
}

async function refreshUserToken(refreshToken) {
  if (!refreshToken) throw new AppError("No refresh token provided", 401);

  const decoded = verifyToken(refreshToken);
  const session = await sessionModel.findOne({
    refreshTokenHash: hashToken(refreshToken),
    revoked: false,
  });
  if (!session) throw new AppError("Invalid refresh token", 401);

  const { newRefreshToken, newAccessToken } = await rotateSession(session, decoded.id);
  return { newRefreshToken, newAccessToken };
}

async function logoutUser(refreshToken) {
  if (!refreshToken) throw new AppError("No refresh token provided", 401);

  const session = await sessionModel.findOne({
    refreshTokenHash: hashToken(refreshToken),
    revoked: false,
  });
  if (!session) throw new AppError("Invalid refresh token", 401);

  session.revoked = true;
  await session.save();
}

async function logoutAllUsers(userId) {
  await sessionModel.updateMany({ user: userId, revoked: false }, { revoked: true });
}

async function forgotPassword(email) {
  const user = await userModel.findOne({ email });
  if (!user) return; // silent — prevent enumeration

  const rawToken = crypto.randomBytes(32).toString("hex");
  user.passwordResetToken = hashToken(rawToken);
  user.passwordResetExpires = new Date(Date.now() + 3600000);
  await user.save({ validateBeforeSave: false });

  const resetLink = `${config.CLIENT_URL}/reset-password/${rawToken}`;

  try {
    await sendEmail(
      email,
      "Password Reset Request",
      `Reset your password: ${resetLink}`,
      getResetPasswordHtml(resetLink),
    );
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    throw new AppError("Email could not be sent", 500);
  }
}

async function resetPassword({ token, newPassword }) {
  const hash = hashToken(token);
  const user = await userModel.findOne({
    passwordResetToken: hash,
    passwordResetExpires: { $gt: Date.now() },
  });
  if (!user) throw new AppError("Token is invalid or has expired", 400);

  user.password = await bcrypt.hash(newPassword, 12);
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  await sessionModel.updateMany({ user: user._id, revoked: false }, { revoked: true });
}

export {
  registerUser,
  loginUser,
  verifyUserEmail,
  refreshUserToken,
  logoutUser,
  logoutAllUsers,
  forgotPassword,
  resetPassword,
};
