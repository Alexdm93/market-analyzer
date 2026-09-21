-- Estudio Especializado: informes generados por el cliente.
--
-- ADITIVA: crea una tabla nueva. No altera ni borra nada existente.
-- IDEMPOTENTE: se puede correr más de una vez sin efecto ni error.

CREATE TABLE IF NOT EXISTS "EstudioInforme" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "snapshotLabel" TEXT NOT NULL DEFAULT '',
    "datosJson" TEXT NOT NULL,
    "generadoPor" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstudioInforme_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EstudioInforme_companyId_createdAt_idx"
    ON "EstudioInforme"("companyId", "createdAt");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EstudioInforme_companyId_fkey') THEN
        ALTER TABLE "EstudioInforme"
            ADD CONSTRAINT "EstudioInforme_companyId_fkey"
            FOREIGN KEY ("companyId") REFERENCES "Company"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
