-- =============================================================================
-- Migration: etiquetas_om_postulantes
-- Agrega:
--   1. Etiqueta (catálogo global) + tablas N:M para Cargo, ConcursoCph, Baja, SolicitudAlta
--   2. OrdenMerito + OrdenMeritoIntegrante
--   3. Postulante + PostulanteConcurso
--   4. Campos nuevos en concursos_cph: ifacs, insal, cambio_especialidad, q_inscriptos
--   5. Drop de etiqueta (campo libre) en solicitudes_alta → reemplazado por N:M
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ETIQUETAS
-- -----------------------------------------------------------------------------

CREATE TABLE "etiquetas" (
  "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
  "nombre"     VARCHAR(100) NOT NULL,
  "color"      VARCHAR(20),
  "activo"     BOOLEAN     NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "etiquetas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "etiquetas_nombre_key" UNIQUE ("nombre")
);

-- N:M Etiqueta ↔ Cargo
CREATE TABLE "etiquetas_cargo" (
  "etiqueta_id" UUID NOT NULL,
  "cargo_id"    UUID NOT NULL,

  CONSTRAINT "etiquetas_cargo_pkey" PRIMARY KEY ("etiqueta_id", "cargo_id"),
  CONSTRAINT "etiquetas_cargo_etiqueta_id_fkey" FOREIGN KEY ("etiqueta_id") REFERENCES "etiquetas"("id") ON DELETE CASCADE,
  CONSTRAINT "etiquetas_cargo_cargo_id_fkey"    FOREIGN KEY ("cargo_id")    REFERENCES "cargos"("id")    ON DELETE CASCADE
);

-- N:M Etiqueta ↔ ConcursoCph
CREATE TABLE "etiquetas_concurso_cph" (
  "etiqueta_id"     UUID NOT NULL,
  "concurso_cph_id" UUID NOT NULL,

  CONSTRAINT "etiquetas_concurso_cph_pkey" PRIMARY KEY ("etiqueta_id", "concurso_cph_id"),
  CONSTRAINT "etiquetas_concurso_cph_etiqueta_id_fkey"     FOREIGN KEY ("etiqueta_id")     REFERENCES "etiquetas"("id")      ON DELETE CASCADE,
  CONSTRAINT "etiquetas_concurso_cph_concurso_cph_id_fkey" FOREIGN KEY ("concurso_cph_id") REFERENCES "concursos_cph"("id") ON DELETE CASCADE
);

-- N:M Etiqueta ↔ Baja
CREATE TABLE "etiquetas_baja" (
  "etiqueta_id" UUID NOT NULL,
  "baja_id"     UUID NOT NULL,

  CONSTRAINT "etiquetas_baja_pkey" PRIMARY KEY ("etiqueta_id", "baja_id"),
  CONSTRAINT "etiquetas_baja_etiqueta_id_fkey" FOREIGN KEY ("etiqueta_id") REFERENCES "etiquetas"("id") ON DELETE CASCADE,
  CONSTRAINT "etiquetas_baja_baja_id_fkey"     FOREIGN KEY ("baja_id")     REFERENCES "bajas"("id")     ON DELETE CASCADE
);

-- N:M Etiqueta ↔ SolicitudAlta (reemplaza campo libre)
CREATE TABLE "etiquetas_solicitud_alta" (
  "etiqueta_id"      UUID NOT NULL,
  "solicitud_alta_id" UUID NOT NULL,

  CONSTRAINT "etiquetas_solicitud_alta_pkey" PRIMARY KEY ("etiqueta_id", "solicitud_alta_id"),
  CONSTRAINT "etiquetas_solicitud_alta_etiqueta_id_fkey"      FOREIGN KEY ("etiqueta_id")      REFERENCES "etiquetas"("id")        ON DELETE CASCADE,
  CONSTRAINT "etiquetas_solicitud_alta_solicitud_alta_id_fkey" FOREIGN KEY ("solicitud_alta_id") REFERENCES "solicitudes_alta"("id") ON DELETE CASCADE
);

-- Migrar etiquetas existentes del campo libre de solicitudes_alta
-- Cada valor único de etiqueta se convierte en una fila en etiquetas,
-- y se crea la relación N:M correspondiente.
INSERT INTO "etiquetas" ("nombre")
SELECT DISTINCT "etiqueta"
FROM "solicitudes_alta"
WHERE "etiqueta" IS NOT NULL AND "etiqueta" <> ''
ON CONFLICT ("nombre") DO NOTHING;

INSERT INTO "etiquetas_solicitud_alta" ("etiqueta_id", "solicitud_alta_id")
SELECT e.id, sa.id
FROM "solicitudes_alta" sa
JOIN "etiquetas" e ON e.nombre = sa.etiqueta
WHERE sa.etiqueta IS NOT NULL AND sa.etiqueta <> '';

-- Drop del campo libre (ya migrado)
ALTER TABLE "solicitudes_alta" DROP COLUMN IF EXISTS "etiqueta";

-- -----------------------------------------------------------------------------
-- 2. ORDEN DE MÉRITO
-- -----------------------------------------------------------------------------

CREATE TYPE "EstadoOrdenMerito" AS ENUM ('vigente', 'prorrogada', 'vencida');

