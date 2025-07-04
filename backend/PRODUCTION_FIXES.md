# Production Stability Fixes for XMTP Agent

## Critical Issues Identified

Based on the production logs, the main issues causing crashes are:

1. **Too Aggressive Stream Monitoring** - Stream restarts every 10 minutes
2. **Excessive Sync Operations** - Conversation sync every 30 seconds  
3. **Memory Leaks** - Processed message sets growing indefinitely
4. **Multiple Health Check Conflicts** - Overlapping monitoring systems
5. **Log Spam** - Too much verbose logging in production

## Required Fixes

### 1. Reduce Sync Frequency in `dstealth-agent.ts`

**Current Problem:**
```typescript
}, 30000); // Every 30 seconds
```

**Fix:**
```typescript
}, 5 * 60 * 1000); // Every 5 minutes instead of 30 seconds
```

### 2. Increase Stream Stall Timeout

**Current Problem:**
```typescript
const staleStreamTimeout = 10 * 60 * 1000; // 10 minutes
```

**Fix:**
```typescript
const staleStreamTimeout = 30 * 60 * 1000); // 30 minutes instead of 10
```

### 3. Reduce Health Check Frequency

**Current Problem:**
```typescript
}, 60000); // Check every minute
```

**Fix:**
```typescript
}, 10 * 60 * 1000); // Check every 10 minutes instead of 1 minute
```

### 4. Reduce Activity Monitor Frequency

**Current Problem:**
```typescript
if (timeSinceLastMessage > 300000) { // 5 minutes
  console.log('⚠️ No messages received in 5 minutes - stream may be stalled');
}
}, 60000);
```

**Fix:**
```typescript
if (timeSinceLastMessage > 15 * 60 * 1000) { // 15 minutes
  console.log('⚠️ No messages received in 15 minutes - stream may be stalled');
}
}, 5 * 60 * 1000); // Check every 5 minutes instead of 1 minute
```

### 5. Implement Proper Memory Management

**Add to processed message cleanup:**
```typescript
// Clean up processed messages more aggressively
if (this.processedMessages.size > 500) { // Reduced from 1000
  const oldestMessages = Array.from(this.processedMessages).slice(0, 250);
  oldestMessages.forEach(id => this.processedMessages.delete(id));
  console.log(`🧹 Cleaned up ${oldestMessages.length} old processed messages`);
}
```

### 6. Add Circuit Breaker for Stream Restarts

**Add restart limiting:**
```typescript
private streamRestartCount = 0;
private lastStreamRestart = 0;
private readonly MAX_STREAM_RESTARTS_PER_HOUR = 3;

// Before restarting stream:
const now = Date.now();
const timeSinceLastRestart = now - this.lastStreamRestart;

if (timeSinceLastRestart < 60 * 60 * 1000) { // Within 1 hour
  if (this.streamRestartCount >= this.MAX_STREAM_RESTARTS_PER_HOUR) {
    console.log('🚨 Too many stream restarts in last hour - entering backoff mode');
    return; // Skip restart
  }
} else {
  this.streamRestartCount = 0; // Reset counter after 1 hour
}

this.streamRestartCount++;
this.lastStreamRestart = now;
```

### 7. Reduce Log Verbosity in Production

**Environment-based logging:**
```typescript
const isProduction = process.env.NODE_ENV === 'production';

// Replace verbose logs with:
if (!isProduction) {
  console.log('📨 RAW STREAM MESSAGE:', messageDetails);
}

// Or use log levels:
const logLevel = isProduction ? 'error' : 'debug';
```

### 8. Add Graceful Degradation

**Handle XMTP failures gracefully:**
```typescript
// In startListening method:
try {
  stream = await this.client.conversations.streamAllMessages();
} catch (streamError) {
  console.error('❌ Failed to create message stream - entering polling mode');
  this.fallbackToPollingMode();
  return;
}

private async fallbackToPollingMode(): Promise<void> {
  console.log('🔄 Entering polling mode as fallback...');
  
  const pollInterval = setInterval(async () => {
    if (this.isShuttingDown) {
      clearInterval(pollInterval);
      return;
    }
    
    try {
      await this.client?.conversations.sync();
      // Check for new messages in conversations
      // Process any new messages found
    } catch (pollError) {
      console.warn('⚠️ Polling sync failed:', pollError);
    }
  }, 2 * 60 * 1000); // Poll every 2 minutes
}
```

## Implementation Priority

1. **High Priority** - Sync frequency and stream timeout fixes
2. **Medium Priority** - Memory management and logging improvements  
3. **Low Priority** - Circuit breaker and graceful degradation

## Deployment Steps

1. Apply sync frequency fixes first
2. Monitor for 24 hours to confirm stability improvement
3. Apply remaining fixes incrementally
4. Add comprehensive monitoring and alerting

## Monitoring Recommendations

- Add memory usage tracking
- Monitor restart frequency
- Track message processing rates
- Alert on consecutive failures

This should resolve the production stability issues and prevent the frequent crashes. 