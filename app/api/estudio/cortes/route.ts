/**
 * Los cortes que la empresa puede usar en el Estudio Especializado.
 *
 * Son los que cumplen las dos condiciones: que la empresa haya participado
 * (si no, no tiene data que comparar) y que el admin se los haya incluido en
 * el estudio contratado. El admin no tiene la segunda restricción.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { cortesPermitidos, resolverAcceso } from "@/lib/estudio-cargos";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const session = await getServerSession(authOptions).catch(() => null);
  const acceso = resolverAcceso(session, searchParams.get("companyId")?.trim() ?? "");
  if (!acceso.ok) return acceso.response;

  const participados = await prisma.userSnapshot.findMany({
    where: { companyId: acceso.companyId },
    select: { snapshotId: true, label: true, date: true },
    orderBy: { date: "desc" },
  });

  const permitidos = acceso.esAdmin ? null : new Set(await cortesPermitidos(acceso.companyId));

  const vistos = new Set<string>();
  const cortes = participados
    .filter((s) => {
      if (vistos.has(s.snapshotId)) return false;
      if (permitidos && !permitidos.has(s.snapshotId)) return false;
      vistos.add(s.snapshotId);
      return true;
    })
    .map((s) => ({ id: s.snapshotId, label: s.label, date: s.date.toISOString().slice(0, 10) }));

  return Response.json({ cortes });
}
