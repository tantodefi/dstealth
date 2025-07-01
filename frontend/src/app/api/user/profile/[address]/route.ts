import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';
import { isAddress } from 'viem';

// Helper function to fetch external profile data
async function fetchExternalProfileData(address: string) {
  const externalData: any = {
    address,
    username: `${address.slice(0, 6)}...${address.slice(-4)}`,
    bio: null,
    avatar: `https://api.ensideas.com/v1/avatar/${address}`,
    ensName: null,
    baseName: null,
    farcasterProfile: null,
    stats: {
      totalContent: 0,
      totalEarnings: '0.00',
      totalViews: 0,
      totalPurchases: 0,
      privacyScore: 0,
      stealthActions: 0,
    },
    content: [],
    joinedDate: new Date().toISOString(),
    isDstealthUser: false
  };

  // Fetch ENS data
  try {
    const ensResponse = await fetch(`https://api.ensideas.com/ens/resolve/${address}`);
    if (ensResponse.ok) {
      const ensData = await ensResponse.json();
      if (ensData.name) {
        externalData.ensName = ensData.name;
        externalData.username = ensData.name;
      }
      if (ensData.avatar) {
        externalData.avatar = ensData.avatar;
      }
      if (ensData.description) {
        externalData.bio = ensData.description;
      }
    }
  } catch (error) {
    console.warn('Failed to fetch ENS data:', error);
  }

  // Fetch Farcaster profile
  try {
    const farcasterRes = await fetch(`https://api.neynar.com/v1/farcaster/user-by-verification?address=${address}`, {
      headers: {
        'api_key': process.env.NEYNAR_API_KEY || '',
      },
    });
    
    if (farcasterRes.ok) {
      const farcasterData = await farcasterRes.json();
      if (farcasterData.result?.user) {
        const farcasterUser = farcasterData.result.user;
        externalData.farcasterProfile = {
          fid: farcasterUser.fid,
          username: farcasterUser.username,
          displayName: farcasterUser.displayName,
          bio: farcasterUser.profile?.bio?.text,
          avatar: farcasterUser.pfp?.url,
          followerCount: farcasterUser.followerCount,
          followingCount: farcasterUser.followingCount,
        };
        
        // Use Farcaster data as primary if available
        if (farcasterUser.username && !externalData.ensName) {
          externalData.username = farcasterUser.username;
        }
        if (farcasterUser.pfp?.url) {
          externalData.avatar = farcasterUser.pfp.url;
        }
        if (farcasterUser.profile?.bio?.text && !externalData.bio) {
          externalData.bio = farcasterUser.profile.bio.text;
        }
      }
    }
  } catch (error) {
    console.warn('Failed to fetch Farcaster profile:', error);
  }

  // Fetch Basename
  try {
    const baseNameRes = await fetch(`https://api.basename.app/v1/names?address=${address}`);
    if (baseNameRes.ok) {
      const baseNameData = await baseNameRes.json();
      if (baseNameData.length > 0) {
        externalData.baseName = baseNameData[0].name;
        // Use basename as username if no better option
        if (!externalData.ensName && !externalData.farcasterProfile) {
          externalData.username = baseNameData[0].name;
        }
      }
    }
  } catch (error) {
    console.warn('Failed to fetch Base name:', error);
  }

  return externalData;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const { searchParams } = new URL(request.url);
    const includePrivate = searchParams.get('includePrivate') === 'true';
    
    if (!address) {
      return NextResponse.json({ error: 'Address parameter is required' }, { status: 400 });
    }

    let resolvedAddress = address;
    
    // If it's not an address, try to resolve ENS first
    if (!isAddress(address)) {
      try {
        const ensResponse = await fetch(`https://api.ensideas.com/ens/resolve/${address}`);
        if (ensResponse.ok) {
          const ensData = await ensResponse.json();
          if (ensData.address) {
            resolvedAddress = ensData.address;
          } else {
            return NextResponse.json({ error: 'ENS name not found' }, { status: 404 });
          }
        } else {
          return NextResponse.json({ error: 'Invalid address or ENS name' }, { status: 400 });
        }
      } catch (error) {
        return NextResponse.json({ error: 'Failed to resolve ENS name' }, { status: 400 });
      }
    }

    // ALWAYS start with external data (works for any valid address)
    const profileData = await fetchExternalProfileData(resolvedAddress);

    // Check if user exists in dstealth database
    const dstealthUser = database.getUser(resolvedAddress);
    const privacySettings = dstealthUser ? database.getPrivacySettings(resolvedAddress) : null;
    
    if (dstealthUser) {
      // User is a dstealth user - overlay their data and respect privacy settings
      profileData.isDstealthUser = true;
      profileData.joinedDate = dstealthUser.createdAt || profileData.joinedDate;
      
      // Get dstealth-specific data
      const userStats = database.calculateUserStats(resolvedAddress);
      const userLinks = database.getUserX402Links(resolvedAddress);
      
      // Override with dstealth data if user has set it
      if (dstealthUser.bio) profileData.bio = dstealthUser.bio;
      if (dstealthUser.avatar) profileData.avatar = dstealthUser.avatar;
      if (dstealthUser.ensName) profileData.ensName = dstealthUser.ensName;
      
      // Apply privacy settings for public views
      if (!includePrivate && privacySettings) {
        // Check profile visibility
        if (privacySettings.profileVisibility === 'private') {
          return NextResponse.json({ error: 'Profile is private' }, { status: 404 });
        }
        
        // Filter data based on privacy settings
        if (!privacySettings.showEarnings) {
          userStats.totalEarnings = 0;
        }
        if (!privacySettings.showActivityStats) {
          userStats.totalViews = 0;
          userStats.totalPurchases = 0;
        }
        if (!privacySettings.showPrivacyScore) {
          userStats.privacyScore = 0;
        }
        if (!privacySettings.showStealthActions) {
          userStats.stealthActions = 0;
        }
        if (!privacySettings.showX402Links) {
          userLinks.length = 0; // Clear the array
        }
        if (!privacySettings.showConnectedIdentities) {
          profileData.farcasterProfile = null;
          profileData.ensName = null;
          profileData.baseName = null;
        }
        if (!privacySettings.showJoinDate) {
          profileData.joinedDate = new Date().toISOString();
        }
      }
      
      // Add dstealth-specific stats and content
      profileData.stats = {
        totalContent: privacySettings?.showX402Links !== false ? userStats.totalLinks : 0,
        totalEarnings: privacySettings?.showEarnings !== false ? userStats.totalEarnings.toFixed(2) : '0.00',
        totalViews: privacySettings?.showActivityStats !== false ? userStats.totalViews : 0,
        totalPurchases: privacySettings?.showActivityStats !== false ? userStats.totalPurchases : 0,
        privacyScore: privacySettings?.showPrivacyScore !== false ? userStats.privacyScore : 0,
        stealthActions: privacySettings?.showStealthActions !== false ? userStats.stealthActions : 0,
      };
      
      profileData.content = privacySettings?.showX402Links !== false ? userLinks.map(link => ({
        id: link.id,
        title: link.title,
        description: link.description,
        price: link.price.toFixed(2),
        linkType: link.linkType,
        createdAt: link.createdAt,
        viewCount: privacySettings?.showTotalViews !== false ? link.viewCount : 0,
        purchaseCount: privacySettings?.showPurchaseHistory !== false ? link.purchaseCount : 0,
        totalEarnings: privacySettings?.showEarnings !== false ? link.totalEarnings : 0,
      })) : [];
      
      // Add dstealth integration data (only if user configured it)
      if (dstealthUser.fkeyId) {
        profileData.fkeyProfile = {
          username: dstealthUser.fkeyId,
          address: resolvedAddress,
          isRegistered: true,
        };
      }
      
      if (dstealthUser.convosUsername) {
        // Note: In a real app, you'd fetch this from Convos API
        profileData.convosProfile = {
          username: dstealthUser.convosUsername,
          name: profileData.username,
          bio: profileData.bio,
          avatar: profileData.avatar,
          xmtpId: dstealthUser.xmtpId || 'unknown',
        };
      }
    }

    return NextResponse.json({
      success: true,
      profile: profileData,
      resolvedAddress,
      isPublic: !includePrivate,
      isDstealthUser: profileData.isDstealthUser,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const body = await request.json();
    
    if (!isAddress(address)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    // Update user data in database
    const updatedUser = await database.createOrUpdateUser({
      address: address.toLowerCase(),
      ...body,
    });

    return NextResponse.json({
      success: true,
      user: updatedUser,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('Error updating user profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 