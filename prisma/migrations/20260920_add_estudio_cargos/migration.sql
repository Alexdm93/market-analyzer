-- Estudio Especializado: lista de cargos propia de cada empresa y sus
-- equivalencias por corte.
--
-- ADITIVA: solo crea dos tablas nuevas. No altera ni borra ninguna tabla
-- existente, así que no puede afectar la data de los cortes.
--
-- IDEMPOTENTE: se puede correr más de una vez sin efecto ni error.

CREATE TABLE IF NOT EXISTS "EstudioCargo" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "departamento" TEXT NOT NULL DEFAULT '',
    "tituloCargo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "hayGrade" INTEGER,
    "capriFamily" TEXT,
    "dataJson" TEXT NOT NULL DEFAULT '{}',
    "origen" TEXT NOT NULL DEFAULT 'manual',
    "origenSnapshotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstudioCargo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EstudioEquivalencia" (
    "id" TEXT NOT NULL,
    "estudioCargoId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "departamento" TEXT NOT NULL DEFAULT '',
    "tituloCatalogo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstudioEquivalencia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EstudioCargo_companyId_idx"
    ON "EstudioCargo"("companyId");

CREATE UNIQUE INDEX IF NOT EXISTS "EstudioCargo_companyId_tituloCargo_key"
    ON "EstudioCargo"("companyId", "tituloCargo");

CREATE INDEX IF NOT EXISTS "EstudioEquivalencia_snapshotId_idx"
    ON "EstudioEquivalencia"("snapshotId");

CREATE UNIQUE INDEX IF NOT EXISTS "EstudioEquivalencia_estudioCargoId_snapshotId_key"
    ON "EstudioEquivalencia"("estudioCargoId", "snapshotId");

-- Postgres no admite IF NOT EXISTS al agregar una constraint, así que se
-- comprueba antes.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EstudioCargo_companyId_fkey') THEN
        ALTER TABLE "EstudioCargo"
            ADD CONSTRAINT "EstudioCargo_companyId_fkey"
            FOREIGN KEY ("companyId") REFERENCES "Company"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EstudioEquivalencia_estudioCargoId_fkey') THEN
        ALTER TABLE "EstudioEquivalencia"
            ADD CONSTRAINT "EstudioEquivalencia_estudioCargoId_fkey"
            FOREIGN KEY ("estudioCargoId") REFERENCES "EstudioCargo"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
