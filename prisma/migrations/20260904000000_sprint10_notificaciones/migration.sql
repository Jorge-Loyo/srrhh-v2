-- Sprint 10: Notificaciones persistidas
-- Enum TipoNotificacion + tabla notificaciones

CREATE TYPE "TipoNotificacion" AS ENUM (
  'concurso_estancado',
  'baja_pendiente',
  'autorizacion_pendiente',
  'autorizacion_resuelta'
);

CREATE TABLE "notificaciones" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "tipo"        "TipoNotificacion" NOT NULL,
  "rol_slug"    VARCHAR(40) NOT NULL,
  "titulo"      VARCHAR(200) NOT NULL,
  "mensaje"     TEXT        NOT NULL,
  "origen_tipo" VARCHAR(50),
  "origen_id"   UUID,
  "origen_key"  VARCHAR(200) UNIQUE,
  "leida"       BOOLEAN     NOT NULL DEFAULT false,
  "creada_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "leida_at"    TIMESTAMPTZ,

  CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notificaciones_rol_slug_leida_idx" ON "notificaciones"("rol_slug", "leida");
CREATE INDEX "notificaciones_tipo_idx"            ON "notificaciones"("tipo");
CREATE INDEX "notificaciones_creada_at_idx"       ON "notificaciones"("creada_at");
