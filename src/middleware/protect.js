import asyncHandler from "#middleware/asyncHandler";
import { verifyToken } from "#services/token.service";
import userModel from "#models/user.model";
import AppError from "#utils/AppError";

const protect = asyncHandler(async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) throw new AppError("No token provided", 401);

  const decoded = verifyToken(token);
  const user = await userModel.findById(decoded.id).select("-password");
  if (!user) throw new AppError("User not found", 401);

  req.user = user;
  req.sessionId = decoded.session;
  next();
});

export default protect;
