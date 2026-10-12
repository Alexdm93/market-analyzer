/**
 * Lo que todo informe de un corte necesita saber del corte.
 *
 * El de cortesía y el general comparten tres hojas idénticas —portada,
 * empresas participantes y distribución de compensación— y las dos se arman
 * con los mismos datos: quién envió, qué declaró cada empresa y cuándo se
 * procesó el corte. Escribir eso dos veces era garantizar que algún día los
 * dos informes dijeran cosas distintas del mismo corte.
 *
 * Acá se reúne una sola vez. Lo que cambia entre un informe y otro —qué
 * métrica se publica, cuántos percentiles, si va en TCR— se queda afuera.
 */
import { getBcvRate, getBcvEuroRate, getBinanceRate } from "@/lib/bcv";
import { CATEGORIAS, calcularDistribucion, calcularMonedaPorNivel } from "@/lib/distribucion-compensacion";
import { catalogoDelCorte, normalizarTitulo } from "@/lib/estudio-cargos";
import { tamanoDeEmpresa } from "@/lib/filtros-mercado";
import type { FilaDistribucionInforme, FilaMonedaInforme, ParticipanteInforme } from "@/lib/informe-cortesia";
import type { TasasGlobales, WorkspaceParaTcr } from "@/lib/percentiles-mercado";
import { prisma } from "@/lib/prisma";
import { getLibreRate } from "@/lib/tcr-config";
import { safeParseCompanyInfo } from "@/lib/workspace";
import type { ExtendedMarketPosition } from "@/types/salary";

/** Cómo se escribe el tamaño en los gráficos, que no es como se calcula. */
const TAMANO_EN_GRAFICO: Record<string, string> = {
  "pequeña": "Pequeña",
  "mediana": "Mediana",
  "grande": "Grande",
};

export type DatosDelCorte = {
  /** El nombre del corte, tal como lo ve el admin. */
  etiqueta: string;
  /**
   * El mes del "DATA:" de la portada: cuándo el admin dio por procesado el
   * corte. Si todavía no lo procesó, la fecha que lleva el corte.
   */
  fechaData: Date;
  participantes: ParticipanteInforme[];
  distribucion: FilaDistribucionInforme[];
  moneda: FilaMonedaInforme[];
  /** El departamento con el que el cargo entró al catálogo de ESTE corte. */
  unidadFuncionalDe: (tituloCargo: string) => string;
  /**
   * Agrupa por unidad funcional y, dentro de cada una, respeta el orden del
   * catálogo. Lo que no esté en el catálogo del corte cae al final.
   */
  compararCargos: (a: CargoOrdenable, b: CargoOrdenable) => number;
  /** Todos los workspaces, para calcular el mercado en TCR sin volver a leer. */
  workspaces: WorkspaceParaTcr[];
  tasas: TasasGlobales;
};

export type CargoOrdenable = { tituloCargo: string; unidadFuncional: string };

/** Cuando el corte no da para armar un informe, con el motivo que ve el cliente. */
export class CorteSinDatos extends Error {}

export async function reunirDatosDelCorte(snapshotId: string): Promise<DatosDelCorte> {
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
    throw new CorteSinDatos("Ninguna empresa ha enviado data en ese corte.");
  }

  const [{ rate: bcv }, { rate: bcvEur }, { rate: binance }, { rate: libreManual }] = tasasGlobales;

  const infoPorUsuario = new Map(workspaces.map((w) => [w.userId, safeParseCompanyInfo(w.companyInfoJson)]));

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
        bcv: info?.ratesAtSave?.bcvUsd ?? bcv,
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

  const procesado = enviados
    .map((e) => e.processedAt)
    .filter((f): f is Date => Boolean(f))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return {
    etiqueta: enviados[0]?.label ?? snapshotId,
    fechaData: procesado ?? enviados[0]?.date ?? new Date(),
    participantes,
    distribucion,
    moneda,
    unidadFuncionalDe: (titulo) => unidadPorCargo.get(normalizarTitulo(titulo)) ?? "",
    compararCargos: (a, b) => {
      const ua = ordenDeLaUnidad.get(a.unidadFuncional) ?? Number.MAX_SAFE_INTEGER;
      const ub = ordenDeLaUnidad.get(b.unidadFuncional) ?? Number.MAX_SAFE_INTEGER;
      if (ua !== ub) return ua - ub;
      const ca = ordenDelCargo.get(normalizarTitulo(a.tituloCargo)) ?? Number.MAX_SAFE_INTEGER;
      const cb = ordenDelCargo.get(normalizarTitulo(b.tituloCargo)) ?? Number.MAX_SAFE_INTEGER;
      if (ca !== cb) return ca - cb;
      return a.tituloCargo.localeCompare(b.tituloCargo, "es");
    },
    workspaces,
    tasas: { bcv, bcvEur, binance, libreManual },
  };
}
