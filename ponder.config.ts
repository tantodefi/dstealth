import { createConfig } from "@ponder/core";
import { http } from "viem";

export default createConfig({
  networks: {
    mainnet: {
      chainId: 1,
      transport: http("https://mainnet.llamarpc.com"),
    },
    base: {
      chainId: 8453,
      transport: http("https://base.llamarpc.com"),
    },
    sepolia: {
      chainId: 11155111, 
      transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
    },
    baseSepolia: {
      chainId: 84532,
      transport: http("https://sepolia.base.org"),
    },
  },
  contracts: {
    // ERC-5564 Stealth Address Announcer
    StealthAnnouncer: {
      network: {
        mainnet: {
          address: "0x55649E01B5Df198D18D95b5cc5051630cfD45564",
          startBlock: 18884340, // Block when contract was deployed
        },
        sepolia: {
          address: "0x55649E01B5Df198D18D95b5cc5051630cfD45564", 
          startBlock: 4916000,
        },
      },
      abi: [
        {
          type: "event",
          name: "Announcement",
          inputs: [
            { name: "schemeId", type: "uint256", indexed: true },
            { name: "stealthAddress", type: "address", indexed: true },
            { name: "caller", type: "address", indexed: true },
            { name: "ephemeralPubKey", type: "bytes", indexed: false },
            { name: "metadata", type: "bytes", indexed: false }
          ]
        }
      ],
    },
    
    // ERC-6538 Stealth Key Registry
    StealthRegistry: {
      network: {
        mainnet: {
          address: "0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538",
          startBlock: 18884340,
        },
        sepolia: {
          address: "0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538",
          startBlock: 4916000,
        },
      },
      abi: [
        {
          type: "event", 
          name: "StealthMetaAddressSet",
          inputs: [
            { name: "registrant", type: "address", indexed: true },
            { name: "schemeId", type: "uint256", indexed: true },
            { name: "stealthMetaAddress", type: "bytes", indexed: false }
          ]
        }
      ],
    },

    // Umbra Protocol
    UmbraProtocol: {
      network: {
        mainnet: {
          address: "0xFb2dc580Eed955B528407b4d36FfaFe3da685401",
          startBlock: 11941000, // Umbra deployment block
        },
      },
      abi: [
        {
          type: "event",
          name: "Announcement", 
          inputs: [
            { name: "receiver", type: "address", indexed: true },
            { name: "amount", type: "uint256", indexed: false },
            { name: "token", type: "address", indexed: true },
            { name: "ephemeralPubKey", type: "uint256[2]", indexed: false },
            { name: "metadata", type: "bytes", indexed: false }
          ]
        },
        {
          type: "event",
          name: "TokenWithdrawal",
          inputs: [
            { name: "receiver", type: "address", indexed: true },
            { name: "acceptor", type: "address", indexed: true },
            { name: "token", type: "address", indexed: true },
            { name: "amount", type: "uint256", indexed: false },
            { name: "fee", type: "uint256", indexed: false }
          ]
        }
      ],
    },

    // Umbra Stealth Key Registry
    UmbraKeyRegistry: {
      network: {
        mainnet: {
          address: "0x31fe56609C65Cd0C510E7125f051D440424D38f3",
          startBlock: 11941000,
        },
      },
      abi: [
        {
          type: "event",
          name: "StealthKeyChanged",
          inputs: [
            { name: "registrant", type: "address", indexed: true },
            { name: "spendingPubKey", type: "uint256[2]", indexed: false },
            { name: "viewingPubKey", type: "uint256[2]", indexed: false }
          ]
        }
      ],
    },

    // FluidKey Score Contract (Base)
    FluidKeyScore: {
      network: {
        base: {
          address: "0x894c663757f6953544548EFA1aebc0846AC08bEa",
          startBlock: 0, // Start from beginning or specific deployment block
        },
      },
      abi: [
        {
          type: "event",
          name: "Transfer",
          inputs: [
            { name: "from", type: "address", indexed: true },
            { name: "to", type: "address", indexed: true },
            { name: "value", type: "uint256", indexed: false }
          ]
        },
        {
          type: "event", 
          name: "ScoreUpdated",
          inputs: [
            { name: "user", type: "address", indexed: true },
            { name: "newScore", type: "uint256", indexed: false },
            { name: "timestamp", type: "uint256", indexed: false }
          ]
        }
      ],
    },
  },
}); 