import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// One-time migration endpoint — adds telemetry columns if they don't exist yet.
// Safe to call multiple times (IF NOT EXISTS). Delete this file after running.
export async function POST() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return Response.json({ message: "No autorizado." }, { status: 403 });
  }

  const results: string[] = [];

  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3)`
    );
    results.push('✓ User.lastLoginAt');
  } catch (e) {
    results.push(`✗ User.lastLoginAt: ${String(e)}`);
  }

  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "UserWorkspace" ADD COLUMN IF NOT EXISTS "lastExportAt" TIMESTAMP(3)`
    );
    results.push('✓ UserWorkspace.lastExportAt');
  } catch (e) {
    results.push(`✗ UserWorkspace.lastExportAt: ${String(e)}`);
  }

  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "estudioEnabled" BOOLEAN NOT NULL DEFAULT false`
    );
    results.push('✓ Company.estudioEnabled');
  } catch (e) {
    results.push(`✗ Company.estudioEnabled: ${String(e)}`);
  }

  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "estudioSnapshotIds" TEXT NOT NULL DEFAULT '[]'`
    );
    results.push('✓ Company.estudioSnapshotIds');
  } catch (e) {
    results.push(`✗ Company.estudioSnapshotIds: ${String(e)}`);
  }

  return Response.json({ results });
}
