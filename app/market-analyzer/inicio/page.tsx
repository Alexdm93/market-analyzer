"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Calendar, Info, Megaphone, MonitorPlay, Newspaper, X } from "lucide-react";
import { type Announcement, useAnnouncements } from "@/contexts/AnnouncementContext";

const TYPE_META: Record<string, {
  label: string;
  icon: React.ElementType;
  color: string;
  pill: string;
  pillDark: string;
  accent: string;
  heroBg: string;
}> = {
  noticia:      {
    label: "Noticia",        icon: Newspaper,   color: "text-teal-700",
    pill: "bg-teal-50 text-teal-700 border-teal-200",
    pillDark: "bg-teal-500/25 text-teal-100 border-teal-400/30 backdrop-blur-sm",
    accent: "bg-teal-500",
    heroBg: "bg-gradient-to-br from-teal-900 via-teal-800 to-teal-600",
  },
  fecha:        {
    label: "Fecha de corte", icon: Calendar,    color: "text-amber-700",
    pill: "bg-amber-50 text-amber-700 border-amber-200",
    pillDark: "bg-amber-500/25 text-amber-100 border-amber-400/30 backdrop-blur-sm",
    accent: "bg-amber-500",
    heroBg: "bg-gradient-to-br from-amber-900 via-amber-800 to-orange-600",
  },
  aviso:        {
    label: "Aviso",          icon: Info,        color: "text-slate-600",
    pill: "bg-slate-100 text-slate-600 border-slate-200",
    pillDark: "bg-slate-500/25 text-slate-100 border-slate-400/30 backdrop-blur-sm",
    accent: "bg-slate-400",
    heroBg: "bg-gradient-to-br from-slate-800 via-slate-700 to-slate-500",
  },
  presentacion: {
    label: "Presentación",   icon: MonitorPlay, color: "text-violet-700",
    pill: "bg-violet-50 text-violet-700 border-violet-200",
    pillDark: "bg-violet-500/25 text-violet-100 border-violet-400/30 backdrop-blur-sm",
    accent: "bg-violet-500",
    heroBg: "bg-gradient-to-br from-violet-900 via-violet-800 to-violet-600",
  },
};

function getTypeMeta(type: string) {
  return TYPE_META[type] ?? {
    label: type, icon: Megaphone, color: "text-slate-600",
    pill: "bg-slate-100 text-slate-600 border-slate-200",
    pillDark: "bg-slate-500/25 text-slate-100 border-slate-400/30 backdrop-blur-sm",
    accent: "bg-slate-400",
    heroBg: "bg-gradient-to-br from-slate-800 to-slate-600",
  };
}

function formatDate(raw: string | null) {
  if (!raw) return "";
  return new Date(raw).toLocaleDateString("es-VE", { year: "numeric", month: "long", day: "numeric" });
}

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match?.[1] ?? null;
}

