import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPublishedSnapshotIds } from "@/lib/published-snapshots";
import { safeParseSnapshots } from "@/lib/workspace";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ workspaceUpdatedAt: null, publishedCount: 0 });
  }

  const [workspace, publishedIds] = await Promise.all([
    prisma.userWorkspace.findUnique({
      where: { userId: session.user.id },
      select: { snapshotsJson: true, updatedAt: true },
    }),
    getPublishedSnapshotIds(),
  ]);

  if (!workspace) {
    return Response.json({ workspaceUpdatedAt: null, publishedCount: 0 });
  }

  const snapshots = safeParseSnapshots(workspace.snapshotsJson);
  const snapshotIds = Object.keys(snapshots);
  const publishedSet = new Set(publishedIds);
  const publishedCount = snapshotIds.filter((id) => publishedSet.has(id)).length;

  return Response.json({
    workspaceUpdatedAt: workspace.updatedAt.toISOString(),
    publishedCount,
  });
}
