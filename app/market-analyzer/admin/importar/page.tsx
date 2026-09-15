"use client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, ArrowRight, Check, Download, FileSpreadsheet, Info, Loader2, Trash2, Upload } from "lucide-react";

import { useConfirm } from "@/components/ConfirmDialog";
import {
  SHEET_CARGOS,
  buildTemplateWorkbook,
  parseCargosWorkbook,
  type CatalogCargo,
  type ImportIssue,
  type ParsedImport,
} from "@/lib/import-cargos";
import type { Snapshot } from "@/lib/workspace";
import type { ExtendedMarketPosition } from "@/types/salary";
import { fetchWorkspace, updateWorkspace } from "@/lib/workspace-client";

type AdminSnapshot = { id: string; label: string; date: string; published?: boolean };
type CompanyOption = { id: string; name: string };
type Modo = "reemplazar" | "completar";

type FileEntry = {
  key: string;
  file: File;
  companyId: string;
  estado: "sin_analizar" | "analizando" | "analizado" | "fallido" | "importando" | "importado";
  parsed: ParsedImport | null;
  mensaje: string;
  filasActuales: number;
  gradosHeredados: number;
  yaEnviado: boolean;
  abierto: boolean;
};

function norm(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Propone la empresa a partir del nombre del archivo, para no elegir 20 veces a mano. */
function adivinarEmpresa(nombreArchivo: string, empresas: CompanyOption[]): string {
  const base = norm(nombreArchivo.replace(/\.[^.]+$/, ""));
  if (!base) return "";

  let mejor = "";
  let mejorLargo = 0;
  for (const empresa of empresas) {
    const nombre = norm(empresa.name);
    if (!nombre || nombre.length < 3) continue;
    if (base.includes(nombre) && nombre.length > mejorLargo) {
      mejor = empresa.id;
      mejorLargo = nombre.length;
    }
  }
  return mejor;
}

function contarPorNivel(issues: ImportIssue[], nivel: ImportIssue["nivel"]) {
  return issues.filter((i) => i.nivel === nivel).length;
}

/**
 * Una celda en blanco deja el valor por defecto, no conserva lo que la empresa
 * ya tuviera cargado. Con el grado CAPRI eso sería destructivo: muchas empresas
 * ya clasificaron sus cargos dentro de la plataforma y su Excel no trae el
 * grado. Así que el grado y su familia se heredan del cargo que ya existía
 * cuando el archivo no los trae. La descripción se hereda siempre, porque la
 * plantilla ya no la pide.
 */
function heredarDeExistentes(
  importadas: ExtendedMarketPosition[],
  existentes: ExtendedMarketPosition[],
): { filas: ExtendedMarketPosition[]; gradosHeredados: number } {
  const previas = new Map(existentes.map((r) => [norm(r.tituloCargo ?? ""), r]));
  let gradosHeredados = 0;

  const filas = importadas.map((fila) => {
    const previa = previas.get(norm(fila.tituloCargo));
    if (!previa) return fila;

    const heredaGrado = fila.hayGrade === undefined && previa.hayGrade !== undefined;
    if (heredaGrado) gradosHeredados++;

    // La familia solo viaja junto al grado: heredarla sobre un grado distinto
    // podría dejar una combinación que el propio asistente CAPRI no permite.
    return {
      ...fila,
      hayGrade: fila.hayGrade ?? previa.hayGrade,
      capriFamily: heredaGrado ? previa.capriFamily : fila.capriFamily,
      descripcion: fila.descripcion ?? previa.descripcion,
    };
  });

  return { filas, gradosHeredados };
}

export default function ImportarDataPage() {
  const [confirm, confirmDialog] = useConfirm();

  const [snapshots, setSnapshots] = useState<AdminSnapshot[]>([]);
  const [empresas, setEmpresas] = useState<CompanyOption[]>([]);
  const [snapshotId, setSnapshotId] = useState("");
  const [catalogo, setCatalogo] = useState<CatalogCargo[] | null>(null);

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [modo, setModo] = useState<Modo>("reemplazar");
  const [prellenar, setPrellenar] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState("");

  const inputRef = useRef<HTMLInputElement | null>(null);

  const corte = useMemo(() => snapshots.find((s) => s.id === snapshotId) ?? null, [snapshots, snapshotId]);

  useEffect(() => {
    void fetch("/api/admin/study", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: { snapshots?: AdminSnapshot[] } | null) => setSnapshots(d?.snapshots ?? []))
      .catch(() => setSnapshots([]));

    void fetch("/api/companies", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: { companies?: CompanyOption[] } | null) => setEmpresas(d?.companies ?? []))
      .catch(() => setEmpresas([]));
  }, []);

  useEffect(() => {
    if (!snapshotId) return;
    let ignore = false;
    void fetch(`/api/admin/config/snapshot-cargos?snapshotId=${encodeURIComponent(snapshotId)}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: { cargos?: CatalogCargo[] | null } | null) => {
        if (ignore) return;
        setCatalogo(Array.isArray(d?.cargos) ? d!.cargos! : []);
      })
      .catch(() => { if (!ignore) setCatalogo([]); });
    return () => { ignore = true; };
  }, [snapshotId]);

  const catalogoCargando = snapshotId !== "" && catalogo === null;

  /** Cambiar de corte invalida el catálogo y cualquier análisis hecho contra el anterior. */
  function cambiarCorte(id: string) {
    setSnapshotId(id);
    setCatalogo(null);
    setAviso("");
    setEntries((prev) => prev.map((e) => ({
      ...e, estado: "sin_analizar", parsed: null, mensaje: "", filasActuales: 0, gradosHeredados: 0, yaEnviado: false, abierto: false,
    })));
  }

  const actualizar = useCallback((key: string, patch: Partial<FileEntry>) => {
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }, []);

  function agregarArchivos(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    const nuevos: FileEntry[] = Array.from(lista).map((file, idx) => ({
      key: `${Date.now()}-${idx}-${file.name}`,
      file,
      companyId: adivinarEmpresa(file.name, empresas),
      estado: "sin_analizar",
      parsed: null,
      mensaje: "",
      filasActuales: 0,
      gradosHeredados: 0,
      yaEnviado: false,
      abierto: false,
    }));
    setEntries((prev) => [...prev, ...nuevos]);
    setAviso("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function descargarPlantilla() {
    if (!corte || !catalogo) return;
    const wb = buildTemplateWorkbook({
      catalogo,
      tasas: [],
      nombreCorte: `${corte.label} (${corte.date})`,
      nombreEmpresa: "",
      prellenarCatalogo: prellenar,
    });
    XLSX.writeFile(wb, `Plantilla data salarial - ${corte.label}.xlsx`);
  }

  async function analizar() {
    if (!corte || !catalogo || catalogo.length === 0) return;

    const pendientes = entries.filter((e) => e.companyId);
    if (pendientes.length === 0) {
      setAviso("Asigna una empresa a cada archivo antes de analizar.");
      return;
    }

    setTrabajando(true);
    setAviso("");

    for (const entry of pendientes) {
      actualizar(entry.key, { estado: "analizando", mensaje: "" });
      try {
        const [buffer, workspace] = await Promise.all([
          entry.file.arrayBuffer(),
          fetchWorkspace(entry.companyId),
        ]);
        const workbook = XLSX.read(buffer, { type: "array" });
        const tasas = (workspace.companyInfo.tasas ?? []).filter((t) => !t.isSystem);
        const parsed = parseCargosWorkbook(workbook, catalogo, tasas);
        const existente = workspace.snapshots[corte.id];
        const { gradosHeredados } = heredarDeExistentes(parsed.rows, existente?.rows ?? []);

        actualizar(entry.key, {
          estado: "analizado",
          parsed,
          filasActuales: existente?.rows?.length ?? 0,
          gradosHeredados,
          yaEnviado: Boolean(existente?.submittedAt),
          mensaje: "",
        });
      } catch (error) {
        actualizar(entry.key, {
          estado: "fallido",
          parsed: null,
          mensaje: error instanceof Error ? error.message : "No se pudo leer el archivo.",
        });
      }
    }

    setTrabajando(false);
  }

  async function importar() {
    if (!corte) return;

    const listos = entries.filter((e) => e.estado === "analizado" && e.companyId && (e.parsed?.rows.length ?? 0) > 0);
    if (listos.length === 0) return;

    const totalCargos = listos.reduce((acc, e) => acc + (e.parsed?.rows.length ?? 0), 0);
    const reemplaza = listos.reduce((acc, e) => acc + (modo === "reemplazar" ? e.filasActuales : 0), 0);
    const enviados = listos.filter((e) => e.yaEnviado).length;
    const heredados = listos.reduce((acc, e) => acc + e.gradosHeredados, 0);

    const lineas = [
      `Se van a cargar ${totalCargos} cargos en ${listos.length} ${listos.length === 1 ? "empresa" : "empresas"} del corte ${corte.label}.`,
      modo === "reemplazar" && reemplaza > 0
        ? `Se reemplazan ${reemplaza} cargos que esas empresas ya tenían cargados en este corte.`
        : "",
      heredados > 0
        ? `${heredados} cargos conservan el grado CAPRI que ya tenían en la plataforma, porque el archivo no lo trae.`
        : "",
      enviados > 0
        ? `${enviados} de esas empresas ya habían enviado este corte; su data queda modificada y sigue contando como enviada.`
        : "",
      corte.published
        ? "El corte está publicado: lo que cargues entra al mercado de inmediato."
        : "La data queda cargada sin enviar, para que la revises antes.",
    ].filter(Boolean);

    const ok = await confirm({
      title: "Cargar la data",
      message: (
        <span className="space-y-2">
          {lineas.map((linea, i) => <span key={i} className="block">{linea}</span>)}
        </span>
      ),
      confirmLabel: "Cargar",
      tone: modo === "reemplazar" && reemplaza > 0 ? "warning" : undefined,
    });
    if (!ok) return;

    setTrabajando(true);
    setAviso("");

    for (const entry of listos) {
      actualizar(entry.key, { estado: "importando", mensaje: "" });
      try {
        // Se relee el workspace justo antes de escribir: el guardado del admin
        // reemplaza TODOS los cortes de la empresa, así que hay que mandarlos
        // completos y al día.
        const workspace = await fetchWorkspace(entry.companyId);
        const importadas = entry.parsed?.rows ?? [];
        const base: Snapshot = workspace.snapshots[corte.id] ?? {
          id: corte.id,
          label: corte.label,
          date: corte.date,
          rows: [],
        };

        const { filas: conHerencia } = heredarDeExistentes(importadas, base.rows ?? []);

        let filas = conHerencia;
        if (modo === "completar") {
          const nuevas = new Set(conHerencia.map((r) => norm(r.tituloCargo)));
          filas = [...(base.rows ?? []).filter((r) => !nuevas.has(norm(r.tituloCargo ?? ""))), ...conHerencia];
        }

        const siguientes: Record<string, Snapshot> = {
          ...workspace.snapshots,
          [corte.id]: { ...base, rows: filas },
        };

        await updateWorkspace({ snapshots: siguientes, selectedSnapshotId: corte.id }, entry.companyId);
        actualizar(entry.key, { estado: "importado", mensaje: `${importadas.length} cargos cargados.` });
      } catch (error) {
        actualizar(entry.key, {
          estado: "fallido",
          mensaje: error instanceof Error ? error.message : "No se pudo guardar la data.",
        });
      }
    }

    setTrabajando(false);
  }

  const resumen = useMemo(() => {
    const analizados = entries.filter((e) => e.estado === "analizado");
    return {
      archivos: entries.length,
      analizados: analizados.length,
      cargos: analizados.reduce((acc, e) => acc + (e.parsed?.rows.length ?? 0), 0),
      errores: analizados.reduce((acc, e) => acc + contarPorNivel(e.parsed?.issues ?? [], "error"), 0),
      avisos: analizados.reduce((acc, e) => acc + contarPorNivel(e.parsed?.issues ?? [], "aviso"), 0),
      importados: entries.filter((e) => e.estado === "importado").length,
    };
  }, [entries]);

  const sinEmpresa = entries.filter((e) => !e.companyId).length;
  const empresasRepetidas = useMemo(() => {
    const cuenta = new Map<string, number>();
    entries.forEach((e) => { if (e.companyId) cuenta.set(e.companyId, (cuenta.get(e.companyId) ?? 0) + 1); });
    return [...cuenta.entries()].filter(([, n]) => n > 1).map(([id]) => empresas.find((c) => c.id === id)?.name ?? id);
  }, [entries, empresas]);

  const puedeAnalizar = Boolean(corte) && (catalogo?.length ?? 0) > 0 && entries.length > 0 && !trabajando;
  const puedeImportar = resumen.cargos > 0 && !trabajando && empresasRepetidas.length === 0;

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow mb-3">Administración</div>
          <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">Importar data.</h1>
          <p className="dashboard-lead mt-3 max-w-2xl text-slate-600">
            Carga la data salarial de varias empresas a la vez desde los Excel que enviaron. Se revisa todo antes de
            escribir nada, y lo que entra queda sin enviar.
          </p>
        </section>

        {/* ── 1. Corte y plantilla ──────────────────────────────────────── */}
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="rounded-full bg-slate-100 p-2 text-slate-700"><FileSpreadsheet size={16} /></div>
            <h2 className="font-display text-xl font-bold text-slate-900">1 · El corte y la plantilla</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="import-snapshot" className="field-label">Corte destino</label>
              <select
                id="import-snapshot"
                value={snapshotId}
                onChange={(e) => cambiarCorte(e.target.value)}
                className="field-select"
              >
                <option value="">Selecciona un corte</option>
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} — {s.date}{s.published ? " · publicado" : ""}
                  </option>
                ))}
              </select>
              {catalogoCargando && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando el catálogo del corte…
                </p>
              )}
              {catalogo && catalogo.length > 0 && (
                <p className="mt-2 text-xs text-slate-600">{catalogo.length} cargos en el catálogo de este corte.</p>
              )}
              {catalogo && catalogo.length === 0 && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-red-600">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Este corte no tiene cargos configurados. Defínelos en Admin antes de importar.
                </p>
              )}
            </div>

            <div>
              <span className="field-label">Plantilla</span>
              <button
                type="button"
                onClick={() => void descargarPlantilla()}
                disabled={!corte || !catalogo || catalogo.length === 0}
                className="btn-secondary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download size={16} /> Descargar plantilla del corte
              </button>
              <label className="mt-3 flex items-start gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={prellenar}
                  onChange={(e) => setPrellenar(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Traer la hoja <strong>{SHEET_CARGOS}</strong> ya con los cargos del catálogo. Solo hay que borrar los que
                  la empresa no tiene y llenar los montos, sin riesgo de escribir mal un nombre.
                </span>
              </label>
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
            <p className="flex items-center gap-1.5 font-semibold text-slate-700"><Info size={14} /> Lo mínimo para que el corte se pueda enviar</p>
            <p className="mt-1.5">
              Cargo del catálogo · grado CAPRI entre 8 y 25 · sueldo básico mayor que cero. Todo lo demás se puede
              completar después dentro de la plataforma. Un cargo que no esté en el catálogo del corte no se carga:
              la plataforma lo borraría en cuanto la empresa abriera su Data.
            </p>
            <p className="mt-3">
              Una celda vacía <strong>no conserva</strong> lo que la empresa ya tenga cargado: se toma el valor por
              defecto (monto en cero, frecuencia mensual, moneda USD). La excepción es el grado CAPRI, que se conserva
              cuando el archivo no lo trae y el cargo ya estaba clasificado. La descripción del cargo no va en el
              archivo: sale del catálogo que mantiene el admin, igual para todas las empresas.
            </p>
          </div>
        </section>

        {/* ── 2. Archivos ───────────────────────────────────────────────── */}
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="rounded-full bg-slate-100 p-2 text-slate-700"><Upload size={16} /></div>
            <h2 className="font-display text-xl font-bold text-slate-900">2 · Los archivos</h2>
          </div>

          <div>
            <label htmlFor="import-files" className="field-label">Archivos de las empresas (uno por empresa)</label>
            <input
              id="import-files"
              ref={inputRef}
              type="file"
              multiple
              accept=".xlsx,.xls,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => agregarArchivos(e.target.files)}
              className="field"
            />
            <p className="mt-2 text-xs text-slate-500">
              Se pueden soltar los 20 de una vez. La empresa se propone por el nombre del archivo, pero conviene revisarla.
            </p>
          </div>

          {entries.length > 0 && (
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
              <div className="max-h-[28rem] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Archivo</th>
                      <th className="px-4 py-2.5 font-semibold">Empresa</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Cargos</th>
                      <th className="px-4 py-2.5 font-semibold">Estado</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {entries.map((entry) => {
                      const errores = contarPorNivel(entry.parsed?.issues ?? [], "error");
                      const avisos = contarPorNivel(entry.parsed?.issues ?? [], "aviso");
                      return (
                        <Fragment key={entry.key}>
                          <tr className="align-middle">
                            <td className="px-4 py-2.5">
                              <span className="block max-w-[16rem] truncate text-slate-800" title={entry.file.name}>{entry.file.name}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              <select
                                aria-label={`Empresa para ${entry.file.name}`}
                                value={entry.companyId}
                                onChange={(e) => actualizar(entry.key, { companyId: e.target.value, estado: "sin_analizar", parsed: null, mensaje: "", gradosHeredados: 0 })}
                                className="field-select text-sm"
                                disabled={trabajando || entry.estado === "importado"}
                              >
                                <option value="">— elegir —</option>
                                {empresas.map((c) => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-700">
                              {entry.parsed ? entry.parsed.rows.length : "—"}
                            </td>
                            <td className="px-4 py-2.5">
                              {entry.estado === "sin_analizar" && <span className="pill bg-slate-100 text-slate-600">Sin analizar</span>}
                              {entry.estado === "analizando" && <span className="pill bg-slate-100 text-slate-600"><Loader2 className="h-3 w-3 animate-spin" /> Analizando</span>}
                              {entry.estado === "analizado" && (
                                errores > 0
                                  ? <span className="pill bg-amber-50 text-amber-700">{errores} {errores === 1 ? "fila descartada" : "filas descartadas"}</span>
                                  : avisos > 0
                                    ? <span className="pill bg-sky-50 text-sky-700">{avisos} {avisos === 1 ? "aviso" : "avisos"}</span>
                                    : <span className="pill bg-teal-50 text-teal-700">Listo</span>
                              )}
                              {entry.estado === "importando" && <span className="pill bg-slate-100 text-slate-600"><Loader2 className="h-3 w-3 animate-spin" /> Cargando</span>}
                              {entry.estado === "importado" && <span className="pill bg-teal-50 text-teal-700"><Check className="h-3 w-3" /> Cargado</span>}
                              {entry.estado === "fallido" && <span className="pill bg-red-50 text-red-700">Falló</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {entry.parsed && (entry.parsed.issues.length > 0 || entry.parsed.rows.length > 0) && (
                                  <button
                                    type="button"
                                    onClick={() => actualizar(entry.key, { abierto: !entry.abierto })}
                                    className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                                  >
                                    {entry.abierto ? "Ocultar" : "Ver detalle"}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  aria-label={`Quitar ${entry.file.name}`}
                                  onClick={() => setEntries((prev) => prev.filter((e) => e.key !== entry.key))}
                                  disabled={trabajando}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {entry.mensaje && (
                            <tr>
                              <td colSpan={5} className={`px-4 pb-2.5 text-xs ${entry.estado === "fallido" ? "text-red-600" : "text-teal-700"}`}>
                                {entry.mensaje}
                              </td>
                            </tr>
                          )}

                          {entry.abierto && entry.parsed && (
                            <tr>
                              <td colSpan={5} className="bg-slate-50 px-4 py-3">
                                <p className="text-xs text-slate-600">
                                  {entry.parsed.rows.length} cargos válidos · {entry.parsed.filasDescartadas} descartados ·{" "}
                                  {entry.filasActuales} ya cargados en este corte
                                  {entry.gradosHeredados > 0 ? ` · ${entry.gradosHeredados} conservan el grado CAPRI que ya tenían` : ""}
                                  {entry.yaEnviado ? " · la empresa ya envió este corte" : ""}
                                </p>
                                {entry.parsed.issues.length > 0 && (
                                  <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs">
                                    {entry.parsed.issues.map((issue, i) => (
                                      <li key={i} className="flex items-start gap-2">
                                        <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${issue.nivel === "error" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                                          {issue.nivel === "error" ? "descartada" : "aviso"}
                                        </span>
                                        <span className="text-slate-600">
                                          {issue.hoja}{issue.fila ? ` · fila ${issue.fila}` : ""} — {issue.mensaje}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {sinEmpresa > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> {sinEmpresa} {sinEmpresa === 1 ? "archivo sin empresa asignada" : "archivos sin empresa asignada"}.
            </p>
          )}
          {empresasRepetidas.length > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" /> Hay más de un archivo para {empresasRepetidas.join(", ")}. El segundo pisaría al primero.
            </p>
          )}
        </section>

        {/* ── 3. Cargar ─────────────────────────────────────────────────── */}
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="rounded-full bg-slate-100 p-2 text-slate-700"><ArrowRight size={16} /></div>
            <h2 className="font-display text-xl font-bold text-slate-900">3 · Revisar y cargar</h2>
          </div>

          <fieldset className="mb-5">
            <legend className="field-label">Qué hacer con lo que la empresa ya tenga en este corte</legend>
            <div className="mt-1 space-y-2">
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="radio" name="modo" value="reemplazar" checked={modo === "reemplazar"} onChange={() => setModo("reemplazar")} className="mt-1" />
                <span><strong>Reemplazar</strong> — el corte de esa empresa queda solo con lo que trae el archivo.</span>
              </label>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="radio" name="modo" value="completar" checked={modo === "completar"} onChange={() => setModo("completar")} className="mt-1" />
                <span><strong>Completar</strong> — se conservan los cargos que ya tenía y solo se actualizan los que vienen en el archivo.</span>
              </label>
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void analizar()}
              disabled={!puedeAnalizar}
              className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {trabajando ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />} Analizar archivos
            </button>
            <button
              type="button"
              onClick={() => void importar()}
              disabled={!puedeImportar}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {trabajando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Cargar la data
            </button>
            {aviso && (
              <span className="flex items-center gap-1.5 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> {aviso}</span>
            )}
          </div>

          {resumen.analizados > 0 && (
            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { k: "Archivos analizados", v: `${resumen.analizados} de ${resumen.archivos}` },
                { k: "Cargos a cargar", v: resumen.cargos },
                { k: "Filas descartadas", v: resumen.errores },
                { k: "Avisos", v: resumen.avisos },
              ].map((item) => (
                <div key={item.k} className="rounded-2xl bg-slate-50 p-4">
                  <dt className="text-xs text-slate-500">{item.k}</dt>
                  <dd className="mt-1 font-display text-xl font-bold tabular-nums text-slate-900">{item.v}</dd>
                </div>
              ))}
            </dl>
          )}

          {resumen.importados > 0 && (
            <p className="mt-4 flex items-center gap-1.5 rounded-2xl bg-teal-50 px-4 py-3 text-sm text-teal-800">
              <Check className="h-4 w-4" />
              {resumen.importados} {resumen.importados === 1 ? "empresa cargada" : "empresas cargadas"}. La data quedó sin enviar:
              revísala en Data eligiendo la empresa, y envíala desde ahí cuando esté conforme.
            </p>
          )}
        </section>
      </div>

      {confirmDialog}
    </main>
  );
}
