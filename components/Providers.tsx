"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { signOut, useSession } from "next-auth/react";
import { AnnouncementProvider } from "@/contexts/AnnouncementContext";
import { WorkspaceNotificationProvider } from "@/contexts/WorkspaceNotificationContext";

const PUBLIC_PATHS = new Set(["/signin", "/register"]);

function SessionGuard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "authenticated" && session?.error === "UserDeleted") {
      void signOut({ callbackUrl: "/signin" });
    }
  }, [session?.error, status]);

  useEffect(() => {
    if (status === "unauthenticated" && !PUBLIC_PATHS.has(pathname)) {
      router.push("/signin");
    }
  }, [status, pathname, router]);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
	return (
		<SessionProvider refetchOnWindowFocus refetchInterval={60}>
			<SessionGuard />
			<AnnouncementProvider>
				<WorkspaceNotificationProvider>
					{children}
				</WorkspaceNotificationProvider>
			</AnnouncementProvider>
		</SessionProvider>
	);
}
