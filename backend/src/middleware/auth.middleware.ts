import { type NextFunction, type Request, type Response } from "express";
import { env } from "../lib/env.js";

export const validateApiSecret = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const apiSecret = req.header("x-api-secret");

  if (!apiSecret || apiSecret !== env.API_SECRET_KEY) {
    return res.status(401).json({
      error: "Unauthorized: Invalid or missing API secret key",
    });
  }

  next();
};
