CREATE TYPE "SnapshotProcessingStatus" AS ENUM ('IN_REVIEW', 'PROCESSED');

ALTER TABLE "UserSnapshot"
ADD COLUMN "status" "SnapshotProcessingStatus" NOT NULL DEFAULT 'IN_REVIEW';