# 🥷 Robust Stealth Address Monitoring System

## Overview

A comprehensive background service that monitors stealth address transactions across multiple blockchains and notifies users in real-time. The system is designed to be **robust**, **non-spammy**, and **forward-operating** (focuses on new transactions rather than historical data).

## 🏗️ Architecture

### Core Components

1. **StealthMonitorService** (`backend/src/services/stealth-monitor.ts`)
   - Background blockchain scanner
   - Real-time event processing
   - User notification management
   - Rate limiting and spam prevention

2. **AgentDatabase** (`backend/src/lib/agent-database.ts`)
   - User preferences storage
   - Notification tracking
   - Stealth key management

3. **Frontend Integration** (`frontend/src/components/StealthScanner.tsx`)
   - User registration interface
   - Monitoring controls
   - Status indicators

## 🔍 Monitoring Features

### **Real-time Scanning**
- **ERC-5564 Announcer** - Detects stealth payment announcements
- **ERC-6538 Registry** - Monitors stealth address registrations
- **Multi-chain Support** - Mainnet, Base, Sepolia, Base Sepolia
- **Block-by-block Processing** - 15-second scan intervals

### **Smart Filtering**
```typescript
// Only notify if:
- User has notifications enabled for this event type
- Event involves user's address or scan keys
- Rate limits are respected (max 10/hour, min 5min interval)
- Event hasn't been processed before
```

### **Forward-Operating Design**
- Starts scanning from recent blocks (not historical)
- Maintains last processed block per chain
- Focuses on new transactions only
- Efficient event deduplication

## 🔔 Notification System

### **Notification Types**
- **💰 Stealth Payment Received** - User received a stealth payment
- **📤 Stealth Payment Sent** - User sent a stealth payment
- **🔐 Stealth Address Registered** - New stealth meta-address registered
- **🔍 Scan Complete** - Manual scan finished

### **Anti-Spam Features**
- **Rate Limiting**: Max 10 notifications per hour per user
- **Minimum Interval**: 5 minutes between notifications
- **Relevance Filtering**: Only events involving user's addresses
- **Deduplication**: Same event never processed twice

### **Delivery Channels**
- Frontend notifications
- Webhook delivery
- Future: Farcaster, email, SMS

## 🚀 Usage

### **User Registration**
```typescript
// Register for stealth notifications
await fetch('/api/stealth/register', {
  method: 'POST',
  body: JSON.stringify({
    userId: userAddress,
    address: userAddress,
    notificationPrefs: {
      stealthEnabled: true,
      stealthPayments: true,
      stealthRegistrations: true,
      stealthAnnouncements: true
    },
    stealthScanKeys: [scanKey]
  })
});
```

### **Check Status**
```typescript
// Check if user has monitoring enabled
const response = await fetch(`/api/stealth/status?userId=${userAddress}`);
const { monitoring, preferences, lastNotification } = await response.json();
```

### **Unregister**
```typescript
// Stop stealth monitoring
await fetch('/api/stealth/unregister', {
  method: 'POST',
  body: JSON.stringify({ userId: userAddress })
});
```

## 🔧 Configuration

### **Environment Variables**
```bash
UPSTASH_REDIS_REST_URL=     # Redis for state storage
UPSTASH_REDIS_REST_TOKEN=   # Redis authentication
NOTIFICATION_SECRET=        # Webhook authentication
NEXT_PUBLIC_URL=           # Frontend URL for links
```

### **Rate Limiting Settings**
```typescript
const SETTINGS = {
  MAX_NOTIFICATIONS_PER_HOUR: 10,    // Max notifications per user per hour
  MIN_NOTIFICATION_INTERVAL: 300000, // 5 minutes between notifications
  BLOCK_SCAN_INTERVAL: 15000,       // 15 seconds between scans
  USER_REFRESH_INTERVAL: 300000     // 5 minutes to refresh user list
};
```

## 📊 Monitoring Dashboard

### **Service Health**
- ✅ Active user count
- 📈 Events processed per hour
- 🔍 Last block scanned per chain
- 📤 Notifications sent today

### **Performance Metrics**
- **Scan Latency** - Time from block creation to processing
- **Event Detection** - Number of stealth events found
- **Notification Delivery** - Success/failure rates
- **Error Tracking** - Failed scans, network issues

## 🛡️ Security & Privacy

### **Privacy Protection**
- **No Private Key Storage** - Only scan keys stored
- **Address Privacy** - Scan keys are hashed
- **Rate Limited Access** - Prevents enumeration attacks
- **Secure Communications** - All API calls authenticated

### **Data Retention**
- **User Preferences**: 30 days
- **Notification History**: 24 hours  
- **Scan State**: 24 hours
- **Error Logs**: 7 days

## 🔄 Operational Flow

### **Startup Sequence**
1. Initialize Redis connection
2. Load last processed blocks
3. Refresh monitored users list
4. Start blockchain scanning loops
5. Start user refresh loop

### **Event Processing**
1. **Scan** - Query blockchain for new events
2. **Filter** - Check event relevance to users
3. **Validate** - Apply rate limits and preferences
4. **Notify** - Send notifications via configured channels
5. **Track** - Update user notification timestamps

### **Error Recovery**
- **Network Failures** - Automatic retry with exponential backoff
- **RPC Timeouts** - Switch to backup RPC endpoints
- **Redis Outages** - Continue with in-memory state
- **Notification Failures** - Queue for retry

## 📝 Deployment

### **Backend Service**
```bash
# Start the stealth monitor service
yarn start

# Service automatically starts with the backend
# Look for: "🥷 Starting stealth transaction monitoring service..."
```

### **Frontend Integration**
```typescript
// Component automatically registers/unregisters users
// See: frontend/src/components/StealthScanner.tsx
// Features: Start/Stop monitoring buttons, status indicators
```

### **Health Checks**
```bash
# Check service health
curl http://localhost:3001/health

# Check specific user status  
curl http://localhost:3001/api/stealth/status?userId=0xAddress
```

## 🎯 Benefits

### **For Users**
- **🔔 Real-time Alerts** - Instant notifications for stealth activity
- **🛡️ Privacy Focused** - No compromise on stealth address privacy
- **📱 Multi-channel** - Notifications delivered where you want them
- **⚙️ Configurable** - Control what notifications you receive

### **For Developers**
- **🚀 Scalable** - Handles hundreds of users efficiently
- **🔧 Extensible** - Easy to add new notification channels
- **📊 Observable** - Comprehensive logging and metrics
- **🛡️ Robust** - Handles network failures gracefully

### **For Privacy**
- **🥷 Non-intrusive** - Respects stealth address privacy principles
- **🔐 Secure** - No private data exposure
- **📍 Targeted** - Only relevant notifications sent
- **⏰ Respectful** - Smart rate limiting prevents spam

---

## 🚀 Production Ready

This system is designed for production use with:
- ✅ Error handling and recovery
- ✅ Rate limiting and spam prevention  
- ✅ Multi-chain support
- ✅ Scalable architecture
- ✅ Privacy-first design
- ✅ Comprehensive logging
- ✅ Health monitoring
- ✅ Graceful degradation

**The stealth monitoring service automatically starts with your backend and begins monitoring for users who have registered for notifications!** 🥷🔔 