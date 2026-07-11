import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireUserSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, response: Response.json({ message: "No autorizado." }, { status: 401 }) };
  }
  return { ok: true as const, session };
}

// POST /api/workspace/submit  { snapshotId }
// Marca la data del usuario como enviada para ese corte (sets submittedAt)
export async function POST(request: Request) {
  const auth = await requireUserSession();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { snapshotId?: string } | null;
  const snapshotId = body?.snapshotId?.trim() ?? "";

  if (!snapshotId) {
    return Response.json({ message: "snapshotId requerido." }, { status: 400 });
  }

  const userId = auth.session.user.id;

  const result = await prisma.userSnapshot.updateMany({
    where: { userId, snapshotId },
    data: { submittedAt: new Date() },
  });

  if (result.count === 0) {
    return Response.json({ message: "Corte no encontrado." }, { status: 404 });
  }

  return Response.json({ submitted: true, snapshotId });
}

// DELETE /api/workspace/submit  { snapshotId }
// Retira el envío del usuario para ese corte (clears submittedAt)
export async function DELETE(request: Request) {
  const auth = await requireUserSession();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { snapshotId?: string } | null;
  const snapshotId = body?.snapshotId?.trim() ?? "";

  if (!snapshotId) {
    return Response.json({ message: "snapshotId requerido." }, { status: 400 });
  }

  const userId = auth.session.user.id;

  const result = await prisma.userSnapshot.updateMany({
    where: { userId, snapshotId },
    data: { submittedAt: null },
  });

  if (result.count === 0) {
    return Response.json({ message: "Corte no encontrado." }, { status: 404 });
  }

  return Response.json({ submitted: false, snapshotId });
}
