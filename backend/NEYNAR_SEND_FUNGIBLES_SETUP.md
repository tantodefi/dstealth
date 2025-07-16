# Neynar Send Fungibles API Setup Guide

## CORRECTED: Understanding Your Neynar Credentials

You're absolutely right! After analyzing your credentials, the Neynar send fungibles API uses different parameters than initially documented:

**Your Credentials:**
- **Wallet ID**: `YOUR_NEYNAR_SPONSOR_WALLET_ID_HERE`
- **Public Address**: `0xYOUR_NEYNAR_SPONSOR_ADDRESS_HERE`

## Configuration Required

Add these variables to your `.env` file:

```bash
# Existing Farcaster API credentials
NEYNAR_API_KEY=your_neynar_api_key_here

# CORRECTED: Neynar Send Fungibles Configuration
NEYNAR_SPONSOR_WALLET_ID=YOUR_NEYNAR_SPONSOR_WALLET_ID_HERE
NEYNAR_SPONSOR_ADDRESS=0xYOUR_NEYNAR_SPONSOR_ADDRESS_HERE
```

### Variable Explanations:

1. **NEYNAR_SPONSOR_WALLET_ID**: 
   - This is your **wallet ID** (the unique identifier Neynar provided)
   - Format: Alphanumeric string (e.g., `uk8ybs3czhgfd47ilp2074re`)
   - This identifies your sponsored wallet in Neynar's system
   - **NOT a FID number** - it's a unique sponsor wallet identifier

2. **NEYNAR_SPONSOR_ADDRESS**:
   - This is your **Public Address** from Neynar
   - Format: Ethereum address starting with `0x`
   - This wallet must contain USDC on Base network to send rewards
   - The address that will actually hold/send the USDC tokens

## How It Works

The Neynar send fungibles API structure is:

```javascript
const requestPayload = {
  fids: [recipientFid],                           // Who receives the tokens
  token_address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC on Base
  amount: "0.001",                                // Amount in USDC
  chain_id: 8453,                                 // Base network
  sponsor_wallet_id: "YOUR_NEYNAR_SPONSOR_WALLET_ID_HERE",  // Your wallet ID
  message: "🎉 dStealth Privacy Rewards!"        // Message to recipient
};
```

## ⚠️ Important Security Note

**NEVER** commit real API keys or wallet credentials to version control. Always use:
- Environment variables for production
- Placeholder values in documentation
- `.env.example` files for configuration templates

## API Usage

The agent will use these credentials to:
1. Send USDC rewards to Farcaster users
2. Sponsor fungible token transfers
3. Provide privacy rewards for dStealth usage

### Required Configuration Steps:

1. 📝 **Get your Neynar credentials** from your Neynar dashboard
2. ✅ **Fund your wallet**: Send USDC to `0xYOUR_NEYNAR_SPONSOR_ADDRESS_HERE` on Base
3. 🔧 **Configure environment variables** in your `.env` file
4. 🧪 **Test the configuration** using the test script

## Testing

Run the test script to verify your configuration:

```bash
npx tsx backend/scripts/test-neynar-send-fungibles.ts
```

This will:
- ✅ Verify your API key is valid
- ✅ Check your wallet balance
- ✅ Test a small fungible transfer
- ✅ Confirm the integration works

## Troubleshooting

Common issues:
- **Invalid API key**: Check your Neynar dashboard
- **Insufficient balance**: Fund your sponsor wallet with USDC
- **Network errors**: Verify Base network connectivity
- **Wallet ID mismatch**: Ensure you're using the correct wallet ID format 