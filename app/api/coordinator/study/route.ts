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

function normalizePositionJson(raw: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = JSON.parse(raw) as Record<string, any>;
    delete obj.id;
    delete obj._carried;
    return JSON.stringify(obj, Object.keys(obj).sort());
  } catch {
    return raw;
  }
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

    const allRows = await prisma.userSnapshot.findMany({
      where: { snapshotId: { in: snapshotIds } },
      select: { snapshotId: true, companyId: true, submittedAt: true },
    });

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

  // Restrict to companies currently assigned to this snapshot (if a list is configured)
  const companiesConfigRow = await prisma.globalConfig.findUnique({
    where: { key: `snapshot-companies-${snapshotId}` },
    select: { value: true },
  });
  let allowedCompanyIds: string[] | null = null;
  if (companiesConfigRow?.value) {
    try {
      const parsed = JSON.parse(companiesConfigRow.value) as { companyIds?: string[] };
      if (Array.isArray(parsed.companyIds)) allowedCompanyIds = parsed.companyIds;
    } catch {}
  }

  // Detail view: companies for a specific snapshot
  const rows = await prisma.userSnapshot.findMany({
    where: {
      snapshotId,
      ...(allowedCompanyIds ? { companyId: { in: allowedCompanyIds } } : {}),
    },
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

  // Find the previous snapshot for comparison
  const currentSnap = allSnapshots.find((s) => s.snapshotId === snapshotId);
  const prevSnap = currentSnap
    ? allSnapshots
        .filter((s) => s.snapshotId !== snapshotId && s.date < currentSnap.date)
        .sort((a, b) => b.date.toISOString().localeCompare(a.date.toISOString()))[0]
    : undefined;

  // Fetch positions for current and previous cuts to detect changes
  const [currentPositions, prevPositions] = await Promise.all([
    prisma.userPosition.findMany({
      where: { snapshotId },
      select: { companyId: true, dataJson: true },
    }),
    prevSnap
      ? prisma.userPosition.findMany({
          where: { snapshotId: prevSnap.snapshotId },
          select: { companyId: true, dataJson: true },
        })
      : Promise.resolve([]),
  ]);

  // Index current positions by company → set of normalized JSON strings
  const currentByCompany = new Map<string, string[]>();
  for (const p of currentPositions) {
    if (!currentByCompany.has(p.companyId)) currentByCompany.set(p.companyId, []);
    currentByCompany.get(p.companyId)!.push(normalizePositionJson(p.dataJson));
  }

  // Index previous positions by company → set of normalized JSON strings
  const prevByCompany = new Map<string, Set<string>>();
  for (const p of prevPositions) {
    if (!prevByCompany.has(p.companyId)) prevByCompany.set(p.companyId, new Set());
    prevByCompany.get(p.companyId)!.add(normalizePositionJson(p.dataJson));
  }

  function didDataChange(companyId: string): boolean | null {
    if (!prevSnap) return null;
    const curr = currentByCompany.get(companyId);
    const prev = prevByCompany.get(companyId);
    if (!curr || curr.length === 0 || !prev || prev.size === 0) return null;
    // Changed if any current position is not found verbatim in the previous cut
    return !curr.every((json) => prev.has(json));
  }

  // Deduplicate by company
  const byCompany = new Map<string, {
    companyId: string;
    name: string;
    economicSector: string | null;
    headcount: string | null;
    submitted: boolean;
    submittedAt: string | null;
    dataChanged: boolean | null;
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
        dataChanged: didDataChange(r.company.id),
        hrName: r.company.hrName,
        hrPosition: r.company.hrPosition,
        hrEmail: r.company.hrEmail,
        hrPhone: r.company.hrPhone,
        hrCell: r.company.hrCell,
      });
    } else if (isSubmitted && !existing.submitted) {
      existing.submitted = true;
      existing.submittedAt = submittedAt;
    }
  }

  const snapshot = allSnapshots.find((s) => s.snapshotId === snapshotId);

  return Response.json({
    snapshot: snapshot
      ? { id: snapshot.snapshotId, label: snapshot.label, date: snapshot.date.toISOString().split("T")[0], status: snapshot.status }
      : null,
    companies: Array.from(byCompany.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "es", { sensitivity: "base" })
    ),
  });
}
