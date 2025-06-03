import Link from "next/link";
import { env } from "@/lib/env";
import { useEruda } from "@/providers/eruda";
import LogoutButton from "./LogoutButton";
import { WelcomeMessage } from "./WelcomeMessage";
import { useXMTP } from "@/context/xmtp-context";

interface HeaderProps {
  onLogout?: () => void;
  isConnected?: boolean;
  onShowEarningsChart?: () => void;
}

export function Header({ onLogout, isConnected, onShowEarningsChart }: HeaderProps) {
  // Use the Eruda context to access toggle functionality
  const { isVisible, toggleEruda } = useEruda();
  const { client } = useXMTP();

  return (
    <>
    <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
      <Link href="/" className="flex items-center gap-2">
        <span className="text-white font-medium">myf🖕key</span>
      </Link>

        <div className="flex items-center space-x-4">
        {env.NEXT_PUBLIC_APP_ENV !== "production" && (
          <button
            onClick={toggleEruda}
              className="text-blue-400 hover:text-blue-300 transition-colors px-2 py-1.5 rounded-md border border-gray-200 bg-gray-900">
            Console
          </button>
        )}

          {client && <LogoutButton />}
      </div>
    </header>
      <WelcomeMessage onShowEarningsChart={onShowEarningsChart} />
    </>
  );
}
