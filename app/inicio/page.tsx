"use client";
import { useEffect, useState } from "react";
import { Calendar, Info, Megaphone, MonitorPlay, Newspaper, X } from "lucide-react";
import { type Announcement, useAnnouncements } from "@/contexts/AnnouncementContext";

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

function TypePill({ type, inline = false }: { type: string; inline?: boolean }) {
  const meta = getTypeMeta(type);
  const Icon = meta.icon;
  if (inline) {
    return (
      <span className={`text-xs font-semibold uppercase tracking-wide ${meta.color}`}>
        {meta.label}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${meta.pill}`}>
      <Icon size={12} aria-hidden />
      {meta.label}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const meta = getTypeMeta(type);
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${meta.color}`}>
      <Icon size={11} aria-hidden />
      {meta.label}
    </span>
  );
}

function MediaThumb({ mediaData, mediaUrl, title, className = "" }: { mediaData: string | null; mediaUrl: string | null; title: string; className?: string }) {
  if (mediaData) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={mediaData} alt={title} className={`h-full w-full object-cover object-center ${className}`} />;
  }
  if (mediaUrl) {
    const ytId = getYouTubeId(mediaUrl);
    if (ytId) {
      return (
        <iframe
          src={`https://www.youtube.com/embed/${ytId}`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className={`h-full w-full border-0 ${className}`}
        />
      );
    }
  }
  return null;
}

function PlaceholderThumb({ type, className = "" }: { type: string; className?: string }) {
  const meta = getTypeMeta(type);
  const Icon = meta.icon;
  const bg: Record<string, string> = {
    noticia: "bg-teal-50",
    fecha: "bg-amber-50",
    aviso: "bg-slate-100",
    presentacion: "bg-violet-50",
  };
  return (
    <div className={`flex h-full w-full items-center justify-center ${bg[type] ?? "bg-slate-100"} ${className}`}>
      <Icon size={28} className={`${meta.color} opacity-40`} aria-hidden />
    </div>
  );
}

function MediaBlock({ mediaData, mediaUrl, title }: { mediaData: string | null; mediaUrl: string | null; title: string }) {
  if (mediaData) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={mediaData} alt={title} className="max-h-[28rem] w-full rounded-[1.25rem] object-cover object-center" />;
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

function AnnouncementModal({ announcement, onClose }: { announcement: Announcement; onClose: () => void }) {
  const meta = getTypeMeta(announcement.type);
  const Icon = meta.icon;

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 rounded-full bg-white/90 p-2 text-slate-500 shadow-md hover:bg-white hover:text-slate-900"
          aria-label="Cerrar"
        >
          <X size={18} />
        </button>
        <div className="overflow-y-auto">
          {(announcement.mediaData || announcement.mediaUrl) && (
            <MediaBlock mediaData={announcement.mediaData} mediaUrl={announcement.mediaUrl} title={announcement.title} />
          )}
          <div className="px-6 py-6 md:px-8 md:py-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${meta.pill}`}>
                <Icon size={12} aria-hidden />
                {meta.label}
              </span>
              {announcement.publishedAt && (
                <time className="text-xs text-slate-400">{formatDate(announcement.publishedAt)}</time>
              )}
            </div>
            <h2 className="mt-4 font-display text-2xl font-bold text-slate-900">{announcement.title}</h2>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-600">{announcement.content}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroCard({ a, onOpen }: { a: Announcement; onOpen: (a: Announcement) => void }) {
  const hasMedia = !!(a.mediaData || a.mediaUrl);
  return (
    <article
      className={`grid cursor-pointer transition-colors hover:bg-slate-50 ${hasMedia ? "md:grid-cols-[55%_1fr]" : ""}`}
      onClick={() => onOpen(a)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(a); }}
      aria-label={a.title}
    >
      {hasMedia && (
        <div className="relative min-h-[220px] overflow-hidden md:min-h-[280px]">
          <MediaThumb mediaData={a.mediaData} mediaUrl={a.mediaUrl} title={a.title} />
        </div>
      )}
      <div className={`flex flex-col justify-center px-7 py-8 ${!hasMedia ? "col-span-full" : ""}`}>
        <h2 className="font-display text-2xl font-bold leading-snug text-slate-900 md:text-3xl">
          {a.title}
        </h2>
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-500">{a.content}</p>
        <div className="mt-5 flex items-center gap-3">
          <TypeBadge type={a.type} />
          {a.publishedAt && (
            <time className="text-xs text-slate-400">{formatDate(a.publishedAt)}</time>
          )}
        </div>
      </div>
    </article>
  );
}

