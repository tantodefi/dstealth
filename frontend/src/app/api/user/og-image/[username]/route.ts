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

const generateProfileCard = (profile: UserProfile) => {
  const truncatedBio = profile.bio.length > 80 ? profile.bio.substring(0, 77) + '...' : profile.bio;
  
  return `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="backgroundGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e1b4b;stop-opacity:1" />
      <stop offset="25%" style="stop-color:#312e81;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#7c3aed;stop-opacity:1" />
      <stop offset="75%" style="stop-color:#a855f7;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1e1b4b;stop-opacity:1" />
    </linearGradient>
    
    <linearGradient id="cardGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:rgba(0,0,0,0.6);stop-opacity:1" />
      <stop offset="100%" style="stop-color:rgba(124,58,237,0.3);stop-opacity:1" />
    </linearGradient>
    
    <linearGradient id="buttonGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#7c3aed;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#a855f7;stop-opacity:1" />
    </linearGradient>
    
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    
    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="rgba(0,0,0,0.3)"/>
    </filter>
  </defs>
  
  <!-- Background -->
  <rect width="1200" height="630" fill="url(#backgroundGradient)"/>
  
  <!-- Background Pattern -->
  <pattern id="dots" patternUnits="userSpaceOnUse" width="40" height="40">
    <circle cx="20" cy="20" r="1" fill="rgba(255,255,255,0.1)"/>
  </pattern>
  <rect width="1200" height="630" fill="url(#dots)"/>
  
  <!-- Main Card -->
  <rect x="60" y="60" width="1080" height="510" rx="24" ry="24" 
        fill="url(#cardGradient)" 
        stroke="rgba(124,58,237,0.5)" 
        stroke-width="2" 
        filter="url(#shadow)"/>
  
  <!-- Header Section -->
  <rect x="80" y="80" width="1040" height="120" rx="16" ry="16" 
        fill="rgba(124,58,237,0.2)" 
        stroke="rgba(124,58,237,0.3)" 
        stroke-width="1"/>
  
  <!-- Avatar Circle -->
  <circle cx="160" cy="140" r="40" 
          fill="rgba(124,58,237,0.3)" 
          stroke="rgba(168,85,247,0.8)" 
          stroke-width="3"/>
  
  <!-- Avatar Icon (User) -->
  <g transform="translate(140, 120)">
    <path d="M20 20 A20 20 0 0 1 20 20 A12 12 0 0 1 8 8 A12 12 0 0 1 32 8 A20 20 0 0 1 20 20 Z" 
          fill="rgba(168,85,247,0.8)"/>
    <circle cx="20" cy="12" r="6" fill="white"/>
    <path d="M8 28 Q8 20 20 20 Q32 20 32 28" fill="white"/>
  </g>
  
  <!-- Username -->
  <text x="220" y="130" 
        font-family="system-ui, -apple-system, sans-serif" 
        font-size="36" 
        font-weight="bold" 
        fill="#a855f7" 
        filter="url(#glow)">@${profile.username}</text>
  
  <!-- Bio -->
  <text x="220" y="165" 
        font-family="system-ui, -apple-system, sans-serif" 
        font-size="18" 
        fill="rgba(255,255,255,0.9)">
    ${truncatedBio}
  </text>
  
  <!-- Stats Section -->
  <g transform="translate(80, 240)">
    <!-- Content Count Stat -->
    <rect x="0" y="0" width="320" height="100" rx="12" ry="12" 
          fill="rgba(124,58,237,0.2)" 
          stroke="rgba(124,58,237,0.3)" 
          stroke-width="1"/>
    <text x="160" y="35" 
          font-family="system-ui, -apple-system, sans-serif" 
          font-size="32" 
          font-weight="bold" 
          fill="#10b981" 
          text-anchor="middle">${profile.contentCount}</text>
    <text x="160" y="60" 
          font-family="system-ui, -apple-system, sans-serif" 
          font-size="14" 
          fill="rgba(255,255,255,0.7)" 
          text-anchor="middle">Premium Content</text>
    <text x="160" y="80" 
          font-family="system-ui, -apple-system, sans-serif" 
          font-size="14" 
          fill="rgba(255,255,255,0.7)" 
          text-anchor="middle">Items</text>
    
    <!-- Earnings Stat -->
    <rect x="360" y="0" width="320" height="100" rx="12" ry="12" 
          fill="rgba(124,58,237,0.2)" 
          stroke="rgba(124,58,237,0.3)" 
          stroke-width="1"/>
    <text x="520" y="35" 
          font-family="system-ui, -apple-system, sans-serif" 
          font-size="32" 
          font-weight="bold" 
          fill="#10b981" 
          text-anchor="middle">${profile.totalEarnings}</text>
    <text x="520" y="60" 
          font-family="system-ui, -apple-system, sans-serif" 
          font-size="14" 
          fill="rgba(255,255,255,0.7)" 
          text-anchor="middle">USDC Earned</text>
    
    <!-- Total Posts Stat -->
    <rect x="720" y="0" width="320" height="100" rx="12" ry="12" 
          fill="rgba(124,58,237,0.2)" 
          stroke="rgba(124,58,237,0.3)" 
          stroke-width="1"/>
    <text x="880" y="35" 
          font-family="system-ui, -apple-system, sans-serif" 
          font-size="32" 
          font-weight="bold" 
          fill="#a855f7" 
          text-anchor="middle">${profile.totalContent}</text>
    <text x="880" y="60" 
          font-family="system-ui, -apple-system, sans-serif" 
          font-size="14" 
          fill="rgba(255,255,255,0.7)" 
          text-anchor="middle">Total Posts</text>
  </g>
  
  <!-- Call-to-Action Buttons -->
  <g transform="translate(80, 380)">
    <!-- View Profile Button -->
    <rect x="0" y="0" width="200" height="50" rx="8" ry="8" 
          fill="url(#buttonGradient)" 
          filter="url(#shadow)"/>
    <text x="100" y="30" 
          font-family="system-ui, -apple-system, sans-serif" 
          font-size="16" 
          font-weight="600" 
          fill="white" 
          text-anchor="middle">📱 View Profile</text>
    
    <!-- Browse Content Button -->
    <rect x="220" y="0" width="200" height="50" rx="8" ry="8" 
          fill="rgba(124,58,237,0.3)" 
          stroke="rgba(124,58,237,0.6)" 
          stroke-width="2"/>
    <text x="320" y="30" 
          font-family="system-ui, -apple-system, sans-serif" 
          font-size="16" 
          font-weight="600" 
          fill="white" 
          text-anchor="middle">🔒 Browse Content</text>
    
    <!-- Support Creator Button -->
    <rect x="440" y="0" width="200" height="50" rx="8" ry="8" 
          fill="rgba(16,185,129,0.3)" 
          stroke="rgba(16,185,129,0.6)" 
          stroke-width="2"/>
    <text x="540" y="30" 
          font-family="system-ui, -apple-system, sans-serif" 
          font-size="16" 
          font-weight="600" 
          fill="white" 
          text-anchor="middle">💳 Support Creator</text>
  </g>
  
  <!-- Footer Brand -->
  <g transform="translate(80, 480)">
    <!-- X402 Logo/Brand -->
    <rect x="0" y="0" width="40" height="40" rx="8" ry="8" 
          fill="rgba(124,58,237,0.6)" 
          stroke="rgba(168,85,247,0.8)" 
          stroke-width="2"/>
    <text x="20" y="28" 
          font-family="system-ui, -apple-system, sans-serif" 
          font-size="20" 
          font-weight="bold" 
          fill="white" 
          text-anchor="middle">X</text>
    
    <!-- Brand Text -->
    <text x="60" y="20" 
          font-family="system-ui, -apple-system, sans-serif" 
          font-size="16" 
          font-weight="600" 
          fill="#a855f7">X402 Protocol</text>
    <text x="60" y="38" 
          font-family="system-ui, -apple-system, sans-serif" 
          font-size="14" 
          fill="rgba(255,255,255,0.7)">Secure • Decentralized • Creator-First</text>
  </g>
  
  <!-- Status Indicator -->
  <circle cx="1080" cy="140" r="8" 
          fill="#10b981" 
          stroke="#ffffff" 
          stroke-width="2">
    <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite"/>
  </circle>
  <text x="1100" y="145" 
        font-family="system-ui, -apple-system, sans-serif" 
        font-size="12" 
        fill="#10b981">Active</text>
  
  <!-- Decorative Elements -->
  <g opacity="0.3">
    <circle cx="1000" cy="500" r="2" fill="#a855f7">
      <animate attributeName="r" values="2;4;2" dur="3s" repeatCount="indefinite"/>
    </circle>
    <circle cx="1050" cy="480" r="1.5" fill="#10b981">
      <animate attributeName="r" values="1.5;3;1.5" dur="4s" repeatCount="indefinite"/>
    </circle>
    <circle cx="970" cy="520" r="1" fill="#ffffff">
      <animate attributeName="r" values="1;2.5;1" dur="5s" repeatCount="indefinite"/>
    </circle>
  </g>
</svg>`;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  try {
    // Fetch user profile
    const profile = await getUserProfile(username);
    
    if (!profile) {
      return new NextResponse('User not found', { status: 404 });
    }

    // Generate SVG profile card
    const svg = generateProfileCard(profile);

    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600', // Cache for 1 hour
      },
    });

  } catch (error) {
    console.error('Error generating user OG image:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 