CREATE TABLE "ordenes_merito" (
  "id"               UUID                NOT NULL DEFAULT gen_random_uuid(),
  "concurso_cph_id"  UUID                NOT NULL,
  "especialidad"     VARCHAR(200)        NOT NULL,
  "puesto"           VARCHAR(200),
  "expediente"       VARCHAR(200),
  "fecha_publicacion" DATE               NOT NULL,
  "fecha_vencimiento" DATE               NOT NULL,  -- = fecha_publicacion + 6 meses
  "fecha_prorroga"   DATE,                           -- nullable = sin prórroga (+60 días)
  "estado"           "EstadoOrdenMerito" NOT NULL DEFAULT 'vigente',
  "observaciones"    TEXT,
  "created_at"       TIMESTAMPTZ         NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ         NOT NULL DEFAULT now(),

  CONSTRAINT "ordenes_merito_pkey"             PRIMARY KEY ("id"),
  CONSTRAINT "ordenes_merito_concurso_cph_fkey" FOREIGN KEY ("concurso_cph_id") REFERENCES "concursos_cph"("id")
);

CREATE INDEX "ordenes_merito_especialidad_estado_idx" ON "ordenes_merito"("especialidad", "estado");

CREATE TABLE "orden_merito_integrantes" (
  "id"                        UUID         NOT NULL DEFAULT gen_random_uuid(),
  "orden_merito_id"           UUID         NOT NULL,
  "persona_id"                UUID,                  -- nullable: puede no estar en padrón
  "cuil"                      VARCHAR(11)  NOT NULL,
  "apellido_nombre"           VARCHAR(200) NOT NULL,
  "especialidad"              VARCHAR(200),
  "posicion"                  INTEGER      NOT NULL,
  "designado"                 BOOLEAN      NOT NULL DEFAULT false,
  "concurso_cph_designado_id" UUID,                  -- qué concurso lo designó
  "created_at"                TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "orden_merito_integrantes_pkey"              PRIMARY KEY ("id"),
  CONSTRAINT "omi_orden_merito_fkey"                      FOREIGN KEY ("orden_merito_id")           REFERENCES "ordenes_merito"("id")  ON DELETE CASCADE,
  CONSTRAINT "omi_persona_fkey"                           FOREIGN KEY ("persona_id")                REFERENCES "personas"("id"),
  CONSTRAINT "omi_concurso_cph_designado_fkey"            FOREIGN KEY ("concurso_cph_designado_id") REFERENCES "concursos_cph"("id"),
  CONSTRAINT "omi_orden_posicion_unique"                  UNIQUE ("orden_merito_id", "posicion"),
  CONSTRAINT "omi_orden_cuil_unique"                      UNIQUE ("orden_merito_id", "cuil")
);

CREATE INDEX "omi_cuil_idx" ON "orden_merito_integrantes"("cuil");

-- -----------------------------------------------------------------------------
-- 3. POSTULANTES
-- -----------------------------------------------------------------------------

CREATE TYPE "EstadoPostulacion" AS ENUM ('inscripto', 'admitido', 'rechazado');

CREATE TABLE "postulantes" (
  "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
  "persona_id"     UUID,                  -- nullable: puede no estar en padrón
  "cuil"           VARCHAR(11)  NOT NULL,
  "apellido_nombre" VARCHAR(200) NOT NULL,
  "especialidad"   VARCHAR(200),
  "es_externo"     BOOLEAN      NOT NULL DEFAULT false,
  "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "postulantes_pkey"       PRIMARY KEY ("id"),
  CONSTRAINT "postulantes_cuil_key"   UNIQUE ("cuil"),
  CONSTRAINT "postulantes_persona_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id")
);

-- persona_id también unique cuando no es null (un persona = un postulante)
CREATE UNIQUE INDEX "postulantes_persona_id_unique" ON "postulantes"("persona_id") WHERE "persona_id" IS NOT NULL;

CREATE TABLE "postulantes_concurso" (
  "id"               UUID                NOT NULL DEFAULT gen_random_uuid(),
  "postulante_id"    UUID                NOT NULL,
  "concurso_cph_id"  UUID                NOT NULL,
  "fecha_postulacion" DATE               NOT NULL,
  "estado"           "EstadoPostulacion" NOT NULL DEFAULT 'inscripto',
  "observaciones"    TEXT,
  "created_at"       TIMESTAMPTZ         NOT NULL DEFAULT now(),

  CONSTRAINT "postulantes_concurso_pkey"        PRIMARY KEY ("id"),
  CONSTRAINT "pc_postulante_fkey"               FOREIGN KEY ("postulante_id")   REFERENCES "postulantes"("id"),
  CONSTRAINT "pc_concurso_cph_fkey"             FOREIGN KEY ("concurso_cph_id") REFERENCES "concursos_cph"("id"),
  CONSTRAINT "pc_postulante_concurso_unique"    UNIQUE ("postulante_id", "concurso_cph_id")
);

CREATE INDEX "pc_concurso_cph_idx" ON "postulantes_concurso"("concurso_cph_id");

-- -----------------------------------------------------------------------------
-- 4. CAMPOS NUEVOS EN concursos_cph
-- -----------------------------------------------------------------------------

ALTER TABLE "concursos_cph"
  ADD COLUMN "ifacs"              VARCHAR(200),
  ADD COLUMN "insal"              VARCHAR(200),
  ADD COLUMN "cambio_especialidad" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "q_inscriptos"       INTEGER;
