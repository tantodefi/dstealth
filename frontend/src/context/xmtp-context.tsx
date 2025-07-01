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
import { NotificationClient } from "@/lib/notification-client";

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
  clearErrorAndRetry: () => void;
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
  clearErrorAndRetry: () => {},
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

  // Initialize notification client
  const notificationClient = useMemo(() => NotificationClient.getInstance(), []);

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

  // Helper function to create user record in Redis
  const createUserRecord = useCallback(async (client: Client, userAddress?: string) => {
    try {
      const inboxId = client.inboxId;
      const effectiveAddress = userAddress || address;
      
      if (!effectiveAddress || !inboxId) {
        console.log("No address or inbox ID available for user record creation");
        return;
      }

      console.log("Creating user record in Redis:", { inboxId, address: effectiveAddress });

      // 🎯 CRITICAL FIX: Store user data in localStorage database first
      try {
        const { database } = await import('@/lib/database');
        await database.createOrUpdateUser({
          address: effectiveAddress,
          xmtpId: inboxId,
          createdAt: new Date().toISOString(),
        });
        console.log("✅ User data stored in localStorage database");
      } catch (error) {
        console.error("❌ Failed to store user data in localStorage:", error);
      }

      // Add user to notifications system with proper error handling
      try {
      await notificationClient.addUserToNotifications(inboxId, undefined);
      } catch (error) {
        console.warn("Failed to add user to notifications (Redis may not be configured):", error);
      }

      // Set default preferences with error handling
      try {
      await notificationClient.setUserPreferences({
        userId: inboxId,
        enableMilestones: true,
        enablePayments: true,
        enableSocial: true,
        enableFKSRewards: true,
          lastNotificationTime: new Date().toISOString(),
          farcaster: false,
          achievements: false,
          fkey: false,
          payments: false,
          weekly: false,
          tokens: false,
          stealth: false,
        });
      } catch (error) {
        console.warn("Failed to set user preferences (Redis may not be configured):", error);
      }

      // Store user activity stats for stats dashboard with error handling
      try {
      await notificationClient.cacheUserStats(inboxId, {
        totalLinks: 0,
        totalPurchases: 0,
        totalRevenue: 0,
        joinedAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        xmtpAddress: effectiveAddress,
        connectionType: connectionType || 'unknown'
      });
      } catch (error) {
        console.warn("Failed to cache user stats (Redis may not be configured):", error);
      }

      // Store in localStorage for quick access
      try {
        localStorage.setItem('user:lastLogin', new Date().toISOString());
        localStorage.setItem('user:inboxId', inboxId);
        localStorage.setItem('user:address', effectiveAddress);
        localStorage.setItem('user:connectionType', connectionType || 'unknown');
        
        // Update session tracking
        localStorage.setItem('session:started', new Date().toISOString());
      } catch (storageError) {
        console.warn("Could not update localStorage:", storageError);
      }

      console.log("✅ User record created successfully");
      
    } catch (error) {
      console.error("❌ Failed to create user record:", error);
      // Don't throw - continue even if user record creation fails
    }
  }, [address, connectionType, notificationClient]);

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
              // Check if it's a smart wallet
              const isSmartWallet = connector?.id === "coinbaseWalletSDK" && 
                (requestedConnectionType === "scw");
              
              if (isSmartWallet) {
                logger.log("Creating Smart Contract Wallet signer for Coinbase");
                xmtpSigner = createSCWSigner(
                  address as `0x${string}`,
                  async ({ message }) => {
                    try {
                      const signature = await signMessageAsync({ 
                        message, 
                        account: address as `0x${string}` 
                      });
                      logger.log("Smart Contract Wallet signature received:", signature);
                      return signature;
                    } catch (error) {
                      logger.error("Error getting SCW signature:", error);
                      throw error;
                    }
                  },
                  BigInt(8453) // Base mainnet
                );
              } else {
                logger.log("Creating EOA signer for Coinbase Wallet");
                xmtpSigner = createEOASigner(address as `0x${string}`, async ({ message }) => {
                  return await signMessageAsync({ 
                    message, 
                    account: address as `0x${string}` 
                  });
                });
              }
            } else if (forceSCW || connector?.id === "safe" || requestedConnectionType === "scw") {
              logger.log("Using Smart Contract Wallet signer");
              xmtpSigner = createSCWSigner(
                address as `0x${string}`,
                async ({ message }) => {
                  return await signMessageAsync({ 
                    message, 
                    account: address as `0x${string}` 
                  });
                },
                BigInt(8453) // Base mainnet
              );
            } else {
              logger.log("Using EOA signer");
              xmtpSigner = createEOASigner(address as `0x${string}`, async ({ message }) => {
                return await signMessageAsync({ 
                  message, 
                  account: address as `0x${string}` 
                });
              });
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

            // 🎯 NEW: Create user record in Redis
            await createUserRecord(newClient, address || undefined);
            
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
          } else if (error.message?.includes('Signature validation failed') ||
                     error.message?.includes('signature validation') ||
                     error.message?.includes('invalid signature')) {
            logger.log("Signature validation failed - likely SCW cache issue, blocking retries");
            // Block retries for signature validation failures to prevent loops
            storage.set(STORAGE_KEYS.INITIALIZATION_BLOCKED, Date.now().toString());
            if (mountedRef.current) {
              setError(new Error("Signature validation failed. Please use the disconnect button to reset your connection."));
            }
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
    [address, connector?.id, client, signMessageAsync, forceSCW, createUserRecord]
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

  /**
   * Clear error state and allow retry
   */
  const clearErrorAndRetry = useCallback(() => {
    logger.log("Clearing error state and allowing retry");
    
    // Clear error state
    setError(null);
    
    // Clear initialization block
    storage.remove(STORAGE_KEYS.INITIALIZATION_BLOCKED);
    
    // Reset global state
    globalInitializing = false;
    globalInitializationPromise = null;
    
    // Reset initialization attempted flag
    initializationAttempted.current = false;
    
    // Clear connection type to force fresh detection
    storage.remove(STORAGE_KEYS.CONNECTION_TYPE);
    setConnectionType("");
    
    logger.log("Error state cleared, ready for retry");
  }, []);

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
      const signer = createEphemeralSigner(ephemeralKey as `0x${string}`);
      
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
        connectionType: savedConnectionType, // Use the saved connection type directly
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
      clearErrorAndRetry,
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
      clearErrorAndRetry,
    ],
  );

  return <XMTPContext.Provider value={value}>{children}</XMTPContext.Provider>;
};

export const useXMTP = () => useContext(XMTPContext);
