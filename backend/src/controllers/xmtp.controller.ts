import { Request, Response } from "express";
import { addUserToDefaultGroupChat } from "../services/xmtp.service.js";

export const addUserToDefaultGroupChatController = async (
  req: Request,
  res: Response
) => {
  try {
    const { inboxId } = req.body;
    const result = await addUserToDefaultGroupChat(inboxId);
    if (!result) {
      res.status(200).json({
        success: false,
        message: "Failed to add user to default group chat",
      });
    } else {
      res.status(200).json({
        success: true,
        message: "Successfully added user to default group chat",
      });
    }
  } catch (error) {
    console.error("Error adding user to default group chat:", error);
    res.status(500).json({
      message: "Failed to add user to default group chat",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
