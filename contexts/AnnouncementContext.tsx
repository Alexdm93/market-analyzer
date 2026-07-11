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
  markSeen: (id: string) => void;
};

const AnnouncementContext = createContext<AnnouncementCtx>({
  announcements: [],
  hasUnread: false,
  isLoading: true,
  markSeen: () => {},
});

export function AnnouncementProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSeenIds(new Set(JSON.parse(raw) as string[]));
    } catch {}
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (status !== "authenticated") { setIsLoading(false); return; }
    fetch("/api/announcements", { cache: "default" })
      .then((r) => r.json())
      .then((d: { announcements?: Announcement[] }) => setAnnouncements(d.announcements ?? []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [status]);

  const hasUnread = announcements.some((a) => !seenIds.has(a.id));

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
    <AnnouncementContext.Provider value={{ announcements, hasUnread, isLoading, markSeen }}>
      {children}
    </AnnouncementContext.Provider>
  );
}

export function useAnnouncements() {
  return useContext(AnnouncementContext);
}
