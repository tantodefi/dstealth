# Farcaster Integration Guide

## Overview

The dStealth Agent now supports Farcaster integration, allowing users to:
- Connect their Coinbase Wallet to their Farcaster identity
- Receive privacy rewards (0.001 USDC) directly to their Farcaster wallet
- Get personalized responses based on their Farcaster profile
- Access enhanced privacy features through social identity verification

## Architecture

The integration uses two main APIs:

### 1. Coinbase Wallet API
- **Endpoint**: `https://api.wallet.coinbase.com/rpc/v2/giftlink/fetchIdentityFromAddress`
- **Purpose**: Fetch Farcaster ID (FID) from wallet address
- **Authentication**: Requires signed message with private key

### 2. Neynar API
- **Base URL**: `https://api.neynar.com/v2`
- **Purpose**: Fetch Farcaster user data and send fungible tokens
- **Authentication**: API key based

## Setup Instructions

### Environment Variables

Add these to your `.env` file:

```env
# Farcaster Integration
COINBASE_API_PRIVATE_KEY=0x1234567890abcdef... # Your authorized private key
NEYNAR_API_KEY=your-neynar-api-key-here        # Get from https://neynar.com

# Neynar Send Fungibles Configuration (for rewards)
NEYNAR_SPONSOR_WALLET_ID=your-wallet-id-here   # Your Neynar sponsor wallet ID
NEYNAR_SPONSOR_ADDRESS=0x1234...               # Your Neynar sponsor wallet address
NEYNAR_SIGNER_UUID=your-signer-uuid-here       # Optional: Neynar signer UUID
```

### API Keys

1. **Coinbase API Private Key**: 
   - This should be a private key for a wallet address that's authorized to call the Coinbase API
   - The corresponding public address needs to be whitelisted by Coinbase

2. **Neynar API Key**:
   - Sign up at https://neynar.com
   - Get your API key from the dashboard
   - Required for both user data fetching and token sending

## User Flow

### 1. User Onboarding
1. User connects their Coinbase Wallet to XMTP
2. Agent automatically fetches their Farcaster context (if available)
3. Agent personalizes responses based on FC profile

### 2. Farcaster Profile Check
```
User: /fc
Agent: Shows Farcaster profile with stats, verification status, and reward options
```

### 3. Privacy Rewards
```
User: /rewards
Agent: Shows available privacy rewards dashboard

User: /send-rewards
Agent: Sends 0.001 USDC to user's Farcaster wallet
```

## New Agent Commands

### `/fc`
- Shows user's Farcaster profile
- Displays stats, verification status, and connected wallet
- Shows available reward options

### `/rewards`
- Shows privacy rewards dashboard
- Displays available rewards and earning opportunities
- Shows current FC connection status

### `/send-rewards`
- Sends 0.001 USDC rewards to user's Farcaster wallet
- Requires both fkey.id setup and Farcaster connection
- Uses Neynar API for token distribution

### `/search-followers`
- Analyzes your Farcaster followers for dStealth usage
- Shows which followers have set up fkey.id
- Provides privacy adoption statistics

### `/search`
- Enhanced search command with multiple capabilities:
  - `/search username` - Search for specific user
  - `/search` (no parameters) - Analyze your followers/following
  - Supports ENS, Base names, and Farcaster usernames

## Integration Points

### 1. Message Processing
- Agent fetches Farcaster context for each message sender
- Context is cached for 1 hour to avoid API limits
- Responses are personalized based on FC profile

### 2. Reward System
- Automatic rewards for privacy actions
- Direct token distribution to Farcaster wallets
- ZK receipt generation for reward transactions

### 3. Enhanced Responses
- Greetings include Farcaster username and verification badges
- OpenAI responses consider Farcaster context
- Fallback responses promote Farcaster connection

## API Integration Details

### Coinbase API Flow
```typescript
// 1. Generate timestamp and signature
const timestamp = Math.floor(Date.now() / 1000);
const signature = await wallet.signMessage(`${walletAddress}${timestamp}`);

// 2. Call API
const response = await fetch(COINBASE_API_ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    wallet_address: walletAddress,
    auth_signature: signature,
    timestamp_secs: timestamp
  })
});

// 3. Extract FID
const { fid, username, displayName, avatarUrl } = await response.json();
```

