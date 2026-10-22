-- La solicitud de acceso cambia dos preguntas.
--
-- "¿Qué necesitas del Market Analyzer?" se convierte en "¿A qué se dedica la
-- empresa?", que es lo que de verdad le sirve al admin para decidir. Se
-- renombra la columna en vez de crear otra para no perder lo ya escrito.
--
-- Y se agrega por dónde se enteró de nosotros.

ALTER TABLE "SolicitudAcceso" RENAME COLUMN "mensaje" TO "actividad";

ALTER TABLE "SolicitudAcceso"
    ADD COLUMN IF NOT EXISTS "comoSeEntero" TEXT NOT NULL DEFAULT '';
