import { Client, type Group } from "@xmtp/node-sdk";
import { env } from "../lib/env.js";
import {
  createSigner,
  generateEncryptionKeyHex,
  getEncryptionKeyFromHex,
} from "../lib/xmtp-utils";

// create random encryption key
const encryptionKey = env.XMTP_ENCRYPTION_KEY
  ? env.XMTP_ENCRYPTION_KEY
  : generateEncryptionKeyHex();

/**
 * Add a user to the default group chat
 * @param newUserInboxId - The inbox ID of the user to add
 * @returns true if the user was added, false otherwise
 */
export const addUserToDefaultGroupChat = async (
  newUserInboxId: string,
): Promise<boolean> => {
  // create ephemeral node signer
  const signer = createSigner(env.XMTP_PRIVATE_KEY);
  console.log("Adding user to default group chat", newUserInboxId);
  // create XMTP Node client
  console.log("Creating XMTP Node client with encription key", encryptionKey);
  const client = await Client.create(
    signer,
    getEncryptionKeyFromHex(encryptionKey),
    {
      env: env.XMTP_ENV,
    },
  );
  console.log("Client created", client.inboxId);
  // Sync the conversations from the network to update the local db
  await client.conversations.sync();

  // Get the group chat by id
  const conversation = await client.conversations.getConversationById(
    env.XMTP_DEFAULT_CONVERSATION_ID,
  );
  if (!conversation)
    throw new Error(
      `Conversation not found with id: ${env.XMTP_DEFAULT_CONVERSATION_ID} on env: ${env.XMTP_ENV}`,
    );

  // Get the metadata
  const metadata = await conversation.metadata();
  console.log("Conversation found", metadata);
  if (metadata.conversationType !== "group")
    throw new Error("Conversation is not a group");

  // load members from the group
  const group = conversation as Group;
  const groupMembers = await group.members();
  console.log(
    "Group members",
    groupMembers.map((member) => member.inboxId),
  );
  const isMember = groupMembers.some(
    (member) => member.inboxId === newUserInboxId,
  );
  if (isMember) {
    console.warn("User already in group, skipping...");
  } else {
    // Add the user to the group chat
    await group.addMembers([newUserInboxId]);
  }
  return true;
};
