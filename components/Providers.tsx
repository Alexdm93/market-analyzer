"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { signOut, useSession } from "next-auth/react";
import { AnnouncementProvider } from "@/contexts/AnnouncementContext";
import { WorkspaceNotificationProvider } from "@/contexts/WorkspaceNotificationContext";

const PUBLIC_PATHS = new Set(["/", "/signin", "/register", "/market-analyzer/signin", "/market-analyzer/register"]);

function SessionGuard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "authenticated" && session?.error === "UserDeleted") {
      void signOut({ callbackUrl: "/market-analyzer/signin" });
    }
  }, [session?.error, status]);

  useEffect(() => {
    if (status === "unauthenticated" && !PUBLIC_PATHS.has(pathname)) {
      router.push("/market-analyzer/signin");
    }
  }, [status, pathname, router]);

  if (status === "loading" && !PUBLIC_PATHS.has(pathname) && !pathname.startsWith("/market-analyzer/signin") && !pathname.startsWith("/market-analyzer/register")) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-[var(--shell-background)] backdrop-blur-sm">
        <div className="surface-panel flex flex-col items-center gap-5 rounded-[2rem] px-10 py-8 shadow-2xl">
          <svg
            className="h-10 w-10 animate-spin text-teal-700"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <div className="text-center">
            <p className="font-display text-lg font-bold text-slate-900">Verificando sesión</p>
            <p className="mt-1 text-sm text-slate-500">Por favor espera un momento…</p>
          </div>
        </div>
      </div>
    );
  }

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
