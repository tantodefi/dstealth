# 🚀 XMTP Mini App Deployment Guide

This guide covers deploying the XMTP mini app with:
- **Frontend**: Vercel 
- **Backend**: Render
- **Indexing**: Ponder.sh

## 📋 Prerequisites

- GitHub repository with your code
- Vercel account
- Render account  
- Railway account (recommended for Ponder.sh)
- Environment variables ready

## 🔧 **IMMEDIATE FIX: Missing Root Package.json**

**⚠️ FIRST STEP**: The root directory needs a package.json for Ponder. Create it:

### Create Root package.json
```bash
# In the root directory (/Users/rob/xmtp-mini-app-examples)
cat > package.json << 'EOF'
{
  "name": "xmtp-stealth-indexer",
  "version": "1.0.0",
  "description": "Ponder indexer for XMTP mini app stealth address protocols",
  "main": "src/index.ts",
  "scripts": {
    "dev": "ponder dev",
    "start": "ponder start",
    "build": "ponder build",
    "serve": "ponder serve",
    "codegen": "ponder codegen",
    "frontend:dev": "cd frontend && yarn dev",
    "frontend:build": "cd frontend && yarn build",
    "backend:dev": "cd backend && yarn dev",
    "backend:build": "cd backend && yarn build",
    "gen:keys": "node -e \"const crypto = require('crypto'); const wallet = crypto.randomBytes(32).toString('hex'); const encryption = crypto.randomBytes(32).toString('hex'); console.log('\\\\n# Generated keys for .env:\\\\nWALLET_KEY=0x' + wallet + '\\\\nENCRYPTION_KEY=' + encryption + '\\\\nXMTP_ENV=dev\\\\n# Public address: ' + require('viem').privateKeyToAddress('0x' + wallet));\""
  },
  "dependencies": {
    "@ponder/core": "^0.4.0",
    "viem": "^2.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF
```

### Install Ponder Dependencies
```bash
# In root directory
yarn install
```

## 🎯 Step 1: Deploy Backend to Render

### 1.1 Create New Web Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure service:
   - **Name**: `xmtp-mini-app-backend`
   - **Region**: Oregon (US West)
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: Node
   - **Build Command**: `yarn install && yarn build`
   - **Start Command**: `yarn start`

### 1.2 Environment Variables for Backend

Add these in Render's Environment tab:

```bash
# XMTP Configuration
WALLET_KEY=0x... # Generate with yarn gen:keys
ENCRYPTION_KEY=... # Generate with yarn gen:keys  
XMTP_ENV=dev # or production

# API Security
API_SECRET_KEY=your-secret-key

# Ponder Integration
PONDER_GRAPHQL_URL=https://your-ponder.railway.app/graphql

# Optional
BACKEND_URL=https://your-backend.onrender.com
```

## 🎯 Step 2: Deploy Ponder.sh Indexer to Railway

### 2.1 Create Railway Project

