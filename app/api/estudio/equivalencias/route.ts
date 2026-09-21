/**
 * F4 — Equivalencia entre un cargo del cliente y uno del catálogo, POR CORTE.
 *
 * Cada corte tiene su propio catálogo (`snapshot-cargos-{snapshotId}`), así que
 * la equivalencia se guarda por el par (cargo × corte). Dos cargos del cliente
 * pueden apuntar al mismo cargo del catálogo: eso está permitido a propósito.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { resolverAcceso } from "@/lib/estudio-cargos";
import { prisma } from "@/lib/prisma";

type CatalogoCargo = { departamento: string; tituloCargo: string };

async function catalogoDelCorte(snapshotId: string): Promise<CatalogoCargo[]> {
  const fila = await prisma.globalConfig.findUnique({
    where: { key: `snapshot-cargos-${snapshotId}` },
    select: { value: true },
  });
  if (!fila?.value) return [];
  try {
    const parsed = JSON.parse(fila.value) as CatalogoCargo[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Devuelve el catálogo del corte, para poder elegir contra qué homologar. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const acceso = resolverAcceso(await getServerSession(authOptions).catch(() => null), searchParams.get("companyId")?.trim() ?? "");
  if (!acceso.ok) return acceso.response;

  const snapshotId = searchParams.get("snapshotId")?.trim() ?? "";
  if (!snapshotId) return Response.json({ message: "Indica el corte." }, { status: 400 });

  // El cliente ve TODO el catálogo del estudio, no solo los cargos con data
  // suficiente: si homologa contra uno sin data, el informe dirá "sin
  // comparación disponible".
  return Response.json({ catalogo: await catalogoDelCorte(snapshotId) });
}

type Cuerpo = {
  companyId?: string;
  estudioCargoId?: string;
  snapshotId?: string;
  departamento?: string;
  tituloCatalogo?: string;
};

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as Cuerpo | null;
  const acceso = resolverAcceso(await getServerSession(authOptions).catch(() => null), body?.companyId?.trim() ?? "");
  if (!acceso.ok) return acceso.response;

  const estudioCargoId = body?.estudioCargoId?.trim() ?? "";
  const snapshotId = body?.snapshotId?.trim() ?? "";
  const tituloCatalogo = (body?.tituloCatalogo ?? "").replace(/\s+/g, " ").trim();

  if (!estudioCargoId || !snapshotId) {
    return Response.json({ message: "Indica el cargo y el corte." }, { status: 400 });
  }

  const cargo = await prisma.estudioCargo.findUnique({
    where: { id: estudioCargoId },
    select: { companyId: true },
  });
  if (!cargo || cargo.companyId !== acceso.companyId) {
    return Response.json({ message: "Ese cargo no existe en esta empresa." }, { status: 404 });
  }

  // Sin título: se entiende como "quitar la equivalencia de este corte".
  if (!tituloCatalogo) {
    await prisma.estudioEquivalencia.deleteMany({ where: { estudioCargoId, snapshotId } });
    return Response.json({ message: "Equivalencia quitada." });
  }

  // Tiene que existir en el catálogo de ESE corte, si no la comparación no
  // encontraría nada después.
  const catalogo = await catalogoDelCorte(snapshotId);
  const objetivo = tituloCatalogo.toLowerCase();
  const coincidencias = catalogo.filter((c) => c.tituloCargo.trim().toLowerCase() === objetivo);

  if (coincidencias.length === 0) {
    return Response.json(
      { message: `"${tituloCatalogo}" no está en el catálogo de ese corte.` },
      { status: 400 },
    );
  }

  const departamentoPedido = (body?.departamento ?? "").trim().toLowerCase();
  const elegido = coincidencias.length === 1
    ? coincidencias[0]
    : coincidencias.find((c) => c.departamento.trim().toLowerCase() === departamentoPedido);

  if (!elegido) {
    return Response.json(
      {
        message: `"${tituloCatalogo}" existe en varios departamentos del catálogo (${coincidencias.map((c) => c.departamento).join(", ")}). Indica cuál.`,
      },
      { status: 400 },
    );
  }

  await prisma.estudioEquivalencia.upsert({
    where: { estudioCargoId_snapshotId: { estudioCargoId, snapshotId } },
    create: {
      estudioCargoId, snapshotId,
      departamento: elegido.departamento,
      tituloCatalogo: elegido.tituloCargo,
    },
    update: {
      departamento: elegido.departamento,
      tituloCatalogo: elegido.tituloCargo,
    },
  });

  return Response.json({
    message: "Equivalencia guardada.",
    equivalencia: { departamento: elegido.departamento, tituloCatalogo: elegido.tituloCargo },
  });
}
