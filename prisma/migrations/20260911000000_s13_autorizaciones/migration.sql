-- S13-1: Tabla autorizaciones + enums TipoAutorizacion / EstadoAutorizacion
-- Autorización genérica para acciones que requieren aprobación de un superior.
-- resolverPorRolSlug es string (sin FK) igual que Notificacion.rolSlug.
-- Para CPH con cambio estructural se crean dos en cadena (director → sgrasv).

CREATE TYPE "TipoAutorizacion" AS ENUM ('concurso_cph', 'alta_cargo');
CREATE TYPE "EstadoAutorizacion" AS ENUM ('pendiente', 'aprobada', 'rechazada');

CREATE TABLE "autorizaciones" (
  "id"                    UUID         NOT NULL DEFAULT gen_random_uuid(),
  "tipo"                  "TipoAutorizacion" NOT NULL,
  "referencia_id"         UUID         NOT NULL,
  "referencia_tipo"       VARCHAR(50)  NOT NULL,
  "estado"                "EstadoAutorizacion" NOT NULL DEFAULT 'pendiente',
  "resolver_por_rol_slug" VARCHAR(40)  NOT NULL,
  "solicitado_por_id"     UUID,
  "resuelto_por_id"       UUID,
  "observaciones"         TEXT,
  "created_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "autorizaciones_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "autorizaciones_solicitado_por_id_fkey"
    FOREIGN KEY ("solicitado_por_id") REFERENCES "usuarios"("id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "autorizaciones_resuelto_por_id_fkey"
    FOREIGN KEY ("resuelto_por_id") REFERENCES "usuarios"("id") ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX "autorizaciones_referencia_id_idx" ON "autorizaciones"("referencia_id");
CREATE INDEX "autorizaciones_rol_estado_idx"    ON "autorizaciones"("resolver_por_rol_slug", "estado");

-- Permiso autorizaciones.resolver para sgrasv (ya existe para director y admin
-- desde la migración RBAC — ver 20260901120000_rbac_dinamico)
INSERT INTO "permisos" ("modulo", "accion", "descripcion")
VALUES ('autorizaciones', 'resolver_sgrasv', 'Aprobar o rechazar una autorización (sgrasv)')
ON CONFLICT ("modulo", "accion") DO NOTHING;

INSERT INTO "role_permisos" ("role_id", "permiso_id")
SELECT r.id, p.id
FROM "roles" r, "permisos" p
WHERE r.slug = 'sgrasv' AND p.modulo = 'autorizaciones' AND p.accion = 'resolver_sgrasv'
ON CONFLICT DO NOTHING;
