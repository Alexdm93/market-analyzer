-- Auditoría del suavizado de percentiles.
--
-- Cada informe generado deja la foto de su matriz: la cruda del mercado, la
-- que vio el cliente y qué hizo el algoritmo. Sirve para revisar meses más
-- tarde si las líneas de tendencia ajustaban bien.
--
-- ADITIVA: una tabla nueva, nada más.

CREATE TABLE IF NOT EXISTS "AuditoriaSuavizado" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "snapshotLabel" TEXT NOT NULL DEFAULT '',
    "grupoComparacion" TEXT NOT NULL DEFAULT '',
    "filtros" TEXT NOT NULL DEFAULT '',
    "metrica" TEXT NOT NULL DEFAULT '',
    "datosJson" TEXT NOT NULL,
    "generadoPor" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditoriaSuavizado_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    ALTER TABLE "AuditoriaSuavizado"
        ADD CONSTRAINT "AuditoriaSuavizado_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "AuditoriaSuavizado_companyId_createdAt_idx"
    ON "AuditoriaSuavizado"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditoriaSuavizado_snapshotId_createdAt_idx"
    ON "AuditoriaSuavizado"("snapshotId", "createdAt");
