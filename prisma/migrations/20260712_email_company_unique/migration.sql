-- Drop the old single-column unique constraint on email
DROP INDEX IF EXISTS "User_email_key";

-- Add composite unique constraint: same email allowed across different companies
ALTER TABLE "User" ADD CONSTRAINT "User_email_companyId_key" UNIQUE ("email", "companyId");
