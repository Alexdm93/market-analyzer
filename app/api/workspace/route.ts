import { SnapshotProcessingStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_WORKSPACE,
  EMPTY_COMPANY_INFO,
  type CompanyInfo,
  type Snapshot,
  safeParseCompanyInfo,
  safeParseSnapshots,
} from "@/lib/workspace";

type TransactionClient = Prisma.TransactionClient;

function resolveSnapshotDate(value: string) {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return new Date();
  }

  return parsedDate;
}

function resolveCompanyName(companyInfo: CompanyInfo, fallbackName: string) {
  const normalized = companyInfo.companyName.trim();
  return normalized || fallbackName;
}

async function getCompanyIdentity(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      company: {
        select: {
          name: true,
          description: true,
          economicSector: true,
          classification: true,
          headcount: true,
          revenueUSD: true,
          avgProfitPercent: true,
          hrName: true,
          hrPosition: true,
          hrEmail: true,
          hrPhone: true,
          hrCell: true,
          minVacationDays: true,
          minUtilityDays: true,
          conversionRate: true,
          locality: true,
        },
      },
    },
  });

  return user?.company ?? null;
}

function mergeCompanyIdentity(companyInfo: CompanyInfo, company: {
  name: string;
  description: string;
  economicSector: string;
  classification: string;
  headcount: string;
  revenueUSD: string;
  avgProfitPercent: string;
  hrName: string;
  hrPosition: string;
  hrEmail: string;
  hrPhone: string;
  hrCell: string;
  minVacationDays: string;
  minUtilityDays: string;
  conversionRate: string;
  locality: string;
} | null): CompanyInfo {
  if (!company) {
    return companyInfo;
  }

  return {
    ...companyInfo,
    companyName: company.name,
    sector: company.economicSector,
    classification: company.classification,
    description: company.description,
    headcount: company.headcount,
    revenueUSD: company.revenueUSD,
    avgProfitPercent: company.avgProfitPercent,
    hrName: company.hrName,
    hrPosition: company.hrPosition,
    hrEmail: company.hrEmail,
    hrPhone: company.hrPhone,
    hrCell: company.hrCell,
    minVacationDays: company.minVacationDays,
    minUtilityDays: company.minUtilityDays,
    conversionRate: company.conversionRate,
    locality: company.locality,
  };
}

async function syncCompanyInfo(
  tx: TransactionClient,
  companyId: string,
  companyInfo: CompanyInfo
) {
  await tx.company.update({
    where: { id: companyId },
    data: {
      name: companyInfo.companyName,
      description: companyInfo.description,
      economicSector: companyInfo.sector,
      classification: companyInfo.classification,
      headcount: companyInfo.headcount,
      revenueUSD: companyInfo.revenueUSD,
      avgProfitPercent: companyInfo.avgProfitPercent,
      hrName: companyInfo.hrName,
      hrPosition: companyInfo.hrPosition,
      hrEmail: companyInfo.hrEmail,
      hrPhone: companyInfo.hrPhone,
      hrCell: companyInfo.hrCell,
      minVacationDays: companyInfo.minVacationDays,
      minUtilityDays: companyInfo.minUtilityDays,
      conversionRate: companyInfo.conversionRate,
      locality: companyInfo.locality,
    },
  });
}

