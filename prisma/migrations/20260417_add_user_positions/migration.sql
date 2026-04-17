-- CreateTable
CREATE TABLE "UserPosition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "snapshotLabel" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "positionId" TEXT NOT NULL,
    "title" TEXT,
    "dataJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserPosition_userId_snapshotDate_idx" ON "UserPosition"("userId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "UserPosition_userId_snapshotId_positionId_key" ON "UserPosition"("userId", "snapshotId", "positionId");

-- AddForeignKey
ALTER TABLE "UserPosition" ADD CONSTRAINT "UserPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;