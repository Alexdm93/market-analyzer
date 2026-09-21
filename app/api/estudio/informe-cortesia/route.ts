/**
 * Genera el informe de cortesía de un corte, rellenando la plantilla del cliente.
 *
 * Los percentiles los manda quien llama y no se recalculan acá: vienen de
 * `/api/percentiles`, que es la ruta que alimenta el estudio de cortesía en
 * pantalla. Recalcularlos por separado abriría la puerta a que el informe y
 * Resultados dijeran cosas distintas.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { generarInformeCortesia, mesYAnio, type GrupoMercado } from "@/lib/informe-cortesia";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

type Cuerpo = {
  snapshotId?: string;
  cargos?: Array<Record<string, unknown>>;
};

function numeroONulo(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Cuerpo | null;
  const snapshotId = body?.snapshotId?.trim() ?? "";
  if (!snapshotId) return Response.json({ message: "Indica el corte." }, { status: 400 });

  if (!Array.isArray(body?.cargos) || body.cargos.length === 0) {
    return Response.json({ message: "El informe no trae cargos." }, { status: 400 });
  }

  const cargos: GrupoMercado[] = body.cargos
    .map((c) => ({
      tituloCargo: String(c.tituloCargo ?? "").trim(),
      n: Number(c.n) || 0,
      p50: numeroONulo(c.p50),
      promedio: numeroONulo(c.promedio),
      min: numeroONulo(c.min),
      max: numeroONulo(c.max),
    }))
    .filter((c) => c.tituloCargo && c.n > 0);

  if (cargos.length === 0) {
    return Response.json({ message: "Ningún cargo del corte tiene observaciones." }, { status: 400 });
  }

  // Participantes: las empresas que enviaron su data en ese corte. Es la misma
  // condición que da derecho al informe.
  const enviados = await prisma.userSnapshot.findMany({
    where: { snapshotId, submittedAt: { not: null } },
    select: { company: { select: { name: true } }, date: true, label: true },
    distinct: ["companyId"],
  });

  const empresas = [...new Set(enviados.map((e) => e.company?.name).filter((n): n is string => Boolean(n)))]
    .sort((a, b) => a.localeCompare(b, "es"));

  if (empresas.length === 0) {
    return Response.json({ message: "Ninguna empresa ha enviado data en ese corte." }, { status: 400 });
  }

  const snapshot = enviados[0];
  const fechaCorte = snapshot?.date ?? new Date();
  const etiqueta = snapshot?.label ?? snapshotId;

  const buffer = await generarInformeCortesia({
    tituloEstudio: `RESULTADOS ${etiqueta.toUpperCase()}`,
    fechaInforme: mesYAnio(new Date()),
    fechaData: mesYAnio(fechaCorte),
    empresas,
    cargos,
  });

  const nombre = `Informe de cortesía - ${etiqueta}.xlsx`;

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
