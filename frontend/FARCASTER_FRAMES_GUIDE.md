# 🖼️ X402 Farcaster Frames Guide

## Overview

The X402 Farcaster Frame system allows you to create shareable X402:// URLs that display rich previews with payment integration when shared on Farcaster. This guide explains how to create, share, and use these Frame-enabled URLs.

## 🎯 Key Features

### ✅ **Rich Frame Previews**
- **Dynamic OG Images**: Beautiful, branded images showing content details, pricing, and payment info
- **Interactive Buttons**: "Pay & Access Content" and "Copy X402 URL" buttons directly in the Frame
- **Payment Integration**: Direct links to payment flow with real USDC transactions
- **Network Support**: Base Sepolia and Base mainnet with proper USDC contracts

### ✅ **Multiple Sharing Formats**
- **X402:// Protocol URL**: Direct protocol URL for technical integrations
- **Farcaster Frame URL**: Rich Frame preview URL for social sharing
- **Direct Viewer URL**: Browser-friendly URL for content access
- **Warpcast Share URL**: Pre-formatted Warpcast compose links

### ✅ **Production Ready**
- **Real USDC Payments**: Live blockchain transactions on Base networks
- **Creator Payments**: X402 URLs automatically send payments to creator's wallet
- **Proper Metadata**: SEO-friendly OG tags and Twitter Card support
- **Error Handling**: Graceful fallbacks and comprehensive error handling

## 🚀 How to Create X402 Frame URLs

### Step 1: Create X402 Content

1. **Connect Your Wallet** - Ensure your wallet is connected to receive payments
2. **Choose URI Scheme** - Select "X402://" (default for production)
3. **Fill Content Details**:
   - **Content Name**: Descriptive title for your content
   - **Description**: Optional description for Frame preview
   - **Content Type**: text, image, video, audio, or file
   - **Price**: Payment amount in USDC (e.g., 0.01)
   - **Network**: Base Sepolia (testnet) or Base (mainnet)
   - **Target URL**: The actual content URL to protect

4. **Click "Create X402 URI"**

### Step 2: Get Your Shareable URLs

After creation, you'll see three types of URLs:

#### 🔗 **X402 Protocol URL**
```
x402://localhost:3000/content/abc123def456
```
- Direct protocol URL for technical integrations
- Use this for X402 protocol implementations

#### 🖼️ **Farcaster Frame URL** (⭐ **Primary for sharing**)
```
http://localhost:3000/x402/abc123def456
```
- Rich Frame preview URL optimized for Farcaster
- Shows beautiful OG image with content details and pricing
- Interactive buttons for payment and sharing
- **Use this URL when sharing on Farcaster**

#### 👁️ **Direct Viewer URL**
```
http://localhost:3000/viewer?uri=x402%3A%2F%2Flocalhost%3A3000%2Fcontent%2Fabc123def456
```
- Browser-friendly URL for direct content access
- Handles payment flow and content delivery
- Use for direct links or non-Farcaster platforms

## 📱 Sharing on Farcaster

### Method 1: One-Click Warpcast Sharing
Click the **"📢 Share on Warpcast"** button to open Warpcast with pre-filled text:
```
Check out this X402 protected content: http://localhost:3000/x402/abc123def456
```

### Method 2: Manual Sharing
Copy the **Frame URL** and paste it in any Farcaster client:
- **Warpcast**: Will show rich Frame preview with interactive buttons
- **Supercast**: Supports Frame interactions
- **Other Clients**: Will show at minimum the OG image and metadata

## 🎨 Frame Display Features

When shared on Farcaster, your X402 Frame shows:

### **Rich Visual Preview**
- Gradient background with brand colors
- Content title, description, and pricing
- Network and content type indicators
- Professional X402:// protocol badge

### **Interactive Buttons**
- **"💳 Pay [PRICE] & Access"**: Links directly to payment flow
- **"🔗 Copy X402 URL"**: Triggers Frame action for URL sharing

### **Content Information**
- Payment amount in USDC
- Network (Base Sepolia/Base)
- Content type (text, image, video, etc.)
- Creator-friendly formatting

## 💰 Payment Flow

### **How Payments Work**
1. **User clicks "Pay & Access"** in the Frame
2. **Redirects to Viewer** with X402 URL
3. **Wallet Connection** prompted if needed
4. **Network Switching** to correct chain (Base/Base Sepolia)
5. **USDC Payment** executed via smart contract
6. **Content Access** granted after payment verification

