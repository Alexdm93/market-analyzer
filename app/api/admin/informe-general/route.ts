/**
 * Quién puede bajar el Informe General y con qué informe de beneficios.
 *
 * Dos cosas distintas que se configuran en la misma pantalla:
 *  - el informe general se habilita por empresa y por corte, igual que el
 *    Estudio Especializado;
 *  - el informe de beneficios no salariales es global y no depende del corte:
 *    se elige cuál de los PDF cargados tiene autorizado bajar cada empresa.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type EmpresaInformeGeneral = {
  id: string;
  name: string;
  economicSector: string;
  generalEnabled: boolean;
  generalSnapshotIds: string[];
  /** Qué PDF de beneficios tiene autorizado, o null si ninguno. */
  beneficiosInformeId: string | null;
  userCount: number;
};

export type CorteDisponible = {
  snapshotId: string;
  label: string;
  date: string;
};

/** La ficha de un PDF, sin el PDF: el archivo pesa megas y acá no hace falta. */
export type InformeBeneficiosFicha = {
  id: string;
  titulo: string;
  nombreArchivo: string;
  bytes: number;
  createdAt: string;
};

async function requerirAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });
  if (session.user.role !== "ADMIN") return Response.json({ message: "Acceso restringido." }, { status: 403 });
  return null;
}

function listaDeIds(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const noAutorizado = await requerirAdmin();
  if (noAutorizado) return noAutorizado;

  const [empresas, cortes, informes] = await Promise.all([
    prisma.company.findMany({
      select: {
        id: true,
        name: true,
        economicSector: true,
        generalEnabled: true,
        generalSnapshotIds: true,
        beneficiosInformeId: true,
        _count: { select: { users: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.userSnapshot.findMany({
      select: { snapshotId: true, label: true, date: true },
      distinct: ["snapshotId"],
      orderBy: { date: "desc" },
    }),
    prisma.informeBeneficios.findMany({
      select: { id: true, titulo: true, nombreArchivo: true, bytes: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return Response.json({
    empresas: empresas.map((c): EmpresaInformeGeneral => ({
      id: c.id,
      name: c.name,
      economicSector: c.economicSector || "—",
      generalEnabled: c.generalEnabled,
      generalSnapshotIds: listaDeIds(c.generalSnapshotIds),
      beneficiosInformeId: c.beneficiosInformeId,
      userCount: c._count.users,
    })),
    cortes: cortes.map((s): CorteDisponible => ({
      snapshotId: s.snapshotId,
      label: s.label,
      date: s.date.toISOString(),
    })),
    informes: informes.map((i): InformeBeneficiosFicha => ({
      id: i.id,
      titulo: i.titulo,
      nombreArchivo: i.nombreArchivo,
      bytes: i.bytes,
      createdAt: i.createdAt.toISOString(),
    })),
  });
}

export async function PUT(request: Request) {
  const noAutorizado = await requerirAdmin();
  if (noAutorizado) return noAutorizado;

  const body = (await request.json().catch(() => null)) as {
    companyId?: string;
    enabled?: boolean;
    snapshotIds?: string[];
    /** `null` le quita el informe de beneficios; ausente lo deja como está. */
    beneficiosInformeId?: string | null;
  } | null;

  if (!body?.companyId) {
    return Response.json({ message: "Indica la empresa." }, { status: 400 });
  }

  const datos: Record<string, unknown> = {};

  if (typeof body.enabled === "boolean") {
    datos.generalEnabled = body.enabled;
    datos.generalSnapshotIds = JSON.stringify(Array.isArray(body.snapshotIds) ? body.snapshotIds : []);
  }

  if (body.beneficiosInformeId !== undefined) {
    datos.beneficiosInformeId = body.beneficiosInformeId || null;
  }

  if (Object.keys(datos).length === 0) {
    return Response.json({ message: "No hay nada que cambiar." }, { status: 400 });
  }

  await prisma.company.update({ where: { id: body.companyId }, data: datos });

  return Response.json({ ok: true });
}
