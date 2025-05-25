import { env } from "./env";

interface FkeyLookupResponse {
  address: string;
  proof: any; // We'll store the proof for later use
}

export async function lookupFkeyProfile(username: string): Promise<FkeyLookupResponse> {
  const response = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/api/fkey/lookup/${encodeURIComponent(username)}`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to lookup profile');
  }
  
  return response.json();
} 