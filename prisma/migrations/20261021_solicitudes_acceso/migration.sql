-- Solicitudes de acceso: el formulario público de "Solicitar acceso".
--
-- Aditiva: crea una tabla nueva y nada más. El enum "EditRequestStatus" ya
-- existe en la base —lo usan EditRequest y SolicitudInforme— así que acá solo
-- se referencia.

CREATE TABLE IF NOT EXISTS "SolicitudAcceso" (
    "id"              TEXT NOT NULL,
    "nombre"          TEXT NOT NULL,
    "correo"          TEXT NOT NULL,
    "cargo"           TEXT NOT NULL DEFAULT '',
    "telefono"        TEXT NOT NULL DEFAULT '',
    "empresa"         TEXT NOT NULL,
    "sector"          TEXT NOT NULL DEFAULT '',
    "clasificacion"   TEXT NOT NULL DEFAULT '',
    "headcount"       TEXT NOT NULL DEFAULT '',
    "localidad"       TEXT NOT NULL DEFAULT '',
    "mensaje"         TEXT NOT NULL DEFAULT '',
    "status"          "EditRequestStatus" NOT NULL DEFAULT 'PENDING',
    "motivoRechazo"   TEXT NOT NULL DEFAULT '',
    "resueltoPor"     TEXT NOT NULL DEFAULT '',
    "resueltoEn"      TIMESTAMP(3),
    "usuarioCreadoId" TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolicitudAcceso_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SolicitudAcceso_status_createdAt_idx"
    ON "SolicitudAcceso" ("status", "createdAt");

CREATE INDEX IF NOT EXISTS "SolicitudAcceso_correo_idx"
    ON "SolicitudAcceso" ("correo");
