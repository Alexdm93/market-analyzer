-- Centro de Ayuda y Academia C&B: los videotutoriales.
--
-- Aditiva: una tabla nueva y su índice, nada que toque lo existente.

CREATE TABLE IF NOT EXISTS "RecursoFormacion" (
    "id"          TEXT NOT NULL,
    "categoria"   TEXT NOT NULL,
    "titulo"      TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "videoUrl"    TEXT NOT NULL,
    "publicado"   BOOLEAN NOT NULL DEFAULT false,
    "orden"       INTEGER NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecursoFormacion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RecursoFormacion_categoria_publicado_orden_idx"
    ON "RecursoFormacion" ("categoria", "publicado", "orden");
