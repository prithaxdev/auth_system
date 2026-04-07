import dotenv from "dotenv";

dotenv.config();

if (!process.env.MONGO_URI) {
  throw new Error("MONGO_URI environment variable is not set");
}

const config = {
  MONGO_URI: process.env.MONGO_URI,
};

export default config;
