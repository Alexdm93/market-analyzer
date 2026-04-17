"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { signOut, useSession } from "next-auth/react";

function SessionGuard() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "authenticated" && session?.error === "UserDeleted") {
      void signOut({ callbackUrl: "/signin" });
    }
  }, [session?.error, status]);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
	return (
		<SessionProvider refetchOnWindowFocus refetchInterval={60}>
			<SessionGuard />
			{children}
		</SessionProvider>
	);
}
