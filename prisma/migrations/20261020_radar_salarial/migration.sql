-- Radar Salarial: reporte suelto de un cargo o un grado, con cupo trimestral.
--
-- ADITIVA: agrega dos columnas a Company y crea una tabla nueva. No altera ni
-- borra nada existente.
-- IDEMPOTENTE: se puede correr más de una vez sin efecto ni error.

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "radarEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "radarCupoTrimestral" INTEGER;

CREATE TABLE IF NOT EXISTS "RadarInforme" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "generadoPor" TEXT NOT NULL DEFAULT '',
    "snapshotId" TEXT NOT NULL,
    "snapshotLabel" TEXT NOT NULL DEFAULT '',
    "modo" TEXT NOT NULL,
    "trimestre" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "datosJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadarInforme_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RadarInforme_companyId_trimestre_idx"
    ON "RadarInforme"("companyId", "trimestre");

CREATE INDEX IF NOT EXISTS "RadarInforme_companyId_createdAt_idx"
    ON "RadarInforme"("companyId", "createdAt");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RadarInforme_companyId_fkey') THEN
        ALTER TABLE "RadarInforme"
            ADD CONSTRAINT "RadarInforme_companyId_fkey"
            FOREIGN KEY ("companyId") REFERENCES "Company"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
