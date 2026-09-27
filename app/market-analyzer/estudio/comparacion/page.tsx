"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertTriangle, ArrowLeft, BarChart3, Check, Download, FileText, Loader2 } from "lucide-react";
import Link from "next/link";

import { gradeToNivel } from "@/lib/capri";
import { computeRowTotals, computeTCRTotals, tasasTcrDeEmpresa, type TcrType } from "@/lib/compensation";
import { TAMANOS } from "@/lib/filtros-mercado";
import { posicionEnMercado } from "@/lib/estudio-informes";
import { isAdminRole } from "@/lib/roles";
import { EMPTY_COMPANY_INFO, type CompanyInfo } from "@/lib/workspace";
import { fetchWorkspace } from "@/lib/workspace-client";
import type { ExtendedMarketPosition } from "@/types/salary";
import { PasosEstudio } from "@/components/PasosEstudio";
import { useEstudio } from "@/contexts/EstudioContext";

type Metrica = "sinPasivosMensual" | "directoMensualizado" | "conPasivosMensual" | "conPasivosAnual";

const METRICAS: Array<{ value: Metrica; label: string; sigla: string }> = [
  { value: "sinPasivosMensual",   label: "Total Efectivo Mensual",              sigla: "TEM" },
  { value: "directoMensualizado", label: "Total Efectivo Mensualizado",         sigla: "TEMz" },
  { value: "conPasivosMensual",   label: "Compensación Integral Mensualizada",  sigla: "CIM" },
  { value: "conPasivosAnual",     label: "Paquete de Compensación Total Anual", sigla: "PCTA" },
];

type Percentiles = { n: number; min: number | null; max: number | null; p10?: number | null; p25: number | null; p50: number | null; p75: number | null; p90?: number | null; promedio: number | null };
type GrupoCargo = { tituloCargo: string; n: number } & Record<Metrica, Percentiles>;
type GrupoGrado = { grade: number; n: number } & Record<Metrica, Percentiles>;

type CargoDTO = {
  id: string;
  departamento: string;
  tituloCargo: string;
  hayGrade: number | null;
  capriFamily: string | null;
  data: Partial<ExtendedMarketPosition>;
  equivalencias: Record<string, { departamento: string; tituloCatalogo: string }>;
};

type CompanyOption = { id: string; name: string };
type SnapshotOption = { id: string; label: string; date: string };

