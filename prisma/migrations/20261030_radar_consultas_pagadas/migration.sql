-- Radar Salarial: consultas pagadas aparte del cupo gratuito del trimestre.
--
-- Las dos columnas son aditivas y traen valor por defecto, asi que no reescriben
-- ninguna fila existente ni cambian el comportamiento de lo que ya hay:
--
--   * "Company"."radarCreditos" arranca en 0 -> ninguna empresa tiene consultas
--     pagadas hasta que el admin se las cargue, igual que hoy.
--   * "RadarInforme"."conCreditos" arranca en false -> todos los informes ya
--     emitidos siguen contando contra el cupo trimestral, que es como se
--     contaron cuando se emitieron.
--
-- AC Consulting, 2026-10-30.

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "radarCreditos" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "RadarInforme"
  ADD COLUMN IF NOT EXISTS "conCreditos" BOOLEAN NOT NULL DEFAULT false;

-- El cupo del trimestre ahora cuenta solo los informes gratuitos, asi que la
-- consulta que lo calcula filtra por "conCreditos" = false. Este indice es el
-- que ya existia mas esa columna, para que siga resolviendose por indice.
CREATE INDEX IF NOT EXISTS "RadarInforme_companyId_trimestre_conCreditos_idx"
  ON "RadarInforme" ("companyId", "trimestre", "conCreditos");
