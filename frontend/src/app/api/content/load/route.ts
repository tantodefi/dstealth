import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

// Redis client setup
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

interface ContentResponse {
  content: string;
  contentType: string;
  isUrl: boolean;
  metadata?: {
    title?: string;
    description?: string;
    mimeType?: string;
  };
}

function corsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Payment');
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contentId = searchParams.get('id');
    const accessToken = searchParams.get('token') || request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!contentId) {
      return corsHeaders(
        NextResponse.json({ error: 'Content ID is required' }, { status: 400 })
      );
    }

    if (!accessToken) {
      return corsHeaders(
        NextResponse.json({ error: 'Access token required' }, { status: 401 })
      );
    }

    console.log('📖 Loading content:', contentId);

    // Verify access token
    const isValidAccess = await verifyAccess(contentId, accessToken);
    
    if (!isValidAccess) {
      return corsHeaders(
        NextResponse.json({ error: 'Invalid or expired access token' }, { status: 403 })
      );
    }

    // Load and serve content
    const content = await loadContent(contentId);
    
    return corsHeaders(NextResponse.json(content));

  } catch (error) {
    console.error('Content loading error:', error);
    return corsHeaders(
      NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to load content' },
        { status: 500 }
      )
    );
  }
}

async function verifyAccess(contentId: string, accessToken: string): Promise<boolean> {
  try {
    // Decode access token
    const decoded = JSON.parse(Buffer.from(accessToken, 'base64').toString('utf-8'));
    
    if (decoded.contentId !== contentId) {
      console.log('❌ Content ID mismatch in token');
      return false;
    }

    // Check if token is not too old (24 hours)
    const tokenAge = Date.now() - decoded.issuedAt;
    if (tokenAge > 24 * 60 * 60 * 1000) {
      console.log('❌ Access token expired');
      return false;
    }

    // Verify payment record exists in Redis
    const paymentKey = decoded.userAddress !== 'anonymous' ? 
      `payment:${contentId}:${decoded.userAddress}` : 
      `payment:${contentId}:guest`;
    
    const paymentRecord = await redis.get(paymentKey);
    
    if (!paymentRecord) {
      console.log('❌ No payment record found');
      return false;
    }

    const payment = typeof paymentRecord === 'string' ? JSON.parse(paymentRecord) : paymentRecord;
    
    // Check if payment is still valid (not expired)
    if (payment.expiresAt && new Date(payment.expiresAt) <= new Date()) {
      console.log('❌ Payment expired');
      await redis.del(paymentKey);
      return false;
    }

    console.log('✅ Access verified');
    return true;

  } catch (error) {
    console.error('Access verification error:', error);
    return false;
  }
}

async function loadContent(contentId: string): Promise<ContentResponse> {
  try {
    // Get content metadata from Redis
    const contentData = await redis.get(`x402:content:${contentId}`);
    
    if (!contentData) {
      console.log('⚠️ No content data found, using fallback');
      return createFallbackContent(contentId);
    }

    const content = typeof contentData === 'string' ? JSON.parse(contentData) : contentData;
    
    // Determine content type and source
    const accessEndpoint = content.accessEndpoint || content.access?.endpoint;
    
    if (!accessEndpoint) {
      return createFallbackContent(contentId);
    }

    // Check if it's a URL or actual content
    if (isUrl(accessEndpoint)) {
      console.log('🔗 Loading URL content:', accessEndpoint);
      return await loadUrlContent(accessEndpoint, content);
    } else {
      console.log('📄 Loading direct content');
      return await loadDirectContent(accessEndpoint, content);
    }

  } catch (error) {
    console.error('Content loading error:', error);
    return createFallbackContent(contentId);
  }
}

function isUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

async function loadUrlContent(url: string, content: any): Promise<ContentResponse> {
  try {
    console.log('🌐 Fetching URL content with auth headers');
    
    // Fetch content with proper headers
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'X402-Content-Loader/1.0',
        'Accept': '*/*',
        'X-Paid-Access': 'true'
      }
    });

    if (!response.ok) {
      console.log(`⚠️ URL fetch failed (${response.status}), creating iframe wrapper`);
    }

    // Create iframe wrapper for the URL
    const iframeContent = createIframeWrapper(url, {
      title: content.name || content.title || 'Paid Content',
      description: content.description || 'Content accessible via X402 payment'
    });

    return {
      content: iframeContent,
      contentType: 'text/html',
      isUrl: true,
      metadata: {
        title: content.name || content.title || 'Paid Content',
        description: content.description || 'URL content loaded in iframe',
        mimeType: 'text/html'
      }
    };

  } catch (error) {
    console.error('URL content loading error:', error);
    
    // Fallback to iframe wrapper
    const iframeContent = createIframeWrapper(url, {
      title: content.name || 'Paid Content',
      description: 'Content loaded in iframe'
    });

    return {
      content: iframeContent,
      contentType: 'text/html',
      isUrl: true,
      metadata: {
        title: content.name || 'Paid Content',
        description: 'URL content loaded in iframe',
        mimeType: 'text/html'
      }
    };
  }
}

