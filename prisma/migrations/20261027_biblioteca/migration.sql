-- Biblioteca de Descargas: la ficha de cada documento.
--
-- El archivo en sí vive en el bucket privado de Supabase Storage; acá va su
-- ficha y el control de acceso. Aditiva: tabla nueva e índices.

CREATE TABLE IF NOT EXISTS "DocumentoBiblioteca" (
    "id"           TEXT NOT NULL,
    "nombre"       TEXT NOT NULL,
    "descripcion"  TEXT NOT NULL DEFAULT '',
    "ruta"         TEXT NOT NULL,
    "tipo"         TEXT NOT NULL DEFAULT '',
    "tamano"       INTEGER NOT NULL DEFAULT 0,
    "visibilidad"  TEXT NOT NULL DEFAULT 'asignado',
    "empresasJson" TEXT NOT NULL DEFAULT '[]',
    "publicado"    BOOLEAN NOT NULL DEFAULT true,
    "subidoPor"    TEXT NOT NULL DEFAULT '',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoBiblioteca_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentoBiblioteca_ruta_key"
    ON "DocumentoBiblioteca" ("ruta");

CREATE INDEX IF NOT EXISTS "DocumentoBiblioteca_visibilidad_createdAt_idx"
    ON "DocumentoBiblioteca" ("visibilidad", "createdAt");
