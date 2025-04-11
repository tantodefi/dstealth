import express from "express";
import { addUserToDefaultGroupChatController } from "../controllers/xmtp.controller.js";

const router = express.Router();

router.post("/add-inbox", addUserToDefaultGroupChatController);

export default router;
