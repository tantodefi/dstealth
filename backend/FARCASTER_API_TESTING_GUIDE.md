# Farcaster API Testing Guide

## Analysis: Can Coinbase API go FID → CBW Wallet?

### **Short Answer: Yes, via Neynar! 🎉**

The **Coinbase API** only goes **one direction** (wallet → FID), but **Neynar API** can go **FID → wallet addresses**. Here's how:

## API Flow Analysis

### Current Implementation
```
Wallet Address → Coinbase API → FID → Neynar API → Full User Data
```

### Your Requested Flow (FID → CBW Wallet)
```
FID → Neynar API → User Data → Wallet Addresses
```

## Environment Variables Required

Add these to your `.env` file:

```bash
# Farcaster Integration
COINBASE_API_PRIVATE_KEY=your_private_key_here
NEYNAR_API_KEY=your_neynar_api_key_here
```

### How to Get These Keys:

1. **Coinbase API Private Key**: 
   - This is YOUR wallet's private key for signing API requests
   - The wallet must be authorized to use the Coinbase API
   - ⚠️ **Keep this secure** - it's your actual private key

2. **Neynar API Key**:
   - Sign up at [neynar.com](https://neynar.com)
   - Get your API key from the dashboard
   - Free tier available for testing

## Testing Your Changes

### 1. Quick Environment Check
```bash
# Run basic environment test
node backend/test-simple.js
```

### 2. Comprehensive Farcaster API Test
```bash
# Run the full Farcaster API test suite
npx tsx backend/scripts/test-farcaster-apis.ts
```

### 3. Test Neynar Send Fungibles
```bash
# Test the Neynar rewards system
npx tsx backend/scripts/test-neynar-send-fungibles.ts
```

### 4. Integration Test with dStealth Agent
```bash
# Test the full agent with Farcaster integration
npx tsx backend/scripts/test-agent-messaging.ts
```

## Test Data You'll Need

Update these values in `backend/scripts/test-farcaster-apis.ts`:

```typescript
// Test data - Replace with real values
const TEST_WALLET_ADDRESS = '0x9A95d67412360DE5c75C69579f5d5ef5ae791B23'; // A real wallet with FC
const TEST_FID = 1234; // A real FID for testing
```

### How to Find Test Data:

1. **Test Wallet Address**: Use any wallet that's connected to Farcaster
2. **Test FID**: 
   - Go to [warpcast.com](https://warpcast.com)
   - Find any user profile
   - The FID is in the URL: `warpcast.com/username` → look at profile data

## API Capabilities

### ✅ What Works Now:

1. **Wallet → FID** (Coinbase API)
   ```typescript
   const result = await fetchFIDFromWalletAddress(walletAddress);
   // Returns: { fid, username, displayName, avatarUrl }
   ```

2. **FID → Wallet Addresses** (Neynar API)
   ```typescript
   const result = await getCBWWalletsFromFID(fid);
   // Returns: { custodyAddress, verifiedAddresses[], allWallets[] }
   ```

3. **Round-trip**: Wallet → FID → All Wallet Addresses
   ```typescript
   const coinbaseData = await fetchFIDFromWalletAddress(wallet);
   const walletData = await getCBWWalletsFromFID(coinbaseData.fid);
   ```

## New Method Added

I've added a new method to the dStealth agent:

```typescript
/**
 * Get CBW wallet addresses directly from FID (your requested flow)
 */
private async getCBWWalletsFromFID(fid: number): Promise<{
  custodyAddress: string;
  verifiedAddresses: string[];
  allWallets: string[];
  error?: string;
}> {
  // Implementation uses Neynar API to get all wallet addresses for a FID
}
```

## Expected Test Results

### Successful Test Output:
```
🧪 Testing Coinbase API: Wallet → FID
✅ Coinbase API Response:
   FID: 1234
   Username: tantodefi
   Display Name: Tanto DeFi
   Avatar: https://...

🧪 Testing Neynar API: FID → Wallet Addresses
✅ Neynar API Response:
   FID: 1234
   Username: @tantodefi
   Custody Address: 0x123...
   Verified Addresses: 2
   📍 Verified Addresses:
     1. 0x123...
     2. 0x456...

🎯 Testing FID → CBW Wallet (Your Requested Flow)
🎉 Success! FID 1234 has 3 wallet addresses:
   1. 0x123... (custody)
   2. 0x456... (verified)
   3. 0x789... (verified)
```

## Common Issues & Solutions

### 1. **"COINBASE_API_PRIVATE_KEY not configured"**
- Add your private key to `.env`
- Make sure it's the full private key (starts with `0x`)

### 2. **"NEYNAR_API_KEY not configured"**
- Sign up at neynar.com
- Get your API key and add to `.env`

### 3. **"HTTP 401: Unauthorized"**
- Your private key might not be authorized for Coinbase API
- Or your Neynar API key is invalid

### 4. **"No user data found"**
- The FID might not exist
- The wallet might not be connected to Farcaster
- Try with a different test FID

## Integration with dStealth Agent

The FID → wallet flow is now integrated into the dStealth agent:

1. **Social Discovery**: Find users by FID, get their wallet addresses
2. **Reverse Lookup**: Given a FID, find all associated CBW addresses
3. **Enhanced Context**: More comprehensive user data for privacy features

## Next Steps

1. **Set up environment variables**
2. **Run tests with real data**
3. **Test the integration in the live agent**
4. **Monitor API usage and rate limits**

---

## Summary

✅ **Yes, you can go FID → CBW Wallet via Neynar API!**

The Coinbase API only goes wallet → FID, but Neynar API provides the reverse: FID → wallet addresses (both custody and verified addresses).

Your requested flow is **fully supported** and **already implemented** in the dStealth agent! 🎉 