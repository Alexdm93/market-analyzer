import { prisma } from "@/lib/prisma";
import { safeParseSnapshots } from "@/lib/workspace";
import type { SnapshotBackup } from "@/app/api/admin/backups/route";

export async function createSnapshotBackup(snapshotId: string): Promise<void> {
  const [snapshotMeta, positions, cargoConfigRow, companyConfigRow] = await Promise.all([
    prisma.userSnapshot.findFirst({
      where: { snapshotId },
      select: { label: true, date: true },
    }),
    prisma.userPosition.findMany({
      where: { snapshotId, snapshot: { submittedAt: { not: null } } },
      select: {
        positionId: true,
        title: true,
        dataJson: true,
        userId: true,
        company: { select: { id: true, name: true } },
        snapshot: { select: { submittedAt: true } },
      },
    }),
    prisma.globalConfig.findUnique({ where: { key: `snapshot-cargos-${snapshotId}` }, select: { value: true } }),
    prisma.globalConfig.findUnique({ where: { key: `snapshot-companies-${snapshotId}` }, select: { value: true } }),
  ]);

  const userIds = [...new Set(positions.map((p) => p.userId))];
  const workspaces = await prisma.userWorkspace.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, snapshotsJson: true },
  });
  const workspaceByUser = new Map(workspaces.map((w) => [w.userId, w.snapshotsJson]));

  const byCompany = new Map<string, SnapshotBackup["companies"][number]>();
  for (const pos of positions) {
    const key = pos.company.id;
    if (!byCompany.has(key)) {
      const snaps = safeParseSnapshots(workspaceByUser.get(pos.userId) ?? "{}");
      byCompany.set(key, {
        companyId: pos.company.id,
        companyName: pos.company.name,
        submittedAt: pos.snapshot.submittedAt!.toISOString(),
        positions: [],
        workspaceRows: (snaps[snapshotId]?.rows ?? []) as unknown[],
      });
    }
    byCompany.get(key)!.positions.push({
      positionId: pos.positionId,
      title: pos.title,
      data: JSON.parse(pos.dataJson) as Record<string, unknown>,
    });
  }

  const companies = [...byCompany.values()];
  const totalPositions = companies.reduce((sum, c) => sum + c.positions.length, 0);

  let cargoConfig: SnapshotBackup["cargoConfig"] = null;
  try { if (cargoConfigRow?.value) cargoConfig = JSON.parse(cargoConfigRow.value) as SnapshotBackup["cargoConfig"]; } catch { /* ignore */ }

  let participatingCompanyIds: string[] | null = null;
  try { if (companyConfigRow?.value) participatingCompanyIds = (JSON.parse(companyConfigRow.value) as { companyIds?: string[] }).companyIds ?? null; } catch { /* ignore */ }

  const backup: SnapshotBackup = {
    version: "1",
    snapshotId,
    snapshotLabel: snapshotMeta?.label ?? snapshotId,
    snapshotDate: snapshotMeta?.date.toISOString().split("T")[0] ?? snapshotId,
    publishedAt: new Date().toISOString(),
    totalCompanies: companies.length,
    totalPositions,
    companies,
    cargoConfig,
    participatingCompanyIds,
  };

  await prisma.globalConfig.upsert({
    where: { key: `snapshot-backup-${snapshotId}` },
    create: { key: `snapshot-backup-${snapshotId}`, value: JSON.stringify(backup) },
    update: { value: JSON.stringify(backup) },
  });
}
