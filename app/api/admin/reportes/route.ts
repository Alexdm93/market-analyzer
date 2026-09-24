/**
 * Reportes de revisión de un corte. Solo admin, y solo lectura.
 *
 * `tipo=conteo` devuelve JSON con lo que entraría en el reporte, para poder ver
 * el alcance antes de bajarse un archivo grande. `tipo=empresas` y `tipo=grados`
 * devuelven el .xlsx.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import {
  bcvActual,
  cargarEmpresas,
  construirReportePorEmpresa,
  construirReportePorGrados,
  type FiltrosReporte,
} from "@/lib/reportes-revision";
import { prisma } from "@/lib/prisma";

// Con muchas empresas el armado del libro puede pasarse de los 10 s por defecto.
export const maxDuration = 60;

function lista(valor: string | null): string[] {
  return (valor ?? "").split(",").map((v) => v.trim()).filter(Boolean);
}

function numero(valor: string | null): number | null {
  if (!valor?.trim()) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions).catch(() => null);

  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get("tipo") ?? "conteo";
  const snapshotId = searchParams.get("snapshotId")?.trim() ?? "";

  if (!snapshotId) {
    return Response.json({ message: "Indica el corte." }, { status: 400 });
  }

  const filtros: FiltrosReporte = {
    snapshotId,
    sectores: lista(searchParams.get("sectores")),
    subsectores: lista(searchParams.get("subsectores")),
    empresaIds: lista(searchParams.get("empresas")),
    headcountMin: numero(searchParams.get("headcountMin")),
    headcountMax: numero(searchParams.get("headcountMax")),
    gradoMin: numero(searchParams.get("gradoMin")),
    gradoMax: numero(searchParams.get("gradoMax")),
    soloEnviados: searchParams.get("soloEnviados") === "1",
  };

  const [empresas, snapshot] = await Promise.all([
    cargarEmpresas(filtros),
    prisma.userSnapshot.findFirst({ where: { snapshotId }, select: { label: true, date: true } }),
  ]);

  const etiquetaCorte = snapshot
    ? `${snapshot.label} (${snapshot.date.toISOString().split("T")[0]})`
    : snapshotId;

  if (tipo === "conteo") {
    return Response.json({
      corte: etiquetaCorte,
      empresas: empresas.length,
      enviadas: empresas.filter((e) => e.enviado).length,
      cargos: empresas.reduce((acc, e) => acc + e.filas.length, 0),
      detalle: empresas.map((e) => ({
        nombre: e.nombre, sector: e.sector, subsector: e.subsector,
        cargos: e.filas.length, enviado: e.enviado,
      })),
    });
  }

  if (empresas.length === 0) {
    return Response.json({ message: "Ninguna empresa cumple con los filtros." }, { status: 400 });
  }

  const bcv = await bcvActual();
  const esPorEmpresa = tipo === "empresas";

  const buffer = esPorEmpresa
    ? await construirReportePorEmpresa(empresas, etiquetaCorte, bcv)
    : await construirReportePorGrados(empresas, etiquetaCorte, bcv);

  const nombre = `${esPorEmpresa ? "Reporte por empresa" : "Reporte por grados"} - ${etiquetaCorte}.xlsx`;

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