function StripCard({ a, onOpen }: { a: Announcement; onOpen: (a: Announcement) => void }) {
  const hasMedia = !!(a.mediaData || a.mediaUrl);
  return (
    <article
      className="cursor-pointer transition-colors hover:bg-slate-50"
      onClick={() => onOpen(a)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(a); }}
      aria-label={a.title}
    >
      <div className="relative h-[130px] w-full overflow-hidden">
        {hasMedia
          ? <MediaThumb mediaData={a.mediaData} mediaUrl={a.mediaUrl} title={a.title} />
          : <PlaceholderThumb type={a.type} />
        }
      </div>
      <div className="px-4 pb-4 pt-3">
        <p className="line-clamp-3 text-[13px] font-semibold leading-[1.4] text-slate-800">{a.title}</p>
        <div className="mt-2">
          <TypeBadge type={a.type} />
        </div>
      </div>
    </article>
  );
}

function ListCard({ a, onOpen }: { a: Announcement; onOpen: (a: Announcement) => void }) {
  const hasMedia = !!(a.mediaData || a.mediaUrl);
  return (
    <article
      className="grid cursor-pointer grid-cols-[120px_1fr] gap-4 px-5 py-4 transition-colors hover:bg-slate-50 sm:grid-cols-[160px_1fr]"
      onClick={() => onOpen(a)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(a); }}
      aria-label={a.title}
    >
      <div className="relative h-[90px] overflow-hidden rounded-xl sm:h-[100px]">
        {hasMedia
          ? <MediaThumb mediaData={a.mediaData} mediaUrl={a.mediaUrl} title={a.title} />
          : <PlaceholderThumb type={a.type} className="rounded-xl" />
        }
      </div>
      <div className="flex flex-col justify-center">
        <TypePill type={a.type} inline />
        <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-slate-900">{a.title}</h3>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{a.content}</p>
        {a.publishedAt && (
          <time className="mt-1.5 text-[11px] text-slate-400">{formatDate(a.publishedAt)}</time>
        )}
      </div>
    </article>
  );
}

export default function InicioPage() {
  const { announcements, markSeen } = useAnnouncements();
  const [selected, setSelected] = useState<Announcement | null>(null);

  function openAnnouncement(a: Announcement) {
    setSelected(a);
    markSeen(a.id);
  }

  const hero  = announcements[0] ?? null;
  const strip = announcements.slice(1, 6);
  const list  = announcements.slice(6);

  return (
    <>
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

          {announcements.length === 0 && (
            <section className="surface-card rounded-[2rem] p-8 text-sm leading-7 text-slate-600">
              No hay anuncios publicados aún. Vuelve pronto.
            </section>
          )}

          {hero && (
            <div className="surface-card overflow-hidden rounded-[2rem]">
              <HeroCard a={hero} onOpen={openAnnouncement} />

              {strip.length > 0 && (
                <>
                  <div className="border-t border-slate-100" />
                  <div className={`grid divide-x divide-slate-100 ${
                    strip.length === 1 ? "grid-cols-1" :
                    strip.length === 2 ? "grid-cols-2" :
                    strip.length === 3 ? "grid-cols-3" :
                    strip.length === 4 ? "grid-cols-2 sm:grid-cols-4" :
                    "grid-cols-2 sm:grid-cols-3 md:grid-cols-5"
                  }`}>
                    {strip.map((a) => (
                      <StripCard key={a.id} a={a} onOpen={openAnnouncement} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {list.length > 0 && (
            <div className="surface-card overflow-hidden rounded-[2rem] divide-y divide-slate-100">
              {list.map((a) => (
                <ListCard key={a.id} a={a} onOpen={openAnnouncement} />
              ))}
            </div>
          )}
        </div>
      </main>

      {selected && (
        <AnnouncementModal announcement={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
