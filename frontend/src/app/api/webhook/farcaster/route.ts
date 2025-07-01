import { NextRequest, NextResponse } from 'next/server';
import {
  NOTIFICATION_TRIGGERS, 
  shouldSendNotification,
  type Milestone 
} from '@/lib/farcaster-miniapp';

// Farcaster Mini App Events
type FarcasterEvent = 
  | 'frame_added'
  | 'frame_removed' 
  | 'notifications_enabled'
  | 'notifications_disabled';

interface FrameNotificationDetails {
  url: string;
  token: string;
}

interface FarcasterWebhookPayload {
  header: string;
  payload: string;
  signature: string;
}

interface EventPayload {
  event: FarcasterEvent;
  notificationDetails?: FrameNotificationDetails;
}

export async function POST(request: NextRequest) {
  try {
    const body: FarcasterWebhookPayload = await request.json();
    
    // Decode the payload
    const decodedPayload = Buffer.from(body.payload, 'base64url').toString();
    const eventData: EventPayload = JSON.parse(decodedPayload);
    
    // Decode the header to get user info
    const decodedHeader = Buffer.from(body.header, 'base64url').toString();
    const headerData = JSON.parse(decodedHeader);
    
    console.log('📧 Farcaster Event Received:', {
      event: eventData.event,
      fid: headerData.fid,
      timestamp: new Date().toISOString()
    });

    // Handle different event types
    switch (eventData.event) {
      case 'frame_added':
        await handleFrameAdded(headerData.fid, eventData.notificationDetails);
        break;
        
      case 'frame_removed':
        await handleFrameRemoved(headerData.fid);
        break;
        
      case 'notifications_enabled':
        await handleNotificationsEnabled(headerData.fid, eventData.notificationDetails);
        break;
        
      case 'notifications_disabled':
        await handleNotificationsDisabled(headerData.fid);
        break;
        
      default:
        console.warn('Unknown event type:', eventData.event);
    }

    return NextResponse.json({ 
      success: true, 
      message: `Event ${eventData.event} processed successfully` 
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { success: false, error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handleFrameAdded(fid: number, notificationDetails?: FrameNotificationDetails) {
  console.log('🎉 User added dstealth Mini App:', fid);
  
  if (notificationDetails) {
    // Store notification token for this user
    // In a real app, you'd save this to your database
    console.log('📱 Notification details:', {
      fid,
      url: notificationDetails.url,
      token: notificationDetails.token.slice(0, 8) + '...'
    });
    
    // Example: Store in database
    // await database.storeNotificationToken(fid, notificationDetails);
  }
  
  // Optional: Send welcome notification
  if (notificationDetails) {
    await sendWelcomeNotification(fid, notificationDetails);
  }
}

async function handleFrameRemoved(fid: number) {
  console.log('👋 User removed dstealth Mini App:', fid);
  
  // Clean up user's notification tokens
  // await database.removeNotificationTokens(fid);
}

async function handleNotificationsEnabled(fid: number, notificationDetails?: FrameNotificationDetails) {
  console.log('🔔 Notifications enabled for user:', fid);
  
  if (notificationDetails) {
    // Store new notification token
    // await database.storeNotificationToken(fid, notificationDetails);
  }
}

async function handleNotificationsDisabled(fid: number) {
  console.log('🔕 Notifications disabled for user:', fid);
  
  // Remove notification tokens
  // await database.removeNotificationTokens(fid);
}

async function sendWelcomeNotification(fid: number, notificationDetails: FrameNotificationDetails) {
  try {
    const notification = {
      notificationId: `welcome_${fid}_${Date.now()}`,
      title: 'Welcome to dstealth! 🥷',
      body: 'Your privacy-first payment app is ready. Start earning with stealth addresses.',
      targetUrl: 'https://dstealth.app/user',
      tokens: [notificationDetails.token]
    };

    const response = await fetch(notificationDetails.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(notification)
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Welcome notification sent:', result);
    } else {
      console.error('❌ Failed to send welcome notification:', response.status);
    }
  } catch (error) {
    console.error('❌ Welcome notification error:', error);
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'farcaster-webhook'
  });
}
