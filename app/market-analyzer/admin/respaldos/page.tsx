"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Database, Download, FileJson, HardDrive, Loader2, RotateCcw, Upload, X } from "lucide-react";

type AdminSnapshot = { id: string; label: string; date: string };

type CompanyAnalysis = {
  companyId: string;
  companyName: string;
  status: "lista" | "sobreescribe" | "fuera_de_catalogo" | "empresa_borrada" | "sin_usuario";
  restorable: boolean;
  posicionesEnRespaldo: number;
  posicionesQueSeReemplazan: number;
  fueEnviado: boolean;
  usuarioOriginalAusente: boolean;
  cargosFueraDeCatalogo: string[];
};

type RestoreAnalysis = {
  origen: { snapshotId: string; label: string; date: string; generatedAt: string; wasPublished: boolean };
  destino: { snapshotId: string; existe: boolean; estaPublicado: boolean; label: string | null };
  advertencias: string[];
  empresas: CompanyAnalysis[];
  totales: { empresasRestaurables: number; posicionesARestaurar: number; posicionesQueSeReemplazan: number };
};

type BackupSummary = {
  source: { snapshotId: string; label: string; date: string; wasPublished: boolean };
  counts: { companies: number; userSnapshots: number; submittedCompanies: number; positions: number };
  porEmpresa: Array<{ empresa: string; posiciones: number; enviado: boolean }>;
};

const STATUS_LABEL: Record<CompanyAnalysis["status"], string> = {
  lista: "Lista",
  sobreescribe: "Sobreescribe",
  fuera_de_catalogo: "Cargos fuera de catálogo",
  empresa_borrada: "Empresa eliminada",
  sin_usuario: "Sin usuario",
};

