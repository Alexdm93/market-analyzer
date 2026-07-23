import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ECONOMIC_SECTOR_OPTIONS,
  COMPANY_CLASSIFICATION_OPTIONS_BY_SECTOR,
} from "@/lib/company";
import { JOB_TITLES_BY_DEPARTMENT } from "@/data/jobTitles";

export type SectorEntry = {
  name: string;
  classifications: string[];
};

export type CargoEntry = {
  departamento: string;
  cargos: string[];
};

const SECTORS_KEY = "sectors";
const CARGOS_KEY = "cargos";

function defaultSectors(): SectorEntry[] {
  return (ECONOMIC_SECTOR_OPTIONS as readonly string[]).map((name) => ({
    name,
    classifications: COMPANY_CLASSIFICATION_OPTIONS_BY_SECTOR[name] ?? [],
  }));
}

function defaultCargos(): CargoEntry[] {
  return Object.entries(JOB_TITLES_BY_DEPARTMENT).map(([departamento, cargos]) => ({
    departamento,
    cargos,
  }));
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  let sectors: SectorEntry[] = defaultSectors();
  let cargos: CargoEntry[] = defaultCargos();

  try {
    const [sectorsRow, cargosRow] = await Promise.all([
      prisma.globalConfig.findUnique({ where: { key: SECTORS_KEY } }),
      prisma.globalConfig.findUnique({ where: { key: CARGOS_KEY } }),
    ]);

    if (sectorsRow?.value) {
      const parsed = JSON.parse(sectorsRow.value) as SectorEntry[];
      if (Array.isArray(parsed)) sectors = parsed;
    }

    if (cargosRow?.value) {
      const parsed = JSON.parse(cargosRow.value) as CargoEntry[];
      if (Array.isArray(parsed)) cargos = parsed;
    }
  } catch {
    // GlobalConfig table may not exist yet — fall back to hardcoded
  }

  return Response.json({ sectors, cargos });
}

type UpdateConfigBody = {
  sectors?: SectorEntry[];
  cargos?: CargoEntry[];
};

type SnapshotCargoEntry = { departamento: string; tituloCargo: string };

function computeDeptRenameMap(oldMaster: CargoEntry[], newMaster: CargoEntry[]): Map<string, string> {
  const oldDeptMap = new Map(oldMaster.map((d) => [d.departamento, new Set(d.cargos)]));
  const newDeptMap = new Map(newMaster.map((d) => [d.departamento, new Set(d.cargos)]));
  const removedDepts = oldMaster.filter((d) => !newDeptMap.has(d.departamento));
  const addedDepts   = newMaster.filter((d) => !oldDeptMap.has(d.departamento));
  const renameMap = new Map<string, string>();
  for (const oldDept of removedDepts) {
    let best: { name: string; score: number } | null = null;
    for (const newDept of addedDepts) {
      const oldSet  = oldDeptMap.get(oldDept.departamento)!;
      const overlap = newDept.cargos.filter((c) => oldSet.has(c)).length;
      const union   = new Set([...oldDept.cargos, ...newDept.cargos]).size;
      const score   = union > 0 ? overlap / union : 0;
      if (score > 0.5 && (!best || overlap > best.score)) {
        best = { name: newDept.departamento, score: overlap };
      }
    }
    if (best) renameMap.set(oldDept.departamento, best.name);
  }
  return renameMap;
}

