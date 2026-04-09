import crypto from "crypto";
import jwt from "jsonwebtoken";
import config from "#config/config";
import sessionModel from "#models/session.model";

function signAccessToken(userId, sessionId) {
  return jwt.sign({ id: userId, session: sessionId }, config.JWT_SECRET, {
    expiresIn: "15m",
  });
}

function signRefreshToken(userId) {
  return jwt.sign({ id: userId }, config.JWT_SECRET, { expiresIn: "7d" });
}

function verifyToken(token) {
  return jwt.verify(token, config.JWT_SECRET);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function createSession(userId, refreshToken, req) {
  return sessionModel.create({
    user: userId,
    refreshTokenHash: hashToken(refreshToken),
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });
}

async function rotateSession(session, userId) {
  const newRefreshToken = signRefreshToken(userId);
  const newAccessToken = signAccessToken(userId, session._id);
  session.refreshTokenHash = hashToken(newRefreshToken);
  await session.save();
  return { newRefreshToken, newAccessToken };
}

function setRefreshCookie(res, token) {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  hashToken,
  createSession,
  rotateSession,
  setRefreshCookie,
};
