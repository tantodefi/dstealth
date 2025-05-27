import { Router } from 'express';
import { paymentMiddleware } from 'x402-express';
import { env } from '../config/env';
import { ReclaimClient } from '@reclaimprotocol/zk-fetch';

const router = Router();
const reclaimClient = new ReclaimClient(env.RECLAIM_APP_ID, env.RECLAIM_APP_SECRET);

// Store user endpoints in memory (should be moved to a database in production)
const userEndpoints = new Map<string, {
  url: string;
  price: number;
  owner: string;
  description: string;
}>();

// Middleware to verify x402 payment
const verifyPayment = paymentMiddleware(
  // Ensure private key is properly formatted with 0x prefix
  (env.X402_PRIVATE_KEY.startsWith('0x') ? env.X402_PRIVATE_KEY : `0x${env.X402_PRIVATE_KEY}`) as `0x${string}`,
  {
    "/data/:endpointId": {
      price: "$0.01",
      network: "base-sepolia",
      config: {
        description: "Access to personal data endpoint"
      }
    }
  }
);

// Create new personal data endpoint
router.post('/endpoints', async (req, res) => {
  try {
    console.log('Creating endpoint with body:', req.body);
    const { url, price, owner, description } = req.body;
    
    if (!url || !owner || typeof price !== 'number') {
      console.error('Invalid request body:', { url, price, owner, description });
      return res.status(400).json({ 
        error: 'Missing required fields: url, price, and owner are required. Price must be a number.',
        success: false
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (e) {
      console.error('Invalid URL format:', url);
      return res.status(400).json({ 
        error: 'Invalid URL format',
        success: false
      });
    }

    // Validate price
    if (price < 0.01) {
      console.error('Price too low:', price);
      return res.status(400).json({ 
        error: 'Price must be at least $0.01',
        success: false
      });
    }

    const endpointId = Buffer.from(url).toString('base64');
    
    userEndpoints.set(endpointId, {
      url,
      price,
      owner,
      description: description || ''
    });

    console.log('Created endpoint:', { endpointId, endpoint: userEndpoints.get(endpointId) });

    res.json({
      success: true,
      endpointId,
      endpoint: userEndpoints.get(endpointId)
    });
  } catch (error) {
    console.error('Error creating endpoint:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to create endpoint',
      success: false
    });
  }
});

// List all endpoints for a user
router.get('/endpoints/:owner', (req, res) => {
  const { owner } = req.params;
  
  const userOwnedEndpoints = Array.from(userEndpoints.entries())
    .filter(([_, endpoint]) => endpoint.owner === owner)
    .map(([id, endpoint]) => ({
      id,
      ...endpoint
    }));

  res.json({
    success: true,
    endpoints: userOwnedEndpoints
  });
});

// Get all endpoints
router.get('/endpoints', async (req, res) => {
  try {
    // Convert Map to array of endpoints with their IDs
    const endpoints = Array.from(userEndpoints.entries()).map(([endpointId, endpoint]) => ({
      ...endpoint,
      endpointId
    }));

    res.json({
      success: true,
      endpoints
    });
  } catch (error) {
    console.error('Error fetching endpoints:', error);
    res.status(500).json({ error: 'Failed to fetch endpoints' });
  }
});

// Get data from an endpoint (requires payment)
router.get('/data/:endpointId', verifyPayment, async (req, res) => {
  try {
    const endpoint = userEndpoints.get(req.params.endpointId);
    
    if (!endpoint) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }

    // Fetch data with zkfetch
    const zkResponse = await reclaimClient.zkFetch(endpoint.url, {
      method: 'GET'
    }, {
      responseMatches: [{
        type: 'regex',
        value: '.*' // Match any response
      }]
    });

    if (!zkResponse) {
      throw new Error('Failed to fetch data from endpoint');
    }

    // Standardized response format
    res.json({
      success: true,
      data: {
        content: zkResponse.claimData,
        proof: {
          signatures: zkResponse.signatures,
          witnesses: zkResponse.witnesses,
          claimData: zkResponse.claimData
        },
        metadata: {
          url: endpoint.url,
          timestamp: new Date().toISOString(),
          owner: endpoint.owner
        }
      }
    });

  } catch (error) {
    if ((error as any)?.status === 402) {
      // Payment required error from x402
      return res.status(402).json(error);
    }
    
    console.error('Error fetching endpoint data:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

export default router; 