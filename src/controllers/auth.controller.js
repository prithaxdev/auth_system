import userModel from "#models/user.model";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import config from "#config/config";

async function register(req, res) {
  const { username, email, password } = req.body;

  const isAlreadyRegistered = await userModel.findOne({
    $or: [{ username }, { email }],
  });

  if (isAlreadyRegistered) {
    return res
      .status(409)
      .json({ message: "Username or email already exists" });
  }

  const hashedPassword = crypto
    .createHash("sha256")
    .update(password)
    .digest("hex");
  const user = await userModel.create({
    username,
    email,
    password: hashedPassword,
  });

  const accessToken = jwt.sign({ id: user._id }, config.JWT_SECRET, {
    expiresIn: "15m",
  });

  const refreshToken = jwt.sign({ id: user._id }, config.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.status(201).json({
    message: "User registered successfully",
    user: {
      username: user.username,
      email: user.email,
    },
    accessToken,
  });
}

async function getMe(req, res) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  const decoded = jwt.verify(token, config.JWT_SECRET);

  const user = await userModel.findById(decoded.id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.status(200).json({
    message: "User retrieved successfully",
    user: {
      username: user.username,
      email: user.email,
    },
  });
}

async function refreshToken(req, res) {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ message: "No refresh token provided" });
  }

  try {
    const decoded = jwt.verify(refreshToken, config.JWT_SECRET);
    const user = await userModel.findById(decoded.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const newAccessToken = jwt.sign({ id: user._id }, config.JWT_SECRET, {
      expiresIn: "15m",
    });

    const newRefreshToken = jwt.sign({ id: user._id }, config.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(200).json({
      message: "Token refreshed successfully",
      accessToken: newAccessToken,
    });
  } catch (error) {
    res.status(401).json({ message: "Invalid refresh token" });
  }
}

export { register, getMe, refreshToken };
