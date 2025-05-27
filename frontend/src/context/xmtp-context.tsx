import {
  Client,
  Conversation,
  Group,
  type ClientOptions,
  type Signer,
} from "@xmtp/browser-sdk";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAccount, useSignMessage } from "wagmi";
import { createEOASigner, createSCWSigner, createEphemeralSigner } from "@/lib/xmtp";

// Type definitions
export type InitializeClientOptions = {
  dbEncryptionKey?: Uint8Array;
  env?: ClientOptions["env"];
  loggingLevel?: ClientOptions["loggingLevel"];
  signer?: Signer;
  connectionType?: string;
};

export type XMTPContextValue = {
  client?: Client;
  setClient: React.Dispatch<React.SetStateAction<Client | undefined>>;
  initialize: (options: InitializeClientOptions) => Promise<Client | undefined>;
  initializing: boolean;
  error: Error | null;
  disconnect: () => void;
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  groupConversation: Group | null;
  setGroupConversation: React.Dispatch<React.SetStateAction<Group | null>>;
};

export type XMTPProviderProps = React.PropsWithChildren & {
  client?: Client;
};

// Storage keys
const STORAGE_KEYS = {
  HAS_CONNECTED: "xmtp:hasConnected",
  CONNECTION_TYPE: "xmtp:connectionType",
  ENCRYPTION_KEY: "xmtp:encryptionKey",
  FORCE_SCW: "xmtp:forceSCW",
  EPHEMERAL_KEY: "xmtp:ephemeralKey",
};

// Create context with default values
export const XMTPContext = createContext<XMTPContextValue>({
  setClient: () => {},
  initialize: () => Promise.reject(new Error("XMTPProvider not available")),
  initializing: false,
  error: null,
  disconnect: () => {},
  conversations: [],
  setConversations: () => {},
  groupConversation: null,
  setGroupConversation: () => {},
});

// Logger utility for consistent logging
const logger = {
  log: (message: string, data?: any) => {
    if (data) {
      console.log(`XMTP: ${message}`, data);
    } else {
      console.log(`XMTP: ${message}`);
    }
  },
  error: (message: string, error?: any) => {
    console.error(`XMTP Error: ${message}`, error);
  },
};

// Storage utility for safely interacting with localStorage
const storage = {
  set: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      logger.error(`Failed to set localStorage item: ${key}`, e);
      return false;
    }
  },
  remove: (key: string) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      logger.error(`Failed to remove localStorage item: ${key}`, e);
      return false;
    }
  },
  clearXMTPItems: () => {
    try {
      storage.remove(STORAGE_KEYS.HAS_CONNECTED);

      let removedCount = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("xmtp.")) {
          localStorage.removeItem(key);
          removedCount++;
        }
      }

      return removedCount;
    } catch (e) {
      logger.error("Failed to clear XMTP items", e);
      return 0;
    }
  },
};

