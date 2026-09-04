import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireUserSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, response: Response.json({ message: "No autorizado." }, { status: 401 }) };
  }
  return { ok: true as const, userId: session.user.id };
}

// GET /api/workspace/request-edit?snapshotId=...
// Devuelve la solicitud más reciente del usuario para ese corte (o null si nunca pidió).
export async function GET(request: Request) {
  const auth = await requireUserSession();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const snapshotId = searchParams.get("snapshotId")?.trim() ?? "";
  if (!snapshotId) {
    return Response.json({ message: "snapshotId requerido." }, { status: 400 });
  }

  const latest = await prisma.editRequest.findFirst({
    where: { userId: auth.userId, snapshotId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, reason: true, createdAt: true, resolvedAt: true, resolvedByName: true },
  });

  return Response.json({ request: latest ?? null });
}

// POST /api/workspace/request-edit  { snapshotId, reason? }
// Crea una solicitud de edición pendiente para un corte ya enviado.
export async function POST(request: Request) {
  const auth = await requireUserSession();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { snapshotId?: string; reason?: string } | null;
  const snapshotId = body?.snapshotId?.trim() ?? "";
  const reason = body?.reason?.trim() || null;

  if (!snapshotId) {
    return Response.json({ message: "snapshotId requerido." }, { status: 400 });
  }

  const userId = auth.userId;

  const userSnapshot = await prisma.userSnapshot.findFirst({
    where: { userId, snapshotId },
    select: { companyId: true, submittedAt: true },
  });

  if (!userSnapshot) {
    return Response.json({ message: "Corte no encontrado." }, { status: 404 });
  }

  if (!userSnapshot.submittedAt) {
    return Response.json({ message: "Este corte no está enviado — ya puedes editarlo." }, { status: 400 });
  }

  const existingPending = await prisma.editRequest.findFirst({
    where: { userId, snapshotId, status: "PENDING" },
    select: { id: true },
  });

  if (existingPending) {
    return Response.json({ message: "Ya tienes una solicitud pendiente para este corte." }, { status: 409 });
  }

  const created = await prisma.editRequest.create({
    data: {
      userId,
      companyId: userSnapshot.companyId,
      snapshotId,
      reason,
    },
    select: { id: true, status: true, reason: true, createdAt: true },
  });

  return Response.json({ request: created }, { status: 201 });
}
