/**
 * Homologa de una vez todos los cargos cuyo nombre calza con el catálogo del
 * corte.
 *
 * La equivalencia se guarda POR CORTE, así que una lista ya homologada contra
 * el estudio del año pasado vuelve a quedar vacía al elegir el de este año.
 * Esto rellena lo obvio; lo ambiguo se sigue eligiendo a mano.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { asegurarCorte, homologarPorNombre, resolverAcceso } from "@/lib/estudio-cargos";
import { prisma } from "@/lib/prisma";

type Cuerpo = { companyId?: string; snapshotId?: string };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Cuerpo | null;
  const acceso = resolverAcceso(await getServerSession(authOptions).catch(() => null), body?.companyId?.trim() ?? "");
  if (!acceso.ok) return acceso.response;

  const snapshotId = body?.snapshotId?.trim() ?? "";
  if (!snapshotId) return Response.json({ message: "Indica el corte." }, { status: 400 });

  const vetado = await asegurarCorte(acceso, snapshotId);
  if (vetado) return vetado;

  const cargos = await prisma.estudioCargo.findMany({
    where: { companyId: acceso.companyId },
    select: { departamento: true, tituloCargo: true },
  });

  const homologados = await homologarPorNombre(acceso.companyId, snapshotId, cargos);

  return Response.json({
    homologados,
    message: homologados > 0
      ? `${homologados} ${homologados === 1 ? "cargo homologado" : "cargos homologados"} por nombre con este estudio.`
      : "",
  });
}
