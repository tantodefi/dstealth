// X402 Protocol Service Worker
// Handles x402:// URIs and redirects to our viewer

const CACHE_NAME = 'x402-cache-v2'; // Updated cache version to trigger cleanup
const VIEWER_BASE_URL = '/viewer';

// Install event - cache essential resources
self.addEventListener('install', (event) => {
  console.log('X402 Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/viewer',
        '/api/x402/generate',
        '/_next/static/css/app.css', // Adjust based on your CSS file names
      ]);
    })
  );
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('X402 Service Worker activating...');
  event.waitUntil(
    // Clean up old caches only - removed payment link cleanup
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - handle x402:// URIs and other requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Check if this is an x402:// URI being handled
  if (url.pathname.includes('x402://') || url.searchParams.get('x402')) {
    event.respondWith(handleX402Request(event.request));
    return;
  }
  
  // Handle regular fetch requests with caching for static assets
  if (event.request.destination === 'document' || event.request.destination === 'script' || event.request.destination === 'style') {
    event.respondWith(
      caches.match(event.request).then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then((response) => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response for caching
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          
          return response;
        });
      })
    );
  }
});

// Handle X402 URI requests
async function handleX402Request(request) {
  try {
    const url = new URL(request.url);
    let x402Uri = '';
    
    // Extract x402 URI from various possible formats
    if (url.searchParams.get('x402')) {
      x402Uri = decodeURIComponent(url.searchParams.get('x402'));
    } else if (url.pathname.includes('x402://')) {
      // Extract from path like /handle-x402/x402://domain/content/123
      const pathParts = url.pathname.split('x402://');
      if (pathParts.length > 1) {
        x402Uri = 'x402://' + pathParts[1];
      }
    }
    
    if (x402Uri) {
      console.log('Handling X402 URI:', x402Uri);
      
      // Parse the x402 URI to extract content ID
      const contentId = extractContentId(x402Uri);
      
      if (contentId) {
        // Redirect to our viewer with the content ID
        const viewerUrl = `${VIEWER_BASE_URL}?content=${encodeURIComponent(contentId)}&x402_uri=${encodeURIComponent(x402Uri)}`;
        
        // Return a redirect response
        return Response.redirect(viewerUrl, 302);
      }
    }
    
    // Fallback: return a helpful error page
    return new Response(generateErrorPage(), {
      headers: { 'Content-Type': 'text/html' },
      status: 400,
    });
    
  } catch (error) {
    console.error('Error handling X402 request:', error);
    return new Response(generateErrorPage(), {
      headers: { 'Content-Type': 'text/html' },
      status: 500,
    });
  }
}

// Extract content ID from x402 URI
function extractContentId(x402Uri) {
  try {
    // Expected format: x402://domain/content/contentId
    const uri = new URL(x402Uri);
    const pathParts = uri.pathname.split('/');
    
    // Look for content ID in various possible positions
    for (let i = 0; i < pathParts.length; i++) {
      if (pathParts[i] === 'content' && i + 1 < pathParts.length) {
        return pathParts[i + 1];
      }
    }
    
    // Fallback: return the last non-empty path segment
    const nonEmptyParts = pathParts.filter(part => part.length > 0);
    if (nonEmptyParts.length > 0) {
      return nonEmptyParts[nonEmptyParts.length - 1];
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting content ID from X402 URI:', error);
    return null;
  }
}

// Generate error page HTML
function generateErrorPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>X402 URI Handler</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            color: white;
            margin: 0;
            padding: 20px;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            max-width: 600px;
            text-align: center;
            background: rgba(255, 255, 255, 0.1);
            padding: 40px;
            border-radius: 20px;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        h1 {
            color: #8b5cf6;
            margin-bottom: 20px;
        }
        .x402-logo {
            font-size: 3em;
            font-weight: bold;
            margin-bottom: 20px;
            color: #8b5cf6;
        }
        a {
            color: #60a5fa;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        .button {
            display: inline-block;
            background: #8b5cf6;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            margin: 10px;
            transition: background 0.3s;
        }
        .button:hover {
            background: #7c3aed;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="x402-logo">X402</div>
        <h1>X402 URI Handler</h1>
        <p>This page handles X402 protocol URIs for accessing premium content.</p>
        <p>If you were redirected here, the X402 URI might be malformed or the content might not be available.</p>
        <div style="margin: 30px 0;">
            <a href="/viewer" class="button">Open Viewer</a>
            <a href="/" class="button">Go Home</a>
        </div>
        <p style="font-size: 0.9em; opacity: 0.7;">
            Learn more about the <a href="https://x402.org" target="_blank">X402 Protocol</a>
        </p>
    </div>
</body>
</html>`;
}

// Message event for communication with main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
}); 