import asyncHandler from "#middleware/asyncHandler";
import * as authService from "#services/auth.service";
import { setRefreshCookie } from "#services/token.service";

const register = asyncHandler(async (req, res) => {
  const user = await authService.registerUser(req.body);
  res.status(201).json({ message: "User registered successfully", user });
});

const login = asyncHandler(async (req, res) => {
  const { user, refreshToken, accessToken } = await authService.loginUser(req.body, req);
  setRefreshCookie(res, refreshToken);
  res.status(200).json({
    message: "Logged in successfully",
    user: { username: user.username, email: user.email },
    accessToken,
  });
});

const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({ message: "User retrieved successfully", user: req.user });
});

const verifyEmail = asyncHandler(async (req, res) => {
  await authService.verifyUserEmail(req.body);
  res.status(200).json({ message: "Email verified successfully" });
});

const refreshToken = asyncHandler(async (req, res) => {
  const { newRefreshToken, newAccessToken } = await authService.refreshUserToken(
    req.cookies.refreshToken,
  );
  setRefreshCookie(res, newRefreshToken);
  res.status(200).json({ message: "Token refreshed successfully", accessToken: newAccessToken });
});

const logout = asyncHandler(async (req, res) => {
  await authService.logoutUser(req.cookies.refreshToken);
  res.clearCookie("refreshToken");
  res.status(200).json({ message: "Logged out successfully" });
});

const logoutAll = asyncHandler(async (req, res) => {
  await authService.logoutAllUsers(req.user._id);
  res.clearCookie("refreshToken");
  res.status(200).json({ message: "Logged out from all devices successfully" });
});

const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  res.status(200).json({ message: "If that email exists, a reset link has been sent" });
});

const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword({
    token: req.params.token,
    newPassword: req.body.password,
  });
  res.status(200).json({ message: "Password reset successfully" });
});

export {
  register,
  login,
  getMe,
  verifyEmail,
  refreshToken,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
};
