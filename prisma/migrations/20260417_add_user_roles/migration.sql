-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- Add role column to users with a safe default for future signups
ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';

-- Promote existing users so the current installation keeps access to admin routes
UPDATE "User" SET "role" = 'ADMIN';