-- Una empresa puede tener autorizados VARIOS informes de beneficios.
--
-- Arranca como uno solo (`beneficiosInformeId`) y resultó que una empresa
-- puede comprar el del mercado general y el de su sector. Pasa a lista, con
-- la misma forma que `generalSnapshotIds`: un arreglo JSON en texto.
--
-- ADITIVA: agrega la columna nueva y se trae lo que hubiera en la vieja. La
-- columna `beneficiosInformeId` queda ahí sin usarse; borrarla, junto con su
-- clave foránea y su índice, es opcional y va comentado al final.

ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "beneficiosInformeIds" TEXT NOT NULL DEFAULT '[]';

-- Lo que ya estuviera asignado pasa a ser una lista de uno.
UPDATE "Company"
   SET "beneficiosInformeIds" = '["' || "beneficiosInformeId" || '"]'
 WHERE "beneficiosInformeId" IS NOT NULL
   AND "beneficiosInformeIds" = '[]';

-- Limpieza, cuando quieras:
-- ALTER TABLE "Company" DROP CONSTRAINT IF EXISTS "Company_beneficiosInformeId_fkey";
-- DROP INDEX IF EXISTS "Company_beneficiosInformeId_idx";
-- ALTER TABLE "Company" DROP COLUMN IF EXISTS "beneficiosInformeId";
