import express from 'express';
import { ReclaimClient } from '@reclaimprotocol/zk-fetch';
import { env } from '../config/env';

const router = express.Router();

// Initialize Reclaim client with required parameters
const reclaimClient = new ReclaimClient(
  env.RECLAIM_APP_ID,
  env.RECLAIM_APP_SECRET
);

router.get('/lookup/:username', async (req, res) => {
  const { username } = req.params;
  let xmtpId: string | null = null;
  let profile: any = null;

  try {
    const url = `https://${username}.convos.org`;
    console.log('\n=== CONVOS.ORG LOOKUP START ===');
    console.log(`🔍 Looking up profile for ${username} at ${url}`);
    
    let html;
    
    // First try with zkfetch
    try {
      console.log('\n📡 Attempting zkfetch...');
      // Get the HTML content first since we need it for parsing
      const fetchResponse = await fetch(url);
      if (!fetchResponse.ok) {
        throw new Error(`HTTP error! status: ${fetchResponse.status}`);
      }
      html = await fetchResponse.text();
      
      // Then do the zkFetch verification
      await reclaimClient.zkFetch(url, {
        method: 'GET'
      });
      console.log('✅ zkfetch verification successful');
      console.log('✅ HTML content fetched, length:', html.length);
      
    } catch (zkError) {
      // Fallback to regular fetch if zkfetch fails
      console.log('\n⚠️ zkfetch failed:', zkError);
      console.log('↪️ Falling back to regular fetch...');
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      html = await response.text();
      console.log('✅ Regular fetch successful, HTML length:', html.length);
    }

    // Look for the __NEXT_DATA__ script tag
    console.log('\n🔎 Looking for Next.js data script tag...');
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    
    if (nextDataMatch) {
      console.log('✅ Found Next.js data script tag');
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        // Look through the props for profile data
        const props = nextData?.props?.pageProps;
        if (props?.profile?.xmtpId) {
          xmtpId = props.profile.xmtpId;
          profile = props.profile;
          console.log('✅ Found XMTP ID in Next.js data:', xmtpId);
          console.log('✅ Found profile:', profile);
        } else {
          console.log('❌ No XMTP ID found in profile data');
          console.log('Props structure:', JSON.stringify(props, null, 2));
        }
      } catch (e) {
        console.log('❌ Failed to parse Next.js data:', e);
      }
    } else {
      console.log('❌ No Next.js data script tag found');
    }

    if (xmtpId) {
      console.log('\n✅ Successfully found XMTP ID:', xmtpId);
      console.log('=== CONVOS.ORG LOOKUP END ===\n');
      res.json({ 
        success: true, 
        xmtpId,
        username,
        url: `https://${username}.convos.org`,
        profile: {
          name: profile.name,
          username: profile.username,
          description: profile.description,
          avatar: profile.avatar,
          address: profile.turnkeyAddress
        }
      });
    } else {
      console.log('\n❌ No XMTP ID found');
      console.log('=== CONVOS.ORG LOOKUP END ===\n');
      res.status(404).json({ 
        success: false, 
        error: 'XMTP ID not found' 
      });
    }
  } catch (error) {
    console.error('\n❌ Error in convos lookup:', error);
    console.log('=== CONVOS.ORG LOOKUP END WITH ERROR ===\n');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router; 