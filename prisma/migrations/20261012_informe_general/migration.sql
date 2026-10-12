-- Informe General de Tendencias Salariales + informes de beneficios no salariales.
--
-- Todo aditivo: columnas nuevas con valor por defecto y una tabla nueva.
-- Ninguna empresa queda habilitada por el solo hecho de correr esto.

-- El informe general se habilita por empresa y por corte, igual que el
-- Estudio Especializado.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "generalEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "generalSnapshotIds" TEXT NOT NULL DEFAULT '[]';

-- Los PDF de beneficios: pocos, de un par de megas, guardados en base64 como
-- la imagen de un anuncio.
CREATE TABLE IF NOT EXISTS "InformeBeneficios" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL DEFAULT '',
    "archivo" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InformeBeneficios_pkey" PRIMARY KEY ("id")
);

-- Cuál de esos informes puede bajar cada empresa. Es global, no por corte.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "beneficiosInformeId" TEXT;

DO $$
BEGIN
    ALTER TABLE "Company"
        ADD CONSTRAINT "Company_beneficiosInformeId_fkey"
        FOREIGN KEY ("beneficiosInformeId") REFERENCES "InformeBeneficios"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Company_beneficiosInformeId_idx" ON "Company"("beneficiosInformeId");
