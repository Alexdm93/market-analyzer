/**
 * Genera el informe de cortesía de un corte, rellenando la plantilla del cliente.
 *
 * Los percentiles los manda quien llama y no se recalculan acá: vienen de
 * `/api/percentiles` y `/api/percentiles-tcr`, que son las rutas que alimentan
 * el estudio de cortesía en pantalla. Recalcularlos por separado abriría la
 * puerta a que el informe y Resultados dijeran cosas distintas.
 *
 * La distribución de compensación sí se calcula acá, porque no existe en
 * ninguna pantalla: es un desglose por categoría que solo usa este informe.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getBcvRate, getBcvEuroRate, getBinanceRate } from "@/lib/bcv";
import { promedioLibre } from "@/lib/compensation";
import { CATEGORIAS, calcularDistribucion, calcularMonedaPorNivel } from "@/lib/distribucion-compensacion";
import { catalogoDelCorte, normalizarTitulo } from "@/lib/estudio-cargos";
import { tamanoDeEmpresa } from "@/lib/filtros-mercado";
import {
  generarInformeCortesia,
  mesYAnio,
  type EstadisticaMercado,
  type GrupoMercado,
  type ParticipanteInforme,
} from "@/lib/informe-cortesia";
import { calcularPercentilesTcr } from "@/lib/percentiles-tcr";
import { prisma } from "@/lib/prisma";
import { getPublishedSnapshotIds } from "@/lib/published-snapshots";
import { getLibreRate } from "@/lib/tcr-config";
import { safeParseCompanyInfo } from "@/lib/workspace";
import type { ExtendedMarketPosition } from "@/types/salary";

export const maxDuration = 60;

type Cuerpo = { snapshotId?: string; companyId?: string; cargos?: Array<Record<string, unknown>> };

function numeroONulo(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function estadistica(v: unknown): EstadisticaMercado {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return {
    p50: numeroONulo(o.p50), promedio: numeroONulo(o.promedio),
    min: numeroONulo(o.min), max: numeroONulo(o.max),
  };
}

const TAMANO_EN_GRAFICO: Record<string, string> = {
  "pequeña": "Pequeña",
  "mediana": "Mediana",
  "grande": "Grande",
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Cuerpo | null;
  const snapshotId = body?.snapshotId?.trim() ?? "";
  if (!snapshotId) return Response.json({ message: "Indica el corte." }, { status: 400 });

  const esAdmin = session.user.role === "ADMIN";

  // El admin puede generarlo para cualquier empresa, o genérico sin ninguna.
  // Una empresa solo descarga el suyo, y solo si se lo ganó: el corte tiene que
  // estar publicado y ella tiene que haber enviado su data. Son las dos mismas
  // condiciones que dan derecho al informe.
  const companyIdCliente = esAdmin ? (body?.companyId?.trim() ?? "") : (session.user.companyId ?? "");

  if (!esAdmin) {
    if (!companyIdCliente) {
      return Response.json({ message: "Tu usuario no tiene empresa asignada." }, { status: 400 });
    }
    const [publicados, envio] = await Promise.all([
      getPublishedSnapshotIds(),
      prisma.userSnapshot.findFirst({
        where: { snapshotId, companyId: companyIdCliente, submittedAt: { not: null } },
        select: { id: true },
      }),
    ]);
    if (!publicados.includes(snapshotId)) {
      return Response.json({ message: "Ese corte todavía no está publicado." }, { status: 403 });
    }
    if (!envio) {
      return Response.json(
        { message: "El informe es para las empresas que enviaron su data en este corte." },
        { status: 403 },
      );
    }
  }
  if (!Array.isArray(body?.cargos) || body.cargos.length === 0) {
    return Response.json({ message: "El informe no trae cargos." }, { status: 400 });
  }

  // El Market Analyzer va agrupado por unidad funcional, que es el
  // departamento con que el cargo entró al catálogo de ESTE corte. Cada corte
  // tiene el suyo, así que no se puede leer de otro lado.
  const catalogo = await catalogoDelCorte(snapshotId);
  const unidadPorCargo = new Map<string, string>();
  const ordenDelCargo = new Map<string, number>();
  const ordenDeLaUnidad = new Map<string, number>();
  catalogo.forEach((c, i) => {
    const clave = normalizarTitulo(c.tituloCargo);
    if (!unidadPorCargo.has(clave)) {
      unidadPorCargo.set(clave, c.departamento);
      ordenDelCargo.set(clave, i);
    }
    if (!ordenDeLaUnidad.has(c.departamento)) ordenDeLaUnidad.set(c.departamento, ordenDeLaUnidad.size);
  });

  // Solo los cargos que tienen algo que mostrar.
  //
  // Todas las columnas de la tabla —TCR, P50, promedio, mínimo y máximo—
  // exigen las mismas observaciones mínimas, así que una fila sin mediana sale
  // en "ND" de punta a punta: ocupa el renglón para no decir nada. Se deja
  // fuera del informe (AC Consulting, 2026-09-27).
  const cargos: GrupoMercado[] = body.cargos
    .map((c) => {
      const tituloCargo = String(c.tituloCargo ?? "").trim();
      return {
        tituloCargo,
        unidadFuncional: unidadPorCargo.get(normalizarTitulo(tituloCargo)) ?? "",
        n: Number(c.n) || 0,
        cim: estadistica(c.cim),
        // Se llena más abajo, con el mercado en TCR.
        cimTcrP50: null as number | null,
      };
    })
    .filter((c) => c.tituloCargo && c.n > 0 && c.cim.p50 !== null)
    // Agrupados por unidad funcional, y dentro de cada una en el orden del
    // catálogo. Lo que no esté en el catálogo del corte cae al final.
    .sort((a, b) => {
      const ua = ordenDeLaUnidad.get(a.unidadFuncional) ?? Number.MAX_SAFE_INTEGER;
      const ub = ordenDeLaUnidad.get(b.unidadFuncional) ?? Number.MAX_SAFE_INTEGER;
      if (ua !== ub) return ua - ub;
      const ca = ordenDelCargo.get(normalizarTitulo(a.tituloCargo)) ?? Number.MAX_SAFE_INTEGER;
      const cb = ordenDelCargo.get(normalizarTitulo(b.tituloCargo)) ?? Number.MAX_SAFE_INTEGER;
      if (ca !== cb) return ca - cb;
      return a.tituloCargo.localeCompare(b.tituloCargo, "es");
    });

  if (cargos.length === 0) {
    return Response.json(
      { message: "Ningún cargo del corte reúne las observaciones mínimas para publicarse." },
      { status: 400 },
    );
  }

  // Participantes: las empresas que enviaron data. Es la misma condición que
  // da derecho al informe.
  const [enviados, posiciones, tasasGlobales, workspaces] = await Promise.all([
    prisma.userSnapshot.findMany({
      where: { snapshotId, submittedAt: { not: null } },
      select: {
        userId: true,
        companyId: true,
        company: { select: { name: true, economicSector: true, headcount: true } },
        date: true,
        label: true,
        processedAt: true,
      },
      distinct: ["companyId"],
    }),
    prisma.userPosition.findMany({
      where: { snapshotId, snapshot: { submittedAt: { not: null } } },
      select: { userId: true, dataJson: true },
    }),
    Promise.all([getBcvRate(), getBcvEuroRate(), getBinanceRate(), getLibreRate()]),
    // Todos, no solo los de las empresas del corte: los percentiles en TCR se
    // calculan sobre el mismo universo que ve la pantalla.
    prisma.userWorkspace.findMany({
      select: { userId: true, snapshotsJson: true, companyInfoJson: true },
    }),
  ]);

  if (enviados.length === 0) {
    return Response.json({ message: "Ninguna empresa ha enviado data en ese corte." }, { status: 400 });
  }

  const [{ rate: bcvGeneral }, { rate: bcvEurGeneral }, { rate: binanceGeneral }, { rate: libreManual }] = tasasGlobales;

  // Cada empresa convierte con la tasa que tenía al guardar, igual que el resto
  // del sistema.
  const infoPorUsuario = new Map(workspaces.map((w) => [w.userId, safeParseCompanyInfo(w.companyInfoJson)]));

  // La columna "P50 - TCR BCV-USD": el mercado del corte completo, sin filtros.
  // Se calcula acá y no en el navegador porque si la llamada fallaba, la
  // columna salía "ND" en todas las filas sin que nadie se enterara.
  const tcrPorCargo = new Map<string, number | null>();
  if (bcvGeneral || promedioLibre(binanceGeneral, bcvEurGeneral) || libreManual) {
    const mercadoTcr = calcularPercentilesTcr({
      snapshotId,
      tcrType: "bcv",
      filtros: { sectores: [], clasificaciones: [], empresas: [], localidades: [], tamanos: [] },
      workspaces,
      globales: { bcv: bcvGeneral, bcvEur: bcvEurGeneral, binance: binanceGeneral, libreManual },
    });
    for (const c of mercadoTcr.cargos) {
      tcrPorCargo.set(normalizarTitulo(c.tituloCargo), c.conPasivosMensual.p50 ?? null);
    }
  }
  for (const cargo of cargos) {
    cargo.cimTcrP50 = tcrPorCargo.get(normalizarTitulo(cargo.tituloCargo)) ?? null;
  }

  // Sector y tamaño de cada participante, para los gráficos de la hoja de
  // empresas. Manda lo que la empresa declaró al enviar su data, que es la
  // misma fuente con la que se arman los filtros de mercado; la ficha que
  // mantiene el admin queda de respaldo.
  const participantes: ParticipanteInforme[] = enviados
    .filter((e) => e.company?.name)
    .map((e) => {
      const info = infoPorUsuario.get(e.userId);
      const headcount = info?.headcount || e.company?.headcount || "";
      const tamano = tamanoDeEmpresa(headcount);
      return {
        empresa: e.company!.name,
        sector: (info?.sector || e.company?.economicSector || "").trim(),
        tamano: tamano ? TAMANO_EN_GRAFICO[tamano] : "",
      };
    })
    .sort((a, b) => a.empresa.localeCompare(b.empresa, "es"));

  const paraDistribucion = posiciones.flatMap((p) => {
    try {
      const info = infoPorUsuario.get(p.userId);
      return [{
        fila: JSON.parse(p.dataJson) as ExtendedMarketPosition,
        tasas: info?.tasas ?? [],
        bcv: info?.ratesAtSave?.bcvUsd ?? bcvGeneral,
      }];
    } catch {
      return [];
    }
  });

  const distribucion = calcularDistribucion(paraDistribucion).map((f) => ({
    nivel: f.nivel.toUpperCase(),
    valores: CATEGORIAS.map((c) => f.porcentajes[c]),
  }));

  const moneda = calcularMonedaPorNivel(paraDistribucion).map((f) => ({
    nivel: f.nivel.toUpperCase(),
    cuentaVES: CATEGORIAS.map((c) => f.cuentaVES[c]),
    cuentaUSD: CATEGORIAS.map((c) => f.cuentaUSD[c]),
    pagoVES: CATEGORIAS.map((c) => f.pagoVES[c]),
    pagoUSD: CATEGORIAS.map((c) => f.pagoUSD[c]),
  }));

  const snapshot = enviados[0];
  const etiqueta = snapshot?.label ?? snapshotId;

  // "DATA:" es cuándo se procesó el corte, no la fecha que lleva el corte de
  // nombre. Si todavía no se procesó, queda la del corte.
  const procesado = enviados
    .map((e) => e.processedAt)
    .filter((f): f is Date => Boolean(f))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const cliente = companyIdCliente
    ? (await prisma.company.findUnique({ where: { id: companyIdCliente }, select: { name: true } }))?.name ?? ""
    : "";

  const buffer = await generarInformeCortesia({
    tituloEstudio: `RESULTADOS ${etiqueta.toUpperCase()}`,
    cliente,
    fechaInforme: mesYAnio(new Date()),
    fechaData: mesYAnio(procesado ?? snapshot?.date ?? new Date()),
    participantes,
    cargos,
    distribucion,
    categoriasDistribucion: [...CATEGORIAS],
    moneda,
  });

  const nombre = cliente
    ? `Informe de cortesía - ${cliente} - ${etiqueta}.xlsx`
    : `Informe de cortesía - ${etiqueta}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
