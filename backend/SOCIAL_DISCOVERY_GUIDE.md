# Social Discovery Features Guide

## Overview

The dStealth Agent now includes powerful social discovery features that leverage Farcaster's social graph to find and connect privacy-conscious users. These features bridge the gap between social identity and privacy tools.

## 🎯 **Core Features**

### **1. Follower Analysis**
- **Command**: `/search-followers`
- **Purpose**: Discover which of your Farcaster followers use dStealth
- **Benefit**: Find privacy-minded users in your network

### **2. Enhanced User Search**
- **Command**: `/search <query>` or `/search` (no parameters)
- **Purpose**: 
  - With query: Search specific users and check their dStealth usage
  - Without query: Analyze your followers/following for dStealth users
- **Benefit**: Unified search experience with comprehensive network analysis

### **3. Farcaster Cast Integration**
- **Method**: Cast `@dstealth yourfkey.fkey.id` on Farcaster
- **Purpose**: Set fkey.id directly through social media
- **Benefit**: Seamless onboarding via familiar social platform

## 🔍 **How It Works**

### **Social Graph Analysis**
```
CBW Wallet → FID → FC Followers → Wallet Addresses → fkey.id Lookup
```

1. **Get Farcaster Context**: Extract FID from user's Coinbase Wallet
2. **Fetch Social Data**: Get followers/search results via Neynar API
3. **Address Mapping**: Collect wallet addresses from FC profiles
4. **Reverse Lookup**: Check if addresses have associated fkey.ids
5. **Results Display**: Show social discovery with privacy context

### **Cast Processing Flow**
```
FC Cast → Webhook → @dstealth Detection → fkey.id Extraction → Verification → Auto-Setup
```

1. **Webhook Trigger**: Neynar sends cast webhook to `/webhook/farcaster/cast`
2. **Mention Detection**: Check if cast mentions `@dstealth`
3. **fkey.id Extraction**: Parse cast text for fkey.id patterns
4. **Verification**: Call fkey.id lookup API to verify ownership
5. **User Mapping**: Find XMTP user by Farcaster wallet addresses
6. **Auto-Setup**: Automatically set fkey.id for the user

## 🚀 **User Experience**

### **Follower Discovery**
```
User: /search-followers
Agent: 🔍 Follower Analysis Results

@username, I found 5 dStealth users among 150 followers:

• @alice✅ → alice.fkey.id
• @bob → bob.fkey.id  
• @charlie✅ → charlie.fkey.id
• @dana → dana.fkey.id
• @eve → eve.fkey.id

🎯 Social Discovery:
• Use /find-users <name> to search for more users
• Share fkey.id with followers for privacy rewards
• Connect more friends to expand the privacy network
```

### **User Search**
```
User: /find-users vitalik
Agent: 🔍 User Search Results

Found 12 users for "vitalik":

🥷 dStealth Users (2):
• @vitalik.eth✅ → vitalik.fkey.id
• @vitaliksbuterin → vitaliksbuterin.fkey.id

⚪ Other Users (10):
• @vitalik-fan✅ (no fkey.id yet)
• @vitalik-updates (no fkey.id yet)
• @vitalik-quotes (no fkey.id yet)
... and 7 more users

🚀 Grow the Network:
• Invite users to get fkey.id
• Share FluidKey: https://app.fluidkey.com/?ref=62YNSG
• Earn rewards for referrals (coming soon)
```

### **Farcaster Cast Setup**
```
On Farcaster:
User casts: "@dstealth tantodefi.fkey.id"

In XMTP:
Agent: ✅ fkey.id Set via Farcaster!

Your fkey.id was automatically set from your Farcaster cast.

Profile: tantodefi.fkey.id
Source: Farcaster cast
ZK Proof: ✅ Verified

Ready to earn privacy rewards! 🥷
```

## 🔧 **Technical Implementation**

### **Database Schema Enhancement**
```typescript
interface UserStealthData {
  userId: string;
  fkeyId: string;
  stealthAddress: string;
  zkProof: any;
  lastUpdated: number;
  requestedBy: string;
  setupStatus: 'new' | 'fkey_set' | 'complete';
  metadata?: {
    source?: 'xmtp-chat' | 'farcaster-cast';
    fid?: number;
    username?: string;
    castHash?: string;
  };
}
```

### **New API Endpoints**

#### **1. Neynar Followers API**
```typescript
GET https://api.neynar.com/v2/farcaster/followers?fid={fid}&limit=50
```

#### **2. Neynar User Search API**
```typescript
GET https://api.neynar.com/v2/farcaster/user/search?q={query}&limit=20
```

#### **3. Farcaster Webhook Endpoint**
```typescript
POST /webhook/farcaster/cast
```

### **Agent Commands**

#### **1. Search Followers Command**
```typescript
private async handleSearchFollowersCommand(senderInboxId: string): Promise<string>
```

#### **2. Find Users Command**
```typescript
private async handleFindUsersCommand(searchQuery: string, senderInboxId: string): Promise<string>
```

#### **3. Reverse Lookup System**
```typescript
private async findFkeyByWallet(walletAddress: string): Promise<string | null>
```

## 📊 **Social Discovery Analytics**