function TypePill({ type, dark = false }: { type: string; dark?: boolean }) {
  const meta = getTypeMeta(type);
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${dark ? meta.pillDark : meta.pill}`}>
      <Icon size={11} aria-hidden />
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

function MediaThumb({
  mediaData, mediaUrl, title, className = "",
}: {
  mediaData: string | null; mediaUrl: string | null; title: string; className?: string;
}) {
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
  return (
    <div className={`flex h-full w-full items-center justify-center ${meta.heroBg} ${className}`}>
      <Icon size={28} className="text-white opacity-20" aria-hidden />
    </div>
  );
}

function MediaBlock({ mediaData, mediaUrl, title }: { mediaData: string | null; mediaUrl: string | null; title: string }) {
  if (mediaData) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={mediaData} alt={title} className="max-h-[28rem] w-full rounded-t-[1.25rem] object-cover object-center" />;
  }
  if (mediaUrl) {
    const ytId = getYouTubeId(mediaUrl);
    if (ytId) {
      return (
        <div className="aspect-video overflow-hidden rounded-t-[1.25rem]">
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div
        className={`absolute inset-0 bg-slate-900/60 backdrop-blur transition-opacity duration-200 ${mounted ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div className={`relative z-10 flex max-h-[95dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl transition-all duration-300 sm:rounded-[2rem] ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 rounded-full bg-white/90 p-2 text-slate-500 shadow-md backdrop-blur-sm hover:bg-white hover:text-slate-900 transition-colors"
          aria-label="Cerrar"
        >
          <X size={18} />
        </button>
        <div className="overflow-y-auto">
          {(announcement.mediaData || announcement.mediaUrl) && (
            <MediaBlock mediaData={announcement.mediaData} mediaUrl={announcement.mediaUrl} title={announcement.title} />
          )}
          {!(announcement.mediaData || announcement.mediaUrl) && (
            <div className={`h-24 w-full ${meta.heroBg}`} />
          )}
          <div className="px-6 py-6 md:px-8 md:py-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TypePill type={announcement.type} />
              {announcement.publishedAt && (
                <time className="text-xs text-slate-400">{formatDate(announcement.publishedAt)}</time>
              )}
            </div>
            <h2 className="mt-4 font-display text-2xl font-bold leading-snug text-slate-900">{announcement.title}</h2>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-600">{announcement.content}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroCard({ a, onOpen }: { a: Announcement; onOpen: (a: Announcement) => void }) {
  const meta = getTypeMeta(a.type);
  const hasMedia = !!(a.mediaData || a.mediaUrl);

  return (
    <article
      className="group relative min-h-[320px] cursor-pointer overflow-hidden md:min-h-[440px]"
      onClick={() => onOpen(a)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(a); }}
      aria-label={a.title}
    >
      {/* Background */}
      <div className="absolute inset-0">
        {hasMedia ? (
          <MediaThumb
            mediaData={a.mediaData}
            mediaUrl={a.mediaUrl}
            title={a.title}
            className="transition-transform duration-700 group-hover:scale-[1.03]"
          />
        ) : (
          <div className={`h-full w-full ${meta.heroBg} transition-transform duration-700 group-hover:scale-[1.03]`} />
        )}
      </div>

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/5" />

      {/* Top badge */}
      <div className="absolute left-5 top-5">
        <TypePill type={a.type} dark />
      </div>

      {/* Content at bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
        <h2 className="font-display text-2xl font-bold leading-snug text-white md:text-3xl lg:text-4xl line-clamp-3 drop-shadow-sm">
          {a.title}
        </h2>
        {a.content && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-white/65 md:text-base">
            {a.content}
          </p>
        )}
        <div className="mt-5 flex items-center justify-between gap-3">
          {a.publishedAt && (
            <time className="text-xs text-white/50">{formatDate(a.publishedAt)}</time>
          )}
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-white/70 transition-colors group-hover:text-white">
            Leer más <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </article>
  );
}

function StripCard({ a, onOpen }: { a: Announcement; onOpen: (a: Announcement) => void }) {
  const meta = getTypeMeta(a.type);
  const hasMedia = !!(a.mediaData || a.mediaUrl);

  return (
    <article
      className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
      onClick={() => onOpen(a)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(a); }}
      aria-label={a.title}
    >
      <div className="relative h-[140px] overflow-hidden">
        {hasMedia ? (
          <MediaThumb
            mediaData={a.mediaData}
            mediaUrl={a.mediaUrl}
            title={a.title}
            className="transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <PlaceholderThumb type={a.type} />
        )}
        <div className={`absolute bottom-0 inset-x-0 h-[3px] ${meta.accent}`} />
      </div>
      <div className="p-3">
        <TypeBadge type={a.type} />
        <p className="mt-1 line-clamp-2 text-[13px] font-semibold leading-snug text-slate-800">{a.title}</p>
        {a.publishedAt && (
          <time className="mt-1.5 block text-[11px] text-slate-400">{formatDate(a.publishedAt)}</time>
        )}
      </div>
    </article>
  );
}

function ListCard({ a, onOpen }: { a: Announcement; onOpen: (a: Announcement) => void }) {
  const meta = getTypeMeta(a.type);
  const hasMedia = !!(a.mediaData || a.mediaUrl);

  return (
    <article
      className="group cursor-pointer transition-colors hover:bg-slate-50/80"
      onClick={() => onOpen(a)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(a); }}
      aria-label={a.title}
    >
      <div className="grid grid-cols-[96px_1fr] gap-4 p-4 sm:grid-cols-[120px_1fr]">
        <div className="relative h-[72px] overflow-hidden rounded-xl sm:h-[84px]">
          {hasMedia ? (
            <MediaThumb
              mediaData={a.mediaData}
              mediaUrl={a.mediaUrl}
              title={a.title}
              className="transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <PlaceholderThumb type={a.type} className="rounded-xl" />
          )}
        </div>
        <div className="flex min-w-0 flex-col justify-center">
          <TypeBadge type={a.type} />
          <h3 className="mt-0.5 line-clamp-2 text-[13px] font-bold leading-snug text-slate-900">{a.title}</h3>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-slate-500">{a.content}</p>
          {a.publishedAt && (
            <time className="mt-1 text-[11px] text-slate-400">{formatDate(a.publishedAt)}</time>
          )}
        </div>
      </div>
      <div className={`h-[2px] w-0 ${meta.accent} transition-all duration-300 group-hover:w-full`} />
    </article>
  );
}

function FeedSkeleton() {
  return (
    <div className="surface-card overflow-hidden rounded-[2rem] animate-pulse">
      <div className="h-[320px] bg-slate-200 md:h-[440px]" />
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-slate-100">
            <div className="h-[140px] bg-slate-200" />
            <div className="space-y-2 p-3">
              <div className="h-2 w-14 rounded bg-slate-200" />
              <div className="h-3 rounded bg-slate-200" />
              <div className="h-3 w-3/4 rounded bg-slate-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function InicioPage() {
  const { announcements, isLoading, hasError, retry, markSeen } = useAnnouncements();
  const [selected, setSelected] = useState<Announcement | null>(null);

  function openAnnouncement(a: Announcement) {
    setSelected(a);
    markSeen(a.id);
  }

  const hero  = announcements[0] ?? null;
  const strip = announcements.slice(1, 6);
  const list  = announcements.slice(6);

  const stripCols =
    strip.length === 1 ? "grid-cols-1" :
    strip.length === 2 ? "grid-cols-2" :
    strip.length === 3 ? "grid-cols-3" :
    strip.length === 4 ? "grid-cols-2 sm:grid-cols-4" :
    "grid-cols-2 sm:grid-cols-3 md:grid-cols-5";

  return (
    <>
      <main className="page-wrap">
        <div className="flex w-full flex-col gap-5">
          {/* Loading skeleton */}
          {isLoading && <FeedSkeleton />}

          {/* Error state */}
          {!isLoading && hasError && (
            <section className="surface-card rounded-[2rem] p-8 text-center">
              <p className="text-sm text-slate-500">No se pudieron cargar los anuncios.</p>
              <button onClick={retry} className="btn btn-secondary mt-4">
                Reintentar
              </button>
            </section>
          )}

          {/* Empty state — solo cuando terminó de cargar sin error */}
          {!isLoading && !hasError && announcements.length === 0 && (
            <section className="surface-card rounded-[2rem] p-8 text-sm leading-7 text-slate-600">
              No hay anuncios publicados aún. Vuelve pronto.
            </section>
          )}

          {/* Featured section: hero + strip */}
          {!isLoading && hero && (
            <div className="surface-card overflow-hidden rounded-[2rem]">
              <HeroCard a={hero} onOpen={openAnnouncement} />

              {strip.length > 0 && (
                <div className={`grid gap-3 p-4 ${stripCols}`}>
                  {strip.map((a) => (
                    <StripCard key={a.id} a={a} onOpen={openAnnouncement} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* List section */}
          {!isLoading && list.length > 0 && (
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
