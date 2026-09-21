/**
 * Lista de ocupantes de una empresa para el Estudio Especializado.
 *
 * La fila es la PERSONA, no el cargo: una empresa puede tener tres analistas
 * con sueldos distintos, y el Análisis de Equidad Interna existe para
 * compararlos entre sí. Eso solo pasa en el especializado — en el estudio de
 * mercado va un cargo por empresa, y de eso se encarga `UserPosition`.
 *
 * Es independiente de `UserPosition` también en el tiempo: esa va por corte y
 * contra el catálogo cerrado; esta es una sola lista por empresa, con sus
 * propios nombres, y persiste entre estudios.
 */
import type { Session } from "next-auth";

import { prisma } from "@/lib/prisma";
import type { ExtendedMarketPosition } from "@/types/salary";

export type EstudioCargoDTO = {
  id: string;
  ocupanteId: string;
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
  // Las equivalencias van por cargo, no por ocupante: se traen aparte y se
  // reparten entre todos los ocupantes que comparten título.
  const [filas, equivalencias] = await Promise.all([
    prisma.estudioCargo.findMany({
      where: { companyId },
      orderBy: [{ departamento: "asc" }, { tituloCargo: "asc" }, { ocupanteId: "asc" }],
    }),
    prisma.estudioEquivalencia.findMany({ where: { companyId } }),
  ]);

  const porTitulo = new Map<string, Record<string, { departamento: string; tituloCatalogo: string }>>();
  for (const e of equivalencias) {
    const actual = porTitulo.get(e.tituloCargoKey) ?? {};
    actual[e.snapshotId] = { departamento: e.departamento, tituloCatalogo: e.tituloCatalogo };
    porTitulo.set(e.tituloCargoKey, actual);
  }

  return filas.map((f) => ({
    id: f.id,
    ocupanteId: f.ocupanteId ?? "",
    departamento: f.departamento,
    tituloCargo: f.tituloCargo,
    descripcion: f.descripcion,
    hayGrade: f.hayGrade,
    capriFamily: f.capriFamily,
    data: parseData(f.dataJson),
    origen: f.origen,
    origenSnapshotId: f.origenSnapshotId,
    equivalencias: porTitulo.get(normalizarTitulo(f.tituloCargo)) ?? {},
    updatedAt: f.updatedAt.toISOString(),
  }));
}

export type EntradaCargo = {
  ocupanteId?: string;
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
      ocupanteId: (entrada.ocupanteId ?? "").replace(/\s+/g, " ").trim(),
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
 * El identificador de ocupante, si se usa, no puede repetirse dentro de la
 * empresa. El título del cargo SÍ puede repetirse: son personas distintas en el
 * mismo cargo, que es exactamente lo que el estudio especializado necesita ver.
 */
export async function ocupanteYaExiste(companyId: string, ocupanteId: string, excluirId?: string): Promise<boolean> {
  const limpio = ocupanteId.trim();
  if (!limpio) return false;
  const encontrado = await prisma.estudioCargo.findFirst({
    where: { companyId, ocupanteId: limpio, ...(excluirId ? { id: { not: excluirId } } : {}) },
    select: { id: true },
  });
  return Boolean(encontrado);
}

/** Quita las equivalencias de un título que ya no tiene ningún ocupante. */
export async function limpiarEquivalenciasHuerfanas(companyId: string, tituloCargo: string): Promise<number> {
  const clave = normalizarTitulo(tituloCargo);
  const quedan = await prisma.estudioCargo.count({ where: { companyId, tituloCargo } });
  if (quedan > 0) return 0;
  const { count } = await prisma.estudioEquivalencia.deleteMany({ where: { companyId, tituloCargoKey: clave } });
  return count;
}