### **Metrics Tracked**
- **Discovery Rate**: % of followers/searches with fkey.id
- **Network Growth**: New users found via social discovery
- **Cast Conversions**: fkey.id setups via Farcaster casts
- **Social Engagement**: @dstealth mentions and interactions

### **Network Effects**
- **Viral Growth**: Users discover friends already using dStealth
- **Social Proof**: Verified users increase trust and adoption
- **Community Building**: Privacy-focused users find each other
- **Referral Potential**: Social connections drive organic growth

## 🔐 **Privacy Considerations**

### **Data Handling**
- **Temporary Caching**: Farcaster data cached for 1 hour only
- **No Persistent Storage**: Social data not permanently stored
- **User Consent**: Only public Farcaster data is accessed
- **Opt-Out Available**: Users can disconnect anytime

### **Security Measures**
- **Address Verification**: All wallet addresses verified before lookup
- **fkey.id Validation**: Ownership proved via ZK proofs
- **Rate Limiting**: API calls throttled to prevent abuse
- **Webhook Validation**: Cast webhooks verified for authenticity

## 🚀 **Setup Instructions**

### **1. Environment Variables**
```env
# Existing Farcaster Integration
COINBASE_API_PRIVATE_KEY=0x1234567890abcdef...
NEYNAR_API_KEY=your-neynar-api-key

# New webhook endpoint (if using external server)
WEBHOOK_BASE_URL=https://your-domain.com
```

### **2. Neynar Webhook Configuration**
```bash
# Configure webhook at https://neynar.com/webhooks
Webhook URL: https://your-domain.com/webhook/farcaster/cast
Events: cast.created
Filters: mentions @dstealth
```

### **3. Agent Commands Registration**
The new commands are automatically registered:
- `/search-followers`
- `/find-users <query>`

### **4. Farcaster Cast Processing**
Webhook automatically processes casts with pattern:
- `@dstealth username.fkey.id`
- `@dstealth username`

## 📈 **Growth Strategy**

### **Organic Discovery**
1. **Follower Analysis**: Users discover privacy-minded followers
2. **Social Proof**: Verified users increase credibility
3. **Network Effect**: Each user brings their social graph
4. **Viral Potential**: Cast integration enables rapid spread

### **Community Building**
1. **Privacy Networks**: Like-minded users find each other
2. **Knowledge Sharing**: Users teach friends about privacy
3. **Reward Incentives**: Privacy actions earn social rewards
4. **Ambassador Program**: Power users promote to followers

## 🔮 **Future Enhancements**

### **Planned Features**
1. **Batch Rewards**: Send rewards to multiple discovered users
2. **Social Leaderboards**: Rank users by privacy network size
3. **Group Discovery**: Find privacy-focused Farcaster channels
4. **Cross-Platform**: Extend to Twitter, Discord, Lens Protocol
5. **Privacy Scores**: Rate users by privacy tool adoption

### **Advanced Analytics**
1. **Network Mapping**: Visualize privacy user connections
2. **Influence Metrics**: Measure privacy advocacy impact
3. **Growth Attribution**: Track discovery source effectiveness
4. **Social ROI**: Measure rewards vs. discovery cost

## 📋 **Usage Examples**

### **Example 1: Finding Privacy Users in Your Network**
```
User: /search-followers
Agent: Shows detailed analysis of followers with dStealth usage
```

### **Example 2: Searching for Specific Users**
```
User: /search tantodefi
Agent: Shows if @tantodefi has fkey.id set up, with payment capabilities

User: /search vitalik.eth
Agent: Resolves ENS name and checks for dStealth usage
```

### **Example 3: Network Analysis Without Parameters**
```
User: /search
Agent: Analyzes your followers AND following for dStealth usage
       Shows comprehensive network privacy adoption statistics
```

### **Example 4: Social Onboarding**
```
User sees friend post about dStealth
Casts "@dstealth myusername.fkey.id"
Automatically onboarded in dStealth
Starts earning privacy rewards immediately
```

## 🛠️ **Troubleshooting**

### **Common Issues**

#### **"No followers found"**
- Check Neynar API key validity
- Verify user has public Farcaster profile
- Ensure followers count > 0

#### **"User search failed"**
- Check search query format
- Verify Neynar API rate limits
- Try simpler search terms

#### **"Cast webhook not working"**
- Verify webhook URL configuration
- Check Neynar webhook settings
- Validate webhook signature (if enabled)

### **Debug Commands**
```bash
# Test webhook endpoint
curl GET https://your-domain.com/api/webhook/farcaster

# Test Neynar API directly
curl -H "api_key: YOUR_NEYNAR_API_KEY" https://api.neynar.com/v2/farcaster/user/bulk?fids=123

# Test agent messaging
npx tsx backend/scripts/test-agent-messaging.ts

# Check agent logs for social discovery
grep -i "social\|farcaster\|search" backend/agent.log
```

## 📞 **Support**

For issues with social discovery features:
1. Check agent logs for API errors
2. Verify Farcaster connection status
3. Test individual API endpoints
4. Contact support with specific error messages

---

*Social Discovery bridges privacy tools with social networks, creating viral growth while maintaining user privacy and security.* 