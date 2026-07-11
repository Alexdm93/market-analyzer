import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireCoordinatorSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, response: Response.json({ message: "No autorizado." }, { status: 401 }) };
  }
  const role = session.user.role;
  if (role !== "COORDINATOR" && role !== "ADMIN") {
    return { ok: false as const, response: Response.json({ message: "Acceso restringido." }, { status: 403 }) };
  }
  return { ok: true as const, session };
}

export async function GET(request: Request) {
  const auth = await requireCoordinatorSession();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const snapshotId = searchParams.get("snapshotId")?.trim() ?? "";

  // All unique snapshots that exist in the system
  const allSnapshots = await prisma.userSnapshot.findMany({
    select: {
      snapshotId: true,
      label: true,
      date: true,
      status: true,
    },
    distinct: ["snapshotId"],
    orderBy: [{ date: "desc" }, { snapshotId: "desc" }],
  });

  if (!snapshotId) {
    // Return summary: for each snapshot, count companies and submitted count
    const snapshotIds = allSnapshots.map((s) => s.snapshotId);

    const submissionStats = await prisma.userSnapshot.groupBy({
      by: ["snapshotId"],
      where: { snapshotId: { in: snapshotIds } },
      _count: { snapshotId: true },
    });

    const submittedStats = await prisma.userSnapshot.groupBy({
      by: ["snapshotId"],
      where: { snapshotId: { in: snapshotIds }, submittedAt: { not: null } },
      _count: { snapshotId: true },
    });

    const totalBySnapshot = new Map(submissionStats.map((s) => [s.snapshotId, s._count.snapshotId]));
    const submittedBySnapshot = new Map(submittedStats.map((s) => [s.snapshotId, s._count.snapshotId]));

    return Response.json({
      snapshots: allSnapshots.map((s) => ({
        id: s.snapshotId,
        label: s.label,
        date: s.date.toISOString().split("T")[0],
        status: s.status,
        totalCompanies: totalBySnapshot.get(s.snapshotId) ?? 0,
        submittedCount: submittedBySnapshot.get(s.snapshotId) ?? 0,
      })),
    });
  }

  // Detail view: companies for a specific snapshot
  const rows = await prisma.userSnapshot.findMany({
    where: { snapshotId },
    select: {
      submittedAt: true,
      company: {
        select: {
          id: true,
          name: true,
          economicSector: true,
          headcount: true,
          hrName: true,
          hrPosition: true,
          hrEmail: true,
          hrPhone: true,
          hrCell: true,
        },
      },
    },
    orderBy: [{ submittedAt: "asc" }],
  });

  const snapshot = allSnapshots.find((s) => s.snapshotId === snapshotId);

  return Response.json({
    snapshot: snapshot
      ? { id: snapshot.snapshotId, label: snapshot.label, date: snapshot.date.toISOString().split("T")[0], status: snapshot.status }
      : null,
    companies: rows.map((r) => ({
      companyId: r.company.id,
      name: r.company.name,
      economicSector: r.company.economicSector,
      headcount: r.company.headcount,
      submitted: r.submittedAt !== null,
      submittedAt: r.submittedAt?.toISOString() ?? null,
      hrName: r.company.hrName,
      hrPosition: r.company.hrPosition,
      hrEmail: r.company.hrEmail,
      hrPhone: r.company.hrPhone,
      hrCell: r.company.hrCell,
    })),
  });
}
