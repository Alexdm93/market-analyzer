/**
 * Lista de cargos propia de una empresa para el Estudio Especializado.
 *
 * Es deliberadamente independiente de `UserPosition`, que es lo que la empresa
 * le reporta al mercado: esa va por corte y contra el catálogo cerrado del
 * corte. Esta es una sola lista por empresa, con sus propios nombres, y
 * persiste entre estudios.
 */
import type { Session } from "next-auth";

import { prisma } from "@/lib/prisma";
import type { ExtendedMarketPosition } from "@/types/salary";

export type EstudioCargoDTO = {
  id: string;
  departamento: string;
  tituloCargo: string;
  descripcion: string;
  hayGrade: number | null;
  capriFamily: string | null;
  data: Partial<ExtendedMarketPosition>;
  origen: string;
  origenSnapshotId: string | null;
  /** Equivalencias por corte: { [snapshotId]: { departamento, tituloCatalogo } } */
  equivalencias: Record<string, { departamento: string; tituloCatalogo: string }>;
  updatedAt: string;
};

/** Sin acentos, en minúsculas: para comparar títulos como hace el resto del sistema. */
export function normalizarTitulo(valor: string): string {
  return valor.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

type Acceso =
  | { ok: true; companyId: string; esAdmin: boolean }
  | { ok: false; response: Response };

/**
 * Resuelve sobre qué empresa se está trabajando.
 *
 * El admin puede operar en nombre de cualquier empresa pasando `companyId`,
 * igual que ya hace la pantalla de Data. Una empresa solo puede tocar la suya,
 * y solo si tiene el Estudio Especializado habilitado.
 */
export function resolverAcceso(session: Session | null, companyIdPedido: string): Acceso {
  const userId = session?.user?.id;
  if (!userId) {
    return { ok: false, response: Response.json({ message: "No autorizado." }, { status: 401 }) };
  }

  const esAdmin = session.user.role === "ADMIN";

  if (esAdmin) {
    if (!companyIdPedido) {
      return { ok: false, response: Response.json({ message: "Indica la empresa." }, { status: 400 }) };
    }
    return { ok: true, companyId: companyIdPedido, esAdmin: true };
  }

  if (companyIdPedido && companyIdPedido !== session.user.companyId) {
    return { ok: false, response: Response.json({ message: "Acceso restringido." }, { status: 403 }) };
  }

  if (!session.user.estudioEnabled) {
    return {
      ok: false,
      response: Response.json({ message: "Tu empresa no tiene el Estudio Especializado habilitado." }, { status: 403 }),
    };
  }

  const companyId = session.user.companyId;
  if (!companyId) {
    return { ok: false, response: Response.json({ message: "Tu usuario no tiene empresa asignada." }, { status: 400 }) };
  }

  return { ok: true, companyId, esAdmin: false };
}

function parseData(dataJson: string): Partial<ExtendedMarketPosition> {
  try {
    const parsed = JSON.parse(dataJson) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Partial<ExtendedMarketPosition>) : {};
  } catch {
    return {};
  }
}

export async function listarCargos(companyId: string): Promise<EstudioCargoDTO[]> {
  const filas = await prisma.estudioCargo.findMany({
    where: { companyId },
    include: { equivalencias: true },
    orderBy: [{ departamento: "asc" }, { tituloCargo: "asc" }],
  });

  return filas.map((f) => ({
    id: f.id,
    departamento: f.departamento,
    tituloCargo: f.tituloCargo,
    descripcion: f.descripcion,
    hayGrade: f.hayGrade,
    capriFamily: f.capriFamily,
    data: parseData(f.dataJson),
    origen: f.origen,
    origenSnapshotId: f.origenSnapshotId,
    equivalencias: Object.fromEntries(
      f.equivalencias.map((e) => [e.snapshotId, { departamento: e.departamento, tituloCatalogo: e.tituloCatalogo }]),
    ),
    updatedAt: f.updatedAt.toISOString(),
  }));
}

export type EntradaCargo = {
  departamento?: string;
  tituloCargo?: string;
  descripcion?: string;
  hayGrade?: number | null;
  capriFamily?: string | null;
  data?: Partial<ExtendedMarketPosition>;
};

const FAMILIAS = new Set(["IC", "LO", "GE", "EJ"]);

export type Validacion = { ok: true; valor: Required<Omit<EntradaCargo, "data">> & { data: Partial<ExtendedMarketPosition> } }
  | { ok: false; mensaje: string };

export function validarCargo(entrada: EntradaCargo): Validacion {
  const tituloCargo = (entrada.tituloCargo ?? "").replace(/\s+/g, " ").trim();
  if (!tituloCargo) return { ok: false, mensaje: "El cargo necesita un nombre." };
  if (tituloCargo.length > 200) return { ok: false, mensaje: "El nombre del cargo es demasiado largo." };

  let hayGrade: number | null = null;
  if (entrada.hayGrade !== null && entrada.hayGrade !== undefined) {
    const n = Math.round(Number(entrada.hayGrade));
    if (!Number.isFinite(n) || n < 8 || n > 25) {
      return { ok: false, mensaje: "El grado CAPRI va del 8 al 25." };
    }
    hayGrade = n;
  }

  const familia = (entrada.capriFamily ?? "").trim().toUpperCase();
  const capriFamily = FAMILIAS.has(familia) ? familia : null;

  return {
    ok: true,
    valor: {
      departamento: (entrada.departamento ?? "").replace(/\s+/g, " ").trim(),
      tituloCargo,
      descripcion: (entrada.descripcion ?? "").trim(),
      hayGrade,
      capriFamily,
      data: entrada.data && typeof entrada.data === "object" ? entrada.data : {},
    },
  };
}

/**
 * El índice único de la base es sensible a mayúsculas y acentos, así que el
 * choque real se comprueba acá, con el mismo criterio que usa el resto del
 * sistema para los títulos de cargo.
 */
export async function tituloYaExiste(companyId: string, titulo: string, excluirId?: string): Promise<boolean> {
  const existentes = await prisma.estudioCargo.findMany({
    where: { companyId, ...(excluirId ? { id: { not: excluirId } } : {}) },
    select: { tituloCargo: true },
  });
  const objetivo = normalizarTitulo(titulo);
  return existentes.some((e) => normalizarTitulo(e.tituloCargo) === objetivo);
}
