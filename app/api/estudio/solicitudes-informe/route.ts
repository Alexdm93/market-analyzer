/**
 * Solicitudes de informes adicionales.
 *
 * Cuando una empresa agota su cupo de cortes de data en un estudio, pide
 * autorización en vez de quedarse trabada. El admin la aprueba otorgando una
 * cantidad —que se suma al cupo de ese estudio— o la rechaza.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { conCupoCambiado, cupoDelCorte, estadoDelCupo } from "@/lib/cupo-informes";
import { asegurarCorte, resolverAcceso } from "@/lib/estudio-cargos";
import { prisma } from "@/lib/prisma";

export type SolicitudInformeDto = {
  id: string;
  companyId: string;
  empresa: string;
  snapshotId: string;
  snapshotLabel: string;
  motivo: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  otorgados: number;
  resueltoPor: string;
  createdAt: string;
};

async function sesion() {
  return getServerSession(authOptions).catch(() => null);
}

/** El admin ve todas las solicitudes; la empresa, solo las suyas. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const session = await sesion();
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });

  const esAdmin = session.user.role === "ADMIN";
  const soloPendientes = searchParams.get("pendientes") === "1";

  const solicitudes = await prisma.solicitudInforme.findMany({
    where: {
      ...(esAdmin ? {} : { companyId: session.user.companyId ?? "" }),
      ...(soloPendientes ? { status: "PENDING" as const } : {}),
    },
    select: {
      id: true, companyId: true, snapshotId: true, snapshotLabel: true, motivo: true,
      status: true, otorgados: true, resueltoPor: true, createdAt: true,
      company: { select: { name: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return Response.json({
    solicitudes: solicitudes.map((s): SolicitudInformeDto => ({
      id: s.id,
      companyId: s.companyId,
      empresa: s.company.name,
      snapshotId: s.snapshotId,
      snapshotLabel: s.snapshotLabel,
      motivo: s.motivo,
      status: s.status,
      otorgados: s.otorgados,
      resueltoPor: s.resueltoPor,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    companyId?: string; snapshotId?: string; snapshotLabel?: string; motivo?: string;
  } | null;

  const session = await sesion();
  const acceso = resolverAcceso(session, body?.companyId?.trim() ?? "");
  if (!acceso.ok) return acceso.response;

  const snapshotId = body?.snapshotId?.trim() ?? "";
  if (!snapshotId) return Response.json({ message: "Indica el estudio." }, { status: 400 });

  const vetado = await asegurarCorte(acceso, snapshotId);
  if (vetado) return vetado;

  // Una sola solicitud viva por estudio: insistir no adelanta nada.
  const yaPedida = await prisma.solicitudInforme.findFirst({
    where: { companyId: acceso.companyId, snapshotId, status: "PENDING" },
    select: { id: true },
  });
  if (yaPedida) {
    return Response.json({ message: "Ya tienes una solicitud esperando respuesta para este estudio." }, { status: 409 });
  }

  await prisma.solicitudInforme.create({
    data: {
      companyId: acceso.companyId,
      snapshotId,
      snapshotLabel: (body?.snapshotLabel ?? "").trim(),
      motivo: (body?.motivo ?? "").trim().slice(0, 500),
    },
  });

  return Response.json({ message: "Solicitud enviada. El administrador te responderá." });
}

/** Resolver una solicitud. Solo admin. */
export async function PUT(request: Request) {
  const session = await sesion();
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });
  if (session.user.role !== "ADMIN") return Response.json({ message: "Acceso restringido." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as {
    id?: string; aprobar?: boolean; otorgados?: number;
  } | null;

  if (!body?.id || typeof body.aprobar !== "boolean") {
    return Response.json({ message: "Formato inválido." }, { status: 400 });
  }

  const solicitud = await prisma.solicitudInforme.findUnique({
    where: { id: body.id },
    select: { id: true, companyId: true, snapshotId: true, status: true },
  });
  if (!solicitud) return Response.json({ message: "Esa solicitud ya no existe." }, { status: 404 });
  if (solicitud.status !== "PENDING") {
    return Response.json({ message: "Esa solicitud ya estaba resuelta." }, { status: 409 });
  }

  const otorgados = body.aprobar ? Math.max(1, Math.floor(Number(body.otorgados) || 1)) : 0;

  await prisma.$transaction(async (tx) => {
    if (body.aprobar) {
      const empresa = await tx.company.findUnique({
        where: { id: solicitud.companyId },
        select: { estudioCuposJson: true },
      });
      const actual = cupoDelCorte(empresa?.estudioCuposJson ?? "{}", solicitud.snapshotId);
      await tx.company.update({
        where: { id: solicitud.companyId },
        data: {
          estudioCuposJson: conCupoCambiado(
            empresa?.estudioCuposJson ?? "{}",
            solicitud.snapshotId,
            actual + otorgados,
          ),
        },
      });
    }

    await tx.solicitudInforme.update({
      where: { id: solicitud.id },
      data: {
        status: body.aprobar ? "APPROVED" : "REJECTED",
        otorgados,
        resueltoPor: session.user?.name ?? session.user?.email ?? "",
        resueltoEn: new Date(),
      },
    });
  });

  const estado = await estadoDelCupo(solicitud.companyId, solicitud.snapshotId);
  return Response.json({ ok: true, cupo: estado });
}
