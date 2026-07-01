"use client";
import { useEffect, useState } from "react";
import { Calendar, Info, Megaphone, MonitorPlay, Newspaper } from "lucide-react";

type Announcement = {
  id: string;
  title: string;
  content: string;
  type: string;
  publishedAt: string | null;
};

const TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  noticia:      { label: "Noticia",       icon: Newspaper,   color: "text-teal-700",   bg: "bg-teal-50",   border: "border-teal-200" },
  fecha:        { label: "Fecha de corte",icon: Calendar,    color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200" },
  aviso:        { label: "Aviso",         icon: Info,        color: "text-slate-700",  bg: "bg-slate-50",  border: "border-slate-200" },
  presentacion: { label: "Presentación",  icon: MonitorPlay, color: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200" },
};

function getTypeMeta(type: string) {
  return TYPE_META[type] ?? { label: type, icon: Megaphone, color: "text-slate-700", bg: "bg-slate-50", border: "border-slate-200" };
}

function formatDate(raw: string | null) {
  if (!raw) return "";
  return new Date(raw).toLocaleDateString("es-VE", { year: "numeric", month: "long", day: "numeric" });
}

export default function InicioPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    fetch("/api/announcements", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { announcements?: Announcement[] }) => {
        if (!ignore) setAnnouncements(d.announcements ?? []);
      })
      .catch(() => {})
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);

  const pinnedTypes = ["fecha", "noticia", "presentacion", "aviso"];
  const grouped = pinnedTypes.map((type) => ({
    type,
    items: announcements.filter((a) => a.type === type),
  })).filter((g) => g.items.length > 0);

  const otherItems = announcements.filter((a) => !pinnedTypes.includes(a.type));

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow mb-3">Plataforma</div>
          <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">
            Bienvenido a Market Analyzer.
          </h1>
          <p className="dashboard-lead mt-3 max-w-3xl text-slate-600">
            Aquí encontrarás noticias, fechas de cortes, avisos y anuncios publicados por el equipo administrador.
          </p>
        </section>

        {loading && (
          <section className="surface-card rounded-[2rem] p-8 text-sm text-slate-500">
            Cargando anuncios...
          </section>
        )}

        {!loading && announcements.length === 0 && (
          <section className="surface-card rounded-[2rem] p-8 text-sm leading-7 text-slate-600">
            No hay anuncios publicados aún. Vuelve pronto.
          </section>
        )}

        {!loading && grouped.map(({ type, items }) => {
          const meta = getTypeMeta(type);
          const Icon = meta.icon;
          return (
            <section key={type} className="surface-card overflow-hidden rounded-[2rem]">
              <div className={`flex items-center gap-3 border-b px-6 py-4 ${meta.border}`}>
                <div className={`rounded-full p-2 ${meta.bg}`}>
                  <Icon size={16} className={meta.color} aria-hidden />
                </div>
                <h2 className={`font-display text-lg font-bold ${meta.color}`}>{meta.label}s</h2>
              </div>
              <div className="flex flex-col divide-y divide-slate-100">
                {items.map((a) => (
                  <article key={a.id} className="px-6 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-display text-base font-bold text-slate-900">{a.title}</h3>
                      {a.publishedAt && (
                        <time className="shrink-0 text-xs text-slate-400">{formatDate(a.publishedAt)}</time>
                      )}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">{a.content}</p>
                  </article>
                ))}
              </div>
            </section>
          );
        })}

        {!loading && otherItems.length > 0 && (
          <section className="surface-card overflow-hidden rounded-[2rem]">
            <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-4">
              <div className="rounded-full bg-slate-50 p-2">
                <Megaphone size={16} className="text-slate-600" aria-hidden />
              </div>
              <h2 className="font-display text-lg font-bold text-slate-700">Otros anuncios</h2>
            </div>
            <div className="flex flex-col divide-y divide-slate-100">
              {otherItems.map((a) => (
                <article key={a.id} className="px-6 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-display text-base font-bold text-slate-900">{a.title}</h3>
                    {a.publishedAt && (
                      <time className="shrink-0 text-xs text-slate-400">{formatDate(a.publishedAt)}</time>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">{a.content}</p>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
