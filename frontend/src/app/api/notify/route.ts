import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { userId, type, title, body, targetUrl, data } = await request.json();

    // Validate required fields
    if (!userId || !type || !title || !body) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, type, title, body' },
        { status: 400 }
      );
    }

    // For now, store in localStorage simulation (in production, use Redis)
    const notification = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      type,
      title,
      body,
      targetUrl,
      data,
      sentAt: new Date().toISOString(),
      read: false
    };

    // In production, this would use the NotificationClient
    // const notificationClient = NotificationClient.getInstance();
    // const success = await notificationClient.sendNotification({
    //   type,
    //   title,
    //   body,
    //   targetUrl,
    //   userId,
    //   data
    // });

    // For development, simulate success
    const success = true;

    if (success) {
      return NextResponse.json({ 
        success: true, 
        notificationId: notification.id,
        message: 'Notification sent successfully'
      });
    } else {
      return NextResponse.json(
        { error: 'Failed to send notification' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Notification API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId parameter required' },
        { status: 400 }
      );
    }

    // In production, this would use Redis
    // const notificationClient = NotificationClient.getInstance();
    // const notifications = await notificationClient.getUserNotifications(userId, limit);

    // For development, return empty array
    const notifications: any[] = [];

    return NextResponse.json({ 
      notifications,
      count: notifications.length,
      hasMore: notifications.length === limit
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 