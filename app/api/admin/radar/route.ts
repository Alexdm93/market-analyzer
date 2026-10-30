/**
 * Configuración del Radar Salarial, del lado del administrador.
 *
 * Tres decisiones viven acá: a qué empresas se les habilita, cuántos informes
 * pueden bajar por trimestre, y de qué corte salen las cifras. El corte es uno
 * solo para toda la plataforma y el admin lo va cambiando cada tanto
 * (AC Consulting, 2026-10-20); los informes ya emitidos no se tocan cuando
 * cambia, porque guardan sus propias cifras.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPublishedSnapshotIds } from "@/lib/published-snapshots";
import {
  CUPO_RADAR_POR_DEFECTO,
  corteDelRadar,
  cupoGeneral,
  fijarCorteDelRadar,
  fijarCupoGeneral,
  trimestreDe,
} from "@/lib/radar";

export type EmpresaRadar = {
  id: string;
  name: string;
  habilitado: boolean;
  /** Null significa "el tope general". */
  cupo: number | null;
  /** Cuántos lleva en el trimestre en curso. Solo los gratuitos. */
  usados: number;
  /** Consultas pagadas que le quedan, aparte de las del trimestre. */
  creditos: number;
};

export type CorteRadar = { id: string; label: string; date: string };

async function soloAdmin() {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user?.id) return { ok: false as const, response: Response.json({ message: "No autorizado." }, { status: 401 }) };
  if (session.user.role !== "ADMIN") {
    return { ok: false as const, response: Response.json({ message: "Acceso restringido a administradores." }, { status: 403 }) };
  }
  return { ok: true as const };
}

export async function GET() {
  const acceso = await soloAdmin();
  if (!acceso.ok) return acceso.response;

  const trimestre = trimestreDe(new Date());
  const publicados = await getPublishedSnapshotIds();

  const [empresas, consumos, cortes, corte, cupo] = await Promise.all([
    prisma.company.findMany({
      select: {
        id: true, name: true, radarEnabled: true,
        radarCupoTrimestral: true, radarCreditos: true,
      },
      orderBy: { name: "asc" },
    }),
    // Solo los gratuitos: las consultas pagadas no gastan el trimestre.
    prisma.radarInforme.groupBy({
      by: ["companyId"],
      where: { trimestre, conCreditos: false },
      _count: { _all: true },
    }),
    publicados.length === 0 ? Promise.resolve([]) : prisma.userSnapshot.findMany({
      where: { snapshotId: { in: publicados } },
      select: { snapshotId: true, label: true, date: true },
      distinct: ["snapshotId"],
      orderBy: { date: "desc" },
    }),
    corteDelRadar(),
    cupoGeneral(),
  ]);

  const porEmpresa = new Map(consumos.map((c) => [c.companyId, c._count._all]));

  return Response.json({
    trimestre,
    corte,
    cupoGeneral: cupo,
    cupoPorDefecto: CUPO_RADAR_POR_DEFECTO,
    // Solo cortes publicados: el Radar no puede salir de data que todavía se
    // está moviendo.
    cortes: cortes.map((c): CorteRadar => ({
      id: c.snapshotId, label: c.label, date: c.date.toISOString().slice(0, 10),
    })),
    empresas: empresas.map((e): EmpresaRadar => ({
      id: e.id,
      name: e.name,
      habilitado: e.radarEnabled,
      cupo: e.radarCupoTrimestral,
      usados: porEmpresa.get(e.id) ?? 0,
      creditos: e.radarCreditos,
    })),
  });
}

type Cuerpo = {
  /** Cambia el corte del que se generan los informes nuevos. */
  corte?: string;
  /** Cambia el tope general. */
  cupoGeneral?: number;
  /** Cambia una empresa. */
  empresa?: { id: string; habilitado?: boolean; cupo?: number | null; creditos?: number };
};

export async function PUT(request: Request) {
  const acceso = await soloAdmin();
  if (!acceso.ok) return acceso.response;

  const body = (await request.json().catch(() => null)) as Cuerpo | null;
  if (!body) return Response.json({ message: "Petición vacía." }, { status: 400 });

  if (typeof body.corte === "string") {
    const corte = body.corte.trim();
    if (corte) {
      const publicados = await getPublishedSnapshotIds();
      if (!publicados.includes(corte)) {
        return Response.json(
          { message: "Ese corte no está publicado. El Radar solo sale de un estudio publicado." },
          { status: 400 },
        );
      }
    }
    await fijarCorteDelRadar(corte);
  }

  if (typeof body.cupoGeneral === "number") {
    const n = Math.round(body.cupoGeneral);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return Response.json({ message: "El cupo va de 0 a 100." }, { status: 400 });
    }
    await fijarCupoGeneral(n);
  }

  if (body.empresa?.id) {
    const { id, habilitado, cupo, creditos } = body.empresa;
    const datos: {
      radarEnabled?: boolean;
      radarCupoTrimestral?: number | null;
      radarCreditos?: number;
    } = {};
    if (typeof habilitado === "boolean") datos.radarEnabled = habilitado;
    if (typeof creditos === "number") {
      // Es un saldo, no un acumulado: lo que se escribe es lo que le queda.
      const n = Math.round(creditos);
      if (!Number.isFinite(n) || n < 0 || n > 999) {
        return Response.json({ message: "Las consultas adicionales van de 0 a 999." }, { status: 400 });
      }
      datos.radarCreditos = n;
    }
    if (cupo === null) datos.radarCupoTrimestral = null;
    else if (typeof cupo === "number") {
      const n = Math.round(cupo);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return Response.json({ message: "El cupo va de 0 a 100." }, { status: 400 });
      }
      datos.radarCupoTrimestral = n;
    }
    if (Object.keys(datos).length > 0) {
      await prisma.company.update({ where: { id }, data: datos });
    }
  }

  return Response.json({ message: "Configuración guardada." });
}
