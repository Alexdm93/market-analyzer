"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

const STORAGE_KEY = "si_seen_announcements";

export type Announcement = {
  id: string;
  title: string;
  content: string;
  type: string;
  publishedAt: string | null;
  mediaData: string | null;
  mediaUrl: string | null;
};

type AnnouncementCtx = {
  announcements: Announcement[];
  hasUnread: boolean;
  isLoading: boolean;
  hasError: boolean;
  retry: () => void;
  markSeen: (id: string) => void;
};

const AnnouncementContext = createContext<AnnouncementCtx>({
  announcements: [],
  hasUnread: false,
  isLoading: true,
  hasError: false,
  retry: () => {},
  markSeen: () => {},
});

export function AnnouncementProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSeenIds(new Set(JSON.parse(raw) as string[]));
    } catch {}
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (status !== "authenticated") { setIsLoading(false); return; }
    setIsLoading(true);
    setHasError(false);

    let cancelled = false;

    async function load(attemptsLeft: number) {
      try {
        const r = await fetch("/api/announcements", { cache: "default" });
        if (!r.ok) throw new Error(`${r.status}`);
        const d = (await r.json()) as { announcements?: Announcement[] };
        if (!cancelled) {
          setAnnouncements(d.announcements ?? []);
          setIsLoading(false);
        }
      } catch {
        if (cancelled) return;
        if (attemptsLeft > 0) {
          await new Promise((res) => setTimeout(res, 2000));
          if (!cancelled) void load(attemptsLeft - 1);
        } else {
          setHasError(true);
          setIsLoading(false);
        }
      }
    }

    void load(2);
    return () => { cancelled = true; };
  }, [status, retryCount]);

  const hasUnread = announcements.some((a) => !seenIds.has(a.id));

  const retry = useCallback(() => setRetryCount((n) => n + 1), []);

  const markSeen = useCallback((id: string) => {
    setSeenIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  return (
    <AnnouncementContext.Provider value={{ announcements, hasUnread, isLoading, hasError, retry, markSeen }}>
      {children}
    </AnnouncementContext.Provider>
  );
}

export function useAnnouncements() {
  return useContext(AnnouncementContext);
}
