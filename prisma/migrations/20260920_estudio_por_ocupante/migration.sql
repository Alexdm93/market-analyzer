-- Estudio Especializado: la fila pasa a ser el OCUPANTE, no el cargo.
--
-- En el estudio especializado una empresa puede tener tres analistas con
-- sueldos distintos, y el Análisis de Equidad Interna existe para compararlos.
-- El índice único por título lo impedía. La homologación, en cambio, es del
-- CARGO: los tres analistas comparan contra el mismo cargo del catálogo.
--
-- EstudioCargo se modifica sin perder nada. EstudioEquivalencia cambia de forma
-- y se recrea, por eso el guardia de abajo: si tuviera datos, aborta y no toca
-- nada.

-- ── Guardia ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "EstudioEquivalencia" LIMIT 1) THEN
        RAISE EXCEPTION 'EstudioEquivalencia tiene datos: no se recrea automáticamente. Avisar antes de continuar.';
    END IF;
END $$;

-- ── EstudioCargo: fuera el único por título, entra el ocupante ──────────────
DROP INDEX IF EXISTS "EstudioCargo_companyId_tituloCargo_key";

ALTER TABLE "EstudioCargo" ADD COLUMN IF NOT EXISTS "ocupanteId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "EstudioCargo_companyId_ocupanteId_key"
    ON "EstudioCargo"("companyId", "ocupanteId");

CREATE INDEX IF NOT EXISTS "EstudioCargo_companyId_tituloCargo_idx"
    ON "EstudioCargo"("companyId", "tituloCargo");

-- ── EstudioEquivalencia: pasa a ir por cargo ────────────────────────────────
DROP TABLE IF EXISTS "EstudioEquivalencia";

CREATE TABLE "EstudioEquivalencia" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tituloCargoKey" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "departamento" TEXT NOT NULL DEFAULT '',
    "tituloCatalogo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstudioEquivalencia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EstudioEquivalencia_companyId_tituloCargoKey_snapshotId_key"
    ON "EstudioEquivalencia"("companyId", "tituloCargoKey", "snapshotId");

CREATE INDEX "EstudioEquivalencia_snapshotId_idx"
    ON "EstudioEquivalencia"("snapshotId");

ALTER TABLE "EstudioEquivalencia"
    ADD CONSTRAINT "EstudioEquivalencia_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
