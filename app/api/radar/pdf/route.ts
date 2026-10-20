/**
 * El PDF de un informe del Radar.
 *
 * Se arma a partir del informe GUARDADO y no de lo que mande la pantalla: un
 * informe ya emitido tiene sus cifras congeladas y volver a calcularlas le
 * cambiaría los números si el admin movió el corte entre medio.
 *
 * El admin es la excepción: su vista previa no se guarda —para no gastarle el
 * cupo a la empresa— así que puede pedir el PDF mandando el informe que acaba
 * de ver.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { generarPdfRadar } from "@/lib/informe-radar-pdf";
import { prisma } from "@/lib/prisma";
import type { InformeRadar } from "@/app/api/radar/route";

export const maxDuration = 60;

type Cuerpo = { id?: string; informe?: InformeRadar };

export async function POST(request: Request) {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Cuerpo | null;
  const esAdmin = session.user.role === "ADMIN";

  let informe: InformeRadar | null = null;
  let nombre = "Radar Salarial";

  const id = body?.id?.trim() ?? "";
  if (id) {
    const guardado = await prisma.radarInforme.findUnique({
      where: { id },
      select: { companyId: true, titulo: true, datosJson: true, snapshotLabel: true },
    });
    if (!guardado) return Response.json({ message: "No se encontró ese informe." }, { status: 404 });
    if (!esAdmin && guardado.companyId !== session.user.companyId) {
      return Response.json({ message: "Ese informe no es de tu empresa." }, { status: 403 });
    }
    try {
      informe = JSON.parse(guardado.datosJson) as InformeRadar;
    } catch {
      return Response.json({ message: "El informe guardado está dañado." }, { status: 500 });
    }
    nombre = `Radar - ${guardado.titulo} - ${guardado.snapshotLabel}`;
  } else if (esAdmin && body?.informe) {
    informe = body.informe;
    nombre = `Radar - ${informe.perfil.tituloCargo} - ${informe.corte.label}`;
  }

  if (!informe) return Response.json({ message: "Indica qué informe bajar." }, { status: 400 });

  const pdf = await generarPdfRadar(informe);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${nombre}.pdf`)}`,
      "Cache-Control": "no-store",
    },
  });
}
