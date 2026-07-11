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
    // Return summary: for each snapshot, count unique companies and how many submitted
    const snapshotIds = allSnapshots.map((s) => s.snapshotId);

    // Fetch all rows grouped by snapshot+company to count unique companies
    const allRows = await prisma.userSnapshot.findMany({
      where: { snapshotId: { in: snapshotIds } },
      select: { snapshotId: true, companyId: true, submittedAt: true },
    });

    // Per snapshot: count unique companies, and unique companies where any user submitted
    const statsMap = new Map<string, { companies: Set<string>; submittedCompanies: Set<string> }>();
    for (const row of allRows) {
      if (!statsMap.has(row.snapshotId)) {
        statsMap.set(row.snapshotId, { companies: new Set(), submittedCompanies: new Set() });
      }
      const stat = statsMap.get(row.snapshotId)!;
      stat.companies.add(row.companyId);
      if (row.submittedAt !== null) stat.submittedCompanies.add(row.companyId);
    }

    return Response.json({
      snapshots: allSnapshots.map((s) => {
        const stat = statsMap.get(s.snapshotId);
        return {
          id: s.snapshotId,
          label: s.label,
          date: s.date.toISOString().split("T")[0],
          status: s.status,
          totalCompanies: stat?.companies.size ?? 0,
          submittedCount: stat?.submittedCompanies.size ?? 0,
        };
      }),
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

  // Deduplicate by company: one entry per company, submitted if any user submitted
  const byCompany = new Map<string, {
    companyId: string;
    name: string;
    economicSector: string | null;
    headcount: string | null;
    submitted: boolean;
    submittedAt: string | null;
    hrName: string | null;
    hrPosition: string | null;
    hrEmail: string | null;
    hrPhone: string | null;
    hrCell: string | null;
  }>();

  for (const r of rows) {
    const existing = byCompany.get(r.company.id);
    const isSubmitted = r.submittedAt !== null;
    const submittedAt = r.submittedAt?.toISOString() ?? null;

    if (!existing) {
      byCompany.set(r.company.id, {
        companyId: r.company.id,
        name: r.company.name,
        economicSector: r.company.economicSector,
        headcount: r.company.headcount,
        submitted: isSubmitted,
        submittedAt,
        hrName: r.company.hrName,
        hrPosition: r.company.hrPosition,
        hrEmail: r.company.hrEmail,
        hrPhone: r.company.hrPhone,
        hrCell: r.company.hrCell,
      });
    } else if (isSubmitted && !existing.submitted) {
      // Mark as submitted if any user from this company submitted
      existing.submitted = true;
      existing.submittedAt = submittedAt;
    }
  }

  const snapshot = allSnapshots.find((s) => s.snapshotId === snapshotId);

  return Response.json({
    snapshot: snapshot
      ? { id: snapshot.snapshotId, label: snapshot.label, date: snapshot.date.toISOString().split("T")[0], status: snapshot.status }
      : null,
    companies: Array.from(byCompany.values()),
  });
}
