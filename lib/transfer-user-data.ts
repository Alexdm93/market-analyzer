import { prisma } from "@/lib/prisma";
import { safeParseSnapshots } from "@/lib/workspace";

/**
 * When a new user is created for an existing company, inherit all UserPosition records
 * and workspace data from the other users in that company. Both submitted and in-progress
 * data is moved so the new user picks up exactly where the others left off.
 */
export async function inheritCompanyData(newUserId: string, companyId: string): Promise<void> {
  const otherUsers = await prisma.user.findMany({
    where: { companyId, id: { not: newUserId } },
    select: { id: true },
  });

  if (otherUsers.length === 0) return;

  const otherUserIds = otherUsers.map((u) => u.id);

  const [positions, sourceSnapshots, otherWorkspaces, newUserSnapshots] = await Promise.all([
    prisma.userPosition.findMany({
      where: { userId: { in: otherUserIds } },
      select: { id: true, snapshotId: true },
    }),
    prisma.userSnapshot.findMany({
      where: { userId: { in: otherUserIds }, submittedAt: { not: null } },
      select: { snapshotId: true, submittedAt: true },
    }),
    prisma.userWorkspace.findMany({
      where: { userId: { in: otherUserIds } },
      select: { snapshotsJson: true },
    }),
    prisma.userSnapshot.findMany({
      where: { userId: newUserId },
      select: { id: true, snapshotId: true },
    }),
  ]);

  if (positions.length === 0 && sourceSnapshots.length === 0) return;

  const targetSnapshotMap = new Map(newUserSnapshots.map((s) => [s.snapshotId, s.id]));

  // Keep the most recent submittedAt per period across all source users
  const submittedByPeriod = new Map<string, Date>();
  for (const snap of sourceSnapshots) {
    const existing = submittedByPeriod.get(snap.snapshotId);
    if (!existing || snap.submittedAt! > existing) {
      submittedByPeriod.set(snap.snapshotId, snap.submittedAt!);
    }
  }

  await prisma.$transaction(async (tx) => {
    // Stamp submittedAt on the new user's UserSnapshot records
    for (const [snapshotId, submittedAt] of submittedByPeriod) {
      const targetId = targetSnapshotMap.get(snapshotId);
      if (!targetId) continue;
      await tx.userSnapshot.update({
        where: { id: targetId },
        data: { submittedAt },
      });
    }

    // Move all positions to the new user
    for (const pos of positions) {
      const targetSnapshotId = targetSnapshotMap.get(pos.snapshotId);
      if (!targetSnapshotId) continue;
      await tx.userPosition.update({
        where: { id: pos.id },
        data: { userId: newUserId, userSnapshotId: targetSnapshotId },
      });
    }

    // Merge workspace JSON from all other users into the new user's workspace
    const newWorkspace = await tx.userWorkspace.findUnique({
      where: { userId: newUserId },
      select: { snapshotsJson: true },
    });
    const mergedSnaps = safeParseSnapshots(newWorkspace?.snapshotsJson ?? "{}");

    for (const ws of otherWorkspaces) {
      const wsSnaps = safeParseSnapshots(ws.snapshotsJson);
      for (const [periodId, snap] of Object.entries(wsSnaps)) {
        if ((snap.rows?.length ?? 0) > 0) {
          mergedSnaps[periodId] = snap;
        }
      }
    }

    await tx.userWorkspace.update({
      where: { userId: newUserId },
      data: { snapshotsJson: JSON.stringify(mergedSnaps) },
    });
  });
}

/**
 * Transfer all submitted snapshot data from one user to another within the same company.
 * Called when deleting a user who has submitted positions and another company user exists.
 * The target user receives: submittedAt timestamps on their UserSnapshot records,
 * ownership of the UserPosition records, and the workspace row data for those periods.
 */
export async function transferSubmittedData(fromUserId: string, toUserId: string): Promise<void> {
  const sourceSnapshots = await prisma.userSnapshot.findMany({
    where: { userId: fromUserId, submittedAt: { not: null } },
    select: { snapshotId: true, submittedAt: true },
  });

  if (sourceSnapshots.length === 0) return;

  const submittedPeriodIds = sourceSnapshots.map((s) => s.snapshotId);

  const [targetSnapshots, positions, sourceWorkspace, targetWorkspace] = await Promise.all([
    prisma.userSnapshot.findMany({
      where: { userId: toUserId },
      select: { id: true, snapshotId: true },
    }),
    prisma.userPosition.findMany({
      where: { userId: fromUserId, snapshotId: { in: submittedPeriodIds } },
      select: { id: true, snapshotId: true },
    }),
    prisma.userWorkspace.findUnique({
      where: { userId: fromUserId },
      select: { snapshotsJson: true },
    }),
    prisma.userWorkspace.findUnique({
      where: { userId: toUserId },
      select: { snapshotsJson: true },
    }),
  ]);

  const targetSnapshotMap = new Map(targetSnapshots.map((s) => [s.snapshotId, s.id]));

  await prisma.$transaction(async (tx) => {
    // Stamp submittedAt on target's matching UserSnapshot records
    for (const snap of sourceSnapshots) {
      const targetId = targetSnapshotMap.get(snap.snapshotId);
      if (!targetId) continue;
      await tx.userSnapshot.update({
        where: { id: targetId },
        data: { submittedAt: snap.submittedAt },
      });
    }

    // Re-parent UserPosition records to the target user and their snapshot record
    for (const pos of positions) {
      const targetSnapshotId = targetSnapshotMap.get(pos.snapshotId);
      if (!targetSnapshotId) continue;
      await tx.userPosition.update({
        where: { id: pos.id },
        data: { userId: toUserId, userSnapshotId: targetSnapshotId },
      });
    }

    // Merge workspace JSON: copy source rows for submitted periods into target
    if (sourceWorkspace?.snapshotsJson) {
      const sourceSnaps = safeParseSnapshots(sourceWorkspace.snapshotsJson);
      const targetSnaps = safeParseSnapshots(targetWorkspace?.snapshotsJson ?? "{}");
      const periodSet = new Set(submittedPeriodIds);
      for (const [periodId, snap] of Object.entries(sourceSnaps)) {
        if (periodSet.has(periodId)) {
          targetSnaps[periodId] = snap;
        }
      }
      await tx.userWorkspace.upsert({
        where: { userId: toUserId },
        update: { snapshotsJson: JSON.stringify(targetSnaps) },
        create: { userId: toUserId, snapshotsJson: JSON.stringify(targetSnaps), inflation: 5 },
      });
    }
  });
}
