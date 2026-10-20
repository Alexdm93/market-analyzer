/**
 * El historial de informes del Radar de una empresa.
 *
 * El CEO lo pidió para poder volver a bajar uno ya generado sin gastar otro
 * del cupo (2026-10-20). Lista lo guardado; el PDF se arma desde ahí.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type InformeDelHistorial = {
  id: string;
  titulo: string;
  modo: string;
  corte: string;
  trimestre: string;
  fecha: string;
  generadoPor: string;
};

export async function GET(request: Request) {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });

  const esAdmin = session.user.role === "ADMIN";
  const companyId = esAdmin
    ? (new URL(request.url).searchParams.get("companyId")?.trim() || session.user.companyId || "")
    : (session.user.companyId ?? "");

  if (!companyId) return Response.json({ informes: [] });

  const filas = await prisma.radarInforme.findMany({
    where: { companyId },
    select: {
      id: true, titulo: true, modo: true, snapshotLabel: true,
      trimestre: true, createdAt: true, generadoPor: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return Response.json({
    informes: filas.map((f): InformeDelHistorial => ({
      id: f.id,
      titulo: f.titulo,
      modo: f.modo,
      corte: f.snapshotLabel,
      trimestre: f.trimestre,
      fecha: f.createdAt.toISOString().slice(0, 10),
      generadoPor: f.generadoPor,
    })),
  });
}