async function ensureCompanyIdForUser(
  tx: TransactionClient,
  userId: string,
  companyInfo: CompanyInfo
) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      companyId: true,
      company: {
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              users: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new Error("User not found.");
  }

  const fallbackCompanyName = user.company?.name?.trim() || (user.name.trim() ? `Empresa ${user.name.trim()}` : `Empresa ${user.email}`);
  const companyName = resolveCompanyName(companyInfo, fallbackCompanyName);

  if (user.company?.name === companyName) {
    return {
      companyId: user.company.id,
      previousCompanyId: null,
    };
  }

  const existingCompany = await tx.company.findUnique({
    where: { name: companyName },
    select: { id: true },
  });

  if (user.company && user.company._count.users === 1 && !existingCompany) {
    const renamedCompany = await tx.company.update({
      where: { id: user.company.id },
      data: { name: companyName },
      select: { id: true },
    });

    return {
      companyId: renamedCompany.id,
      previousCompanyId: null,
    };
  }

  const company =
    existingCompany ??
    (await tx.company.create({
      data: { name: companyName },
      select: { id: true },
    }));

  const previousCompanyId = user.companyId !== company.id ? user.companyId : null;

  if (previousCompanyId) {
    await tx.user.update({
      where: { id: userId },
      data: { companyId: company.id },
    });
  }

  return {
    companyId: company.id,
    previousCompanyId,
  };
}

async function cleanupUnusedCompany(tx: TransactionClient, companyId: string | null) {
  if (!companyId) {
    return;
  }

  const companyUsage = await tx.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });

  if (!companyUsage) {
    return;
  }

  const [userCount, snapshotCount, positionCount] = await Promise.all([
    tx.user.count({ where: { companyId } }),
    tx.userSnapshot.count({ where: { companyId } }),
    tx.userPosition.count({ where: { companyId } }),
  ]);

  if (userCount === 0 && snapshotCount === 0 && positionCount === 0) {
    await tx.company.delete({
      where: { id: companyId },
    });
  }
}

async function syncRelationalWorkspace(
  tx: TransactionClient,
  userId: string,
  companyId: string,
  snapshots: Record<string, Snapshot>
) {
  const existingStatuses = await tx.userSnapshot.findMany({
    where: { userId },
    select: {
      snapshotId: true,
      status: true,
      processedAt: true,
    },
  });
  const statusBySnapshotId = new Map(existingStatuses.map((snapshot) => [snapshot.snapshotId, { status: snapshot.status, processedAt: snapshot.processedAt }]));

  await tx.userPosition.deleteMany({
    where: { userId },
  });

  await tx.userSnapshot.deleteMany({
    where: { userId },
  });

  for (const snapshot of Object.values(snapshots)) {
    const createdSnapshot = await tx.userSnapshot.create({
      data: {
        userId,
        companyId,
        snapshotId: snapshot.id,
        label: snapshot.label,
        date: resolveSnapshotDate(snapshot.date),
        status: statusBySnapshotId.get(snapshot.id)?.status ?? SnapshotProcessingStatus.IN_REVIEW,
        processedAt: statusBySnapshotId.get(snapshot.id)?.processedAt ?? null,
      },
      select: { id: true },
    });

    if ((snapshot.rows ?? []).length > 0) {
      await tx.userPosition.createMany({
        data: (snapshot.rows ?? []).map((row) => ({
          userId,
          companyId,
          userSnapshotId: createdSnapshot.id,
          snapshotId: snapshot.id,
          snapshotLabel: snapshot.label,
          snapshotDate: resolveSnapshotDate(snapshot.date),
          positionId: row.id,
          title: row.tituloCargo || null,
          dataJson: JSON.stringify(row),
        })),
      });
    }
  }
}

async function backfillRelationalWorkspace(userId: string, companyInfoJson: string, snapshotsJson: string) {
  const nextCompanyInfo = safeParseCompanyInfo(companyInfoJson);
  const nextSnapshots = safeParseSnapshots(snapshotsJson);

  await prisma.$transaction(async (tx) => {
    const { companyId, previousCompanyId } = await ensureCompanyIdForUser(tx, userId, nextCompanyInfo);
    await syncCompanyInfo(tx, companyId, nextCompanyInfo);
    const snapshotCount = await tx.userSnapshot.count({ where: { userId } });

    if (snapshotCount === 0 && Object.keys(nextSnapshots).length > 0) {
      await syncRelationalWorkspace(tx, userId, companyId, nextSnapshots);
    }

    await cleanupUnusedCompany(tx, previousCompanyId);
  });
}

