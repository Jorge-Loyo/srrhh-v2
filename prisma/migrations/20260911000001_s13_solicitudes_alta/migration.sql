-- S13-2: Tabla solicitudes_alta + enum SolicitudAltaEstado
-- Una solicitud NO es un Cargo hasta ser aprobada por el director.
-- Al aprobar: se generan los Cargo reales con código asignado.
-- Al rechazar: persiste para trazabilidad.

CREATE TYPE "SolicitudAltaEstado" AS ENUM ('pendiente', 'aprobada', 'rechazada');

CREATE TABLE "solicitudes_alta" (
  "id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
  "hospital_id"         UUID         NOT NULL,
  "escalafon_id"        UUID         NOT NULL,
  "codigo_registro_id"  UUID,
  "literal_puesto"      VARCHAR(200) NOT NULL,
  "especialidad"        VARCHAR(200),
  "agrupador"           VARCHAR(150),
  "unificador_puesto"   VARCHAR(200),
  "regimen"             VARCHAR(50),
  "expediente"          VARCHAR(150),
  "desde"               DATE,
  "cantidad"            INTEGER      NOT NULL DEFAULT 1,
  "estado"              "SolicitudAltaEstado" NOT NULL DEFAULT 'pendiente',
  "solicitado_por_id"   UUID,
  "cargos_creados_ids"  UUID[]       NOT NULL DEFAULT '{}',
  "observaciones"       TEXT,
  "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "solicitudes_alta_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "solicitudes_alta_hospital_id_fkey"
    FOREIGN KEY ("hospital_id") REFERENCES "hospitales"("id") ON UPDATE CASCADE,
  CONSTRAINT "solicitudes_alta_escalafon_id_fkey"
    FOREIGN KEY ("escalafon_id") REFERENCES "escalafones"("id") ON UPDATE CASCADE,
  CONSTRAINT "solicitudes_alta_codigo_registro_id_fkey"
    FOREIGN KEY ("codigo_registro_id") REFERENCES "codigos_registro"("id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "solicitudes_alta_solicitado_por_id_fkey"
    FOREIGN KEY ("solicitado_por_id") REFERENCES "usuarios"("id") ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX "solicitudes_alta_hospital_id_idx" ON "solicitudes_alta"("hospital_id");
CREATE INDEX "solicitudes_alta_estado_idx"      ON "solicitudes_alta"("estado");

-- Permisos para el módulo solicitudes-alta
INSERT INTO "permisos" ("modulo", "accion", "descripcion") VALUES
  ('solicitudes-alta', 'ver',    'Ver solicitudes de alta de cargo'),
  ('solicitudes-alta', 'crear',  'Crear una solicitud de alta de cargo')
ON CONFLICT ("modulo", "accion") DO NOTHING;

-- editor y concursales_cph pueden crear; director y admin pueden ver y resolver
INSERT INTO "role_permisos" ("role_id", "permiso_id")
SELECT r.id, p.id
FROM (VALUES
  ('admin',           'solicitudes-alta', 'ver'),
  ('admin',           'solicitudes-alta', 'crear'),
  ('editor',          'solicitudes-alta', 'ver'),
  ('editor',          'solicitudes-alta', 'crear'),
  ('director',        'solicitudes-alta', 'ver'),
  ('concursales_cph', 'solicitudes-alta', 'ver'),
  ('concursales_cph', 'solicitudes-alta', 'crear'),
  ('viewer',          'solicitudes-alta', 'ver')
) AS seed(role_slug, modulo, accion)
JOIN "roles" r ON r.slug = seed.role_slug
JOIN "permisos" p ON p.modulo = seed.modulo AND p.accion = seed.accion
ON CONFLICT DO NOTHING;
