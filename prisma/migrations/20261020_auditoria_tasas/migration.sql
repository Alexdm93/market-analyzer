-- Control de calidad: deja registradas las tasas con las que se emitió cada
-- informe, para poder reproducirlo y explicar de dónde salió cada cifra.
--
-- ADITIVA: agrega una columna con valor por defecto. No altera ni borra nada.
-- IDEMPOTENTE: se puede correr más de una vez sin efecto ni error.

ALTER TABLE "AuditoriaSuavizado"
    ADD COLUMN IF NOT EXISTS "tasasJson" TEXT NOT NULL DEFAULT '{}';
