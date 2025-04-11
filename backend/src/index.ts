import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import { env } from "./lib/env.js";
import { validateApiSecret } from "./middleware/auth.middleware.js";
import xmtpRoutes from "./routes/xmtp.routes.js";

// Load environment variables
dotenv.config();

const app = express();
const port = env.PORT;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check route (unprotected)
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Protected API routes
app.use("/api/xmtp", validateApiSecret, xmtpRoutes);

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
