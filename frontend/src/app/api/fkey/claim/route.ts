import { NextResponse } from 'next/server';
import { verifyProof } from '@reclaimprotocol/js-sdk';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { fkeyId, owner, convosUsername, convosXmtpId, fkeyProof, convosProof } = body;

    // Validate required fields
    if (!fkeyId || !owner || !convosUsername || !convosXmtpId || !fkeyProof || !convosProof) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify both proofs
    console.log('=== Verifying fkey.id proof ===');
    const isFkeyProofValid = await verifyProof(fkeyProof);
    if (!isFkeyProofValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid fkey.id proof' },
        { status: 400 }
      );
    }

    console.log('=== Verifying convos.org proof ===');
    const isConvosProofValid = await verifyProof(convosProof);
    if (!isConvosProofValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid convos.org proof' },
        { status: 400 }
      );
    }

    // Make request to fkey.id API to claim the username
    const fkeyResponse = await fetch('https://api.fkey.id/v1/claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: fkeyId,
        owner,
        convosUsername,
        convosXmtpId,
        fkeyProof,
        convosProof
      })
    });

    if (!fkeyResponse.ok) {
      const errorData = await fkeyResponse.json().catch(() => ({}));
      return NextResponse.json(
        { 
          success: false, 
          error: errorData.error || `Failed to claim fkey.id: ${fkeyResponse.status}` 
        },
        { status: fkeyResponse.status }
      );
    }

    const data = await fkeyResponse.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error claiming fkey.id:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to claim fkey.id' 
      },
      { status: 500 }
    );
  }
} 