export const XMTPProvider: React.FC<XMTPProviderProps> = ({
  children,
  client: initialClient,
}) => {
  const { address, connector } = useAccount();
  const { signMessageAsync } = useSignMessage();
  
  // State
  const [client, setClient] = useState<Client | undefined>(initialClient);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [groupConversation, setGroupConversation] = useState<Group | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [forceSCW, setForceSCW] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.FORCE_SCW) === "true";
    } catch {
      return false;
    }
  });

  // Debug logging on mount
  useEffect(() => {
    logger.log("Provider mounted");
    return () => {
      logger.log("Provider unmounted");
    };
  }, []);

  // Reset conversations when client changes
  useEffect(() => {
    logger.log("Client changed", { exists: !!client });
    if (!client) {
      setConversations([]);
      setGroupConversation(null);
    }
  }, [client]);

  const initialize = useCallback(
    async ({
      dbEncryptionKey,
      env,
      loggingLevel,
      signer: providedSigner,
      connectionType,
    }: InitializeClientOptions) => {
      logger.log("Initialize called with options", {
        hasDBEncryptionKey: !!dbEncryptionKey,
        env,
        loggingLevel,
        hasSigner: !!providedSigner,
        connectionType,
      });

      // Don't initialize if client exists
      if (client) {
        logger.log("Client already exists, returning existing client");
        return client;
      }

      // Don't proceed if already initializing
      if (initializing) {
        logger.log("XMTP client initialization already in progress");
        return undefined;
      }

      // Set initializing state
      setInitializing(true);
      setError(null);

      try {
        let xmtpSigner = providedSigner;
        const isEphemeral = connectionType === "ephemeral";
        const isCoinbaseWallet = connector?.id === "coinbaseWalletSDK";

        if (!xmtpSigner) {
          if (!address && !isEphemeral) {
            throw new Error("Please connect your wallet first");
          }

          if (isEphemeral) {
            logger.log("Creating ephemeral signer");
            // Generate a random private key for ephemeral connection
            const privateKeyBytes = new Uint8Array(32);
            crypto.getRandomValues(privateKeyBytes);
            const privateKey = Array.from(privateKeyBytes)
              .map(b => b.toString(16).padStart(2, '0'))
              .join('');
            xmtpSigner = createEphemeralSigner(`0x${privateKey}` as `0x${string}`);
            // Store the ephemeral key
            localStorage.setItem(STORAGE_KEYS.EPHEMERAL_KEY, `0x${privateKey}`);
          } else if (isCoinbaseWallet) {
            logger.log("Using Coinbase Wallet signer");
            xmtpSigner = createEOASigner(address as `0x${string}`, signMessageAsync);
          } else if (forceSCW || connector?.id === "safe") {
            logger.log("Using Smart Contract Wallet signer");
            xmtpSigner = createSCWSigner(
              address as `0x${string}`,
              signMessageAsync,
              BigInt(8453) // Base mainnet
            );
          } else {
            logger.log("Using EOA signer");
            xmtpSigner = createEOASigner(address as `0x${string}`, signMessageAsync);
          }
        }

        // Store connection type
        if (connectionType) {
          localStorage.setItem(STORAGE_KEYS.CONNECTION_TYPE, connectionType);
        }

        // Create XMTP client
        const newClient = await Client.create(xmtpSigner, {
          env: env || "production",
          dbEncryptionKey,
          loggingLevel,
        });

        logger.log("XMTP client created successfully");
        setClient(newClient);
        return newClient;
      } catch (e) {
        logger.error("Error initializing XMTP client:", e);
        setError(e as Error);
        throw e;
      } finally {
        setInitializing(false);
      }
    },
    [address, connector?.id, client, initializing, signMessageAsync, forceSCW]
  );

  /**
   * Disconnect the XMTP client
   */
  const disconnect = useCallback(() => {
    logger.log("Disconnect called");

    if (client) {
      logger.log("Closing client");
      client.close();

      logger.log("Setting client to undefined");
      setClient(undefined);
      setConversations([]);
      setGroupConversation(null);
      setError(null);

      // Clear XMTP storage
      const removedCount = storage.clearXMTPItems();
      logger.log(`Removed ${removedCount} XMTP-specific localStorage items`);
    } else {
      logger.log("No client to disconnect");
    }
  }, [client]);

  // Restore connection on mount if previously connected
  useEffect(() => {
    const connectionType = localStorage.getItem(STORAGE_KEYS.CONNECTION_TYPE);
    const hasConnected = localStorage.getItem(STORAGE_KEYS.HAS_CONNECTED);
    const ephemeralKey = localStorage.getItem(STORAGE_KEYS.EPHEMERAL_KEY);
    
    // Only attempt to initialize if wallet is connected or we have an ephemeral key
    if ((address || ephemeralKey) && !client && !initializing && !error) {
      logger.log("Attempting to initialize XMTP", { 
        connectionType,
        hasConnected,
        address,
        hasEphemeralKey: !!ephemeralKey
      });
      
      initialize({ 
        connectionType: ephemeralKey ? "ephemeral" : (connectionType || "eoa"),
        env: "production"
      }).catch((e) => {
        logger.error("Error initializing XMTP:", e);
      });
    }
  }, [client, initializing, error, address, initialize]);

  // Handle wallet disconnection
  useEffect(() => {
    if (!address && client && !localStorage.getItem(STORAGE_KEYS.EPHEMERAL_KEY)) {
      logger.log("Wallet disconnected and no ephemeral key, cleaning up XMTP client");
      disconnect();
    }
  }, [address, client, disconnect]);

  // Handle successful initialization
  useEffect(() => {
    if (client && address) {
      logger.log("XMTP initialized successfully", { address });
      localStorage.setItem(STORAGE_KEYS.HAS_CONNECTED, 'true');
    }
  }, [client, address]);

  // Create context value
  const value = useMemo<XMTPContextValue>(
    () => ({
      client,
      setClient,
      initialize,
      initializing,
      error,
      disconnect,
      conversations,
      setConversations,
      groupConversation,
      setGroupConversation,
    }),
    [
      client,
      initialize,
      initializing,
      error,
      disconnect,
      conversations,
      groupConversation,
    ],
  );

  return <XMTPContext.Provider value={value}>{children}</XMTPContext.Provider>;
};

export const useXMTP = () => useContext(XMTPContext);
