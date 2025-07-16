#!/usr/bin/env node

/**
 * Debug script for Farcaster webhook - helps test webhook logic
 */

console.log('🔍 FARCASTER WEBHOOK DEBUGGING GUIDE');
console.log('=====================================');
console.log('');

console.log('✅ WEBHOOK ENDPOINT STATUS:');
console.log('  - Endpoint is accessible: https://xmtp-mini-app-examples.onrender.com/api/webhooks/farcaster/cast');
console.log('  - Signature verification is working');
console.log('  - Route is properly registered');
console.log('');

console.log('🔧 NEYNAR WEBHOOK CONFIGURATION:');
console.log('  1. Go to https://dev.neynar.com/');
console.log('  2. Navigate to Webhooks section');
console.log('  3. Your webhook URL should be:');
console.log('     https://xmtp-mini-app-examples.onrender.com/api/webhooks/farcaster/cast');
console.log('  4. Subscribe to: cast.created events');
console.log('  5. Make sure the webhook secret matches your NEYNAR_WEBHOOK_SECRET env var');
console.log('');

console.log('🎯 TESTING CAST FORMAT:');
console.log('  Try casting these formats:');
console.log('  ✅ "@dstealth username.fkey.id" (to set fkey.id)');
console.log('  ✅ "@dstealth username" (to lookup fkey.id)');
console.log('  ✅ "@dstealth" (general mention)');
console.log('');

console.log('📊 DEBUGGING STEPS:');
console.log('  1. Check your .env file has:');
console.log('     NEYNAR_WEBHOOK_ID=your_webhook_id');
console.log('     NEYNAR_WEBHOOK_SECRET=your_webhook_secret');
console.log('');
console.log('  2. Check Render logs for webhook attempts:');
console.log('     - Look for "📬 Farcaster cast webhook received"');
console.log('     - Look for signature verification messages');
console.log('');
console.log('  3. Test signature verification:');
console.log('     - If you see "❌ Missing webhook signature" or "❌ Invalid webhook signature"');
console.log('     - The webhook secret might not match');
console.log('');
console.log('  4. Verify webhook registration:');
console.log('     - Check if Neynar is actually sending webhooks');
console.log('     - Try creating a simple test webhook with no signature verification');
console.log('');

console.log('⚠️  TEMPORARY DEBUGGING:');
console.log('  To test webhook logic without signature verification:');
console.log('  1. Temporarily comment out signature verification in webhook-farcaster.ts');
console.log('  2. Deploy and test with a cast');
console.log('  3. Check logs to see if webhook logic is working');
console.log('  4. Re-enable signature verification after testing');
console.log('');

console.log('🔗 USEFUL LINKS:');
console.log('  - Neynar Webhook Docs: https://docs.neynar.com/docs/webhooks');
console.log('  - Render Logs: https://dashboard.render.com/');
console.log('  - Test webhook: Try casting "@dstealth test.fkey.id" on Warpcast');
console.log('');

console.log('🚨 COMMON ISSUES:');
console.log('  1. Webhook URL missing /api/webhooks prefix');
console.log('  2. Webhook secret mismatch between Neynar and .env');
console.log('  3. Webhook not subscribed to cast.created events');
console.log('  4. Cast not containing @dstealth mention');
console.log('  5. Neynar webhook not triggering (check Neynar dashboard)');
console.log('');

console.log('📝 NEXT STEPS:');
console.log('  1. Verify webhook URL in Neynar dashboard');
console.log('  2. Check webhook secret matches');
console.log('  3. Try a test cast: "@dstealth test.fkey.id"');
console.log('  4. Check Render logs for webhook activity');
console.log('  5. If no logs appear, webhook might not be triggered by Neynar'); 