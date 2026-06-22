-- Add telemetry tracking fields
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "UserWorkspace" ADD COLUMN "lastExportAt" TIMESTAMP(3);
