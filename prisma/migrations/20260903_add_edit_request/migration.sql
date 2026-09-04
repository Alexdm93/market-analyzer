-- Purely additive: new enum + new table. Does not alter, drop, or touch any existing
-- table, column, or row (User, Company, UserSnapshot, UserPosition, etc. are untouched).

-- Step 1: New enum for edit request status
CREATE TYPE "EditRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Step 2: New table
CREATE TABLE "EditRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "reason" TEXT,
    "status" "EditRequestStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedByName" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditRequest_pkey" PRIMARY KEY ("id")
);

-- Step 3: Indexes
CREATE INDEX "EditRequest_snapshotId_status_idx" ON "EditRequest"("snapshotId", "status");
CREATE INDEX "EditRequest_companyId_idx" ON "EditRequest"("companyId");
CREATE INDEX "EditRequest_userId_snapshotId_status_idx" ON "EditRequest"("userId", "snapshotId", "status");

-- Step 4: Foreign keys (cascade delete, same pattern as UserSnapshot/UserPosition)
ALTER TABLE "EditRequest" ADD CONSTRAINT "EditRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EditRequest" ADD CONSTRAINT "EditRequest_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
