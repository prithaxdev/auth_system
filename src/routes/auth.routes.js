import { Router } from "express";
import * as authController from "#controllers/auth.controller";

const authRouter = Router();

/*
/api/auth -> prefix for all auth routes
Post /api/auth/login - Login a user
Post /api/auth/register - Register a new user
*/

// authRouter.post("/login", authController.login);
authRouter.post("/register", authController.register);

/*
GET /api/auth/get-me - Get the current user
*/
authRouter.get("/get-me", authController.getMe);

/*
GET /api/auth/refresh-token - Refresh the access token
*/
authRouter.get("/refresh-token", authController.refreshToken);

/*
 Get /api/auth/logout - Logout the current user
*/
authRouter.get("/logout", authController.logout);

/*
Get /api/auth/logout-all - Logout all devices
*/
authRouter.get("/logout-all", authController.logoutAll);

export default authRouter;
