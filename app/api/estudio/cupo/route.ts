/**
 * Cómo va el cupo de informes de una empresa en un estudio.
 *
 * Lo consulta la pantalla de comparación para avisar antes de que el cliente
 * arme un corte que no va a poder emitir.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { estadoDelCupo, type EstadoDelCupo } from "@/lib/cupo-informes";
import { asegurarCorte, resolverAcceso } from "@/lib/estudio-cargos";

export type RespuestaCupo = EstadoDelCupo & { ilimitado: boolean };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const session = await getServerSession(authOptions).catch(() => null);
  const acceso = resolverAcceso(session, searchParams.get("companyId")?.trim() ?? "");
  if (!acceso.ok) return acceso.response;

  const snapshotId = searchParams.get("snapshotId")?.trim() ?? "";
  if (!snapshotId) return Response.json({ message: "Indica el estudio." }, { status: 400 });

  const vetado = await asegurarCorte(acceso, snapshotId);
  if (vetado) return vetado;

  // El admin arma los recortes que necesite para revisar.
  if (acceso.esAdmin) {
    return Response.json({
      cupo: 0, usados: 0, disponibles: 0, solicitudPendiente: false, ilimitado: true,
    } satisfies RespuestaCupo);
  }

  const estado = await estadoDelCupo(acceso.companyId, snapshotId);
  return Response.json({ ...estado, ilimitado: false } satisfies RespuestaCupo);
}
