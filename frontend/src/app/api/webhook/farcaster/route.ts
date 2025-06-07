import { NextRequest, NextResponse } from 'next/server';
import {
  NOTIFICATION_TRIGGERS, 
  shouldSendNotification,
  type Milestone 
} from '@/lib/farcaster-miniapp';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    console.log('Farcaster webhook received:', {
      type: body.type,
      timestamp: body.timestamp,
      user: body.data?.user?.fid || 'unknown'
    });

    // Handle different webhook events
    switch (body.type) {
      case 'app_notification_request':
        return handleNotificationRequest(body);
      case 'user_install':
        return handleUserInstall(body);
      case 'user_uninstall':
        return handleUserUninstall(body);
      case 'frame_interaction':
        return handleFrameInteraction(body);
      default:
        console.log('Unknown webhook type:', body.type);
        return NextResponse.json({ success: true });
    }

  } catch (error) {
    console.error('Farcaster webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handleNotificationRequest(body: any) {
  try {
    const { user, trigger, data } = body.data || {};
    
    if (!user?.fid) {
      return NextResponse.json({ error: 'User FID required' }, { status: 400 });
    }

    // Check if we should send this notification
    const userStats = data?.activityStats || {};
    const lastNotificationTime = data?.lastNotificationTime;
    
    if (!shouldSendNotification(trigger, userStats, lastNotificationTime)) {
      return NextResponse.json({ 
        success: true, 
        notification_sent: false,
        reason: 'Rate limited or not qualified'
      });
    }

    let notification;
    
    switch (trigger) {
      case NOTIFICATION_TRIGGERS.MILESTONE_ACHIEVED:
        notification = createMilestoneNotification(data.milestone);
      break;
      case NOTIFICATION_TRIGGERS.FIRST_PAYMENT_RECEIVED:
        notification = createFirstPaymentNotification(data.amount);
      break;
      case NOTIFICATION_TRIGGERS.WEEKLY_SUMMARY:
        notification = createWeeklySummaryNotification(userStats);
      break;
      case NOTIFICATION_TRIGGERS.STEVEN_TOKENS_AVAILABLE:
        notification = createStevenTokensNotification(data.tokenCount);
      break;
      default:
        return NextResponse.json({ error: 'Unknown trigger' }, { status: 400 });
    }

    // Send notification via Farcaster API
    const notificationResponse = await sendFarcasterNotification(user.fid, notification);
    
    return NextResponse.json({
      success: true,
      notification_sent: true,
      notification_id: notificationResponse?.id
    });

  } catch (error) {
    console.error('Notification request error:', error);
    return NextResponse.json({ error: 'Failed to process notification' }, { status: 500 });
  }
}

async function handleUserInstall(body: any) {
  try {
    const { user } = body.data || {};
    
    if (!user?.fid) {
      return NextResponse.json({ error: 'User FID required' }, { status: 400 });
    }

    console.log('User installed X402 Mini App:', user.fid);
    
    // Send welcome notification after a short delay
    setTimeout(async () => {
      const welcomeNotification = {
        title: "🎉 Welcome to X402 Protocol!",
        body: "Start monetizing your content with crypto payments. Create your first X402 link now!",
        targetUrl: `${process.env.NEXT_PUBLIC_URL}?tab=settings`,
        icon: `${process.env.NEXT_PUBLIC_URL}/images/icon.png`
      };
      
      await sendFarcasterNotification(user.fid, welcomeNotification);
    }, 5000); // 5 second delay
    
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('User install error:', error);
    return NextResponse.json({ error: 'Failed to process install' }, { status: 500 });
  }
}

async function handleUserUninstall(body: any) {
  try {
    const { user } = body.data || {};
    
    if (user?.fid) {
      console.log('User uninstalled X402 Mini App:', user.fid);
      // Could track this for analytics
    }
    
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('User uninstall error:', error);
    return NextResponse.json({ error: 'Failed to process uninstall' }, { status: 500 });
  }
}

async function handleFrameInteraction(body: any) {
  try {
    const { user, frame_data } = body.data || {};
    
    if (!user?.fid) {
      return NextResponse.json({ error: 'User FID required' }, { status: 400 });
    }

    console.log('Frame interaction:', {
      fid: user.fid,
      button: frame_data?.button_index,
      frame_url: frame_data?.frame_url?.substring(0, 100) + '...'
    });
    
    // Track frame interactions for analytics
    // Could trigger milestone checks here
    
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Frame interaction error:', error);
    return NextResponse.json({ error: 'Failed to process frame interaction' }, { status: 500 });
  }
}

// Notification Creation Functions
function createMilestoneNotification(milestone: Milestone) {
  return {
    title: milestone.notification.title,
    body: milestone.notification.body,
    targetUrl: milestone.notification.targetUrl || `${process.env.NEXT_PUBLIC_URL}?tab=rewards`,
    icon: `${process.env.NEXT_PUBLIC_URL}/images/ninja-icon.png`
  };
}

function createFirstPaymentNotification(amount: number) {
  return {
    title: "💰 First Payment Received!",
    body: `Congratulations! You just earned $${(amount / 100).toFixed(2)} from your X402 content.`,
    targetUrl: `${process.env.NEXT_PUBLIC_URL}?tab=stats`,
    icon: `${process.env.NEXT_PUBLIC_URL}/images/payment-icon.png`
  };
}

function createWeeklySummaryNotification(stats: any) {
  const revenue = (stats.totalRevenue || 0) / 100;
  return {
    title: "📊 Weekly X402 Summary",
    body: `This week: $${revenue.toFixed(2)} earned • ${stats.totalLinks || 0} links • ${stats.totalPurchases || 0} purchases`,
    targetUrl: `${process.env.NEXT_PUBLIC_URL}?tab=stats`,
    icon: `${process.env.NEXT_PUBLIC_URL}/images/stats-icon.png`
  };
}

function createStevenTokensNotification(tokenCount: number) {
  return {
    title: "🥷 Tokens Ready!",
    body: `You have ${tokenCount.toLocaleString()} 🥷 tokens waiting to be claimed!`,
    targetUrl: `${process.env.NEXT_PUBLIC_URL}?tab=rewards`,
    icon: `${process.env.NEXT_PUBLIC_URL}/images/🥷-icon.png`
  };
}

// Send notification via Farcaster API
async function sendFarcasterNotification(fid: string, notification: any) {
  try {
    // This would use the actual Farcaster API when available
    // For now, we'll log the notification
    console.log('Sending notification to FID:', fid, notification);
    
    // Mock response
    return {
      id: `notif_${Date.now()}`,
      sent: true,
      fid,
      notification
    };
    
    // Actual implementation would be:
    // const response = await fetch('https://api.farcaster.xyz/v1/notifications', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${process.env.FARCASTER_API_KEY}`,
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify({
    //     fid,
    //     ...notification
    //   })
    // });
    // 
    // return await response.json();

  } catch (error) {
    console.error('Failed to send Farcaster notification:', error);
    throw error;
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