function norm(v: string) {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function money(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return "—";
  return Math.round(v).toLocaleString("es-VE");
}

/**
 * Una lista de casillas para elegir varias opciones. Se repite para sectores y
 * ubicaciones, que son listas cortas pero de largo variable.
 */
function ListaCasillas({
  titulo, vacio, opciones, elegidas, onToggle, onLimpiar, etiquetas,
}: {
  titulo: string;
  vacio: string;
  opciones: string[];
  elegidas: string[];
  onToggle: (valor: string) => void;
  onLimpiar: () => void;
  /** Para listas con valor interno distinto del que se muestra. */
  etiquetas?: Record<string, string>;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="field-label mb-0">{titulo}</span>
        <span className="text-xs text-slate-500">
          {elegidas.length === 0 ? vacio : `${elegidas.length} ${elegidas.length === 1 ? "elegido" : "elegidos"}`}
        </span>
      </div>
      {elegidas.length > 0 && (
        <button type="button" onClick={onLimpiar} className="btn btn-secondary btn-xs mt-2">
          Quitar selección
        </button>
      )}
      <div className="mt-2 max-h-40 overflow-y-auto rounded-2xl border border-slate-200 p-3">
        <div className="grid gap-1.5">
          {opciones.map((o) => (
            <label key={o} className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={elegidas.includes(o)} onChange={() => onToggle(o)} className="mt-1" />
              <span className="truncate" title={etiquetas?.[o] ?? o}>{etiquetas?.[o] ?? o}</span>
            </label>
          ))}
          {opciones.length === 0 && <p className="text-xs text-slate-500">Sin opciones que listar todavía.</p>}
        </div>
      </div>
    </div>
  );
}

export default function ComparacionPage() {
  const { data: session, status } = useSession();
  const esAdmin = isAdminRole(session?.user?.role);

  const [empresas, setEmpresas] = useState<CompanyOption[]>([]);
  const { companyId, snapshotId } = useEstudio();
  const [snapshots, setSnapshots] = useState<SnapshotOption[]>([]);
  const [modo, setModo] = useState<"cargo" | "grado">("cargo");
  const [tcrActivo, setTcrActivo] = useState(false);
  const [tcrTipo, setTcrTipo] = useState<TcrType>("bcv");
  const [tasasGlobales, setTasasGlobales] = useState<{ bcv: number | null; bcvEur: number | null; binance: number | null; libreManual: number | null }>(
    { bcv: null, bcvEur: null, binance: null, libreManual: null },
  );
  const [metrica, setMetrica] = useState<Metrica>("sinPasivosMensual");

  const [cargos, setCargos] = useState<CargoDTO[]>([]);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(EMPTY_COMPANY_INFO);
  const [porCargo, setPorCargo] = useState<GrupoCargo[]>([]);
  const [porGrado, setPorGrado] = useState<GrupoGrado[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [filtroGrados, setFiltroGrados] = useState<number[]>([]);
  const [nombreInforme, setNombreInforme] = useState("");
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [comisiones, setComisiones] = useState(false);
  const [bajandoExcel, setBajandoExcel] = useState(false);

  // Grupo de mercado contra el que se compara. La plantilla lo llama
  // "Compañía / Unidad" y por defecto dice "Mercado general", o sea todo el corte.
  const [filtroSectores, setFiltroSectores] = useState<string[]>([]);
  const [filtroClasificaciones, setFiltroClasificaciones] = useState<string[]>([]);
  const [filtroLocalidades, setFiltroLocalidades] = useState<string[]>([]);
  const [filtroTamanos, setFiltroTamanos] = useState<string[]>([]);
  const [disponibles, setDisponibles] = useState<{ sectores: string[]; clasificaciones: string[]; localidades: string[] }>(
    { sectores: [], clasificaciones: [], localidades: [] },
  );
  const [abrirGrupo, setAbrirGrupo] = useState(false);

  const empresaActiva = esAdmin ? companyId : (session?.user?.companyId ?? "");

  // Lo que quedó decidido en el paso 1, para mostrarlo hecho en vez de volver
  // a preguntarlo.
  const nombreEmpresa = esAdmin
    ? (empresas.find((c) => c.id === companyId)?.name ?? "")
    : (session?.user?.companyName ?? "Tu empresa");

  const nombreCorte = (() => {
    const corte = snapshots.find((x) => x.id === snapshotId);
    return corte ? `${corte.label} — ${corte.date}` : "";
  })();

  const listoElPaso1 = Boolean(empresaActiva && snapshotId && cargos.length > 0);

  const faltaEnElPaso1 = [
    !empresaActiva ? "elegir la empresa" : "",
    !snapshotId ? "elegir el estudio" : "",
    empresaActiva && cargos.length === 0 ? "cargar los cargos" : "",
  ].filter(Boolean).join(", ");

  useEffect(() => {
    if (!esAdmin) return;
    void fetch("/api/companies", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: { companies?: CompanyOption[] } | null) => setEmpresas(d?.companies ?? []))
      .catch(() => setEmpresas([]));
    void fetch("/api/admin/study", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: { snapshots?: SnapshotOption[] } | null) => setSnapshots(d?.snapshots ?? []))
      .catch(() => setSnapshots([]));
  }, [esAdmin]);

  const cargar = useCallback(async () => {
    if (!empresaActiva) { setCargos([]); return; }
    setCargando(true);
    setError("");
    try {
      const params = esAdmin && companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
      const [resCargos, workspace] = await Promise.all([
        fetch(`/api/estudio/cargos${params}`, { cache: "no-store" }),
        fetchWorkspace(esAdmin && companyId ? companyId : undefined).catch(() => null),
      ]);
      const data = (await resCargos.json().catch(() => null)) as { cargos?: CargoDTO[]; message?: string } | null;
      if (!resCargos.ok) { setError(data?.message ?? "No se pudo cargar la lista."); return; }
      setCargos(data?.cargos ?? []);
      if (workspace) setCompanyInfo(workspace.companyInfo);
      // Los cortes salen de la API, no del workspace: son solo los que el
      // admin incluyó en el Estudio Especializado de esta empresa.
      if (!esAdmin) {
        const resCortes = await fetch("/api/estudio/cortes", { cache: "no-store" }).catch(() => null);
        const cortes = (await resCortes?.json().catch(() => null)) as { cortes?: SnapshotOption[] } | null;
        setSnapshots(cortes?.cortes ?? []);
      }
    } finally {
      setCargando(false);
    }
  }, [empresaActiva, esAdmin, companyId]);

  useEffect(() => { void cargar(); }, [cargar]);

  // Los percentiles salen de las rutas que ya alimentan el estudio de cortesía:
  // así la comparación da exactamente lo mismo que ve la empresa en Resultados.
  /**
   * Los filtros del grupo de comparación: por criterio, no por empresa. La
   * ruta llama `sizes` a la clasificación, que es el subsector.
   */
  const filtrosMercado = useCallback(() => {
    const p = new URLSearchParams();
    if (filtroSectores.length > 0) p.set("sectors", filtroSectores.join(","));
    if (filtroClasificaciones.length > 0) p.set("sizes", filtroClasificaciones.join(","));
    if (filtroLocalidades.length > 0) p.set("localities", filtroLocalidades.join(","));
    if (filtroTamanos.length > 0) p.set("tamanos", filtroTamanos.join(","));
    return p;
  }, [filtroSectores, filtroClasificaciones, filtroLocalidades, filtroTamanos]);

  const descripcionGrupo = useMemo(() => {
    const partes: string[] = [];
    const resumir = (xs: string[], uno: string, varios: string) =>
      xs.length === 1 ? xs[0] : xs.length > 1 ? `${xs.length} ${varios}` : "";

    for (const texto of [
      resumir(filtroSectores, "sector", "sectores"),
      resumir(filtroClasificaciones, "clasificación", "clasificaciones"),
      resumir(filtroLocalidades, "ubicación", "ubicaciones"),
      resumir(filtroTamanos.map((t) => TAMANOS.find((x) => x.valor === t)?.etiqueta ?? t), "tamaño", "tamaños"),
    ]) {
      if (texto) partes.push(texto);
    }
    return partes.length > 0 ? partes.join(" · ") : "Mercado general";
  }, [filtroSectores, filtroClasificaciones, filtroLocalidades, filtroTamanos]);

  // Las tasas del sistema, para poder expresar el estudio en TCR.
  useEffect(() => {
    void fetch(esAdmin ? "/api/admin/tcr-rates" : "/api/tcr-rates", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: {
        bcvUsd?: { rate: number | null }; bcvEur?: { rate: number | null };
        binance?: { rate: number | null }; libre?: { rate: number | null; isManual?: boolean };
      } | null) => {
        if (!d) return;
        setTasasGlobales({
          bcv: d.bcvUsd?.rate ?? null,
          bcvEur: d.bcvEur?.rate ?? null,
          binance: d.binance?.rate ?? null,
          libreManual: d.libre?.isManual ? (d.libre?.rate ?? null) : null,
        });
      })
      .catch(() => {});
  }, [esAdmin]);

  const consultaFiltros = filtrosMercado().toString();

  useEffect(() => {
    if (!snapshotId) { setPorCargo([]); setPorGrado([]); return; }
    let ignorar = false;
    const base = `snapshotId=${encodeURIComponent(snapshotId)}${consultaFiltros ? `&${consultaFiltros}` : ""}`;

    void fetch(`/api/percentiles?${base}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: { grupos?: GrupoCargo[]; availableSectors?: string[]; availableSizes?: string[]; availableLocalities?: string[] } | null) => {
        if (ignorar) return;
        setPorCargo(d?.grupos ?? []);
        // Las listas se quedan con lo que devuelve el corte completo; si se
        // recortaran al filtro activo no habría forma de volver atrás.
        setDisponibles((prev) => ({
          sectores: (d?.availableSectors?.length ?? 0) > 0 && !consultaFiltros ? d!.availableSectors! : prev.sectores,
          clasificaciones: (d?.availableSizes?.length ?? 0) > 0 && !consultaFiltros ? d!.availableSizes! : prev.clasificaciones,
          localidades: (d?.availableLocalities?.length ?? 0) > 0 && !consultaFiltros ? d!.availableLocalities! : prev.localidades,
        }));
      })
      .catch(() => { if (!ignorar) setPorCargo([]); });

    void fetch(`/api/percentiles-by-grade?${base}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: { grupos?: GrupoGrado[] } | null) => { if (!ignorar) setPorGrado(d?.grupos ?? []); })
      .catch(() => { if (!ignorar) setPorGrado([]); });

    return () => { ignorar = true; };
  }, [snapshotId, consultaFiltros, tcrActivo]);

  // En TCR el mercado sale de su propia ruta, que devuelve las mismas cuatro
  // métricas por cargo y por grado, pero convertidas con el tipo elegido.
  useEffect(() => {
    if (!snapshotId || !tcrActivo) return;
    let ignorar = false;
    const base = `snapshotId=${encodeURIComponent(snapshotId)}&tcrType=${tcrTipo}${consultaFiltros ? `&${consultaFiltros}` : ""}`;

    void fetch(`/api/percentiles-tcr?${base}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: { cargos?: GrupoCargo[]; grades?: GrupoGrado[]; message?: string } | null) => {
        if (ignorar) return;
        setPorCargo(d?.cargos ?? []);
        setPorGrado(d?.grades ?? []);
        if (d?.message) setError(d.message);
      })
      .catch(() => { if (!ignorar) { setPorCargo([]); setPorGrado([]); } });

    return () => { ignorar = true; };
  }, [snapshotId, consultaFiltros, tcrActivo, tcrTipo]);

  const tasas = useMemo(() => (companyInfo.tasas ?? []).filter((t) => !t.isSystem), [companyInfo.tasas]);
  const bcv = useMemo(() => {
    const v = Number((companyInfo.tasas ?? []).find((t) => t.id === "bcv-usd")?.valor);
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [companyInfo.tasas]);

  /**
   * Las tasas con las que la empresa envió su data, resueltas igual que en la
   * ruta de percentiles TCR. `null` cuando el TCR está apagado.
   */
  const opcionesTcr = useMemo(() => {
    if (!tcrActivo) return null;
    const { bcvEurRate, libreRate, tasaTcr } = (() => {
      const r = tasasTcrDeEmpresa(companyInfo.ratesAtSave, tasasGlobales, tcrTipo);
      return { bcvEurRate: r.bcvEurRate, libreRate: r.libreRate, tasaTcr: r.tcrRate };
    })();
    if (!tasaTcr || tasaTcr <= 0) return null;
    return { tipo: tcrTipo, bcvEur: bcvEurRate, libre: libreRate, tasaTcr };
  }, [tcrActivo, tcrTipo, companyInfo.ratesAtSave, tasasGlobales]);

  const mercadoPorTitulo = useMemo(() => {
    const m = new Map<string, GrupoCargo>();
    porCargo.forEach((g) => m.set(norm(g.tituloCargo), g));
    return m;
  }, [porCargo]);

  const mercadoPorGrado = useMemo(() => {
    const m = new Map<number, GrupoGrado>();
    porGrado.forEach((g) => m.set(g.grade, g));
    return m;
  }, [porGrado]);

  /** Los grados que de verdad hay en la lista de la empresa. */
  const gradosDisponibles = useMemo(
    () => [...new Set(cargos.map((c) => c.hayGrade).filter((g): g is number => typeof g === "number"))]
      .sort((a, b) => b - a),
    [cargos],
  );

  const filas = useMemo(() => {
    // Analizar solo los grados elegidos; sin elección, todos.
    const enFoco = filtroGrados.length === 0
      ? cargos
      : cargos.filter((c) => typeof c.hayGrade === "number" && filtroGrados.includes(c.hayGrade));

    return enFoco.map((c) => {
      const fila = { id: c.id, tituloCargo: c.tituloCargo, ...c.data } as ExtendedMarketPosition;
      const diasVac = Number(companyInfo.minVacationDays) || 0;
      const diasUtil = Number(companyInfo.minUtilityDays) || 0;
      const totales = opcionesTcr
        ? computeTCRTotals(fila, tasas, bcv, opcionesTcr.bcvEur, opcionesTcr.libre, opcionesTcr.tasaTcr, opcionesTcr.tipo, diasVac, diasUtil)
        : computeRowTotals(fila, tasas, bcv, diasVac, diasUtil);
      const propio = totales[
        metrica === "sinPasivosMensual" ? "totalSinPasivosMensual"
        : metrica === "directoMensualizado" ? "totalDirectoMensualizado"
        : metrica === "conPasivosMensual" ? "totalConPasivosMensual"
        : "totalConPasivosAnual"
      ];

      // Si no hay equivalencia guardada pero el nombre del cargo calza exacto
      // con uno del corte, se compara igual y la tabla lo marca "por nombre",
      // para que se vea que no es una homologación hecha a mano.
      const registrada = c.equivalencias[snapshotId]?.tituloCatalogo ?? "";
      const porNombre = !registrada && mercadoPorTitulo.has(norm(c.tituloCargo)) ? c.tituloCargo : "";
      const equivalencia = registrada || porNombre;
      const mercado = modo === "cargo"
        ? (equivalencia ? mercadoPorTitulo.get(norm(equivalencia)) : undefined)
        : (c.hayGrade ? mercadoPorGrado.get(c.hayGrade) : undefined);

      return {
        cargo: c,
        propio,
        equivalencia,
        equivalenciaPorNombre: Boolean(porNombre),
        percentiles: mercado ? mercado[metrica] : undefined,
        observaciones: mercado?.n ?? 0,
      };
    });
  }, [cargos, filtroGrados, tasas, bcv, companyInfo, metrica, modo, snapshotId, mercadoPorTitulo, mercadoPorGrado, opcionesTcr]);

  /**
   * Congela lo que la pantalla está mostrando. Se mandan los números ya
   * calculados a propósito: un informe es la foto de lo que el cliente vio, así
   * que recalcularlos al guardar sería justamente lo contrario de congelar.
   */
  async function generarInforme() {
    const elegidas = filas.filter((f) => seleccionados.includes(f.cargo.id));
    if (elegidas.length === 0) { setError("Elige al menos un cargo para el informe."); return; }
    if (!nombreInforme.trim()) { setError("Ponle un nombre al informe."); return; }

    setGenerando(true);
    setError("");
    setAviso("");
    try {
      const corte = snapshots.find((x) => x.id === snapshotId);
      const res = await fetch("/api/estudio/informes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(esAdmin && companyId ? { companyId } : {}),
          nombre: nombreInforme.trim(),
          snapshotId,
          snapshotLabel: corte ? `${corte.label} — ${corte.date}` : "",
          modo,
          metrica,
          filas: elegidas.map((f) => ({
            cargoId: f.cargo.id,
            departamento: f.cargo.departamento,
            tituloCargo: f.cargo.tituloCargo,
            hayGrade: f.cargo.hayGrade,
            capriFamily: f.cargo.capriFamily,
            nivel: gradeToNivel(f.cargo.hayGrade ?? undefined, f.cargo.capriFamily ?? undefined),
            equivalencia: f.equivalencia,
            propio: f.propio,
            percentiles: f.percentiles ?? null,
          })),
        }),
      });
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) { setError(data?.message ?? "No se pudo guardar el informe."); return; }
      setAviso(data?.message ?? "Informe guardado.");
      setNombreInforme("");
      setSeleccionados([]);
    } finally {
      setGenerando(false);
    }
  }

  /**
   * El documento completo en Excel. Va acá y no en Informes porque el corte y
   * la métrica ya están elegidos en esta pantalla: pedirlos de nuevo en otra
   * obligaba a elegir lo mismo dos veces.
   */
  async function descargarExcel() {
    if (!snapshotId) return;
    setBajandoExcel(true);
    setError("");
    try {
      // El mercado del informe sale de la misma fuente que la pantalla, para
      // que el Excel no pueda decir algo distinto de lo que se está viendo.
      const urlMercado = tcrActivo
        ? `/api/percentiles-tcr?snapshotId=${encodeURIComponent(snapshotId)}&tcrType=${tcrTipo}${consultaFiltros ? `&${consultaFiltros}` : ""}`
        : `/api/percentiles-by-grade?snapshotId=${encodeURIComponent(snapshotId)}${consultaFiltros ? `&${consultaFiltros}` : ""}`;
      const resPct = await fetch(urlMercado, { cache: "no-store" });
      const pct = (await resPct.json().catch(() => null)) as
        | { grupos?: Array<{ grade: number } & Record<string, Percentiles>>;
            grades?: Array<{ grade: number } & Record<string, Percentiles>>;
            message?: string } | null;
      if (!resPct.ok) { setError(pct?.message ?? "No se pudieron obtener los percentiles por grado."); return; }

      const mercadoPorGrado = ((tcrActivo ? pct?.grades : pct?.grupos) ?? []).map((g) => {
        const m = g[metrica];
        return { grade: g.grade, p90: m?.p90 ?? null, p75: m?.p75 ?? null, p50: m?.p50 ?? null, p25: m?.p25 ?? null, p10: m?.p10 ?? null };
      });

      const res = await fetch("/api/estudio/informe-especializado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(esAdmin && companyId ? { companyId } : {}),
          snapshotId,
          config: { concepto: metrica, incluirComisiones: comisiones },
          grados: filtroGrados.length > 0 ? filtroGrados : undefined,
          tcr: tcrActivo ? { tipo: tcrTipo } : null,
          grupoComparacion: descripcionGrupo,
          mercadoPorGrado,
        }),
      });

      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(d?.message ?? `No se pudo generar el informe (error ${res.status}).`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Informe especializado.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el informe.");
    } finally {
      setBajandoExcel(false);
    }
  }

  const conComparacion = filas.filter((f) => f.percentiles && f.percentiles.n > 0).length;
  const sigla = METRICAS.find((m) => m.value === metrica)?.sigla ?? "";

  if (status === "loading") {
    return <main className="page-wrap"><p className="text-sm text-slate-500">Cargando…</p></main>;
  }

  if (!esAdmin && !session?.user?.estudioEnabled) {
    return (
      <main className="page-wrap">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <h1 className="dashboard-title font-display font-bold text-slate-900">Comparación.</h1>
          <p className="dashboard-lead mt-3 text-slate-600">Tu empresa no tiene el Estudio Especializado habilitado.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <PasosEstudio />
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow mb-3">Estudio Especializado</div>
          <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">Comparación.</h1>
          <p className="dashboard-lead mt-3 max-w-2xl text-slate-600">
            Tus cargos contra el mercado del estudio, por cargo homologado o por grado.
          </p>
        </section>

        {/* Lo que se decidió en el paso 1 no se vuelve a preguntar: se muestra
            hecho, con una salida para cambiarlo donde se eligió. */}
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-slate-50 p-4">
            <div className="flex min-w-0 flex-wrap gap-x-8 gap-y-3">
              {esAdmin && (
                <div className="min-w-0">
                  <div className="field-label">Empresa</div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    {empresaActiva
                      ? <><Check size={14} className="shrink-0 text-teal-600" aria-hidden /> {nombreEmpresa}</>
                      : <span className="font-normal text-amber-700">Sin elegir</span>}
                  </div>
                </div>
              )}
              <div className="min-w-0">
                <div className="field-label">Estudio</div>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  {snapshotId
                    ? <><Check size={14} className="shrink-0 text-teal-600" aria-hidden /> {nombreCorte}</>
                    : <span className="font-normal text-amber-700">Sin elegir</span>}
                </div>
              </div>
              <div className="min-w-0">
                <div className="field-label">Cargos</div>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  {cargos.length > 0
                    ? <><Check size={14} className="shrink-0 text-teal-600" aria-hidden /> {cargos.length} en la lista</>
                    : <span className="font-normal text-amber-700">Ninguno</span>}
                </div>
              </div>
            </div>
            <Link href="/market-analyzer/estudio/cargos" className="btn btn-secondary text-xs">
              <ArrowLeft size={14} /> Cambiar en Mis cargos
            </Link>
          </div>

          {!listoElPaso1 ? (
            <p className="mt-5 text-sm text-slate-600">
              Falta completar el <strong>paso 1</strong>: {faltaEnElPaso1}. Vuelve a <strong>Mis cargos</strong> y
              luego regresa aquí.
            </p>
          ) : (
          <>
          {/* Va antes de "Comparar" a propósito: primero qué cargos entran, después
              cómo se comparan y contra quién. Cuando estaba debajo se leía como una
              sub-opción del modo de comparación, que no lo es. */}
          {gradosDisponibles.length > 0 && (
            <div className="mb-5 rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Qué cargos de tu lista analizar</span>
                  <span className="block text-xs text-slate-500">
                    Se eligen por grado CAPRI. Aplica compares por cargo homologado o por grado.
                  </span>
                </span>
                <span className="text-xs text-slate-500">
                  {filtroGrados.length === 0
                    ? `Todos los de tu lista (${gradosDisponibles.length})`
                    : `${filtroGrados.length} de ${gradosDisponibles.length}`}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {gradosDisponibles.map((g) => {
                  const activo = filtroGrados.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={activo}
                      onClick={() => setFiltroGrados((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g])}
                      className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${
                        activo
                          ? "border-[#1B4965] bg-[#1B4965] text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {g}
                    </button>
                  );
                })}
                {filtroGrados.length > 0 && (
                  <button type="button" onClick={() => setFiltroGrados([])} className="btn btn-secondary btn-xs">
                    Todos
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div>
              <label htmlFor="cmp-modo" className="field-label">Comparar</label>
              <select id="cmp-modo" value={modo} onChange={(e) => setModo(e.target.value as "cargo" | "grado")} className="field-select">
                <option value="cargo">Por cargo homologado</option>
                <option value="grado">Por grado CAPRI</option>
              </select>
            </div>
            <div>
              <label htmlFor="cmp-metrica" className="field-label">Métrica</label>
              <select id="cmp-metrica" value={metrica} onChange={(e) => setMetrica(e.target.value as Metrica)} className="field-select">
                {METRICAS.map((m) => <option key={m.value} value={m.value}>{m.sigla} — {m.label}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={comisiones} onChange={(e) => setComisiones(e.target.checked)} className="mt-1" />
                <span>Incluir comisiones</span>
              </label>
            </div>
          </div>

          {/* ── Tipo de cambio ───────────────────────────────────────── */}
          <div className="mt-5 rounded-2xl border border-slate-200 p-4">
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={tcrActivo} onChange={(e) => setTcrActivo(e.target.checked)} className="mt-1" />
              <span>
                <span className="block font-semibold text-slate-900">Expresar en TCR</span>
                <span className="block text-xs text-slate-500">
                  Convierte todo con un tipo de cambio de referencia, en vez del BCV. Aplica al estudio completo:
                  pantalla e informe.
                </span>
              </span>
            </label>

            {tcrActivo && (
              <div className="mt-3 max-w-xs">
                <label htmlFor="cmp-tcr-tipo" className="field-label">Tipo de cambio de referencia</label>
                <select id="cmp-tcr-tipo" value={tcrTipo} onChange={(e) => setTcrTipo(e.target.value as TcrType)} className="field-select">
                  <option value="bcv">BCV — dólar</option>
                  <option value="euro">BCV — euro</option>
                  <option value="libre">Libre</option>
                </select>
                <p className="mt-1.5 text-xs text-slate-500">
                  Se usa la tasa que la empresa tenía guardada al enviar su data, la misma con la que se calcula el
                  mercado contra el que se compara.
                </p>
              </div>
            )}
          </div>

          {/* ── Grupo de comparación ──────────────────────────────────── */}
          <div className="mt-5 rounded-2xl border border-slate-200 p-4">
            <button
              type="button"
              onClick={() => setAbrirGrupo((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <span>
                <span className="block text-sm font-semibold text-slate-900">Grupo de comparación</span>
                <span className="block text-xs text-slate-500">
                  Contra quién se compara: <strong>{descripcionGrupo}</strong>
                </span>
              </span>
              <span className="text-xs font-semibold text-teal-700">{abrirGrupo ? "Ocultar" : "Cambiar"}</span>
            </button>

            {abrirGrupo && (
              <div className="mt-4 space-y-4">
                {/* El orden que pidió el CEO: sector, clasificación, ubicación y tamaño. */}
                <div className="grid gap-4 md:grid-cols-2">
                  <ListaCasillas
                    titulo="Sectores económicos"
                    vacio="Todos los del corte"
                    opciones={disponibles.sectores}
                    elegidas={filtroSectores}
                    onToggle={(v) => setFiltroSectores((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v])}
                    onLimpiar={() => setFiltroSectores([])}
                  />
                  <ListaCasillas
                    titulo="Clasificación (subsector)"
                    vacio="Todas las del corte"
                    opciones={disponibles.clasificaciones}
                    elegidas={filtroClasificaciones}
                    onToggle={(v) => setFiltroClasificaciones((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v])}
                    onLimpiar={() => setFiltroClasificaciones([])}
                  />
                  <ListaCasillas
                    titulo="Ubicación"
                    vacio="Todas las del corte"
                    opciones={disponibles.localidades}
                    elegidas={filtroLocalidades}
                    onToggle={(v) => setFiltroLocalidades((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v])}
                    onLimpiar={() => setFiltroLocalidades([])}
                  />
                  <ListaCasillas
                    titulo="Tamaño"
                    vacio="Todos los del corte"
                    opciones={TAMANOS.map((t) => t.valor)}
                    etiquetas={Object.fromEntries(TAMANOS.map((t) => [t.valor, t.etiqueta]))}
                    elegidas={filtroTamanos}
                    onToggle={(v) => setFiltroTamanos((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v])}
                    onLimpiar={() => setFiltroTamanos([])}
                  />
                </div>

                <p className="text-xs text-slate-500">
                  Recortar el grupo cambia los percentiles de toda la pantalla y del informe que descargues. Con menos
                  empresas hay menos observaciones por cargo, así que algunos pueden quedar sin comparación.
                </p>
              </div>
            )}
          </div>

          {cargando && <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…</p>}
          {error && <p className="mt-4 flex items-center gap-1.5 text-sm text-red-700"><AlertTriangle className="h-4 w-4" /> {error}</p>}

          {snapshotId && cargos.length > 0 && (
            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { k: "Cargos en tu lista", v: cargos.length },
                { k: "Con comparación", v: conComparacion },
                { k: "Sin comparación", v: cargos.length - conComparacion },
              ].map((i) => (
                <div key={i.k} className="rounded-2xl bg-slate-50 p-4">
                  <dt className="text-xs text-slate-500">{i.k}</dt>
                  <dd className="mt-1 font-display text-xl font-bold tabular-nums text-slate-900">{i.v}</dd>
                </div>
              ))}
            </dl>
          )}
          </>
          )}
        </section>

        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="rounded-full bg-slate-100 p-2 text-slate-700"><BarChart3 size={16} /></div>
            <h2 className="font-display text-xl font-bold text-slate-900">Posicionamiento · {sigla}</h2>
          </div>

          {!listoElPaso1 && <p className="text-sm text-slate-500">Completa el paso 1 para ver la comparación.</p>}

          {snapshotId && cargos.length === 0 && !cargando && (
            <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              No hay cargos en la lista. Cárgalos desde <strong>Mis cargos</strong>.
            </p>
          )}

          {snapshotId && cargos.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[54rem] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-10 px-4 py-2.5">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos los cargos"
                        checked={seleccionados.length > 0 && seleccionados.length === filas.length}
                        ref={(el) => { if (el) el.indeterminate = seleccionados.length > 0 && seleccionados.length < filas.length; }}
                        onChange={(e) => setSeleccionados(e.target.checked ? filas.map((f) => f.cargo.id) : [])}
                      />
                    </th>
                    <th className="px-4 py-2.5 font-semibold">Cargo</th>
                    <th className="px-4 py-2.5 font-semibold">{modo === "cargo" ? "Equivale a" : "Grado"}</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Tuyo</th>
                    <th className="px-4 py-2.5 text-right font-semibold">P25</th>
                    <th className="px-4 py-2.5 text-right font-semibold">P50</th>
                    <th className="px-4 py-2.5 text-right font-semibold">P75</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Obs.</th>
                    <th className="px-4 py-2.5 font-semibold">Posición</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filas.map((f) => {
                    const hayMercado = Boolean(f.percentiles && f.percentiles.n > 0);
                    const pos = posicionEnMercado(f.propio, f.percentiles ?? null);
                    return (
                      <tr key={f.cargo.id}>
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            aria-label={`Incluir ${f.cargo.tituloCargo} en el informe`}
                            checked={seleccionados.includes(f.cargo.id)}
                            onChange={() => setSeleccionados((prev) => prev.includes(f.cargo.id) ? prev.filter((x) => x !== f.cargo.id) : [...prev, f.cargo.id])}
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="block text-slate-800">{f.cargo.tituloCargo}</span>
                          {f.cargo.departamento && <span className="block text-xs text-slate-500">{f.cargo.departamento}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-600">
                          {modo === "cargo"
                            ? (f.equivalencia
                                ? <>{f.equivalencia}{f.equivalenciaPorNombre && <span className="ml-1 text-slate-400">· por nombre</span>}</>
                                : <span className="text-amber-700">Sin homologar</span>)
                            : (f.cargo.hayGrade
                                ? `${f.cargo.hayGrade} · ${gradeToNivel(f.cargo.hayGrade, f.cargo.capriFamily ?? undefined)}`
                                : <span className="text-amber-700">Sin grado</span>)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-800">{money(f.propio)}</td>
                        {hayMercado ? (
                          <>
                            <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-600">{money(f.percentiles!.p25)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-900">{money(f.percentiles!.p50)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-600">{money(f.percentiles!.p75)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-500">{f.observaciones}</td>
                            <td className="px-4 py-2.5"><span className={`pill ${pos.clase}`}>{pos.texto}</span></td>
                          </>
                        ) : (
                          <td colSpan={5} className="px-4 py-2.5 text-xs text-slate-500">Sin comparación disponible</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Cuando falta algo se dice cuál es, en vez de esconder el bloque:
              antes desaparecía sin explicación y parecía que no existía. */}
          {empresaActiva && (!snapshotId || cargos.length === 0) && (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 p-5">
              <h3 className="font-display text-base font-bold text-slate-500">Generar un informe</h3>
              <p className="mt-1 text-sm text-slate-500">
                {cargos.length === 0
                  ? <>Esta empresa todavía no tiene cargos en su lista. Cárgalos en <strong>Mis cargos</strong> y vuelve.</>
                  : <>Elige arriba el <strong>estudio</strong> contra el que comparar y aparecerán aquí las opciones para guardar y descargar el informe.</>}
              </p>
            </div>
          )}

          {snapshotId && cargos.length > 0 && (
            <div className="mt-6 rounded-2xl border border-slate-200 p-5">
              <h3 className="font-display text-base font-bold text-slate-900">Generar un informe</h3>
              <p className="mt-1 text-sm text-slate-600">
                <strong>Guardar</strong> deja el informe congelado con estos números en el <strong>Historial</strong>:
                si después cambia la data, seguirá igual. <strong>Descargar</strong> baja el documento completo en Excel
                —dispersión, equidad interna, competitividad, mapa de calor y simulador— con el estudio y la métrica
                de arriba.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="min-w-[16rem] flex-1">
                  <label htmlFor="cmp-nombre" className="field-label">Nombre del informe</label>
                  <input
                    id="cmp-nombre"
                    value={nombreInforme}
                    onChange={(e) => setNombreInforme(e.target.value)}
                    className="field"
                    placeholder="Ej. Posicionamiento gerencial 2026"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void generarInforme()}
                  disabled={generando || seleccionados.length === 0}
                  className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {generando ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                  Guardar con {seleccionados.length} {seleccionados.length === 1 ? "cargo" : "cargos"}
                </button>
                <button
                  type="button"
                  onClick={() => void descargarExcel()}
                  disabled={bajandoExcel}
                  className="btn btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bajandoExcel ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  Descargar el informe completo
                </button>
              </div>
              {aviso && (
                <p className="mt-3 rounded-2xl bg-teal-50 px-4 py-3 text-sm text-teal-800">
                  {aviso} Lo encuentras en <strong>Informes</strong>.
                </p>
              )}
            </div>
          )}

          <p className="mt-4 text-xs text-slate-500">
            Los percentiles salen del mismo cálculo que alimenta Resultados, así que coinciden con lo que ve la empresa.
            Un cargo sin homologar, o homologado contra uno sin data suficiente, se muestra igual con sus propios
            montos y sin columnas de mercado.
          </p>
        </section>
      </div>
    </main>
  );
}
