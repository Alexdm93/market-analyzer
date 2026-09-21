-- Estudio Especializado: a qué cargo reporta cada ocupante.
--
-- Lo pide la hoja "Mapeo de cargos" del informe especializado. Aplica solo a
-- este estudio: la captura del mercado no lo usa.
--
-- ADITIVA e IDEMPOTENTE: agrega una columna con valor por defecto. No altera
-- ninguna otra tabla ni toca la data de los cortes.

ALTER TABLE "EstudioCargo"
    ADD COLUMN IF NOT EXISTS "reportaA" TEXT NOT NULL DEFAULT '';
