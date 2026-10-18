/**
 * Los cortes que la empresa puede usar en el Estudio de Competitividad.
 *
 * Son los que el admin le incluyó en el estudio contratado, y nada más. Antes
 * se exigía además haber participado en el corte, pero AC Consulting pidió que
 * una empresa que no participó también pueda contratar el estudio
 * (2026-10-14): compara sus cargos contra un mercado del que no forma parte,
 * que es exactamente lo que vende el informe.
 *
 * El admin ve todos los cortes del sistema.
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

  const permitidos = acceso.esAdmin ? null : new Set(await cortesPermitidos(acceso.companyId));

  const todos = await prisma.userSnapshot.findMany({
    select: { snapshotId: true, label: true, date: true },
    distinct: ["snapshotId"],
    orderBy: { date: "desc" },
  });

  const cortes = todos
    .filter((s) => !permitidos || permitidos.has(s.snapshotId))
    .map((s) => ({ id: s.snapshotId, label: s.label, date: s.date.toISOString().slice(0, 10) }));

  return Response.json({ cortes });
}
