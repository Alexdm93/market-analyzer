-- Cupo de informes del Estudio Especializado.
--
-- El cupo no limita descargas: limita cuántos cortes de data distintos puede
-- configurar una empresa en un estudio. Los que ya configuró los baja las
-- veces que quiera. Al agotarlo pide autorización al admin.
--
-- ADITIVA: dos columnas con valor por defecto y una tabla nueva.

ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "estudioCuposJson" TEXT NOT NULL DEFAULT '{}';

-- La huella de la configuración: dos informes con la misma no son dos cortes.
ALTER TABLE "EstudioInforme"
    ADD COLUMN IF NOT EXISTS "configHash" TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS "SolicitudInforme" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "snapshotLabel" TEXT NOT NULL DEFAULT '',
    "motivo" TEXT NOT NULL DEFAULT '',
    "status" "EditRequestStatus" NOT NULL DEFAULT 'PENDING',
    "otorgados" INTEGER NOT NULL DEFAULT 0,
    "resueltoPor" TEXT NOT NULL DEFAULT '',
    "resueltoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SolicitudInforme_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    ALTER TABLE "SolicitudInforme"
        ADD CONSTRAINT "SolicitudInforme_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "SolicitudInforme_status_companyId_idx"
    ON "SolicitudInforme"("status", "companyId");
CREATE INDEX IF NOT EXISTS "SolicitudInforme_companyId_snapshotId_idx"
    ON "SolicitudInforme"("companyId", "snapshotId");