type UpdateWorkspaceBody = Partial<{
  inflation: number;
  snapshots: Record<string, Snapshot>;
  selectedSnapshotId: string;
  companyInfo: CompanyInfo;
}>;

async function getCurrentSession() {
  return getServerSession(authOptions);
}

async function getOrCreateWorkspace(userId: string) {
  return prisma.userWorkspace.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      inflation: DEFAULT_WORKSPACE.inflation,
      snapshotsJson: JSON.stringify(DEFAULT_WORKSPACE.snapshots),
      selectedSnapshotId: DEFAULT_WORKSPACE.selectedSnapshotId,
      companyInfoJson: JSON.stringify(DEFAULT_WORKSPACE.companyInfo),
    },
  });
}

function toPayload(workspace: {
  inflation: number;
  snapshotsJson: string;
  selectedSnapshotId: string | null;
  companyInfoJson: string;
}, company: {
  name: string;
  description: string;
  economicSector: string;
  classification: string;
  headcount: string;
  revenueUSD: string;
  avgProfitPercent: string;
  hrName: string;
  hrPosition: string;
  hrEmail: string;
  hrPhone: string;
  hrCell: string;
  minVacationDays: string;
  minUtilityDays: string;
  conversionRate: string;
  locality: string;
} | null) {
  const parsedCompanyInfo = safeParseCompanyInfo(workspace.companyInfoJson);

  return {
    inflation: Number.isFinite(workspace.inflation) ? workspace.inflation : DEFAULT_WORKSPACE.inflation,
    snapshots: safeParseSnapshots(workspace.snapshotsJson),
    selectedSnapshotId: workspace.selectedSnapshotId ?? "",
    companyInfo: mergeCompanyIdentity(parsedCompanyInfo, company),
  };
}

async function buildCompanyPayload(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      description: true,
      economicSector: true,
      classification: true,
      headcount: true,
      revenueUSD: true,
      avgProfitPercent: true,
      hrName: true,
      hrPosition: true,
      hrEmail: true,
      hrPhone: true,
      hrCell: true,
      minVacationDays: true,
      minUtilityDays: true,
      conversionRate: true,
      locality: true,
    },
  });

  if (!company) {
    return null;
  }

  const [workspace, snapshots, positions] = await Promise.all([
    prisma.userWorkspace.findFirst({
      where: {
        user: {
          companyId,
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        inflation: true,
        selectedSnapshotId: true,
        companyInfoJson: true,
      },
    }),
    prisma.userSnapshot.findMany({
      where: { companyId },
      select: {
        snapshotId: true,
        label: true,
        date: true,
      },
      distinct: ["snapshotId"],
      orderBy: [
        { date: "desc" },
        { snapshotId: "desc" },
      ],
    }),
    prisma.userPosition.findMany({
      where: { companyId },
      select: {
        snapshotId: true,
        positionId: true,
        dataJson: true,
      },
      orderBy: [
        { snapshotDate: "desc" },
        { updatedAt: "desc" },
      ],
    }),
  ]);

  const companySnapshots = Object.fromEntries(
    snapshots.map((snapshot) => [
      snapshot.snapshotId,
      {
        id: snapshot.snapshotId,
        label: snapshot.label,
        date: snapshot.date.toISOString().split("T")[0],
        rows: [],
      },
    ])
  ) as Record<string, Snapshot>;

  const seenPositions = new Set<string>();

  for (const position of positions) {
    const dedupeKey = `${position.snapshotId}:${position.positionId}`;

    if (seenPositions.has(dedupeKey)) {
      continue;
    }

    const targetSnapshot = companySnapshots[position.snapshotId];

    if (!targetSnapshot) {
      continue;
    }

    try {
      targetSnapshot.rows.push(JSON.parse(position.dataJson));
      seenPositions.add(dedupeKey);
    } catch {
      continue;
    }
  }

  const parsedCompanyInfo = safeParseCompanyInfo(workspace?.companyInfoJson);

  return {
    inflation: workspace?.inflation ?? DEFAULT_WORKSPACE.inflation,
    snapshots: companySnapshots,
    selectedSnapshotId:
      (workspace?.selectedSnapshotId && companySnapshots[workspace.selectedSnapshotId]
        ? workspace.selectedSnapshotId
        : snapshots[0]?.snapshotId) ?? "",
    companyInfo: {
      ...parsedCompanyInfo,
      companyName: company.name,
      sector: company.economicSector,
      classification: company.classification,
      description: company.description,
      headcount: company.headcount,
      revenueUSD: company.revenueUSD,
      avgProfitPercent: company.avgProfitPercent,
      hrName: company.hrName,
      hrPosition: company.hrPosition,
      hrEmail: company.hrEmail,
      hrPhone: company.hrPhone,
      hrCell: company.hrCell,
      minVacationDays: company.minVacationDays,
      minUtilityDays: company.minUtilityDays,
      conversionRate: company.conversionRate,
      locality: company.locality,
    },
  };
}

