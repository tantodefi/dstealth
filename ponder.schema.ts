import { createSchema } from "@ponder/core";

export default createSchema((p) => ({
  // ERC-5564 Stealth Address Announcements
  StealthAnnouncement: p.createTable({
    id: p.string(),
    schemeId: p.bigint(),
    stealthAddress: p.hex(),
    caller: p.hex(),
    ephemeralPubKey: p.hex(),
    metadata: p.hex(),
    blockNumber: p.bigint(),
    timestamp: p.bigint(),
    transactionHash: p.hex(),
    network: p.string(),
  }),

  // ERC-6538 Stealth Key Registry
  StealthRegistration: p.createTable({
    id: p.string(),
    registrant: p.hex(),
    schemeId: p.bigint(),
    stealthMetaAddress: p.hex(),
    blockNumber: p.bigint(),
    timestamp: p.bigint(),
    transactionHash: p.hex(),
    network: p.string(),
  }),

  // Umbra Protocol Transactions (sends & withdrawals)
  UmbraTransaction: p.createTable({
    id: p.string(),
    type: p.string(), // "send" or "withdrawal"
    receiver: p.hex(),
    acceptor: p.hex().optional(), // Only for withdrawals
    token: p.hex(),
    amount: p.string(),
    fee: p.string().optional(), // Only for withdrawals
    ephemeralPubKey: p.string().optional(), // Only for sends (JSON string)
    metadata: p.hex().optional(), // Only for sends
    blockNumber: p.bigint(),
    timestamp: p.bigint(),
    transactionHash: p.hex(),
    network: p.string(),
  }),

  // Umbra Stealth Key Registrations
  UmbraKeyRegistration: p.createTable({
    id: p.string(),
    registrant: p.hex(),
    spendingPubKey: p.string(), // JSON string of uint256[2]
    viewingPubKey: p.string(), // JSON string of uint256[2]
    blockNumber: p.bigint(),
    timestamp: p.bigint(),
    transactionHash: p.hex(),
    network: p.string(),
  }),

  // FluidKey Score Token Balances (Base)
  FluidKeyBalance: p.createTable({
    id: p.string(), // address-chainId
    address: p.hex(),
    balance: p.string(),
    lastUpdated: p.bigint(),
    network: p.string(),
  }),

  // FluidKey Privacy Scores (Base)
  FluidKeyScore: p.createTable({
    id: p.string(), // address-chainId
    address: p.hex(),
    score: p.string(),
    lastUpdated: p.bigint(),
    network: p.string(),
  }),

  // Aggregated Privacy Metrics per Address
  PrivacyProfile: p.createTable({
    id: p.hex(), // address
    address: p.hex(),
    
    // ERC-5564 metrics
    announcementCount: p.int(),
    registrationCount: p.int(),
    
    // Umbra metrics
    umbraSendCount: p.int(),
    umbraWithdrawCount: p.int(),
    umbraKeyRegistrations: p.int(),
    
    // FluidKey metrics
    fluidKeyBalance: p.string(),
    fluidKeyScore: p.string(),
    
    // Overall privacy score (0-100)
    privacyScore: p.int(),
    
    // Last activity timestamp
    lastActivity: p.bigint(),
    
    // Networks active on
    networks: p.string(), // JSON array of network names
  }),
})); 