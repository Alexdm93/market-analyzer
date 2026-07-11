-- Step 1: Add COORDINATOR to the enum (can add values, cannot remove directly)
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'COORDINATOR';

-- Step 2: Convert any existing ANALYST users to COORDINATOR
UPDATE "User" SET "role" = 'COORDINATOR' WHERE "role" = 'ANALYST';

-- Step 3: Remove ANALYST from the enum by recreating the type
--   3a. Create replacement enum
CREATE TYPE "UserRole_new" AS ENUM ('USER', 'COORDINATOR', 'ADMIN');

--   3b. Swap the column to use the new type
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole_new"
  USING "role"::text::"UserRole_new";

--   3c. Drop the old enum and rename
DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";

-- Step 4: Add submittedAt to UserSnapshot
ALTER TABLE "UserSnapshot" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