function propagateMasterToSnapshot(
  newMaster: CargoEntry[],
  snapshot: SnapshotCargoEntry[],
  deptRenameMap: Map<string, string>
): SnapshotCargoEntry[] {
  const newDeptMap = new Map(newMaster.map((d) => [d.departamento, new Set(d.cargos)]));

  // Rebuild snapshot: apply renames, remove deleted depts/cargos, keep valid entries
  const kept: SnapshotCargoEntry[] = [];
  for (const entry of snapshot) {
    const resolvedDept = deptRenameMap.get(entry.departamento) ?? entry.departamento;
    const deptCargos   = newDeptMap.get(resolvedDept);
    if (!deptCargos) continue; // dept deleted
    if (!deptCargos.has(entry.tituloCargo)) continue; // cargo deleted from dept
    kept.push({ departamento: resolvedDept, tituloCargo: entry.tituloCargo });
  }

  // Add new cargos to depts already present in this snapshot
  const keptByDept = new Map<string, Set<string>>();
  for (const e of kept) {
    if (!keptByDept.has(e.departamento)) keptByDept.set(e.departamento, new Set());
    keptByDept.get(e.departamento)!.add(e.tituloCargo);
  }
  for (const newDept of newMaster) {
    const existing = keptByDept.get(newDept.departamento);
    if (!existing) continue; // dept not in this snapshot — don't auto-add
    for (const cargo of newDept.cargos) {
      if (!existing.has(cargo)) {
        kept.push({ departamento: newDept.departamento, tituloCargo: cargo });
      }
    }
  }

  return kept;
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
  }

  const body = (await request.json()) as UpdateConfigBody;

  if (!Array.isArray(body.sectors) && !Array.isArray(body.cargos)) {
    return Response.json({ message: "Nada que guardar." }, { status: 400 });
  }

  try {
    const operations: Promise<unknown>[] = [];

    if (Array.isArray(body.sectors)) {
      operations.push(
        prisma.globalConfig.upsert({
          where: { key: SECTORS_KEY },
          create: { key: SECTORS_KEY, value: JSON.stringify(body.sectors) },
          update: { value: JSON.stringify(body.sectors) },
        })
      );
    }

    if (Array.isArray(body.cargos)) {
      // Read old master + all snapshot-cargos rows before saving
      const [oldMasterRow, snapshotRows] = await Promise.all([
        prisma.globalConfig.findUnique({ where: { key: CARGOS_KEY } }),
        prisma.globalConfig.findMany({ where: { key: { startsWith: "snapshot-cargos-" } } }),
      ]);

      const oldMaster: CargoEntry[] = (() => {
        try { return oldMasterRow?.value ? (JSON.parse(oldMasterRow.value) as CargoEntry[]) : []; }
        catch { return []; }
      })();

      // Compute rename map once (used for snapshot-cargos, UserWorkspace, and UserPosition)
      const deptRenameMap = computeDeptRenameMap(oldMaster, body.cargos!);

      // Propagate changes to every snapshot-cargos row
      const snapshotUpdates = snapshotRows.map((row) => {
        const current: SnapshotCargoEntry[] = (() => {
          try { return JSON.parse(row.value) as SnapshotCargoEntry[]; }
          catch { return []; }
        })();
        const updated = propagateMasterToSnapshot(body.cargos!, current, deptRenameMap);
        return prisma.globalConfig.update({
          where: { key: row.key },
          data: { value: JSON.stringify(updated) },
        });
      });

      // When depts were renamed, patch departamento in UserWorkspace and UserPosition records
      // so existing data isn't silently dropped by the client-side validation on next load.
      const dataPatches: Promise<unknown>[] = [];
      if (deptRenameMap.size > 0) {
        const affectedSnapshotIds = snapshotRows.map((r) => r.key.replace("snapshot-cargos-", ""));

        // Patch UserWorkspace.snapshotsJson
        const workspaces = await prisma.userWorkspace.findMany({
          select: { userId: true, snapshotsJson: true },
        });
        for (const ws of workspaces) {
          let changed = false;
          let parsed: Record<string, { rows?: Array<Record<string, unknown>> }>;
          try { parsed = JSON.parse(ws.snapshotsJson) as typeof parsed; }
          catch { continue; }
          for (const snapId of affectedSnapshotIds) {
            const snap = parsed[snapId];
            if (!snap?.rows) continue;
            for (const row of snap.rows) {
              const oldDept = typeof row.departamento === "string" ? row.departamento : null;
              if (oldDept && deptRenameMap.has(oldDept)) {
                row.departamento = deptRenameMap.get(oldDept);
                changed = true;
              }
            }
          }
          if (changed) {
            dataPatches.push(
              prisma.userWorkspace.update({
                where: { userId: ws.userId },
                data: { snapshotsJson: JSON.stringify(parsed) },
              })
            );
          }
        }

        // Patch UserPosition.dataJson
        const positions = await prisma.userPosition.findMany({
          where: { snapshotId: { in: affectedSnapshotIds } },
          select: { id: true, dataJson: true },
        });
        for (const pos of positions) {
          let data: Record<string, unknown>;
          try { data = JSON.parse(pos.dataJson) as typeof data; }
          catch { continue; }
          const oldDept = typeof data.departamento === "string" ? data.departamento : null;
          if (oldDept && deptRenameMap.has(oldDept)) {
            dataPatches.push(
              prisma.userPosition.update({
                where: { id: pos.id },
                data: { dataJson: JSON.stringify({ ...data, departamento: deptRenameMap.get(oldDept) }) },
              })
            );
          }
        }
      }

      operations.push(
        prisma.globalConfig.upsert({
          where: { key: CARGOS_KEY },
          create: { key: CARGOS_KEY, value: JSON.stringify(body.cargos) },
          update: { value: JSON.stringify(body.cargos) },
        }),
        ...snapshotUpdates,
        ...dataPatches
      );
    }

    await Promise.all(operations);

    const messages: string[] = [];
    if (body.sectors) messages.push("Sectores guardados");
    if (body.cargos) messages.push("Cargos guardados");

    return Response.json({ message: `${messages.join(" y ")} correctamente.` });
  } catch {
    return Response.json(
      { message: "No se pudo guardar. Ejecuta la migración pendiente con: npx prisma migrate dev" },
      { status: 500 }
    );
  }
}