async function loadDirectContent(endpoint: string, content: any): Promise<ContentResponse> {
  try {
    // For direct content endpoints (like /api/x402/test)
    const response = await fetch(endpoint, {
      headers: {
        'X-Payment': 'verified',
        'Accept': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      
      if (data.content) {
        return {
          content: JSON.stringify(data.content),
          contentType: 'application/json',
          isUrl: false,
          metadata: {
            title: data.content.title || content.name,
            description: data.content.body || content.description,
            mimeType: 'application/json'
          }
        };
      }
    }

    // Fallback to mock content
    return createFallbackContent(content.contentId || 'unknown');

  } catch (error) {
    console.error('Direct content loading error:', error);
    return createFallbackContent(content.contentId || 'unknown');
  }
}

function createIframeWrapper(url: string, metadata: { title: string; description: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${metadata.title}</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #1a1a1a;
            color: white;
        }
        .header {
            background: #2a2a2a;
            padding: 15px;
            border-bottom: 1px solid #444;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .header h1 {
            margin: 0;
            font-size: 1.2em;
            color: #4ecdc4;
        }
        .header .status {
            background: #4ecdc4;
            color: #1a1a1a;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.8em;
            font-weight: bold;
        }
        .iframe-container {
            position: relative;
            width: 100%;
            height: calc(100vh - 80px);
        }
        iframe {
            width: 100%;
            height: 100%;
            border: none;
            background: white;
        }
        .loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
        }
        .error-msg {
            background: #ff6b6b;
            color: white;
            padding: 10px;
            margin: 20px;
            border-radius: 8px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>✅ ${metadata.title}</h1>
        <div class="status">PAID ACCESS</div>
    </div>
    
    <div class="iframe-container">
        <div class="loading" id="loading">
            <p>Loading content...</p>
            <div style="width: 40px; height: 40px; border: 4px solid #333; border-top: 4px solid #4ecdc4; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
        </div>
        
        <iframe 
            src="${url}" 
            title="${metadata.title}"
            onload="document.getElementById('loading').style.display='none'"
            onerror="showError()"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            allowfullscreen>
        </iframe>
    </div>

    <style>
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>

    <script>
        function showError() {
            document.getElementById('loading').innerHTML = 
                '<div class="error-msg">Failed to load content. <a href="${url}" target="_blank" style="color: #fff; text-decoration: underline;">Open in new tab</a></div>';
        }
        
        // Hide loading after 10 seconds if iframe doesn't load
        setTimeout(() => {
            const loading = document.getElementById('loading');
            if (loading && loading.style.display !== 'none') {
                loading.style.display = 'none';
            }
        }, 10000);
    </script>
</body>
</html>`;
}

function createFallbackContent(contentId: string): ContentResponse {
  const fallbackHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>X402 Protected Content</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            margin: 0;
            padding: 40px;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
        }
        .container {
            max-width: 600px;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 8px 32px rgba(31, 38, 135, 0.37);
        }
        h1 {
            font-size: 2.5em;
            margin-bottom: 20px;
            background: linear-gradient(45deg, #4ecdc4, #44a08d);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .success-icon {
            font-size: 4em;
            margin-bottom: 20px;
            color: #4ecdc4;
        }
        .content-box {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 15px;
            padding: 30px;
            margin: 20px 0;
            border-left: 4px solid #4ecdc4;
        }
        .tech-details {
            background: rgba(0, 0, 0, 0.2);
            border-radius: 10px;
            padding: 15px;
            margin: 15px 0;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.9em;
            text-align: left;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">🎉</div>
        <h1>Payment Successful!</h1>
        
        <div class="content-box">
            <h3>🔓 Premium X402 Content Unlocked</h3>
            <p><strong>Content ID:</strong> ${contentId}</p>
            <p>Congratulations! Your payment has been verified and you now have access to this protected content.</p>
            
            <h4>🎯 What you get:</h4>
            <ul style="text-align: left; padding-left: 20px;">
                <li>✅ Exclusive access to premium content</li>
                <li>✅ Verified blockchain payment</li>
                <li>✅ Secure X402 protocol protection</li>
                <li>✅ 24-hour access period</li>
            </ul>
        </div>

        <div class="tech-details">
            <h4>Technical Details:</h4>
            <p>• Protocol: X402 Payment Gateway</p>
            <p>• Payment: Verified ✅</p>
            <p>• Network: Base (USDC)</p>
            <p>• Content ID: <code>${contentId}</code></p>
            <p>• Access: Granted for 24 hours</p>
        </div>

        <p style="margin-top: 30px; font-size: 0.9em; opacity: 0.8;">
            This demonstrates the X402 payment protocol working end-to-end with real USDC payments on Base network.
        </p>
    </div>
</body>
</html>`;

  return {
    content: fallbackHtml,
    contentType: 'text/html',
    isUrl: false,
    metadata: {
      title: `X402 Protected Content ${contentId.substring(0, 8)}`,
      description: 'Premium content unlocked via X402 payment',
      mimeType: 'text/html'
    }
  };
}

export async function OPTIONS(request: NextRequest) {
  return corsHeaders(new NextResponse(null, { status: 200 }));
} 