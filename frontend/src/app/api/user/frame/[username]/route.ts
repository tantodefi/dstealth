import { NextRequest, NextResponse } from 'next/server';

interface UserProfile {
  username: string;
  bio: string;
  totalContent: number;
  totalEarnings: string;
  contentCount: number;
  avatar?: string;
}

// Mock user data - replace with actual database/API call
const getUserProfile = async (username: string): Promise<UserProfile | null> => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Mock data - in production, fetch from your database
  const profiles: Record<string, UserProfile> = {
    'alice': {
      username: 'alice',
      bio: 'Blockchain developer sharing DeFi insights and tutorials',
      totalContent: 12,
      totalEarnings: '45.67',
      contentCount: 12,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice'
    },
    'bob': {
      username: 'bob',
      bio: 'Crypto trader providing market analysis and strategies',
      totalContent: 8,
      totalEarnings: '23.45',
      contentCount: 8,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob'
    }
  };

  return profiles[username.toLowerCase()] || {
    username: username,
    bio: 'Creative content creator sharing premium insights through X402 protocol',
    totalContent: Math.floor(Math.random() * 20) + 1,
    totalEarnings: (Math.random() * 100).toFixed(2),
    contentCount: Math.floor(Math.random() * 15) + 1,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
  };
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    
    // Fetch user profile
    const profile = await getUserProfile(username);
    
    if (!profile) {
      return new NextResponse('User not found', { status: 404 });
    }

    // Generate Frame HTML with rich metadata
    const frameHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>@${profile.username} - X402 Creator Profile</title>
  
  <!-- Open Graph Tags -->
  <meta property="og:title" content="@${profile.username} - X402 Creator Profile" />
  <meta property="og:description" content="${profile.bio} • ${profile.contentCount} Premium Content Items • ${profile.totalEarnings} USDC Earned" />
  <meta property="og:image" content="${baseUrl}/api/user/og-image/${username}" />
  <meta property="og:url" content="${baseUrl}/user/${username}" />
  <meta property="og:type" content="profile" />
  <meta property="og:site_name" content="X402 Protocol" />
  
  <!-- Twitter/X Cards -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="@${profile.username} - X402 Creator Profile" />
  <meta name="twitter:description" content="${profile.bio}" />
  <meta name="twitter:image" content="${baseUrl}/api/user/og-image/${username}" />
  <meta name="twitter:creator" content="@${profile.username}" />
  
  <!-- Farcaster Frame Meta Tags -->
  <meta name="fc:frame" content="vNext" />
  <meta name="fc:frame:image" content="${baseUrl}/api/user/og-image/${username}" />
  <meta name="fc:frame:image:aspect_ratio" content="1.91:1" />
  <meta name="fc:frame:button:1" content="📱 View Profile" />
  <meta name="fc:frame:button:1:action" content="link" />
  <meta name="fc:frame:button:1:target" content="${baseUrl}/user/${username}" />
  <meta name="fc:frame:button:2" content="🔒 Browse Content" />
  <meta name="fc:frame:button:2:action" content="link" />
  <meta name="fc:frame:button:2:target" content="${baseUrl}/user/${username}#content" />
  <meta name="fc:frame:button:3" content="💳 Support Creator" />
  <meta name="fc:frame:button:3:action" content="link" />
  <meta name="fc:frame:button:3:target" content="${baseUrl}/user/${username}?action=support" />
  
  <!-- X402 Protocol Meta Tags -->
  <meta name="x402:protocol" content="user-profile" />
  <meta name="x402:creator" content="${profile.username}" />
  <meta name="x402:content-count" content="${profile.contentCount}" />
  <meta name="x402:earnings" content="${profile.totalEarnings}" />
  <meta name="x402:profile-url" content="${baseUrl}/user/${username}" />
  
  <!-- Additional Meta Tags -->
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#7c3aed" />
  <link rel="canonical" href="${baseUrl}/user/${username}" />
  
  <!-- Structured Data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "mainEntity": {
      "@type": "Person",
      "name": "${profile.username}",
      "description": "${profile.bio}",
      "image": "${profile.avatar || `${baseUrl}/api/user/og-image/${username}`}",
      "url": "${baseUrl}/user/${username}",
      "sameAs": [
        "${baseUrl}/user/${username}"
      ],
      "knowsAbout": [
        "Blockchain",
        "Cryptocurrency", 
        "DeFi",
        "Web3",
        "X402 Protocol"
      ]
    },
    "about": {
      "@type": "Thing",
      "name": "X402 Protocol Content Creation",
      "description": "Premium digital content monetization platform"
    }
  }
  </script>
  
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: linear-gradient(135deg, #1e1b4b, #7c3aed, #1e1b4b);
      color: white;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    
    .profile-card {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(124, 58, 237, 0.3);
      border-radius: 16px;
      padding: 32px;
      max-width: 600px;
      backdrop-filter: blur(10px);
    }
    
    .avatar {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      margin: 0 auto 16px;
      border: 3px solid #7c3aed;
    }
    
    .username {
      font-size: 2rem;
      font-weight: bold;
      margin-bottom: 8px;
      color: #a855f7;
    }
    
    .bio {
      font-size: 1.1rem;
      margin-bottom: 24px;
      opacity: 0.9;
      line-height: 1.5;
    }
    
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    
    .stat {
      background: rgba(124, 58, 237, 0.2);
      padding: 16px;
      border-radius: 12px;
      border: 1px solid rgba(124, 58, 237, 0.3);
    }
    
    .stat-value {
      font-size: 1.5rem;
      font-weight: bold;
      color: #10b981;
    }
    
    .stat-label {
      font-size: 0.9rem;
      opacity: 0.8;
      margin-top: 4px;
    }
    
    .cta {
      background: linear-gradient(45deg, #7c3aed, #a855f7);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      display: inline-block;
      margin: 8px;
      transition: transform 0.2s;
    }
    
    .cta:hover {
      transform: translateY(-2px);
    }
    
    .footer {
      margin-top: 24px;
      opacity: 0.7;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="profile-card">
    <img src="${profile.avatar || `${baseUrl}/api/user/og-image/${username}`}" alt="@${profile.username}" class="avatar" />
    <h1 class="username">@${profile.username}</h1>
    <p class="bio">${profile.bio}</p>
    
    <div class="stats">
      <div class="stat">
        <div class="stat-value">${profile.contentCount}</div>
        <div class="stat-label">Content Items</div>
      </div>
      <div class="stat">
        <div class="stat-value">${profile.totalEarnings}</div>
        <div class="stat-label">USDC Earned</div>
      </div>
      <div class="stat">
        <div class="stat-value">${profile.totalContent}</div>
        <div class="stat-label">Total Posts</div>
      </div>
    </div>
    
    <div>
      <a href="${baseUrl}/user/${username}" class="cta">📱 View Full Profile</a>
      <a href="${baseUrl}/user/${username}#content" class="cta">🔒 Browse Content</a>
    </div>
    
    <div class="footer">
      🔗 Powered by X402 Protocol • Secure • Decentralized • Creator-First
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(frameHtml, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=300', // Cache for 5 minutes
      },
    });

  } catch (error) {
    console.error('Error generating user frame:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 