### **Payment Recipients**
- **Creator's Wallet**: Payments automatically go to the wallet that created the X402 URL
- **Real USDC**: Live transactions on Base blockchain
- **No Middleman**: Direct peer-to-peer payments

## 🔧 Technical Implementation

### **API Endpoints**

#### Frame Metadata Generation
```
GET /api/og/x402/[id]?format=metadata
```
Returns JSON metadata for Frame tags

#### Frame Image Generation  
```
GET /api/og/x402/[id]?format=image
```
Returns dynamic OG image with content details

#### Frame Action Handler
```
POST /api/x402/frame-action
```
Handles Frame button interactions

#### X402 Content Info
```
GET /api/x402/info/[id]
```
Returns content metadata for specified X402 ID

### **Frame Metadata Tags**
- **OpenGraph Tags**: `og:title`, `og:description`, `og:image`, etc.
- **Twitter Cards**: `twitter:card`, `twitter:title`, etc.
- **Farcaster Frame**: `fc:frame`, `fc:frame:image`, `fc:frame:button:*`
- **Custom X402**: `x402:content_id`, `x402:url`, `x402:price`, etc.

## 📊 Content Management

### **View Your X402 URLs**
- All created X402 URLs are listed in the **"Your X402:// URIs"** section
- Each entry shows:
  - Content name, type, and pricing
  - Creation date and access count
  - Multiple URL formats (X402, Frame, Viewer)
  - Quick action buttons (Copy, Share, Preview)

### **Quick Actions Available**
- **📋 Copy X402 URI**: Copy the protocol URL
- **🖼️ Copy Frame URL**: Copy the Farcaster Frame URL  
- **📢 Share on Warpcast**: Open Warpcast with pre-filled share text
- **👁️ Preview Content**: Open viewer in new tab

## 🌐 Production Deployment

### **Environment Variables**
```bash
NEXT_PUBLIC_URL=https://yourdomain.com
NEXT_PUBLIC_DEFAULT_PAYMENT_RECIPIENT=0x... # Optional fallback
```

### **Network Configuration**
- **Base Sepolia**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (USDC)
- **Base Mainnet**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (USDC)

### **CDN and Caching**
- OG images cached for 1 hour
- Frame metadata cached with stale-while-revalidate
- Error images cached for 5 minutes

## 🔍 Troubleshooting

### **Frame Not Showing in Farcaster**
- ✅ Use the **Frame URL** (not X402:// or Viewer URL)
- ✅ Ensure content metadata is valid
- ✅ Check network connectivity to your server
- ✅ Verify HTTPS is working in production

### **Payment Issues**
- ✅ Connect wallet to correct network (Base/Base Sepolia)
- ✅ Ensure sufficient USDC balance
- ✅ Check wallet supports the network
- ✅ Verify creator wallet address is correct

### **Content Access Issues**
- ✅ Verify target URL is accessible
- ✅ Check content ID exists in system
- ✅ Ensure payment was successful
- ✅ Check browser console for errors

## 📈 Best Practices

### **Content Creation**
- **Descriptive Titles**: Use clear, engaging titles that describe the value
- **Appropriate Pricing**: Price content fairly for the value provided
- **Quality Content**: Ensure target URLs provide real value
- **Clear Descriptions**: Help users understand what they're paying for

### **Sharing Strategy**
- **Use Frame URLs**: Always share the Frame URL on Farcaster for best experience
- **Include Context**: Add helpful text when sharing to explain the content value
- **Test First**: Test your content flow before promoting widely
- **Monitor Performance**: Track access counts and user feedback

## 🚀 Example Use Cases

### **Premium Content**
```
Name: "Advanced DeFi Trading Strategies"
Description: "Professional trading guide with real examples"
Price: 5.00 USDC
Type: text
```

### **Exclusive Media**
```
Name: "Behind the Scenes Video"
Description: "Exclusive content from our latest project"
Price: 1.00 USDC  
Type: video
```

### **Digital Downloads**
```
Name: "High-Quality Stock Photos Pack"
Description: "50 professional photos for commercial use"
Price: 10.00 USDC
Type: file
```

---

## 🎯 Next Steps

1. **Create your first X402 URL** using the settings panel
2. **Test the Frame preview** by sharing on Farcaster
3. **Verify the payment flow** with a small test transaction
4. **Share your content** and start earning USDC payments!

The X402 Farcaster Frame system provides a complete solution for monetizing content with seamless payment integration and beautiful social media previews. Start creating and sharing today! 