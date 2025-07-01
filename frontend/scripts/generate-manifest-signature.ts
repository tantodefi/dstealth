#!/usr/bin/env tsx

/**
 * Generate Account Association Signature for Farcaster Mini App Manifest
 * 
 * This script helps generate the JSON Farcaster Signature (JFS) required
 * for the accountAssociation field in .well-known/farcaster.json
 * 
 * Usage:
 * 1. Set your domain in the DOMAIN constant
 * 2. Set your Farcaster FID in the FID constant  
 * 3. Run: npx tsx scripts/generate-manifest-signature.ts
 * 4. Sign the message with your Farcaster custody address
 * 5. Update the manifest with the generated values
 */

import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet } from 'viem/chains';

// Configuration - UPDATE THESE VALUES
const DOMAIN = process.env.NEXT_PUBLIC_URL?.replace(/^https?:\/\//, '') || 'dstealth.app';
const FID = process.env.FARCASTER_FID || '000000'; // Replace with your Farcaster FID

// JSON Farcaster Signature (JFS) Format
interface JFSHeader {
  fid: number;
  type: 'custody';
  key: string; // custody address
}

interface JFSPayload {
  domain: string;
}

function generateManifestSignature() {
  console.log('🎯 Farcaster Mini App Manifest Generator');
  console.log('=====================================\n');

  // Step 1: Generate the payload
  const payload: JFSPayload = {
    domain: DOMAIN
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
  
  console.log('📝 STEP 1: Payload Generated');
  console.log(`Domain: ${DOMAIN}`);
  console.log(`Encoded Payload: ${encodedPayload}`);
  console.log(`Decoded: ${JSON.stringify(payload, null, 2)}\n`);

  // Step 2: Instructions for header generation
  console.log('🔑 STEP 2: Generate Header');
  console.log('You need to create a header with your Farcaster custody address:');
  console.log('');
  console.log('Header structure:');
  console.log(`{`);
  console.log(`  "fid": ${FID},`);
  console.log(`  "type": "custody",`);
  console.log(`  "key": "YOUR_CUSTODY_ADDRESS_HERE"`);
  console.log(`}`);
  console.log('');

  // Step 3: Signing instructions
  console.log('✍️  STEP 3: Sign with Custody Address');
  console.log('1. Get your Farcaster custody address from Warpcast settings');
  console.log('2. Use that address to sign this exact message:');
  console.log('');
  console.log('MESSAGE TO SIGN:');
  console.log('================');
  console.log(JSON.stringify(payload));
  console.log('================');
  console.log('');
  console.log('3. You can sign using:');
  console.log('   - Warpcast (go to Settings > Advanced > Signature)');
  console.log('   - MetaMask personal_sign');
  console.log('   - Any Ethereum wallet with personal message signing');
  console.log('');

  // Step 4: Assembly instructions
  console.log('🔨 STEP 4: Assemble the Account Association');
  console.log('Once you have the signature, create base64 encoded values:');
  console.log('');
  console.log('const header = Buffer.from(JSON.stringify({');
  console.log(`  fid: ${FID},`);
  console.log('  type: "custody",');
  console.log('  key: "YOUR_CUSTODY_ADDRESS"');
  console.log('})).toString("base64");');
  console.log('');
  console.log('const payload = "' + encodedPayload + '";');
  console.log('');
  console.log('const signature = Buffer.from("YOUR_SIGNATURE_HERE").toString("base64");');
  console.log('');

  // Step 5: Example output
  console.log('📄 STEP 5: Update Manifest');
  console.log('Replace the placeholders in frontend/public/.well-known/farcaster.json:');
  console.log('');
  console.log('```json');
  console.log('{');
  console.log('  "accountAssociation": {');
  console.log('    "header": "BASE64_ENCODED_HEADER",');
  console.log(`    "payload": "${encodedPayload}",`);
  console.log('    "signature": "BASE64_ENCODED_SIGNATURE"');
  console.log('  },');
  console.log('  // ... rest of manifest');
  console.log('}');
  console.log('```');
  console.log('');

  // Verification steps
  console.log('✅ STEP 6: Verification');
  console.log('Test your manifest at: https://' + DOMAIN + '/.well-known/farcaster.json');
  console.log('Ensure it returns valid JSON with your account association.');
  console.log('');

  console.log('🚀 Ready for testing!');
}

// Alternative: Interactive signature generation
async function interactiveSignature() {
  console.log('\n🔧 ALTERNATIVE: Generate Signature Programmatically');
  console.log('If you have access to a private key for your custody address:');
  console.log('');

  const payload = { domain: DOMAIN };
  const message = JSON.stringify(payload);
  
  console.log('Message to sign:', message);
  console.log('');
  console.log('Example code:');
  console.log('```typescript');
  console.log('import { createWalletClient, http } from "viem";');
  console.log('import { privateKeyToAccount } from "viem/accounts";');
  console.log('import { mainnet } from "viem/chains";');
  console.log('');
  console.log('const privateKey = "YOUR_CUSTODY_PRIVATE_KEY" as `0x${string}`;');
  console.log('const account = privateKeyToAccount(privateKey);');
  console.log('const client = createWalletClient({');
  console.log('  account,');
  console.log('  chain: mainnet,');
  console.log('  transport: http()');
  console.log('});');
  console.log(`const message = '${message}';`);
  console.log('const signature = await client.signMessage({ message });');
  console.log('console.log("Signature:", signature);');
  console.log('```');
}

if (require.main === module) {
  generateManifestSignature();
  interactiveSignature();
} 