"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

const KEY_RESULTADOS = "si_last_visit_resultados";
const KEY_DATA       = "si_last_visit_data";

type WorkspaceNotifCtx = {
  hasUnreadResultados: boolean;
  hasUnreadData: boolean;
  markRouteSeen: (route: "resultados" | "data") => void;
};

const WorkspaceNotifContext = createContext<WorkspaceNotifCtx>({
  hasUnreadResultados: false,
  hasUnreadData: false,
  markRouteSeen: () => {},
});

type Meta = { workspaceUpdatedAt: string | null; publishedCount: number };

function readTs(key: string): number {
  try { return Number(localStorage.getItem(key) ?? "0"); } catch { return 0; }
}

function writeTs(key: string) {
  try { localStorage.setItem(key, String(Date.now())); } catch {}
}

export function WorkspaceNotificationProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [meta, setMeta] = useState<Meta>({ workspaceUpdatedAt: null, publishedCount: 0 });
  const [lastVisitResultados, setLastVisitResultados] = useState(0);
  const [lastVisitData, setLastVisitData] = useState(0);

  useEffect(() => {
    setLastVisitResultados(readTs(KEY_RESULTADOS));
    setLastVisitData(readTs(KEY_DATA));
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/workspace/meta", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Meta) => setMeta(d))
      .catch(() => {});
  }, [status]);

  const updatedTs = meta.workspaceUpdatedAt ? new Date(meta.workspaceUpdatedAt).getTime() : 0;

  const hasUnreadResultados = updatedTs > 0 && meta.publishedCount > 0 && updatedTs > lastVisitResultados;
  const hasUnreadData       = updatedTs > 0 && updatedTs > lastVisitData;

  const markRouteSeen = useCallback((route: "resultados" | "data") => {
    const key = route === "resultados" ? KEY_RESULTADOS : KEY_DATA;
    writeTs(key);
    if (route === "resultados") setLastVisitResultados(Date.now());
    else setLastVisitData(Date.now());
  }, []);

  return (
    <WorkspaceNotifContext.Provider value={{ hasUnreadResultados, hasUnreadData, markRouteSeen }}>
      {children}
    </WorkspaceNotifContext.Provider>
  );
}

export function useWorkspaceNotification() {
  return useContext(WorkspaceNotifContext);
}