### Neynar API Flow
```typescript
// 1. Fetch user data
const userResponse = await fetch(`${NEYNAR_API_BASE}/farcaster/user/bulk?fids=${fid}`, {
  headers: { 'api_key': NEYNAR_API_KEY }
});

// 2. Send rewards
const sendResponse = await fetch(`${NEYNAR_API_BASE}/farcaster/fungibles/send`, {
  method: 'POST',
  headers: { 'api_key': NEYNAR_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fids: [fid],
    token_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC on Base
    amount: '0.001',
    chain_id: 8453,
    message: 'dStealth Privacy Rewards! 🥷'
  })
});
```

## Error Handling

The integration includes comprehensive error handling:

### Coinbase API Errors
- Invalid wallet address
- Unauthorized private key
- Rate limiting
- Network connectivity issues

### Neynar API Errors
- Invalid API key
- User not found
- Insufficient sponsor funds
- Token transfer failures

### Graceful Degradation
- Agent continues to function without Farcaster integration
- Missing API keys are handled gracefully
- Cached data is used when APIs are unavailable

## Security Considerations

### Private Key Security
- Store `COINBASE_API_PRIVATE_KEY` securely
- Use environment variables, never hard-code
- Rotate keys regularly
- Monitor for unauthorized usage

### API Key Management
- Protect `NEYNAR_API_KEY` access
- Monitor API usage and costs
- Set up rate limiting alerts
- Use separate keys for dev/production

### User Privacy
- Farcaster context is cached temporarily (1 hour)
- No persistent storage of social data
- Users can disconnect at any time
- Reward transactions are optional

## Testing

### Manual Testing
1. Set up environment variables
2. Connect a Coinbase Wallet with Farcaster
3. Test commands: `/fc`, `/rewards`, `/send-rewards`
4. Verify reward transactions on Base network

### Integration Testing
```bash
# Test Coinbase API
curl -X POST https://api.wallet.coinbase.com/rpc/v2/giftlink/fetchIdentityFromAddress \
  -H "Content-Type: application/json" \
  -d '{"wallet_address": "0x...", "auth_signature": "...", "timestamp_secs": ...}'

# Test Neynar API
curl -X GET https://api.neynar.com/v2/farcaster/user/bulk?fids=123 \
  -H "api_key: your-neynar-api-key"
```

## Monitoring

### Key Metrics
- Farcaster connection rate
- Reward distribution success rate
- API response times
- Error rates by API

### Logging
- All API calls are logged with timestamps
- Error responses include detailed information
- User interactions are tracked for analytics

## Future Enhancements

### Planned Features
1. **Custom ERC20 Token**: Replace USDC with dStealth token
2. **Reward Levels**: Tiered rewards based on privacy usage
3. **Social Features**: Farcaster-native sharing of payment links
4. **Analytics Dashboard**: User FC stats and reward history
5. **Batch Rewards**: Send rewards to multiple users at once

### Technical Improvements
1. **Webhook Integration**: Real-time FC updates
2. **GraphQL Support**: More efficient data fetching
3. **Caching Strategy**: Redis-based FC context caching
4. **Rate Limiting**: Intelligent API usage management

## Troubleshooting

### Common Issues

#### "No Farcaster Profile Found"
- User's wallet isn't connected to Farcaster
- Direct them to warpcast.com to connect

#### "Reward Send Failed"
- Check Neynar API key validity
- Verify sponsor wallet has sufficient funds
- Check network connectivity

#### "API Error: 401"
- Verify API keys are correct
- Check if keys have expired
- Ensure proper environment variable setup

### Debug Mode
Enable debug logging by setting:
```env
DEBUG=farcaster:*
```

## Support

For issues with the Farcaster integration:
1. Check the logs for API errors
2. Verify environment variables are set correctly
3. Test API endpoints directly with curl
4. Contact support with specific error messages

## Contributing

To contribute to the Farcaster integration:
1. Follow the existing code patterns
2. Add comprehensive error handling
3. Include tests for new features
4. Update this documentation
5. Submit pull requests with clear descriptions

---

*This integration enhances the dStealth Agent with social features while maintaining privacy and security as core principles.* 