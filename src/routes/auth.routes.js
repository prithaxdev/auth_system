import { Router } from "express";
import * as authController from "#controllers/auth.controller";
import protect from "#middleware/protect";
import {
  validateRegister,
  validateLogin,
  validateVerifyEmail,
  validateForgotPassword,
  validateResetPassword,
} from "#middleware/validators/auth.validators";

const authRouter = Router();

authRouter.post("/register", validateRegister, authController.register);
authRouter.post("/login", validateLogin, authController.login);
authRouter.get("/get-me", protect, authController.getMe);
authRouter.post("/verify-email", validateVerifyEmail, authController.verifyEmail);
authRouter.post("/refresh-token", authController.refreshToken);
authRouter.post("/logout", authController.logout);
authRouter.post("/logout-all", protect, authController.logoutAll);
authRouter.post("/forgot-password", validateForgotPassword, authController.forgotPassword);
authRouter.post(
  "/reset-password/:token",
  validateResetPassword,
  authController.resetPassword,
);

export default authRouter;