const STATUS_STYLE: Record<CompanyAnalysis["status"], string> = {
  lista: "bg-teal-50 text-teal-700",
  sobreescribe: "bg-amber-50 text-amber-700",
  fuera_de_catalogo: "bg-amber-50 text-amber-700",
  empresa_borrada: "bg-red-50 text-red-700",
  sin_usuario: "bg-red-50 text-red-700",
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(raw: string | null | undefined) {
  if (!raw) return "—";
  return new Date(raw).toLocaleString("es-VE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Un respaldo real pesa varios MB y Vercel corta los cuerpos cerca de 4,5 MB,
 * así que el cuerpo se manda comprimido cuando el navegador lo soporta.
 */
async function postRestore(payload: unknown): Promise<Response> {
  const json = JSON.stringify(payload);

  if (typeof CompressionStream !== "undefined") {
    try {
      const gz = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
      const blob = await new Response(gz).blob();
      return fetch("/api/admin/backups/v2/restore", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: blob,
      });
    } catch {
      // si algo falla al comprimir, se intenta sin comprimir
    }
  }

  return fetch("/api/admin/backups/v2/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: json,
  });
}

type ParsedResponse<T> = {
  ok: boolean;
  data: (T & { message?: string }) | null;
  errorMessage: string;
  timedOut: boolean;
};

/**
 * Lee la respuesta sin asumir que es JSON. Cuando Vercel corta una función por
 * tiempo responde con una página de error, no con JSON, y un res.json() directo
 * terminaba mostrando "Unexpected token… is not valid JSON".
 */
async function readResponse<T>(res: Response, fallback: string): Promise<ParsedResponse<T>> {
  const raw = await res.text();
  let data: (T & { message?: string }) | null = null;
  try {
    data = JSON.parse(raw) as T & { message?: string };
  } catch {
    data = null;
  }

  if (res.ok && data) return { ok: true, data, errorMessage: "", timedOut: false };

  const timedOut = res.status === 504 || /FUNCTION_INVOCATION_TIMEOUT/i.test(raw);
  let errorMessage: string;
  if (timedOut) errorMessage = "El servidor tardó demasiado y cortó la operación.";
  else if (res.status === 413) errorMessage = "El archivo es demasiado grande para enviarlo al servidor.";
  else if (data?.message) errorMessage = data.message;
  else errorMessage = `${fallback} (error ${res.status}).`;

  return { ok: false, data, errorMessage, timedOut };
}

type ApplyResult = { empresas: number; posiciones: number; oculto: boolean; respaldoPrevio: boolean };

export default function RespaldosPage() {
  const [snapshots, setSnapshots] = useState<AdminSnapshot[]>([]);
  const [notification, setNotification] = useState("");
  const [error, setError] = useState("");

  // Crear respaldo
  const [backupSnapshotId, setBackupSnapshotId] = useState("");
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [busyBackup, setBusyBackup] = useState<"" | "summary" | "download" | "store">("");

  // Restaurar
  const [uploaded, setUploaded] = useState<{ data: unknown; name: string; size: number } | null>(null);
  const [storedSourceId, setStoredSourceId] = useState("");
  const [targetSnapshotId, setTargetSnapshotId] = useState("");
  const [targetIsNew, setTargetIsNew] = useState(false);
  const [newTargetId, setNewTargetId] = useState("");
  const [newTargetLabel, setNewTargetLabel] = useState("");
  const [analysis, setAnalysis] = useState<RestoreAnalysis | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [restoreProfile, setRestoreProfile] = useState(false);
  const [restoreConfig, setRestoreConfig] = useState(true);
  const [busyRestore, setBusyRestore] = useState<"" | "analyze" | "apply">("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [hideFromCompanies, setHideFromCompanies] = useState(true);
  const [applyError, setApplyError] = useState<{ message: string; timedOut: boolean } | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState("");

  function notify(msg: string) {
    setError("");
    setNotification(msg);
    setTimeout(() => setNotification(""), 6000);
  }
  function fail(msg: string) {
    setNotification("");
    setError(msg);
  }

  useEffect(() => {
    void fetch("/api/admin/snapshots", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { snapshots?: AdminSnapshot[] }) => setSnapshots(d.snapshots ?? []))
      .catch(() => fail("No se pudieron cargar los cortes."));
  }, []);

  // ── Crear respaldo ────────────────────────────────────────────────────────

  const loadSummary = useCallback(async (snapshotId: string) => {
    if (!snapshotId) { setSummary(null); return; }
    setBusyBackup("summary");
    try {
      const res = await fetch(`/api/admin/backups/v2?snapshotId=${encodeURIComponent(snapshotId)}&summary=1`, { cache: "no-store" });
      const data = (await res.json()) as BackupSummary & { message?: string };
      if (!res.ok) throw new Error(data.message ?? "No se pudo leer el corte.");
      setSummary(data);
    } catch (e) {
      setSummary(null);
      fail(e instanceof Error ? e.message : "Error al leer el corte.");
    } finally {
      setBusyBackup("");
    }
  }, []);

  useEffect(() => { void loadSummary(backupSnapshotId); }, [backupSnapshotId, loadSummary]);

  async function downloadBackup() {
    if (!backupSnapshotId) return;
    setBusyBackup("download");
    try {
      const res = await fetch(`/api/admin/backups/v2?snapshotId=${encodeURIComponent(backupSnapshotId)}`, { cache: "no-store" });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(d?.message ?? "No se pudo generar el respaldo.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `respaldo-${backupSnapshotId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify(`Respaldo descargado (${formatBytes(blob.size)}). Guárdalo fuera del sistema.`);
    } catch (e) {
      fail(e instanceof Error ? e.message : "Error al descargar.");
    } finally {
      setBusyBackup("");
    }
  }

  async function storeBackup() {
    if (!backupSnapshotId) return;
    setBusyBackup("store");
    try {
      const res = await fetch("/api/admin/backups/v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: backupSnapshotId }),
      });
      const data = (await res.json()) as { message?: string; tamañoBytes?: number };
      if (!res.ok) throw new Error(data.message ?? "No se pudo guardar.");
      notify(`${data.message} Tamaño: ${formatBytes(data.tamañoBytes ?? 0)}`);
    } catch (e) {
      fail(e instanceof Error ? e.message : "Error al guardar el respaldo.");
    } finally {
      setBusyBackup("");
    }
  }

  // ── Restaurar ─────────────────────────────────────────────────────────────

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalysis(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as unknown;
        setUploaded({ data: parsed, name: file.name, size: file.size });
        setStoredSourceId("");
        const src = (parsed as { source?: { snapshotId?: string } })?.source?.snapshotId;
        if (src && !targetSnapshotId) setTargetSnapshotId(src);
        notify(`Archivo cargado: ${file.name} (${formatBytes(file.size)})`);
      } catch {
        fail("El archivo no es un JSON válido.");
      }
    };
    reader.readAsText(file);
  }

  const effectiveTarget = targetIsNew ? newTargetId : targetSnapshotId;

  async function analyze() {
    setAnalyzeError("");
    if (!uploaded && !storedSourceId) { setAnalyzeError("Sube un archivo o elige un respaldo guardado."); return; }
    if (targetIsNew && !newTargetId) { setAnalyzeError("Indica la fecha del corte nuevo."); return; }
    setBusyRestore("analyze");
    setAnalysis(null);
    try {
      const res = await postRestore({
        mode: "analyze",
        backup: uploaded?.data,
        fromStoredSnapshotId: uploaded ? undefined : storedSourceId,
        targetSnapshotId: effectiveTarget || undefined,
      });
      const parsed = await readResponse<RestoreAnalysis>(res, "No se pudo analizar el respaldo");
      if (!parsed.ok || !parsed.data) {
        setAnalyzeError(parsed.timedOut ? "El servidor tardó demasiado en analizar el respaldo. Intenta de nuevo." : parsed.errorMessage);
        return;
      }
      const data = parsed.data;
      setAnalysis(data);
      setSelected(new Set(data.empresas.filter((e) => e.restorable).map((e) => e.companyId)));
      if (!targetIsNew && !targetSnapshotId) setTargetSnapshotId(data.destino.snapshotId);
    } catch {
      setAnalyzeError("No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setBusyRestore("");
    }
  }

  async function apply() {
    if (!analysis) return;
    setBusyRestore("apply");
    setApplyError(null);
    setApplyResult(null);
    try {
      const res = await postRestore({
        mode: "apply",
        backup: uploaded?.data,
        fromStoredSnapshotId: uploaded ? undefined : storedSourceId,
        targetSnapshotId: analysis.destino.snapshotId,
        targetLabel: targetIsNew ? newTargetLabel : undefined,
        companyIds: [...selected],
        restoreCompanyProfile: restoreProfile,
        restoreConfig,
        hideFromCompanies,
      });
      const parsed = await readResponse<{
        empresasRestauradas?: number;
        posicionesRestauradas?: number;
        respaldoPrevioGuardado?: boolean;
      }>(res, "No se pudo restaurar");

      if (!parsed.ok || !parsed.data) {
        setApplyError({ message: parsed.errorMessage, timedOut: parsed.timedOut });
        return;
      }
      setApplyResult({
        empresas: parsed.data.empresasRestauradas ?? 0,
        posiciones: parsed.data.posicionesRestauradas ?? 0,
        oculto: hideFromCompanies,
        respaldoPrevio: parsed.data.respaldoPrevioGuardado === true,
      });
    } catch {
      setApplyError({
        message: "Se perdió la conexión con el servidor antes de recibir respuesta.",
        timedOut: true,
      });
    } finally {
      setBusyRestore("");
    }
  }

  function closeConfirm() {
    if (busyRestore === "apply") return; // no se cierra mientras escribe
    if (applyResult) setAnalysis(null); // terminó bien: se limpia el análisis ya aplicado
    setConfirmOpen(false);
    setApplyError(null);
    setApplyResult(null);
  }

  function reanalyzeAfterError() {
    setConfirmOpen(false);
    setApplyError(null);
    void analyze();
  }

  function toggle(companyId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId); else next.add(companyId);
      return next;
    });
  }

  const restorableIds = analysis?.empresas.filter((e) => e.restorable).map((e) => e.companyId) ?? [];
  const allSelected = restorableIds.length > 0 && restorableIds.every((id) => selected.has(id));
  const someSelected = restorableIds.some((id) => selected.has(id));
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(restorableIds));
  }

  const seleccionadas = analysis?.empresas.filter((e) => selected.has(e.companyId)) ?? [];
  const posicionesSeleccionadas = seleccionadas.reduce((s, e) => s + e.posicionesEnRespaldo, 0);
  const posicionesAReemplazar = seleccionadas.reduce((s, e) => s + e.posicionesQueSeReemplazan, 0);

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">

        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow mb-3">Administración</div>
          <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">Respaldos.</h1>
          <p className="dashboard-lead mt-3 max-w-2xl text-slate-600">
            Respalda la data de todas las empresas de un corte, y restaúrala completa o por empresa si algo sale mal.
          </p>
        </section>

        {notification && (
          <div className="flex items-start gap-2 rounded-[1.5rem] border border-teal-200 bg-teal-50 px-5 py-3 text-sm font-semibold text-teal-700">
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{notification}</span>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-[1.5rem] border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Crear respaldo ──────────────────────────────────────────── */}
        <section className="surface-card rounded-[2rem] p-6 md:p-8">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="rounded-full bg-teal-50 p-2 text-teal-700"><HardDrive size={16} /></div>
            <h2 className="font-display text-xl font-bold text-slate-900">Crear respaldo</h2>
          </div>

          <div className="max-w-md">
            <label htmlFor="backup-snapshot" className="field-label">Corte</label>
            <select
              id="backup-snapshot"
              value={backupSnapshotId}
              onChange={(e) => setBackupSnapshotId(e.target.value)}
              className="field-select"
            >
              <option value="">Selecciona un corte</option>
              {snapshots.map((s) => (
                <option key={s.id} value={s.id}>{s.label} — {s.date}</option>
              ))}
            </select>
          </div>

          {busyBackup === "summary" && (
            <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Leyendo el corte...
            </p>
          )}

          {summary && (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                {[
                  { label: "Empresas", value: summary.counts.companies },
                  { label: "Enviaron data", value: summary.counts.submittedCompanies },
                  { label: "Posiciones", value: summary.counts.positions },
                  { label: "Publicado", value: summary.source.wasPublished ? "Sí" : "No" },
                ].map((m) => (
                  <div key={m.label} className="rounded-[1.1rem] border border-slate-200 bg-white/70 px-4 py-3">
                    <div className="eyebrow-xs eyebrow mb-1">{m.label}</div>
                    <div className="font-display text-xl font-bold text-slate-900">{m.value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 max-h-[22rem] overflow-auto rounded-[1.1rem] border border-slate-200">
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50 text-left text-[0.68rem] uppercase tracking-[0.12em] text-slate-500 shadow-[0_1px_0_rgb(226_232_240)]">
                      <th className="px-4 py-2.5 font-bold">Empresa</th>
                      <th className="px-4 py-2.5 text-right font-bold">Posiciones</th>
                      <th className="px-4 py-2.5 font-bold">Envió</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.porEmpresa.map((e) => (
                      <tr key={e.empresa} className="border-t border-slate-100">
                        <td className="px-4 py-2.5 font-semibold text-slate-800">{e.empresa}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{e.posiciones}</td>
                        <td className="px-4 py-2.5">
                          {e.enviado
                            ? <span className="pill bg-teal-50 text-xs font-semibold text-teal-700">Sí</span>
                            : <span className="pill bg-slate-100 text-xs font-semibold text-slate-500">No</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={() => void downloadBackup()} disabled={busyBackup !== ""} className="btn btn-primary">
                  {busyBackup === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Descargar respaldo
                </button>
                <button type="button" onClick={() => void storeBackup()} disabled={busyBackup !== ""} className="btn btn-secondary">
                  {busyBackup === "store" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                  Guardar copia en la base
                </button>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                La copia en la base sirve para deshacer un error reciente. El archivo descargado es el que te salva si
                el problema es de la base — guárdalo fuera del sistema.
              </p>
            </>
          )}
        </section>

        {/* ── Restaurar ───────────────────────────────────────────────── */}
        <section className="surface-card rounded-[2rem] p-6 md:p-8">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="rounded-full bg-amber-50 p-2 text-amber-700"><RotateCcw size={16} /></div>
            <h2 className="font-display text-xl font-bold text-slate-900">Restaurar</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="restore-file" className="field-label">Subir archivo de respaldo</label>
              <input id="restore-file" type="file" accept="application/json,.json" onChange={handleFile} className="field" />
              {uploaded && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
                  <FileJson className="h-3.5 w-3.5" /> {uploaded.name} · {formatBytes(uploaded.size)}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="restore-stored" className="field-label">…o usar un respaldo guardado</label>
              <select
                id="restore-stored"
                value={storedSourceId}
                onChange={(e) => { setStoredSourceId(e.target.value); setUploaded(null); setAnalysis(null); }}
                className="field-select"
                disabled={Boolean(uploaded)}
              >
                <option value="">Selecciona un corte</option>
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>{s.label} — {s.date}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 max-w-md">
            <label htmlFor="restore-target" className="field-label">Restaurar en el corte</label>
            <select
              id="restore-target"
              value={targetIsNew ? "__nuevo__" : targetSnapshotId}
              onChange={(e) => {
                const v = e.target.value;
                setAnalysis(null);
                if (v === "__nuevo__") { setTargetIsNew(true); setTargetSnapshotId(""); }
                else { setTargetIsNew(false); setTargetSnapshotId(v); }
              }}
              className="field-select"
            >
              <option value="">El mismo del respaldo</option>
              {snapshots.map((s) => (
                <option key={s.id} value={s.id}>{s.label} — {s.date}</option>
              ))}
              <option value="__nuevo__">Un corte nuevo (escribir fecha)…</option>
            </select>

            {targetIsNew && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="restore-new-target" className="field-label">Fecha del corte nuevo</label>
                  <input
                    id="restore-new-target"
                    type="date"
                    value={newTargetId}
                    onChange={(e) => { setNewTargetId(e.target.value); setAnalysis(null); }}
                    className="field"
                  />
                </div>
                <div>
                  <label htmlFor="restore-new-label" className="field-label">Nombre del corte</label>
                  <input
                    id="restore-new-label"
                    type="text"
                    value={newTargetLabel}
                    onChange={(e) => setNewTargetLabel(e.target.value)}
                    className="field"
                    placeholder="Ej. Prueba de restauración"
                  />
                </div>
                <p className="text-xs text-slate-500 sm:col-span-2">
                  El corte se crea con la data del respaldo — no hace falta asignarle empresas antes.
                  Si dejas el nombre vacío, se usa el del respaldo.
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void analyze()}
            disabled={busyRestore !== "" || (!uploaded && !storedSourceId) || (targetIsNew && !newTargetId)}
            className="btn btn-secondary mt-5"
          >
            {busyRestore === "analyze" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Analizar respaldo
          </button>
          <p className="mt-2 text-xs text-slate-500">El análisis es solo de lectura — no modifica nada.</p>
          {analyzeError && (
            <div className="mt-3 flex items-start gap-2 rounded-[1rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{analyzeError}</span>
            </div>
          )}

          {/* Resultado del análisis */}
          {analysis && (
            <div className="mt-7 border-t border-slate-200 pt-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.1rem] border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="eyebrow-xs eyebrow mb-1">Origen del respaldo</div>
                  <div className="font-semibold text-slate-900">{analysis.origen.label}</div>
                  <div className="text-xs text-slate-500">Generado el {formatDateTime(analysis.origen.generatedAt)}</div>
                </div>
                <div className="rounded-[1.1rem] border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="eyebrow-xs eyebrow mb-1">Destino</div>
                  <div className="font-semibold text-slate-900">{analysis.destino.label ?? analysis.destino.snapshotId}</div>
                  <div className="text-xs text-slate-500">
                    {analysis.destino.existe ? "Corte existente" : "Se creará"}
                    {analysis.destino.estaPublicado ? " · publicado" : ""}
                  </div>
                </div>
              </div>

              {analysis.advertencias.length > 0 && (
                <div className="mt-4 rounded-[1.1rem] border border-amber-200 bg-amber-50/70 px-4 py-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.1em] text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5" /> Advertencias
                  </div>
                  <ul className="space-y-1.5">
                    {analysis.advertencias.map((a) => (
                      <li key={a} className="text-sm leading-6 text-amber-900">• {a}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-5 max-h-[26rem] overflow-auto rounded-[1.1rem] border border-slate-200">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50 text-left text-[0.68rem] uppercase tracking-[0.12em] text-slate-500 shadow-[0_1px_0_rgb(226_232_240)]">
                      <th className="px-4 py-2.5 font-bold">
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                            onChange={toggleAll}
                            aria-label="Seleccionar todas las empresas"
                            className="h-4 w-4"
                          />
                          Todas
                        </label>
                      </th>
                      <th className="px-4 py-2.5 font-bold">Empresa</th>
                      <th className="px-4 py-2.5 font-bold">Estado</th>
                      <th className="px-4 py-2.5 text-right font-bold">En respaldo</th>
                      <th className="px-4 py-2.5 text-right font-bold">Se reemplazan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.empresas.map((e) => (
                      <tr key={e.companyId} className={`border-t border-slate-100 ${e.restorable ? "" : "opacity-60"}`}>
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={selected.has(e.companyId)}
                            disabled={!e.restorable}
                            onChange={() => toggle(e.companyId)}
                            aria-label={`Restaurar ${e.companyName}`}
                            className="h-4 w-4"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-slate-800">{e.companyName}</div>
                          {e.usuarioOriginalAusente && (
                            <div className="text-xs text-amber-700">usuario original eliminado — se reasigna</div>
                          )}
                          {e.cargosFueraDeCatalogo.length > 0 && (
                            <div className="text-xs text-amber-700">
                              {e.cargosFueraDeCatalogo.length} cargo(s) fuera del catálogo destino
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`pill text-xs font-semibold ${STATUS_STYLE[e.status]}`}>{STATUS_LABEL[e.status]}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{e.posicionesEnRespaldo}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                          {e.posicionesQueSeReemplazan > 0 ? e.posicionesQueSeReemplazan : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex flex-col gap-2.5">
                <label className="flex items-center gap-2.5 text-sm text-slate-700">
                  <input type="checkbox" checked={restoreConfig} onChange={(e) => setRestoreConfig(e.target.checked)} className="h-4 w-4" />
                  Restaurar también la configuración del corte (catálogo de cargos, accesos, rangos)
                </label>
                <label className="flex items-center gap-2.5 text-sm text-slate-700">
                  <input type="checkbox" checked={restoreProfile} onChange={(e) => setRestoreProfile(e.target.checked)} className="h-4 w-4" />
                  Restaurar también el perfil de las empresas y sus tasas guardadas
                  <span className="text-xs text-slate-500">(revierte cambios de perfil hechos después del respaldo)</span>
                </label>
              </div>

              <button
                type="button"
                onClick={() => { setHideFromCompanies(!analysis.destino.existe); setApplyError(null); setApplyResult(null); setConfirmOpen(true); }}
                disabled={busyRestore !== "" || selected.size === 0}
                className="btn btn-danger mt-5"
              >
                {busyRestore === "apply" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Restaurar {selected.size} empresa{selected.size === 1 ? "" : "s"}
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Confirmación, progreso y resultado de la restauración */}
      {confirmOpen && analysis && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="surface-card w-full max-w-md overflow-hidden rounded-[2rem] shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <div className="eyebrow mb-0.5">
                  {busyRestore === "apply" ? "En curso" : applyResult ? "Listo" : applyError ? "Error" : "Confirmar"}
                </div>
                <h2 className="font-display text-lg font-bold text-slate-900">Restaurar respaldo</h2>
              </div>
              {busyRestore !== "apply" && (
                <button type="button" onClick={closeConfirm} className="rounded-full p-1.5 hover:bg-slate-100" aria-label="Cerrar">
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Restaurando */}
            {busyRestore === "apply" && (
              <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
                <p className="text-sm font-semibold text-slate-800">
                  Restaurando {selected.size} empresa{selected.size === 1 ? "" : "s"}…
                </p>
                <p className="text-xs leading-5 text-slate-500">
                  Puede tardar hasta un minuto. No cierres ni recargues esta pestaña.
                </p>
              </div>
            )}

            {/* Terminó bien */}
            {busyRestore !== "apply" && applyResult && (
              <>
                <div className="space-y-3 px-6 py-5">
                  <div className="flex items-start gap-2.5 rounded-[1rem] border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Se restauraron <strong>{applyResult.empresas} empresas</strong> y{" "}
                      <strong>{applyResult.posiciones} posiciones</strong> en el corte{" "}
                      <strong>{analysis.destino.label ?? (targetIsNew && newTargetLabel ? newTargetLabel : analysis.destino.snapshotId)}</strong>.
                    </span>
                  </div>
                  {applyResult.oculto && (
                    <p className="text-xs leading-5 text-slate-600">
                      El corte quedó <strong>oculto para las empresas</strong>. Para habilitarlo: Admin → Crear cortes → Empresas.
                    </p>
                  )}
                  {applyResult.respaldoPrevio && (
                    <p className="text-xs leading-5 text-slate-600">
                      Se guardó un respaldo del estado previo del corte por si necesitas deshacer.
                    </p>
                  )}
                </div>
                <div className="flex justify-end border-t border-slate-100 px-6 py-4">
                  <button type="button" onClick={closeConfirm} className="btn btn-primary">
                    <Check className="h-4 w-4" />
                    Listo
                  </button>
                </div>
              </>
            )}

            {/* Falló */}
            {busyRestore !== "apply" && applyError && (
              <>
                <div className="space-y-3 px-6 py-5">
                  <div className="flex items-start gap-2.5 rounded-[1rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{applyError.message}</span>
                  </div>
                  {applyError.timedOut ? (
                    <p className="text-xs leading-5 text-slate-600">
                      La restauración es <strong>todo o nada</strong>, así que no quedó a medias: o se aplicó
                      completa, o no se aplicó nada. Para saber cuál de las dos pasó, vuelve a analizar el
                      respaldo contra el mismo destino — si el destino aparece como corte existente, se aplicó.
                    </p>
                  ) : (
                    <p className="text-xs leading-5 text-slate-600">
                      No se escribió nada: la restauración se revierte completa si algo falla.
                    </p>
                  )}
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
                  <button type="button" onClick={closeConfirm} className="btn btn-secondary">Cerrar</button>
                  {applyError.timedOut ? (
                    <button type="button" onClick={reanalyzeAfterError} className="btn btn-primary">
                      <Upload className="h-4 w-4" />
                      Volver a analizar
                    </button>
                  ) : (
                    <button type="button" onClick={() => void apply()} className="btn btn-danger">
                      <RotateCcw className="h-4 w-4" />
                      Reintentar
                    </button>
                  )}
                </div>
              </>
            )}

            {/* Confirmar */}
            {busyRestore !== "apply" && !applyResult && !applyError && (
              <>
                <div className="space-y-3 px-6 py-5">
                  <p className="text-sm text-slate-700">
                    Vas a restaurar <strong>{selected.size} empresa{selected.size === 1 ? "" : "s"}</strong> con{" "}
                    <strong>{posicionesSeleccionadas} posiciones</strong> en el corte{" "}
                    <strong>{analysis.destino.label ?? (targetIsNew && newTargetLabel ? newTargetLabel : analysis.destino.snapshotId)}</strong>.
                  </p>
                  {posicionesAReemplazar > 0 && (
                    <div className="rounded-[1rem] border border-red-100 bg-red-50/70 px-4 py-3 text-xs text-red-800">
                      Esto <strong>reemplaza {posicionesAReemplazar} posiciones</strong> que hay actualmente en ese corte.
                      Se guardará un respaldo del estado previo antes de escribir.
                    </div>
                  )}
                  {analysis.destino.estaPublicado && (
                    <div className="rounded-[1rem] border border-amber-100 bg-amber-50/70 px-4 py-3 text-xs text-amber-900">
                      El corte destino está <strong>publicado</strong> — las empresas ya están viendo estos resultados.
                    </div>
                  )}
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-[1rem] border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={hideFromCompanies}
                      onChange={(e) => setHideFromCompanies(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    <span>
                      <strong>Ocultar este corte a las empresas</strong> (solo lo ve el admin)
                      <span className="mt-1 block text-xs text-slate-500">
                        {analysis.destino.existe
                          ? "Ojo: este corte ya existe. Si lo ocultas, las empresas que hoy lo ven dejarán de verlo."
                          : "Recomendado para pruebas. Después puedes habilitarlo desde Admin → Crear cortes → Empresas."}
                      </span>
                    </span>
                  </label>
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
                  <button type="button" onClick={closeConfirm} className="btn btn-secondary">Cancelar</button>
                  <button type="button" onClick={() => void apply()} className="btn btn-danger">
                    <RotateCcw className="h-4 w-4" />
                    Sí, restaurar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
