import { useAvatar, useName, IdentityResolver } from "@paperclip-labs/whisk-sdk/identity";
import { useFrame } from "@/context/frame-context";
import { useAccount } from "wagmi";
import Image from "next/image";

export function WelcomeMessage() {
  const { context } = useFrame();
  const { address } = useAccount();

  // Get the user's name and avatar from Whisk Identity Kit
  const { data: name, isLoading: nameLoading } = useName({ 
    address: address as `0x${string}`,
    resolverOrder: [
      IdentityResolver.Farcaster,
      IdentityResolver.Ens,
      IdentityResolver.Base
    ]
  });

  const { data: avatar, isLoading: avatarLoading } = useAvatar({ 
    address: address as `0x${string}`,
    resolverOrder: [
      IdentityResolver.Farcaster,
      IdentityResolver.Ens,
      IdentityResolver.Base
    ]
  });

  const displayName = address ? (name || address?.slice(0, 6)) : "anon";
  const isLoading = nameLoading || avatarLoading;

  return (
    <div className="bg-gray-800 py-2 px-4">
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
        <p className="text-gray-200">
          Welcome, <span className="font-medium text-white">{displayName}</span>
        </p>
        {avatar && !isLoading && (
          <div className="relative w-6 h-6 rounded-full overflow-hidden">
            <Image
              src={avatar}
              alt={`${displayName}'s avatar`}
              fill
              className="object-cover"
            />
          </div>
        )}
      </div>
    </div>
  );
} 