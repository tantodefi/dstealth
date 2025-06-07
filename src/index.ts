import { ponder } from "@/generated";

// Index ERC-5564 Stealth Address Announcements
ponder.on("StealthAnnouncer:Announcement", async ({ event, context }) => {
  const { StealthAnnouncement } = context.db;

  await StealthAnnouncement.create({
    id: event.log.id,
    data: {
      schemeId: event.args.schemeId,
      stealthAddress: event.args.stealthAddress,
      caller: event.args.caller,
      ephemeralPubKey: event.args.ephemeralPubKey,
      metadata: event.args.metadata,
      blockNumber: event.block.number,
      timestamp: event.block.timestamp,
      transactionHash: event.transaction.hash,
      network: event.log.chainId === 1 ? "mainnet" : "sepolia",
    },
  });
});

// Index ERC-6538 Stealth Key Registry
ponder.on("StealthRegistry:StealthMetaAddressSet", async ({ event, context }) => {
  const { StealthRegistration } = context.db;

  await StealthRegistration.create({
    id: event.log.id,
    data: {
      registrant: event.args.registrant,
      schemeId: event.args.schemeId, 
      stealthMetaAddress: event.args.stealthMetaAddress,
      blockNumber: event.block.number,
      timestamp: event.block.timestamp,
      transactionHash: event.transaction.hash,
      network: event.log.chainId === 1 ? "mainnet" : "sepolia",
    },
  });
});

// Index Umbra Protocol Announcements
ponder.on("UmbraProtocol:Announcement", async ({ event, context }) => {
  const { UmbraTransaction } = context.db;

  await UmbraTransaction.create({
    id: event.log.id,
    data: {
      type: "send",
      receiver: event.args.receiver,
      amount: event.args.amount.toString(),
      token: event.args.token,
      ephemeralPubKey: JSON.stringify(event.args.ephemeralPubKey),
      metadata: event.args.metadata,
      blockNumber: event.block.number,
      timestamp: event.block.timestamp,
      transactionHash: event.transaction.hash,
      network: "mainnet",
    },
  });
});

// Index Umbra Protocol Withdrawals
ponder.on("UmbraProtocol:TokenWithdrawal", async ({ event, context }) => {
  const { UmbraTransaction } = context.db;

  await UmbraTransaction.create({
    id: event.log.id,
    data: {
      type: "withdrawal",
      receiver: event.args.receiver,
      acceptor: event.args.acceptor,
      token: event.args.token,
      amount: event.args.amount.toString(),
      fee: event.args.fee.toString(),
      blockNumber: event.block.number,
      timestamp: event.block.timestamp,
      transactionHash: event.transaction.hash,
      network: "mainnet",
    },
  });
});

// Index Umbra Stealth Key Changes
ponder.on("UmbraKeyRegistry:StealthKeyChanged", async ({ event, context }) => {
  const { UmbraKeyRegistration } = context.db;

  await UmbraKeyRegistration.create({
    id: event.log.id,
    data: {
      registrant: event.args.registrant,
      spendingPubKey: JSON.stringify(event.args.spendingPubKey),
      viewingPubKey: JSON.stringify(event.args.viewingPubKey),
      blockNumber: event.block.number,
      timestamp: event.block.timestamp,
      transactionHash: event.transaction.hash,
      network: "mainnet",
    },
  });
});

// Index FluidKey Score Updates (Base)
ponder.on("FluidKeyScore:Transfer", async ({ event, context }) => {
  const { FluidKeyBalance } = context.db;

  // Update both sender and receiver balances
  if (event.args.from !== "0x0000000000000000000000000000000000000000") {
    await FluidKeyBalance.upsert({
      id: `${event.args.from}-${event.log.chainId}`,
      create: {
        address: event.args.from,
        balance: (-Number(event.args.value)).toString(),
        lastUpdated: event.block.timestamp,
        network: "base",
      },
      update: ({ current }) => ({
        balance: (BigInt(current.balance) - event.args.value).toString(),
        lastUpdated: event.block.timestamp,
      }),
    });
  }

  if (event.args.to !== "0x0000000000000000000000000000000000000000") {
    await FluidKeyBalance.upsert({
      id: `${event.args.to}-${event.log.chainId}`,
      create: {
        address: event.args.to,
        balance: event.args.value.toString(),
        lastUpdated: event.block.timestamp,
        network: "base",
      },
      update: ({ current }) => ({
        balance: (BigInt(current.balance) + event.args.value).toString(),
        lastUpdated: event.block.timestamp,
      }),
    });
  }
});

// Index FluidKey Score Updates (if contract emits ScoreUpdated events)
ponder.on("FluidKeyScore:ScoreUpdated", async ({ event, context }) => {
  const { FluidKeyScore } = context.db;

  await FluidKeyScore.upsert({
    id: `${event.args.user}-${event.log.chainId}`,
    create: {
      address: event.args.user,
      score: event.args.newScore.toString(),
      lastUpdated: event.args.timestamp,
      network: "base",
    },
    update: {
      score: event.args.newScore.toString(),
      lastUpdated: event.args.timestamp,
    },
  });
}); 