export async function GET(request: Request) {
  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId")?.trim() ?? "";

  if (companyId) {
    if (session.user.role !== "ADMIN") {
      return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
    }

    const companyPayload = await buildCompanyPayload(companyId);

    if (!companyPayload) {
      return Response.json({ message: "La empresa seleccionada no existe." }, { status: 404 });
    }

    return Response.json(companyPayload);
  }

  const workspace = await getOrCreateWorkspace(userId);
  await backfillRelationalWorkspace(userId, workspace.companyInfoJson, workspace.snapshotsJson);
  const company = await getCompanyIdentity(userId);

  return Response.json(toPayload(workspace, company));
}

export async function PUT(request: Request) {
  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  const body = (await request.json()) as UpdateWorkspaceBody;
  const existingWorkspace = await getOrCreateWorkspace(userId);

  const nextInflation =
    typeof body.inflation === "number" && Number.isFinite(body.inflation)
      ? body.inflation
      : existingWorkspace.inflation;

  const nextSnapshots = body.snapshots && typeof body.snapshots === "object" ? body.snapshots : safeParseSnapshots(existingWorkspace.snapshotsJson);
  const nextSelectedSnapshotId = typeof body.selectedSnapshotId === "string" ? body.selectedSnapshotId : existingWorkspace.selectedSnapshotId ?? "";
  const requestedCompanyInfo =
    body.companyInfo && typeof body.companyInfo === "object"
      ? { ...EMPTY_COMPANY_INFO, ...body.companyInfo }
      : safeParseCompanyInfo(existingWorkspace.companyInfoJson);
  const company = await getCompanyIdentity(userId);
  const nextCompanyInfo = mergeCompanyIdentity(requestedCompanyInfo, company);

  const snapshotsJson = JSON.stringify(nextSnapshots);
  const companyInfoJson = JSON.stringify(nextCompanyInfo);

  const workspace = await prisma.$transaction(async (tx) => {
    const { companyId, previousCompanyId } = await ensureCompanyIdForUser(tx, userId, nextCompanyInfo);
    await syncCompanyInfo(tx, companyId, nextCompanyInfo);

    const updatedWorkspace = await tx.userWorkspace.update({
      where: { userId },
      data: {
        inflation: nextInflation,
        snapshotsJson,
        selectedSnapshotId: nextSelectedSnapshotId,
        companyInfoJson,
      },
    });

    await syncRelationalWorkspace(tx, userId, companyId, nextSnapshots);
    await cleanupUnusedCompany(tx, previousCompanyId);

    return updatedWorkspace;
  });

  const updatedCompany = await getCompanyIdentity(userId);

  return Response.json(toPayload(workspace, updatedCompany));
}