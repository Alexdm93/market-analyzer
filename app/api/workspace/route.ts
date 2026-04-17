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

type UpdateWorkspaceBody = Partial<{
  inflation: number;
  snapshots: Record<string, Snapshot>;
  selectedSnapshotId: string;
  companyInfo: CompanyInfo;
}>;

async function getCurrentUserId() {
  const session = await getServerSession(authOptions);
  return session?.user?.id;
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
}) {
  return {
    inflation: Number.isFinite(workspace.inflation) ? workspace.inflation : DEFAULT_WORKSPACE.inflation,
    snapshots: safeParseSnapshots(workspace.snapshotsJson),
    selectedSnapshotId: workspace.selectedSnapshotId ?? "",
    companyInfo: safeParseCompanyInfo(workspace.companyInfoJson),
  };
}

export async function GET() {
  const userId = await getCurrentUserId();

  if (!userId) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  const workspace = await getOrCreateWorkspace(userId);

  return Response.json(toPayload(workspace));
}

export async function PUT(request: Request) {
  const userId = await getCurrentUserId();

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
  const nextCompanyInfo =
    body.companyInfo && typeof body.companyInfo === "object"
      ? { ...EMPTY_COMPANY_INFO, ...body.companyInfo }
      : safeParseCompanyInfo(existingWorkspace.companyInfoJson);

  const workspace = await prisma.userWorkspace.update({
    where: { userId },
    data: {
      inflation: nextInflation,
      snapshotsJson: JSON.stringify(nextSnapshots),
      selectedSnapshotId: nextSelectedSnapshotId,
      companyInfoJson: JSON.stringify(nextCompanyInfo),
    },
  });

  return Response.json(toPayload(workspace));
}