1. Go to [Railway Dashboard](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository
5. **Root Directory**: `/` (important!)

### 2.2 Railway Configuration

#### Build Command:
```bash
yarn install && yarn build
```

#### Start Command:
```bash
yarn start
```

#### Environment Variables:
```bash
# Database (Railway provides automatically)
DATABASE_URL=${{ Postgres.DATABASE_URL }}

# RPC URLs for blockchain access
PONDER_RPC_URL_1=https://mainnet.llamarpc.com
PONDER_RPC_URL_8453=https://base.llamarpc.com
PONDER_RPC_URL_11155111=https://sepolia.llamarpc.com
PONDER_RPC_URL_84532=https://base-sepolia.llamarpc.com

# Optional: Custom port
PORT=3000
```

### 2.3 Verify Ponder Deployment

After deployment, check:
- **GraphQL Endpoint**: `https://your-ponder.railway.app/graphql`
- **Health Check**: `https://your-ponder.railway.app/health`
- **Metrics**: `https://your-ponder.railway.app/metrics`

## 🎯 Step 3: Deploy Frontend to Vercel

### 3.1 Create Vercel Project

1. Go to [Vercel Dashboard](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`
   - **Build Command**: `yarn build`
   - **Output Directory**: `.next`

### 3.2 Environment Variables for Frontend

Add these in Vercel's Environment Variables:

```bash
# App Configuration
NEXT_PUBLIC_URL=https://your-app.vercel.app
NEXT_PUBLIC_BACKEND_URL=https://your-backend.onrender.com

# XMTP Configuration  
NEXT_PUBLIC_XMTP_ENV=dev # or production
BACKEND_URL=https://your-backend.onrender.com

# API Security
API_SECRET_KEY=your-secret-key

# Ponder Integration
PONDER_GRAPHQL_URL=https://your-ponder.railway.app/graphql
NEXT_PUBLIC_PONDER_URL=https://your-ponder.railway.app

# Farcaster Frame Configuration
NEXT_PUBLIC_FARCASTER_HEADER=your-header
NEXT_PUBLIC_FARCASTER_PAYLOAD=your-payload
NEXT_PUBLIC_FARCASTER_SIGNATURE=your-signature

# Optional: WalletConnect Project ID
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-project-id
```

## 🔗 Step 4: Connect Frontend to Ponder.sh

### 4.1 Update Frontend API Calls

The frontend will automatically use Ponder via the `/api/stealth/scan/[address]` endpoint which:

1. **Queries Ponder GraphQL** for indexed data
2. **Falls back to RPC** if Ponder unavailable  
3. **Caches responses** for performance
4. **Returns unified data** format

### 4.2 Verify Integration

Test the integration:

```bash
# Test Ponder directly
curl https://your-ponder.railway.app/graphql \\
  -H "Content-Type: application/json" \\
  -d '{"query":"{ stealthAnnouncements(first: 5) { id amount } }"}'

# Test via frontend API
curl https://your-app.vercel.app/api/stealth/scan/0x123...
```

## 🎯 Step 5: Update Payment Methods

### 5.1 DaimoPay (✅ Working)
- **Status**: ✅ **FIXED** - Uses Daimo deep links
- **Function**: Opens Daimo app or web interface
- **Mobile**: Direct app launch
- **Desktop**: Opens in new tab

### 5.2 Direct USDC (✅ Working)  
- **Status**: ✅ Working - Direct USDC transfers
- **Function**: Uses wagmi + viem for blockchain transactions
- **Networks**: Base, Base Sepolia
- **Auto-switches**: Automatically switches to correct network

### 5.3 MiniKit (✅ Working)
- **Status**: ✅ **FIXED** - Smart wallet integration  
- **Function**: Handles iframe/mini app environments
- **Fallback**: Uses direct wallet if not in mini app
- **PostMessage**: Uses parent communication for mini apps

## 🔍 Step 6: Farcaster Frame URLs

### 6.1 Frame URL Structure

X402 content creates multiple shareable URLs:

```typescript
// X402 Protocol URL
x402://your-app.vercel.app/content/abc123

// Farcaster Frame URL (for sharing)
https://your-app.vercel.app/x402/abc123

// Direct Viewer URL  
https://your-app.vercel.app/viewer?uri=x402://...
```

### 6.2 Frame Metadata Generation

Each Frame URL dynamically generates:
- **OpenGraph images** with pricing and content info
- **Interactive buttons** for payment and preview
- **Farcaster-specific tags** for proper frame rendering
- **X402 metadata** for protocol identification

## 🚀 Step 7: Final Testing

### 7.1 End-to-End Test Flow

1. **Create X402 URL** in frontend
2. **Share Frame URL** on Farcaster
3. **Verify Frame** shows payment button
4. **Test Payment** via Daimo/Direct/MiniKit
5. **Check Content** loads in viewer iframe

### 7.2 Monitoring & Debugging

#### Frontend Logs (Vercel)
```bash
# Check Vercel function logs
vercel logs your-app
```

#### Backend Logs (Render)
```bash  
# Check Render logs in dashboard
# Look for XMTP connection and API calls
```

#### Ponder Logs (Railway)
```bash
# Check Railway logs in dashboard
# Look for blockchain indexing progress
```

## 🎯 Step 8: Profile URLs and fkey.id

### 8.1 Profile URL Structure

After deployment, users get profiles at:
```
https://your-app.vercel.app/u/0x123...
```

### 8.2 fkey.id Claiming

Users can claim their fkey.id at:
```
https://your-app.vercel.app/fkey/claim
```

This links their wallet to a memorable identifier like `alice.fkey.id`.

## ⚠️ Troubleshooting

### Frontend Issues
- **React Errors**: Clear `.next` cache, restart dev server
- **Import Errors**: Check all dependencies are installed
- **Wallet Issues**: Verify network configuration

### Backend Issues  
- **XMTP Connection**: Check wallet key and encryption key
- **API Errors**: Verify API secret key matches
- **Network Issues**: Check RPC endpoints

### Ponder Issues
- **No Data**: Check blockchain RPC connections
- **GraphQL Errors**: Verify Ponder schema matches queries
- **Sync Issues**: Check contract addresses and start blocks

## 📊 Environment Variables Summary

| Service | Required Variables | Purpose |
|---------|-------------------|---------|
| **Frontend** | `NEXT_PUBLIC_URL`, `NEXT_PUBLIC_BACKEND_URL`, `PONDER_GRAPHQL_URL` | App URLs and API endpoints |
| **Backend** | `WALLET_KEY`, `ENCRYPTION_KEY`, `API_SECRET_KEY` | XMTP auth and security |
| **Ponder** | `DATABASE_URL`, `PONDER_RPC_URL_*` | Database and blockchain access |

## 🎉 Success Criteria

When deployment is successful:

✅ **Frontend**: Loads without React errors  
✅ **Backend**: XMTP agent connects and responds  
✅ **Ponder**: Indexes blockchain data in real-time  
✅ **Payment**: All three payment methods work  
✅ **Frames**: X402 URLs render beautiful Farcaster frames  
✅ **Profiles**: Users can claim and share fkey.id profiles  

---

## 🚀 Next Steps

1. **Deploy in order**: Backend → Ponder → Frontend
2. **Test each service** before moving to the next
3. **Update environment variables** with actual deployment URLs
4. **Test end-to-end** payment and content flow
5. **Share first Frame** on Farcaster to celebrate! 🎉 