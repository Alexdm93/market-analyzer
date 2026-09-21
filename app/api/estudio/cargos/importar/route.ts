/**
 * F3 — Importar a la lista propia los cargos que la empresa ya reportó en un corte.
 *
 * Lo importado es una COPIA editable: se guarda `origen: "importado"` y de qué
 * corte salió, pero a partir de ahí vive por su cuenta. Editarla no toca la data
 * que la empresa envió a ese corte.
 *
 * El corte trae un cargo por empresa, así que cada cargo importado entra como
 * un ocupante. Se saltan los títulos que ya están en la lista para que importar
 * dos veces no duplique; si la empresa necesita varias personas en el mismo
 * cargo, las agrega a mano.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { asegurarCorte, homologarPorNombre, normalizarTitulo, resolverAcceso } from "@/lib/estudio-cargos";
import { prisma } from "@/lib/prisma";
import type { ExtendedMarketPosition } from "@/types/salary";

type Cuerpo = { companyId?: string; snapshotId?: string; soloPrevisualizar?: boolean };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Cuerpo | null;
  const session = await getServerSession(authOptions).catch(() => null);
  const acceso = resolverAcceso(session, body?.companyId?.trim() ?? "");
  if (!acceso.ok) return acceso.response;

  const snapshotId = body?.snapshotId?.trim() ?? "";
  if (!snapshotId) return Response.json({ message: "Indica el corte del que importar." }, { status: 400 });

  const vetado = await asegurarCorte(acceso, snapshotId);
  if (vetado) return vetado;

  const [posiciones, existentes] = await Promise.all([
    prisma.userPosition.findMany({
      where: { companyId: acceso.companyId, snapshotId },
      select: { title: true, dataJson: true },
      orderBy: { title: "asc" },
    }),
    prisma.estudioCargo.findMany({
      where: { companyId: acceso.companyId },
      select: { tituloCargo: true },
    }),
  ]);

  const yaEstan = new Set(existentes.map((e) => normalizarTitulo(e.tituloCargo)));
  const vistosEnElCorte = new Set<string>();

  const nuevos: Array<{
    ocupanteId: string | null; departamento: string; tituloCargo: string; descripcion: string;
    hayGrade: number | null; capriFamily: string | null; dataJson: string;
  }> = [];
  const repetidos: string[] = [];

  for (const posicion of posiciones) {
    let fila: Partial<ExtendedMarketPosition>;
    try {
      fila = JSON.parse(posicion.dataJson) as Partial<ExtendedMarketPosition>;
    } catch {
      continue;
    }

    const titulo = (posicion.title ?? fila.tituloCargo ?? "").replace(/\s+/g, " ").trim();
    if (!titulo) continue;

    const clave = normalizarTitulo(titulo);
    // La empresa puede tener varios usuarios con la misma posición cargada.
    if (vistosEnElCorte.has(clave)) continue;
    vistosEnElCorte.add(clave);

    if (yaEstan.has(clave)) {
      repetidos.push(titulo);
      continue;
    }

    const familia = typeof fila.capriFamily === "string" ? fila.capriFamily : null;
    nuevos.push({
      // El corte no trae identificador de ocupante: se deja vacío y el cliente
      // lo completa si lo usa.
      ocupanteId: null,
      departamento: (fila.departamento ?? "").trim(),
      tituloCargo: titulo,
      descripcion: (fila.descripcion ?? "").trim(),
      hayGrade: typeof fila.hayGrade === "number" ? fila.hayGrade : null,
      capriFamily: familia,
      dataJson: JSON.stringify(fila),
    });
  }

  if (body?.soloPrevisualizar) {
    return Response.json({
      aImportar: nuevos.length,
      yaEnLaLista: repetidos.length,
      repetidos: repetidos.slice(0, 50),
      cargos: nuevos.map((n) => ({ departamento: n.departamento, tituloCargo: n.tituloCargo, hayGrade: n.hayGrade })),
    });
  }

  if (nuevos.length === 0) {
    return Response.json({
      message: repetidos.length > 0
        ? "Todos los cargos de ese corte ya están en tu lista."
        : "Ese corte no tiene cargos para importar.",
      importados: 0,
      yaEnLaLista: repetidos.length,
    });
  }

  await prisma.estudioCargo.createMany({
    data: nuevos.map((n) => ({
      ...n,
      companyId: acceso.companyId,
      origen: "importado",
      origenSnapshotId: snapshotId,
    })),
  });

  const homologados = await homologarPorNombre(acceso.companyId, snapshotId, nuevos);

  return Response.json({
    message: `${nuevos.length} ${nuevos.length === 1 ? "cargo importado" : "cargos importados"}`
      + (homologados > 0 ? `, ${homologados} homologados con el catálogo.` : "."),
    importados: nuevos.length,
    homologados,
    yaEnLaLista: repetidos.length,
  });
}
