import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
  {
    email: { type: String, required: [true, "Email is required"] },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: [true, "User is required"],
    },
    otpHash: { type: String, required: [true, "OTP hashed is required"] },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 10 * 60 * 1000),
      index: { expires: 0 },
    },
  },
  { timestamps: true },
);

const otpModel = mongoose.model("otps", otpSchema);

export default otpModel;
