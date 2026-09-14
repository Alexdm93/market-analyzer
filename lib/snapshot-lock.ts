import { prisma } from "@/lib/prisma";
import { getPublishedSnapshotIds } from "@/lib/published-snapshots";

/**
 * Candado de publicación.
 *
 * Una vez publicado un corte, su data queda congelada: si una empresa pudiera
 * enviar data después, los percentiles de un estudio que las demás empresas ya
 * están viendo cambiarían solos.
 *
 * Excepciones:
 *  - El admin nunca se bloquea (necesita poder corregir).
 *  - Una solicitud de edición APROBADA destraba ese caso puntual, y se considera
 *    "gastada" en cuanto el usuario vuelve a enviar.
 */

export type LockedSnapshots = {
  /** Cortes publicados que este usuario NO puede tocar */
  locked: Set<string>;
  /** Cortes publicados destrabados por una aprobación vigente */
  unlockedByApproval: Set<string>;
};

export async function getLockedSnapshotsForUser(
  userId: string,
  role: string | undefined
): Promise<LockedSnapshots> {
  // El admin nunca se bloquea
  if (role === "ADMIN") {
    return { locked: new Set(), unlockedByApproval: new Set() };
  }

  const publishedIds = await getPublishedSnapshotIds();
  if (publishedIds.length === 0) {
    return { locked: new Set(), unlockedByApproval: new Set() };
  }

  const [snapshots, approvals] = await Promise.all([
    prisma.userSnapshot.findMany({
      where: { userId, snapshotId: { in: publishedIds } },
      select: { snapshotId: true, submittedAt: true },
    }),
    prisma.editRequest.findMany({
      where: { userId, snapshotId: { in: publishedIds }, status: "APPROVED" },
      select: { snapshotId: true, resolvedAt: true },
      orderBy: { resolvedAt: "desc" },
    }),
  ]);

  const submittedAtBySnapshot = new Map(snapshots.map((s) => [s.snapshotId, s.submittedAt]));

  // Aprobación más reciente por corte
  const latestApproval = new Map<string, Date | null>();
  for (const a of approvals) {
    if (!latestApproval.has(a.snapshotId)) latestApproval.set(a.snapshotId, a.resolvedAt);
  }

  const locked = new Set<string>();
  const unlockedByApproval = new Set<string>();

  for (const snapshotId of publishedIds) {
    const approvedAt = latestApproval.get(snapshotId);
    const submittedAt = submittedAtBySnapshot.get(snapshotId);

    // La aprobación sigue vigente mientras no haya un envío posterior a ella
    const approvalIsLive =
      approvedAt != null && (submittedAt == null || submittedAt.getTime() < approvedAt.getTime());

    if (approvalIsLive) {
      unlockedByApproval.add(snapshotId);
    } else {
      locked.add(snapshotId);
    }
  }

  return { locked, unlockedByApproval };
}
