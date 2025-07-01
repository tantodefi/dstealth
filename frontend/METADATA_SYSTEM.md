# 🎯 **dstealth Mini App Metadata System**

## Overview
Comprehensive OG metadata and Farcaster Mini App embed system designed to drive viral growth and seamless user experiences across all routes.

## 🚀 **System Architecture**

### 1. **Route-Based Metadata Generation**
- **`/lib/og-metadata.ts`** - Core metadata generator with database integration
- **`/lib/route-metadata.ts`** - Route-specific handlers
- **`/app/metadata.ts`** - Global defaults with Mini App embed

### 2. **Dynamic OG Image Generation**
All routes generate 1200x630 (3:2 aspect ratio) images as required by Farcaster Mini Apps:

```
/api/og/default              - Main app branding
/api/og/user-profile         - Dynamic user profiles
/api/og/x402/[id]           - X402 content previews
/api/og/x402-viewer         - X402 viewer pages
/api/og/proxy402-viewer     - Proxy402 content
/api/og/fkey-claim          - FluidKey claiming
/api/og/content/[id]        - Premium content
/api/og/payment/[id]        - Payment flows
/api/og/discover            - Creator discovery
/api/og/dashboard           - Creator dashboard
```

## 📱 **Mini App Embed Strategy**

### **Farcaster Mini Apps Specification Compliance**
```json
{
  "version": "next",
  "imageUrl": "https://dstealth.app/api/og/...",
  "button": {
    "title": "Dynamic Button Text",
    "action": {
      "type": "launch_frame",
      "name": "dstealth",
      "url": "https://dstealth.app/...",
      "splashImageUrl": "https://dstealth.app/images/icon.png",
      "splashBackgroundColor": "#000000"
    }
  }
}
```

## 🎨 **Route-Specific Embeds**

### **1. Main App (`/`)**
```yaml
Title: "🥷 Launch dstealth"
Description: "Create monetized content, send private payments, and earn rewards"
Image: Ninja emoji + dstealth branding + feature highlights
Splash: Black background with app icon
```

### **2. User Profiles (`/user/[username]`)**
```yaml
Dynamic Detection:
  - Database User: "💰 Support {username}" + earnings stats
  - Non-User: "🔍 View Profile" + Web3 identity info
  
Image: User avatar + stats overlay + privacy indicators
Data: Farcaster profile, ENS, Basename, earnings, privacy score
```

### **3. X402 Content (`/x402/[id]`)**
```yaml
Title: "🔓 Unlock for {price} {currency}"
Description: "Premium content by {creator} • {description}"
Image: Content preview + creator info + price overlay
Payment: Direct launch to payment flow
```

### **4. Viewer Pages (`/viewer?url=...`)**
**X402 URIs (`x402://...`)**:
```yaml
Title: "💳 Pay {price} {currency}"
Description: "Access exclusive content from {creator}"
Image: Parsed X402 metadata + creator avatar
```

**Proxy402 URLs**:
```yaml
Title: "🚀 Access Content"
Description: "Premium content through Proxy402 gateway"
Image: Proxy402 branding + payment flow
```

### **5. FluidKey Claims (`/fkey/claim`)**
```yaml
Title: "🔑 Claim {username}.fkey.id"
Description: "Claim your FluidKey identity and start earning"
Image: FluidKey branding + username preview + benefits
Benefit: "Free FluidKey Score included!"
```

### **6. Content Creation (`/content/[id]`)**
```yaml
Title: "{content.title} - dstealth"
Description: "{description} • Pay {price} {currency} to access"
Image: Content preview + creator info + payment prompt
Action: Direct to payment flow
```

### **7. Payment Flow (`/pay/[linkId]`)**
```yaml
Title: "💳 Complete Payment"
Description: "Secure payment processing for premium content"
Image: Payment progress + security indicators
Color: Green theme for trust
```

### **8. Discovery (`/discover`)**
```yaml
Title: "🔍 Discover Creators"
Description: "Amazing creators, premium content, and rewards"
Image: Creator collage + trending content + earnings stats
Action: Browse discovery feed
```

### **9. Creator Dashboard (`/dashboard`)**
**Authenticated**:
```yaml
Title: "📊 View Dashboard"
Description: "Manage content, track earnings, view analytics"
Image: Dashboard preview + user stats + revenue charts
```

