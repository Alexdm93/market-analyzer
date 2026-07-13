"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, ImageIcon, Loader2, Megaphone, Pencil, Plus, Trash2, Video, X } from "lucide-react";

type Announcement = {
  id: string;
  title: string;
  content: string;
  type: string;
  published: boolean;
  publishedAt: string | null;
  sortOrder: number;
  mediaData: string | null;
  mediaUrl: string | null;
  createdAt: string;
};

const TYPE_OPTIONS = [
  { value: "aviso",        label: "Aviso" },
  { value: "noticia",      label: "Noticia" },
  { value: "fecha",        label: "Fecha de corte" },
  { value: "presentacion", label: "Presentación" },
];

const TYPE_BADGE: Record<string, string> = {
  aviso:        "bg-slate-100 text-slate-700",
  noticia:      "bg-teal-50 text-teal-700",
  fecha:        "bg-amber-50 text-amber-700",
  presentacion: "bg-violet-50 text-violet-700",
};

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

function formatDate(raw: string | null) {
  if (!raw) return "—";
  return new Date(raw).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type MediaType = "none" | "image" | "video";
type FormState = {
  title: string;
  content: string;
  type: string;
  mediaType: MediaType;
  mediaData: string;
  mediaUrl: string;
};

const EMPTY_FORM: FormState = { title: "", content: "", type: "aviso", mediaType: "none", mediaData: "", mediaUrl: "" };

export default function AdminAnunciosPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState("");
  const [mediaError, setMediaError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const fileRef = useRef<HTMLInputElement>(null);

  function notify(msg: string) {
    setNotification(msg);
    setTimeout(() => setNotification(""), 3500);
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/announcements", { cache: "no-store" });
      const data = (await res.json()) as { announcements?: Announcement[] };
      setAnnouncements(data.announcements ?? []);
    } catch {
      notify("Error al cargar anuncios.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setMediaError("");
    setShowForm(true);
  }

  function openEdit(a: Announcement) {
    setEditingId(a.id);
    const mediaType: MediaType = a.mediaData ? "image" : a.mediaUrl ? "video" : "none";
    setForm({ title: a.title, content: a.content, type: a.type, mediaType, mediaData: a.mediaData ?? "", mediaUrl: a.mediaUrl ?? "" });
    setMediaError("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setMediaError("");
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaError("");
    if (file.size > MAX_BYTES) {
      setMediaError("La imagen supera el límite de 2 MB. Comprime el archivo e intenta de nuevo.");
      e.target.value = "";
      return;
    }
    const base64 = await fileToBase64(file);
    setForm((f) => ({ ...f, mediaData: base64 }));
  }

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) {
      notify("Título y contenido son obligatorios.");
      return;
    }
    if (form.mediaType === "image" && !form.mediaData) {
      notify("Selecciona una imagen.");
      return;
    }
    if (form.mediaType === "video" && !form.mediaUrl.trim()) {
      notify("Ingresa el link del video.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...(editingId ? { id: editingId } : {}),
        title: form.title,
        content: form.content,
        type: form.type,
        mediaData: form.mediaType === "image" ? form.mediaData : null,
        mediaUrl: form.mediaType === "video" ? form.mediaUrl : null,
      };
      const res = await fetch("/api/admin/announcements", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      notify(editingId ? "Anuncio actualizado." : "Anuncio creado.");
      closeForm();
      await load();
    } catch {
      notify("Error al guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePublish(a: Announcement) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, published: !a.published }),
      });
      if (!res.ok) throw new Error();
      notify(a.published ? "Anuncio despublicado." : "Anuncio publicado.");
      await load();
    } catch {
      notify("Error al actualizar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleMove(id: string, direction: "up" | "down") {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "reorder", direction }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      notify("Error al reordenar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este anuncio permanentemente?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/announcements?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      notify("Anuncio eliminado.");
      await load();
    } catch {
      notify("Error al eliminar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        {/* Header */}
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="eyebrow mb-3">Administración</div>
              <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">Anuncios.</h1>
              <p className="dashboard-lead mt-3 max-w-2xl text-slate-600">
                Crea, edita y publica anuncios que aparecerán en la página de inicio de los usuarios.
              </p>
            </div>
            <button type="button" onClick={openCreate} className="btn btn-primary shrink-0">
              <Plus className="h-4 w-4" />
              Nuevo anuncio
            </button>
          </div>
        </section>

        {/* Notification */}
        {notification && (
          <div className="flex items-center gap-2 rounded-[1.5rem] border border-teal-200 bg-teal-50 px-5 py-3 text-sm font-semibold text-teal-700">
            <Check className="h-4 w-4 shrink-0" />
            {notification}
          </div>
        )}

        {/* Form */}
        {showForm && (
          <section className="surface-card rounded-[2rem] p-6 md:p-8">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-slate-900">
                {editingId ? "Editar anuncio" : "Nuevo anuncio"}
              </h2>
              <button type="button" onClick={closeForm} className="btn btn-secondary">
                <X className="h-4 w-4" /> Cancelar
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_12rem]">
              <div>
                <label htmlFor="anuncio-title" className="field-label">Título</label>
                <input
                  id="anuncio-title"
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="field"
                  placeholder="Ej. Fecha de entrega del corte Q2"
                />
              </div>
              <div>
                <label htmlFor="anuncio-type" className="field-label">Tipo</label>
                <select
                  id="anuncio-type"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="field-select"
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor="anuncio-content" className="field-label">Contenido</label>
              <textarea
                id="anuncio-content"
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                rows={4}
                className="field resize-none"
                placeholder="Escribe el contenido del anuncio..."
              />
            </div>

            {/* Media section */}
            <div className="mt-5 rounded-[1.5rem] border border-slate-200 p-4">
              <div className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">Media (opcional)</div>
              <div className="flex gap-2">
                {(["none", "image", "video"] as MediaType[]).map((mt) => (
                  <button
                    key={mt}
                    type="button"
                    onClick={() => { setForm((f) => ({ ...f, mediaType: mt, mediaData: "", mediaUrl: "" })); setMediaError(""); if (fileRef.current) fileRef.current.value = ""; }}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      form.mediaType === mt
                        ? "border-teal-300 bg-teal-50 text-teal-700"
                        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    {mt === "none" && "Sin media"}
                    {mt === "image" && <><ImageIcon className="h-3.5 w-3.5" /> Imagen</>}
                    {mt === "video" && <><Video className="h-3.5 w-3.5" /> Video (YouTube)</>}
                  </button>
                ))}
              </div>

              {form.mediaType === "image" && (
                <div className="mt-3">
                  <label htmlFor="anuncio-file" className="field-label">Archivo de imagen</label>
                  <input
                    id="anuncio-file"
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="field text-sm"
                  />
                  <p className="mt-1 text-xs text-slate-400">Máximo 2 MB. Se admiten JPG, PNG, GIF, WebP.</p>
                  {mediaError && <p className="mt-1.5 text-xs text-red-600">{mediaError}</p>}
                  {form.mediaData && (
                    <div className="mt-3 overflow-hidden rounded-[1rem]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={form.mediaData} alt="Vista previa" className="max-h-48 w-full object-cover" />
                    </div>
                  )}
                </div>
              )}

              {form.mediaType === "video" && (
                <div className="mt-3">
                  <label htmlFor="anuncio-videourl" className="field-label">Link de YouTube</label>
                  <input
                    id="anuncio-videourl"
                    type="url"
                    value={form.mediaUrl}
                    onChange={(e) => setForm((f) => ({ ...f, mediaUrl: e.target.value }))}
                    className="field"
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeForm} className="btn btn-secondary">
                Cancelar
              </button>
              <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {editingId ? "Guardar cambios" : "Crear anuncio"}
              </button>
            </div>
          </section>
        )}

        {/* List */}
        {loading ? (
          <section className="surface-card rounded-[2rem] p-8 text-sm text-slate-500">
            Cargando anuncios...
          </section>
        ) : announcements.length === 0 ? (
          <section className="surface-card rounded-[2rem] p-8">
            <div className="flex flex-col items-center gap-3 py-6 text-slate-500">
              <Megaphone size={28} className="text-slate-300" />
              <p className="text-sm">No hay anuncios aún. Crea el primero con el botón de arriba.</p>
            </div>
          </section>
        ) : (
          <section className="surface-card overflow-hidden rounded-[2rem]">
            <div className="border-b border-slate-200/70 px-6 py-4">
              <h2 className="font-display text-xl font-bold text-slate-900">Todos los anuncios</h2>
            </div>
            <div className="flex flex-col divide-y divide-slate-100">
              {announcements.map((a, index) => (
                <div key={a.id} className="flex flex-wrap items-start gap-3 px-6 py-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${TYPE_BADGE[a.type] ?? "bg-slate-100 text-slate-700"}`}>
                        {TYPE_OPTIONS.find((t) => t.value === a.type)?.label ?? a.type}
                      </span>
                      {a.mediaData && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                          <ImageIcon className="h-3 w-3" /> Imagen
                        </span>
                      )}
                      {a.mediaUrl && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                          <Video className="h-3 w-3" /> Video
                        </span>
                      )}
                      {a.published ? (
                        <span className="inline-block rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-700">Publicado</span>
                      ) : (
                        <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">Borrador</span>
                      )}
                      {a.publishedAt && (
                        <span className="text-xs text-slate-400">{formatDate(a.publishedAt)}</span>
                      )}
                    </div>
                    <h3 className="mt-1.5 font-display text-base font-bold text-slate-900">{a.title}</h3>
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm leading-6 text-slate-500">{a.content}</p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleMove(a.id, "up")}
                        disabled={saving || index === 0}
                        className="btn btn-secondary px-2 disabled:opacity-30"
                        title="Mover arriba"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(a.id, "down")}
                        disabled={saving || index === announcements.length - 1}
                        className="btn btn-secondary px-2 disabled:opacity-30"
                        title="Mover abajo"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => openEdit(a)}
                      className="btn btn-secondary"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTogglePublish(a)}
                      disabled={saving}
                      className="btn btn-secondary"
                      title={a.published ? "Despublicar" : "Publicar"}
                    >
                      {a.published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      {a.published ? "Despublicar" : "Publicar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(a.id)}
                      disabled={saving}
                      className="btn btn-secondary text-red-600 hover:border-red-200 hover:bg-red-50"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
