import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, response: Response.json({ message: "No autorizado." }, { status: 401 }) };
  }
  if (session.user.role !== "ADMIN") {
    return { ok: false as const, response: Response.json({ message: "Acceso restringido a administradores." }, { status: 403 }) };
  }
  return { ok: true as const, session };
}

// GET /api/admin/edit-requests?status=PENDING (default: PENDING; pasar status=ALL para ver todas)
export async function GET(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status")?.trim().toUpperCase() ?? "PENDING";

  const requests = await prisma.editRequest.findMany({
    where: statusParam === "ALL" ? {} : { status: statusParam as "PENDING" | "APPROVED" | "REJECTED" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      snapshotId: true,
      reason: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
      resolvedByName: true,
      user: { select: { name: true, email: true } },
      company: { select: { name: true } },
    },
  });

  // Adjuntar la etiqueta/fecha del corte para que la vista no tenga que resolverlo aparte
  const snapshotIds = [...new Set(requests.map((r) => r.snapshotId))];
  const snapshotMeta = snapshotIds.length
    ? await prisma.userSnapshot.findMany({
        where: { snapshotId: { in: snapshotIds } },
        select: { snapshotId: true, label: true, date: true },
        distinct: ["snapshotId"],
      })
    : [];
  const metaById = new Map(snapshotMeta.map((s) => [s.snapshotId, s]));

  const result = requests.map((r) => ({
    id: r.id,
    snapshotId: r.snapshotId,
    snapshotLabel: metaById.get(r.snapshotId)?.label ?? r.snapshotId,
    snapshotDate: metaById.get(r.snapshotId)?.date?.toISOString().split("T")[0] ?? r.snapshotId,
    reason: r.reason,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    resolvedByName: r.resolvedByName,
    userName: r.user.name,
    userEmail: r.user.email,
    companyName: r.company.name,
  }));

  return Response.json({ requests: result });
}

// PATCH /api/admin/edit-requests  { id, action: "approve" | "reject" }
export async function PATCH(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { id?: string; action?: string } | null;
  const id = body?.id?.trim() ?? "";
  const action = body?.action;

  if (!id || (action !== "approve" && action !== "reject")) {
    return Response.json({ message: "id y action ('approve' | 'reject') son requeridos." }, { status: 400 });
  }

  const editRequest = await prisma.editRequest.findUnique({ where: { id } });
  if (!editRequest) {
    return Response.json({ message: "Solicitud no encontrada." }, { status: 404 });
  }
  if (editRequest.status !== "PENDING") {
    return Response.json({ message: "Esta solicitud ya fue resuelta." }, { status: 409 });
  }

  const adminName = auth.session.user.name ?? auth.session.user.email ?? "Admin";

  await prisma.$transaction(async (tx) => {
    await tx.editRequest.update({
      where: { id },
      data: {
        status: action === "approve" ? "APPROVED" : "REJECTED",
        resolvedAt: new Date(),
        resolvedByName: adminName,
      },
    });

    if (action === "approve") {
      // Reabrir el corte para que el usuario pueda volver a editarlo
      await tx.userSnapshot.updateMany({
        where: { userId: editRequest.userId, snapshotId: editRequest.snapshotId },
        data: { submittedAt: null },
      });
    }
  });

  return Response.json({ ok: true });
}
