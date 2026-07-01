"use client";
import { useEffect, useState } from "react";
import { Calendar, Info, Megaphone, MonitorPlay, Newspaper } from "lucide-react";

type Announcement = {
  id: string;
  title: string;
  content: string;
  type: string;
  publishedAt: string | null;
  mediaData: string | null;
  mediaUrl: string | null;
};

const TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string; pill: string }> = {
  noticia:      { label: "Noticia",        icon: Newspaper,   color: "text-teal-700",   pill: "bg-teal-50 text-teal-700 border-teal-200" },
  fecha:        { label: "Fecha de corte", icon: Calendar,    color: "text-amber-700",  pill: "bg-amber-50 text-amber-700 border-amber-200" },
  aviso:        { label: "Aviso",          icon: Info,        color: "text-slate-600",  pill: "bg-slate-100 text-slate-600 border-slate-200" },
  presentacion: { label: "Presentación",   icon: MonitorPlay, color: "text-violet-700", pill: "bg-violet-50 text-violet-700 border-violet-200" },
};

function getTypeMeta(type: string) {
  return TYPE_META[type] ?? { label: type, icon: Megaphone, color: "text-slate-600", pill: "bg-slate-100 text-slate-600 border-slate-200" };
}

function formatDate(raw: string | null) {
  if (!raw) return "";
  return new Date(raw).toLocaleDateString("es-VE", { year: "numeric", month: "long", day: "numeric" });
}

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match?.[1] ?? null;
}

function MediaBlock({ mediaData, mediaUrl, title }: { mediaData: string | null; mediaUrl: string | null; title: string }) {
  if (mediaData) {
    return (
      <div className="overflow-hidden rounded-[1.25rem]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mediaData} alt={title} className="w-full object-cover" />
      </div>
    );
  }
  if (mediaUrl) {
    const ytId = getYouTubeId(mediaUrl);
    if (ytId) {
      return (
        <div className="aspect-video overflow-hidden rounded-[1.25rem]">
          <iframe
            src={`https://www.youtube.com/embed/${ytId}`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full border-0"
          />
        </div>
      );
    }
  }
  return null;
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

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow mb-3">Plataforma</div>
          <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">
            Bienvenido a Market Analyzer.
          </h1>
          <p className="dashboard-lead mt-3 max-w-3xl text-slate-600">
            Noticias, fechas de cortes, avisos y anuncios del equipo.
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

        {!loading && announcements.length > 0 && (
          <div className="flex flex-col gap-5">
            {announcements.map((a) => {
              const meta = getTypeMeta(a.type);
              const Icon = meta.icon;
              const hasMedia = !!(a.mediaData || a.mediaUrl);

              return (
                <article key={a.id} className="surface-card overflow-hidden rounded-[2rem]">
                  {hasMedia && (
                    <div className="px-5 pt-5 md:px-6 md:pt-6">
                      <MediaBlock mediaData={a.mediaData} mediaUrl={a.mediaUrl} title={a.title} />
                    </div>
                  )}

                  <div className="px-5 py-5 md:px-6 md:py-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${meta.pill}`}>
                        <Icon size={12} aria-hidden />
                        {meta.label}
                      </span>
                      {a.publishedAt && (
                        <time className="text-xs text-slate-400">{formatDate(a.publishedAt)}</time>
                      )}
                    </div>

                    <h2 className="mt-3 font-display text-lg font-bold text-slate-900 md:text-xl">{a.title}</h2>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">{a.content}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
