import { prisma } from "@/lib/prisma";

const KEY = "published-snapshot-ids";

export async function getPublishedSnapshotIds(): Promise<string[]> {
  const record = await prisma.globalConfig.findUnique({ where: { key: KEY } });
  if (!record) return [];
  try {
    const parsed = JSON.parse(record.value);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export async function publishSnapshot(snapshotId: string): Promise<void> {
  const current = await getPublishedSnapshotIds();
  if (current.includes(snapshotId)) return;
  const updated = [...current, snapshotId];
  await prisma.globalConfig.upsert({
    where: { key: KEY },
    update: { value: JSON.stringify(updated) },
    create: { key: KEY, value: JSON.stringify(updated) },
  });
}

export async function unpublishSnapshot(snapshotId: string): Promise<void> {
  const current = await getPublishedSnapshotIds();
  const updated = current.filter((id) => id !== snapshotId);
  await prisma.globalConfig.upsert({
    where: { key: KEY },
    update: { value: JSON.stringify(updated) },
    create: { key: KEY, value: JSON.stringify(updated) },
  });
}
