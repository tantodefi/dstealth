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
  useRef,
} from "react";
import { useAccount, useSignMessage } from "wagmi";
import { createEOASigner, createSCWSigner, createEphemeralSigner } from "@/lib/xmtp";
import { env as envConfig } from "@/lib/env";
import { useFrame } from "./frame-context";

// Type definitions
export type InitializeClientOptions = {
  dbEncryptionKey?: Uint8Array;
  env?: ClientOptions["env"];
  loggingLevel?: ClientOptions["loggingLevel"];
  signer?: Signer;
  connectionType?: string;
  skipAutoInit?: boolean;
};

export type XMTPContextValue = {
  client?: Client;
  setClient: React.Dispatch<React.SetStateAction<Client | undefined>>;
  initialize: (options: InitializeClientOptions) => Promise<Client | undefined>;
  initializing: boolean;
  error: Error | null;
  disconnect: () => void;
  conversations: Conversation<any>[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation<any>[]>>;
  groupConversation: Group | null;
  setGroupConversation: React.Dispatch<React.SetStateAction<Group | null>>;
  connectionType: string;
  isInFarcasterContext: boolean;
  farcasterUser: any;
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
  FARCASTER_AUTO_CONNECTED: "xmtp:farcasterAutoConnected",
  INITIALIZATION_BLOCKED: "xmtp:initBlocked",
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
  connectionType: "",
  isInFarcasterContext: false,
  farcasterUser: null,
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
  get: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      logger.error(`Failed to get localStorage item: ${key}`, e);
      return null;
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
      // Clear all xmtp: prefixed items
      const keysToRemove = Object.values(STORAGE_KEYS);
      keysToRemove.forEach(key => storage.remove(key));

      // Clear any other xmtp. prefixed items
      let removedCount = 0;
      for (let i = localStorage.length - 1; i >= 0; i--) {
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

// Global initialization state to prevent multiple simultaneous attempts
let globalInitializing = false;
let globalInitializationPromise: Promise<Client | undefined> | null = null;

export const XMTPProvider: React.FC<XMTPProviderProps> = ({
  children,
  client: initialClient,
}) => {
  const { address, connector } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { context, isInMiniApp, isSDKLoaded } = useFrame();
  
  // State
  const [client, setClient] = useState<Client | undefined>(initialClient);
  const [conversations, setConversations] = useState<Conversation<any>[]>([]);
  const [groupConversation, setGroupConversation] = useState<Group | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [connectionType, setConnectionType] = useState<string>("");
  const [farcasterUser, setFarcasterUser] = useState<any>(null);
  
  // Refs to prevent loops and track state
  const initializationAttempted = useRef(false);
  const mountedRef = useRef(true);
  const lastAddressRef = useRef<string>("");
  
  // Derived state
  const isInFarcasterContext = isInMiniApp && !!context;

  const [forceSCW, setForceSCW] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.FORCE_SCW) === "true";
    } catch {
      return false;
    }
  });

  // Load connection type from storage on mount
  useEffect(() => {
    const savedConnectionType = storage.get(STORAGE_KEYS.CONNECTION_TYPE);
    if (savedConnectionType) {
      setConnectionType(savedConnectionType);
    }
  }, []);

  // Handle Farcaster context changes
  useEffect(() => {
    if (isSDKLoaded && context) {
      logger.log("Farcaster context detected", { context });
      setFarcasterUser(context.user);
      
      // Mark that we've detected Farcaster context
      storage.set(STORAGE_KEYS.FARCASTER_AUTO_CONNECTED, "true");
    }
  }, [context, isSDKLoaded]);

  // Debug logging on mount
  useEffect(() => {
    mountedRef.current = true;
    logger.log("Provider mounted", {
      hasInitialClient: !!initialClient,
      isInFarcasterContext,
      isSDKLoaded
    });
    return () => {
      mountedRef.current = false;
      logger.log("Provider unmounted");
      
      // Clean up global state on unmount
      if (globalInitializing) {
        globalInitializing = false;
        globalInitializationPromise = null;
      }
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
      connectionType: requestedConnectionType,
      skipAutoInit = false,
    }: InitializeClientOptions) => {
      logger.log("Initialize called with options", {
        hasDBEncryptionKey: !!dbEncryptionKey,
        env,
        loggingLevel,
        hasSigner: !!providedSigner,
        connectionType: requestedConnectionType,
        skipAutoInit,
        globalInitializing,
      });

      // Don't initialize if client exists
      if (client) {
        logger.log("Client already exists, returning existing client");
        return client;
      }

      // Don't proceed if already initializing (global check)
      if (globalInitializing && globalInitializationPromise) {
        logger.log("Global initialization in progress, waiting for completion");
        try {
          return await globalInitializationPromise;
        } catch (error) {
          logger.error("Global initialization failed:", error);
          return undefined;
        }
      }

      // Check for recent initialization block (to prevent rapid retries)
      const initBlocked = storage.get(STORAGE_KEYS.INITIALIZATION_BLOCKED);
      if (initBlocked) {
        const blockedTime = parseInt(initBlocked);
        const now = Date.now();
        if (now - blockedTime < 5000) { // 5 second cooldown
          logger.log("Initialization blocked due to recent failure, skipping");
          return undefined;
        } else {
          storage.remove(STORAGE_KEYS.INITIALIZATION_BLOCKED);
        }
      }

      // Set global initialization state
      globalInitializing = true;
      setInitializing(true);
      setError(null);
      initializationAttempted.current = true;

      const initPromise = (async () => {
        try {
          let xmtpSigner = providedSigner;
          const isEphemeral = requestedConnectionType === "ephemeral";
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
              storage.set(STORAGE_KEYS.EPHEMERAL_KEY, `0x${privateKey}`);
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
          if (requestedConnectionType) {
            setConnectionType(requestedConnectionType);
            storage.set(STORAGE_KEYS.CONNECTION_TYPE, requestedConnectionType);
          }

          // Create XMTP client with proper error handling for database conflicts
          logger.log("Creating XMTP client...");
          const newClient = await Client.create(xmtpSigner, {
            env: env || envConfig.NEXT_PUBLIC_XMTP_ENV,
            dbEncryptionKey,
            loggingLevel,
          });

          // Only set client if component is still mounted
          if (mountedRef.current) {
            logger.log("XMTP client created successfully");
            setClient(newClient);
            
            // Mark as successfully connected
            storage.set(STORAGE_KEYS.HAS_CONNECTED, 'true');
            
            // Update last connected address
            if (address) {
              lastAddressRef.current = address;
            }
            
            return newClient;
          } else {
            logger.log("Component unmounted during initialization, cleaning up client");
            newClient.close();
            return undefined;
          }
        } catch (e) {
          const error = e as Error;
          logger.error("Error initializing XMTP client:", error);
          
          // Handle database access conflicts
          if (error.message?.includes('createSyncAccessHandle') || 
              error.message?.includes('NoModificationAllowedError')) {
            logger.log("Database access conflict detected, blocking retries temporarily");
            storage.set(STORAGE_KEYS.INITIALIZATION_BLOCKED, Date.now().toString());
          }
          
          // Check for specific error types that shouldn't trigger retries
          if (error.message?.includes('rejected due to a change in selected network') ||
              error.message?.includes('User rejected') ||
              error.message?.includes('User denied')) {
            logger.log("User-related error, not setting permanent error state");
            // Don't set permanent error state for user rejections
          } else {
            if (mountedRef.current) {
              setError(error);
            }
          }
          
          throw error;
        } finally {
          globalInitializing = false;
          globalInitializationPromise = null;
          if (mountedRef.current) {
            setInitializing(false);
          }
        }
      })();

      globalInitializationPromise = initPromise;
      return initPromise;
    },
    [address, connector?.id, client, signMessageAsync, forceSCW]
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
      
      // Reset state
      setConnectionType("");
      initializationAttempted.current = false;
      lastAddressRef.current = "";
      
      // Clear global state
      globalInitializing = false;
      globalInitializationPromise = null;
    } else {
      logger.log("No client to disconnect");
    }
  }, [client]);

  // Restore connection on mount - improved logic with better loop prevention
  useEffect(() => {
    // Prevent multiple restoration attempts
    if (initializationAttempted.current || !mountedRef.current) {
      return;
    }

    const savedConnectionType = storage.get(STORAGE_KEYS.CONNECTION_TYPE);
    const hasConnected = storage.get(STORAGE_KEYS.HAS_CONNECTED);
    const ephemeralKey = storage.get(STORAGE_KEYS.EPHEMERAL_KEY);
    const farcasterAutoConnected = storage.get(STORAGE_KEYS.FARCASTER_AUTO_CONNECTED);
    
    // Check if there's already an error or global initialization to avoid retry loops
    if (error || globalInitializing) {
      logger.log("Error detected or global initialization in progress, not restoring connection:", { error, globalInitializing });
      return;
    }
    
    // Don't restore if client already exists
    if (client) {
      return;
    }

    // Track address changes to prevent unnecessary re-initialization
    if (address && address === lastAddressRef.current && savedConnectionType && savedConnectionType !== "ephemeral") {
      logger.log("Same address as last initialization, skipping restore");
      return;
    }

    // Priority 1: Check for Farcaster context and auto-connect if not done yet
    if (isInFarcasterContext && address && !farcasterAutoConnected && !savedConnectionType) {
      logger.log("Farcaster context detected - auto-connecting with EOA wallet", {
        address,
        context: !!context
      });
      
      setConnectionType("EOA Wallet");
      storage.set(STORAGE_KEYS.CONNECTION_TYPE, "EOA Wallet");
      
      // Auto-initialize with Farcaster wallet
      initialize({ 
        connectionType: "eoa",
        env: envConfig.NEXT_PUBLIC_XMTP_ENV
      }).catch((e) => {
        logger.log("Error auto-connecting with Farcaster wallet:", e);
      });
      
      return;
    }
    
    // Priority 2: Restore ephemeral connection
    if (ephemeralKey && savedConnectionType === "ephemeral" && !client && !globalInitializing) {
      logger.log("Attempting to restore ephemeral connection", { 
        savedConnectionType,
        hasConnected,
        hasEphemeralKey: !!ephemeralKey
      });
      
      setConnectionType("ephemeral");
      
      // Use the saved ephemeral key to create signer
      const signer = createEphemeralSigner(ephemeralKey);
      
      initialize({ 
        connectionType: "ephemeral",
        env: envConfig.NEXT_PUBLIC_XMTP_ENV,
        signer // Pass the signer directly
      }).then((client) => {
        if (client) {
          logger.log("Ephemeral connection restored successfully");
          // Force a re-render by updating connection type again
          setConnectionType("ephemeral");
        }
      }).catch((e) => {
        logger.log("Error restoring ephemeral connection:", e);
        // Clear ephemeral key if it's invalid
        storage.remove(STORAGE_KEYS.EPHEMERAL_KEY);
        storage.remove(STORAGE_KEYS.CONNECTION_TYPE);
        setConnectionType("");
      });
    } 
    // Priority 3: Restore EOA/SCW wallet connection if wallet is connected
    else if (address && savedConnectionType && savedConnectionType !== "ephemeral" && !client && !globalInitializing) {
      logger.log("Attempting to restore wallet connection", {
        address,
        savedConnectionType,
        hasConnected,
        lastAddress: lastAddressRef.current
      });
      
      setConnectionType(savedConnectionType);
      
      // Auto-initialize for previously connected wallets
      initialize({ 
        connectionType: savedConnectionType === "Coinbase Smart Wallet" ? "scw" : "eoa",
        env: envConfig.NEXT_PUBLIC_XMTP_ENV
      }).catch((e) => {
        logger.log("Error restoring wallet connection:", e);
      });
    }
  }, [client, address, initialize, error, isInFarcasterContext, context]);

  // Handle wallet disconnection
  useEffect(() => {
    if (!address && client && !storage.get(STORAGE_KEYS.EPHEMERAL_KEY)) {
      logger.log("Wallet disconnected and no ephemeral key, cleaning up XMTP client");
      disconnect();
    }
  }, [address, client, disconnect]);

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
      connectionType,
      isInFarcasterContext,
      farcasterUser,
    }),
    [
      client,
      initialize,
      initializing,
      error,
      disconnect,
      conversations,
      groupConversation,
      connectionType,
      isInFarcasterContext,
      farcasterUser,
    ],
  );

  return <XMTPContext.Provider value={value}>{children}</XMTPContext.Provider>;
};

export const useXMTP = () => useContext(XMTPContext);
