import { NextRequest, NextResponse } from 'next/server';

interface CleanupMetrics {
  type: string;
  metrics: {
    timestamp: number;
    clientsContacted: number;
    successfulCleanups: number;
    totalKeysRemoved: number;
    results: Array<{
      status: string;
      keysRemoved: number;
      keysScanned?: number;
      removedKeys?: string[];
      errors?: string[];
    }>;
  };
  userAgent: string;
  url: string;
}

export async function POST(request: NextRequest) {
  try {
    const data: CleanupMetrics = await request.json();
    
    // Log the cleanup metrics for monitoring
    const timestamp = new Date(data.metrics.timestamp).toISOString();
    
    console.log('🧹 SERVICE WORKER CLEANUP METRICS:');
    console.log('==================================');
    console.log(`Timestamp: ${timestamp}`);
    console.log(`Clients Contacted: ${data.metrics.clientsContacted}`);
    console.log(`Successful Cleanups: ${data.metrics.successfulCleanups}`);
    console.log(`Total Keys Removed: ${data.metrics.totalKeysRemoved}`);
    console.log(`User Agent: ${data.userAgent}`);
    console.log(`Origin: ${data.url}`);
    
    // Log individual client results
    if (data.metrics.results && data.metrics.results.length > 0) {
      console.log('\n📊 Individual Client Results:');
      data.metrics.results.forEach((result, index) => {
        console.log(`  Client ${index + 1}:`);
        console.log(`    Status: ${result.status}`);
        console.log(`    Keys Scanned: ${result.keysScanned || 'N/A'}`);
        console.log(`    Keys Removed: ${result.keysRemoved}`);
        if (result.errors && result.errors.length > 0) {
          console.log(`    Errors: ${result.errors.join(', ')}`);
        }
        if (result.removedKeys && result.removedKeys.length > 0) {
          console.log(`    Removed Keys: ${result.removedKeys.slice(0, 5).join(', ')}${result.removedKeys.length > 5 ? '...' : ''}`);
        }
      });
    }
    
    // Calculate effectiveness metrics
    const effectiveness = data.metrics.clientsContacted > 0 
      ? (data.metrics.successfulCleanups / data.metrics.clientsContacted * 100).toFixed(1)
      : '0';
    
    console.log(`\n✅ Cleanup Effectiveness: ${effectiveness}% (${data.metrics.successfulCleanups}/${data.metrics.clientsContacted} clients)`);
    
    if (data.metrics.totalKeysRemoved > 0) {
      console.log(`🗑️ Payment Link Security: ${data.metrics.totalKeysRemoved} stale keys removed from user sessions`);
    } else {
      console.log(`✨ Payment Link Security: No stale payment data found (already clean)`);
    }
    
    // Return success response
    return NextResponse.json({
      success: true,
      message: 'Cleanup metrics recorded',
      summary: {
        timestamp,
        clientsContacted: data.metrics.clientsContacted,
        successfulCleanups: data.metrics.successfulCleanups,
        totalKeysRemoved: data.metrics.totalKeysRemoved,
        effectiveness: `${effectiveness}%`
      }
    });
    
  } catch (error) {
    console.error('❌ Error processing cleanup metrics:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to process cleanup metrics' 
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Service Worker Cleanup Metrics Endpoint',
    description: 'POST endpoint for receiving payment link cleanup metrics from service workers',
    usage: 'This endpoint logs cleanup effectiveness for monitoring payment link security'
  });
} 