import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";

const authRouter = Router();

/*
/api/auth -> prefix for all auth routes
Post /api/auth/login - Login a user
Post /api/auth/register - Register a new user
*/

// authRouter.post("/login", authController.login);
authRouter.post("/register", authController.register);

export default authRouter;
