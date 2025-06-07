import { NextResponse } from "next/server";

export async function GET() {
  const manifest = {
    "accountAssociation": {
      "header": process.env.NEXT_PUBLIC_FARCASTER_HEADER || "",
      "payload": process.env.NEXT_PUBLIC_FARCASTER_PAYLOAD || "", 
      "signature": process.env.NEXT_PUBLIC_FARCASTER_SIGNATURE || ""
    },
    "frame": {
      "name": "X402 Protocol",
      "description": "Crypto payments for content monetization with 🥷 rewards",
      "icon": `${process.env.NEXT_PUBLIC_URL}/icon.png`,
      "homeUrl": process.env.NEXT_PUBLIC_URL || "http://localhost:3000",
      "imageUrl": `${process.env.NEXT_PUBLIC_URL}/api/og/default`,
      "buttonTitle": "Enter X402",
      "splashImageUrl": `${process.env.NEXT_PUBLIC_URL}/splash.png`,
      "splashBackgroundColor": "#000000",
      "webhookUrl": `${process.env.NEXT_PUBLIC_URL}/api/webhook/farcaster`
    },
    "features": {
      "notifications": true,
      "userProfiles": true,
      "payments": true,
      "dynamicImages": true,
      "rewardSystem": true,
      "socialSharing": true
    },
    "version": "1.0.0"
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
