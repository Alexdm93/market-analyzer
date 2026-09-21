/**
 * F4 — Equivalencia entre un cargo del cliente y uno del catálogo, POR CORTE.
 *
 * Cada corte tiene su propio catálogo (`snapshot-cargos-{snapshotId}`), así que
 * la equivalencia se guarda por el par (cargo × corte). Va por CARGO y no por
 * ocupante: los tres analistas de una empresa comparan todos contra el mismo
 * cargo del catálogo. Dos cargos distintos del cliente sí pueden apuntar al
 * mismo del catálogo: eso está permitido a propósito.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { asegurarCorte, catalogoDelCorte, normalizarTitulo, resolverAcceso } from "@/lib/estudio-cargos";
import { prisma } from "@/lib/prisma";

/** Devuelve el catálogo del corte, para poder elegir contra qué homologar. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const acceso = resolverAcceso(await getServerSession(authOptions).catch(() => null), searchParams.get("companyId")?.trim() ?? "");
  if (!acceso.ok) return acceso.response;

  const snapshotId = searchParams.get("snapshotId")?.trim() ?? "";
  if (!snapshotId) return Response.json({ message: "Indica el corte." }, { status: 400 });

  const vetado = await asegurarCorte(acceso, snapshotId);
  if (vetado) return vetado;

  // El cliente ve TODO el catálogo del estudio, no solo los cargos con data
  // suficiente: si homologa contra uno sin data, el informe dirá "sin
  // comparación disponible".
  return Response.json({ catalogo: await catalogoDelCorte(snapshotId) });
}

type Cuerpo = {
  companyId?: string;
  /** El título del cargo del cliente, no el id de un ocupante. */
  tituloCargo?: string;
  snapshotId?: string;
  departamento?: string;
  tituloCatalogo?: string;
};

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as Cuerpo | null;
  const acceso = resolverAcceso(await getServerSession(authOptions).catch(() => null), body?.companyId?.trim() ?? "");
  if (!acceso.ok) return acceso.response;

  const tituloCargo = (body?.tituloCargo ?? "").replace(/\s+/g, " ").trim();
  const snapshotId = body?.snapshotId?.trim() ?? "";
  const tituloCatalogo = (body?.tituloCatalogo ?? "").replace(/\s+/g, " ").trim();

  if (!tituloCargo || !snapshotId) {
    return Response.json({ message: "Indica el cargo y el corte." }, { status: 400 });
  }

  const vetado = await asegurarCorte(acceso, snapshotId);
  if (vetado) return vetado;

  const tituloCargoKey = normalizarTitulo(tituloCargo);

  // El cargo tiene que existir en la lista de la empresa: el título viene del
  // cliente y no se homologa algo que no se cargó.
  const existe = await prisma.estudioCargo.findFirst({
    where: { companyId: acceso.companyId, tituloCargo },
    select: { id: true },
  });
  if (!existe) {
    return Response.json({ message: `"${tituloCargo}" no está en la lista de esta empresa.` }, { status: 404 });
  }

  // Sin título: se entiende como "quitar la equivalencia de este corte".
  if (!tituloCatalogo) {
    await prisma.estudioEquivalencia.deleteMany({ where: { companyId: acceso.companyId, tituloCargoKey, snapshotId } });
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
    where: {
      companyId_tituloCargoKey_snapshotId: { companyId: acceso.companyId, tituloCargoKey, snapshotId },
    },
    create: {
      companyId: acceso.companyId, tituloCargoKey, snapshotId,
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
