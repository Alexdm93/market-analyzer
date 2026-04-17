-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserSnapshot_userId_snapshotId_key" ON "UserSnapshot"("userId", "snapshotId");

-- CreateIndex
CREATE INDEX "UserSnapshot_companyId_date_idx" ON "UserSnapshot"("companyId", "date");

-- Seed companies for existing users before adding the required relation
INSERT INTO "Company" ("id", "name", "createdAt", "updatedAt")
SELECT DISTINCT
    md5(COALESCE(NULLIF(trim((w."companyInfoJson"::jsonb ->> 'companyName')), ''), 'Empresa ' || u."id")),
    COALESCE(NULLIF(trim((w."companyInfoJson"::jsonb ->> 'companyName')), ''), 'Empresa ' || u."id"),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User" u
LEFT JOIN "UserWorkspace" w ON w."userId" = u."id";

-- Add companyId to existing users and backfill it
ALTER TABLE "User" ADD COLUMN "companyId" TEXT;

UPDATE "User" u
SET "companyId" = (
    SELECT c."id"
    FROM "Company" c
    WHERE c."name" = COALESCE(
        NULLIF(trim((
            SELECT w."companyInfoJson"::jsonb ->> 'companyName'
            FROM "UserWorkspace" w
            WHERE w."userId" = u."id"
            LIMIT 1
        )), ''),
        'Empresa ' || u."id"
    )
    LIMIT 1
);

ALTER TABLE "User" ALTER COLUMN "companyId" SET NOT NULL;

-- Extend positions with company and snapshot relations
ALTER TABLE "UserPosition" ADD COLUMN "companyId" TEXT;
ALTER TABLE "UserPosition" ADD COLUMN "userSnapshotId" TEXT;

-- Backfill snapshots from existing positions
INSERT INTO "UserSnapshot" ("id", "userId", "companyId", "snapshotId", "label", "date", "createdAt", "updatedAt")
SELECT
    md5(p."userId" || ':' || p."snapshotId"),
    p."userId",
    u."companyId",
    p."snapshotId",
    MAX(p."snapshotLabel"),
    MAX(p."snapshotDate"),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "UserPosition" p
INNER JOIN "User" u ON u."id" = p."userId"
GROUP BY p."userId", u."companyId", p."snapshotId";

UPDATE "UserPosition" p
SET "companyId" = u."companyId",
    "userSnapshotId" = md5(p."userId" || ':' || p."snapshotId")
FROM "User" u
WHERE u."id" = p."userId";

ALTER TABLE "UserPosition" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "UserPosition" ALTER COLUMN "userSnapshotId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "UserPosition_companyId_snapshotDate_idx" ON "UserPosition"("companyId", "snapshotDate");

-- CreateIndex
CREATE INDEX "UserPosition_userSnapshotId_idx" ON "UserPosition"("userSnapshotId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSnapshot" ADD CONSTRAINT "UserSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSnapshot" ADD CONSTRAINT "UserSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPosition" ADD CONSTRAINT "UserPosition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPosition" ADD CONSTRAINT "UserPosition_userSnapshotId_fkey" FOREIGN KEY ("userSnapshotId") REFERENCES "UserSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;