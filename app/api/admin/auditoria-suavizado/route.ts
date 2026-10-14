/**
 * Control de calidad del suavizado de mercado.
 *
 * Lista las fotos que deja cada informe generado y entrega el Excel de control
 * de cualquiera de ellas. Es de uso interno: el cliente no sabe que esto
 * existe ni tiene por qué saberlo.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { construirReporteAuditoria } from "@/lib/reporte-auditoria";
import type { Diagnostico } from "@/lib/suavizado-percentiles";

export const maxDuration = 60;

export type AuditoriaFila = {
  id: string;
  empresa: string;
  snapshotId: string;
  corte: string;
  grupoComparacion: string;
  metrica: string;
  generadoPor: string;
  createdAt: string;
  /** Un resumen de lo que tocó el algoritmo, para no abrir el Excel por nada. */
  resumen: { reordenadas: number; imputadas: number; suavizadas: number; sinSuavizar: number };
};

async function requerirAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });
  if (session.user.role !== "ADMIN") return Response.json({ message: "Acceso restringido." }, { status: 403 });
  return null;
}

function leerDiagnosticos(json: string): Record<string, Diagnostico> {
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, Diagnostico>) : {};
  } catch {
    return {};
  }
}

function resumir(diagnosticos: Record<string, Diagnostico>) {
  let reordenadas = 0, imputadas = 0, suavizadas = 0, sinSuavizar = 0;
  for (const d of Object.values(diagnosticos)) {
    reordenadas += d.filasReordenadas ?? 0;
    imputadas += d.celdasImputadas ?? 0;
    suavizadas += d.celdasSuavizadas ?? 0;
    sinSuavizar += (d.columnas ?? []).filter((c) => c.motivo).length;
  }
  return { reordenadas, imputadas, suavizadas, sinSuavizar };
}

export async function GET(request: Request) {
  const noAutorizado = await requerirAdmin();
  if (noAutorizado) return noAutorizado;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim() ?? "";

  // ── El Excel de control de una foto ──
  if (id) {
    const fila = await prisma.auditoriaSuavizado.findUnique({
      where: { id },
      select: {
        snapshotLabel: true, snapshotId: true, grupoComparacion: true, metrica: true,
        datosJson: true, generadoPor: true, createdAt: true,
        company: { select: { name: true } },
      },
    });
    if (!fila) return Response.json({ message: "Esa auditoría ya no existe." }, { status: 404 });

    const buffer = await construirReporteAuditoria(
      {
        empresa: fila.company.name,
        corte: fila.snapshotLabel || fila.snapshotId,
        grupoComparacion: fila.grupoComparacion,
        metrica: fila.metrica,
        generadoPor: fila.generadoPor,
        fecha: fila.createdAt,
      },
      leerDiagnosticos(fila.datosJson),
    );

    const nombre = `Control de suavizado - ${fila.company.name} - ${fila.snapshotLabel || fila.snapshotId}.xlsx`;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        "Cache-Control": "no-store",
      },
    });
  }

  // ── El listado ──
  const empresa = searchParams.get("empresa")?.trim() ?? "";
  const snapshotId = searchParams.get("snapshotId")?.trim() ?? "";
  const desde = searchParams.get("desde")?.trim() ?? "";
  const hasta = searchParams.get("hasta")?.trim() ?? "";

  const filas = await prisma.auditoriaSuavizado.findMany({
    where: {
      ...(empresa ? { company: { name: { contains: empresa, mode: "insensitive" as const } } } : {}),
      ...(snapshotId ? { snapshotId } : {}),
      ...(desde || hasta
        ? {
            createdAt: {
              ...(desde ? { gte: new Date(`${desde}T00:00:00`) } : {}),
              ...(hasta ? { lte: new Date(`${hasta}T23:59:59`) } : {}),
            },
          }
        : {}),
    },
    select: {
      id: true, snapshotId: true, snapshotLabel: true, grupoComparacion: true, metrica: true,
      datosJson: true, generadoPor: true, createdAt: true,
      company: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return Response.json({
    auditorias: filas.map((f): AuditoriaFila => ({
      id: f.id,
      empresa: f.company.name,
      snapshotId: f.snapshotId,
      corte: f.snapshotLabel || f.snapshotId,
      grupoComparacion: f.grupoComparacion,
      metrica: f.metrica,
      generadoPor: f.generadoPor,
      createdAt: f.createdAt.toISOString(),
      resumen: resumir(leerDiagnosticos(f.datosJson)),
    })),
  });
}
