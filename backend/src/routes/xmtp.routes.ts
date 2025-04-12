import express, { type Request, type Response } from "express";
import { addUserToDefaultGroupChatController } from "../controllers/xmtp.controller";

const router = express.Router();

router.post("/add-inbox", (req: Request, res: Response) => {
  addUserToDefaultGroupChatController(req, res).catch((err: unknown) => {
    console.error("Error adding user to inbox:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
});

export default router;
