import express from "express";
import morgan from "morgan";
import authRouter from "#routes/auth.routes";
import cookieParser from "cookie-parser";
import errorHandler from "#middleware/errorHandler";

const app = express();

app.use(express.json());
app.use(morgan("dev"));
app.use(cookieParser());

app.use("/api/auth", authRouter);

app.use(errorHandler);

export default app;