**Unauthenticated**:
```yaml
Title: "🔑 Connect Wallet"
Description: "Access your creator dashboard and manage content"
Image: Login prompt + benefits preview
```

## 💾 **Database Integration**

### **User Data Resolution Priority**
1. **Database**: `database.getUser(identifier)`
2. **API Lookup**: `/api/user/profile/${identifier}`
3. **Fallback**: Generic Web3 profile

### **Privacy-Aware Content**
```typescript
Privacy Settings Applied:
- showEarnings: Revenue data visibility
- showX402Links: Content listing
- showPrivacyScore: Privacy metrics
- profileVisibility: public/friends/private
- allowDirectContact: XMTP messaging
```

### **Dynamic Stats Integration**
```typescript
Real-time Calculations:
- totalEarnings: X402 + Proxy402 + Direct payments
- privacyScore: Stealth actions + address registrations
- contentCount: Published X402 links
- viewStats: Content engagement metrics
```

## 🔗 **SEO & Discovery Optimization**

### **Keywords Strategy**
```yaml
Primary: ["stealth payments", "content creation", "XMTP", "Base network"]
Secondary: ["X402 protocol", "privacy", "DeFi", "Farcaster"]
Long-tail: ["monetize content with crypto", "private messaging payments"]
```

### **Structured Data**
- **Organization**: dstealth team
- **WebApplication**: Mini App metadata
- **CreativeWork**: User-generated content
- **MonetaryAmount**: Payment information

### **Social Sharing Optimization**
- **Twitter Cards**: Large image with creator info
- **OpenGraph**: Rich previews with dynamic data
- **LinkedIn**: Professional creator profiles
- **Discord**: Mini App embeds

## 🌐 **Growth Mechanisms**

### **Viral Sharing Features**
1. **Creator Profiles**: Share earnings/content to attract supporters
2. **Payment Success**: "I just paid {creator} for exclusive content!"
3. **Content Unlocks**: "Just unlocked premium content on dstealth"
4. **Earnings Milestones**: "Earned $100 from my content!"

### **Cross-Platform Discovery**
- **Farcaster Feeds**: Native Mini App embeds
- **Twitter**: Rich card previews
- **Discord**: Embedded content previews
- **Telegram**: Bot integration potential

### **Referral Integration**
```yaml
URL Parameters:
  - ?ref={referrer} - Track referral sources
  - ?campaign={id} - Marketing campaign attribution
  - ?creator={username} - Direct creator attribution
```

## 🔄 **Dynamic Rendering Logic**

### **Route Handler Flow**
```typescript
1. Parse URL + parameters
2. Detect user authentication
3. Query database for content
4. Apply privacy filters
5. Generate dynamic metadata
6. Render appropriate embed
7. Track engagement metrics
```

### **Fallback Strategy**
```yaml
Content Not Found: → Generic discovery page
User Private: → Public Web3 profile only
Payment Required: → Content preview + unlock prompt
Network Error: → Cached metadata + retry logic
```

## 📊 **Analytics & Tracking**

### **Embed Performance**
- Click-through rates by route type
- Conversion rates (view → payment)
- Share frequency and platforms
- User acquisition sources

### **Content Metrics**
- Most shared content types
- Highest converting price points
- Creator profile engagement
- Payment completion rates

## 🛠 **Implementation Status**

### ✅ **Completed**
- Core metadata generation system
- Route-based handlers
- Database integration
- Privacy-aware filtering
- Dynamic OG image framework

### 🚧 **In Progress**
- Full OG image generation APIs
- Analytics integration
- Referral tracking
- A/B testing framework

### 📋 **Todo**
- Performance optimization
- Cache management
- Error handling improvements
- Mobile-specific optimizations

---

## 🎯 **Impact Goals**

1. **Growth**: 50% increase in organic discovery
2. **Engagement**: 2x click-through rates on shares
3. **Conversion**: 30% improvement in payment completion
4. **Retention**: Enhanced user experience across all touchpoints

This system transforms every dstealth URL into a powerful marketing tool that showcases value, builds trust, and drives user acquisition through the power of the Farcaster Mini Apps ecosystem. 