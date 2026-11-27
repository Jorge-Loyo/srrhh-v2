-- Wizard CEETPS: asignación manual de jurado (Etapa 2), inscriptos y pasos del
-- concurso (Etapa 3) y campos nuevos de la Etapa 5 (Designación).
-- 14 columnas nullable/con default en concursos_ceetps + 2 tablas nuevas.
--
-- Idempotente: ADD COLUMN / CREATE TABLE IF NOT EXISTS, así re-ejecutarla no falla.
--
-- MANUAL: NO ejecutar con `prisma migrate dev/deploy` contra ninguna base real
-- (Render corre `prisma migrate deploy` en cada arranque; ver
-- Doc/Desarrollo/DEPLOY_PRODUCCION.md sección 7, trampa 1). Se aplica a mano con
-- psql y se marca resuelta ANTES del push:
--   psql "$NEON_DIRECT" -f prisma/migrations/20261118000000_ceetps_jurado_inscriptos_etapa5/migration.sql
--   DATABASE_URL="$NEON_DIRECT" npx prisma migrate resolve --applied 20261118000000_ceetps_jurado_inscriptos_etapa5 --schema=./prisma/schema.prisma

-- ── Etapa 5: Designación ─────────────────────────────────────────────────────
-- (dispo_designacion ya existe y se reutiliza como "Disposición de designación")
ALTER TABLE concursos_ceetps ADD COLUMN IF NOT EXISTS carga_documentacion      BOOLEAN;
ALTER TABLE concursos_ceetps ADD COLUMN IF NOT EXISTS tramite_designacion      VARCHAR(10);
ALTER TABLE concursos_ceetps ADD COLUMN IF NOT EXISTS fecha_apto_medico        DATE;
ALTER TABLE concursos_ceetps ADD COLUMN IF NOT EXISTS fecha_dispo_designacion  DATE;
ALTER TABLE concursos_ceetps ADD COLUMN IF NOT EXISTS resolucion_convalidacion VARCHAR(500);
ALTER TABLE concursos_ceetps ADD COLUMN IF NOT EXISTS proyecto_resolucion      BOOLEAN;
ALTER TABLE concursos_ceetps ADD COLUMN IF NOT EXISTS reso_a_la_firma          BOOLEAN;
ALTER TABLE concursos_ceetps ADD COLUMN IF NOT EXISTS fecha_resolucion         DATE;

-- ── Etapa 2: lugares del jurado ──────────────────────────────────────────────
ALTER TABLE concursos_ceetps ADD COLUMN IF NOT EXISTS jurado_cant_titulares    INTEGER;
ALTER TABLE concursos_ceetps ADD COLUMN IF NOT EXISTS jurado_cant_suplentes    INTEGER;

-- ── Etapa 3: puntajes mínimos por paso y cronograma ─────────────────────────
ALTER TABLE concursos_ceetps ADD COLUMN IF NOT EXISTS puntaje_minimo_examen      DOUBLE PRECISION;
ALTER TABLE concursos_ceetps ADD COLUMN IF NOT EXISTS puntaje_minimo_cv          DOUBLE PRECISION;
ALTER TABLE concursos_ceetps ADD COLUMN IF NOT EXISTS puntaje_minimo_entrevista  DOUBLE PRECISION;
ALTER TABLE concursos_ceetps ADD COLUMN IF NOT EXISTS cronograma                 JSONB NOT NULL DEFAULT '{}';

-- ── Jurado asignado ──────────────────────────────────────────────────────────
-- rol: 'titular' | 'suplente'. Una persona no puede estar dos veces en el mismo concurso.
CREATE TABLE IF NOT EXISTS miembros_jurado_ceetps (
  id                 UUID         NOT NULL DEFAULT gen_random_uuid(),
  concurso_ceetps_id UUID         NOT NULL REFERENCES concursos_ceetps(id) ON DELETE CASCADE,
  persona_id         UUID         NOT NULL REFERENCES personas(id),
  rol                VARCHAR(10)  NOT NULL,
  orden              INTEGER      NOT NULL,
  apellido_nombre    VARCHAR(200) NOT NULL,
  cuil               VARCHAR(11)  NOT NULL,
  hospital_nombre    VARCHAR(200),
  puesto             VARCHAR(200),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT miembros_jurado_ceetps_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS miembros_jurado_ceetps_concurso_ceetps_id_persona_id_key
  ON miembros_jurado_ceetps (concurso_ceetps_id, persona_id);
CREATE INDEX IF NOT EXISTS miembros_jurado_ceetps_concurso_ceetps_id_idx
  ON miembros_jurado_ceetps (concurso_ceetps_id);

-- ── Inscriptos y su recorrido por los pasos ──────────────────────────────────
-- admitido NULL = pendiente. "Pasó el paso" no se guarda: se calcula contra los mínimos.
CREATE TABLE IF NOT EXISTS inscriptos_ceetps (
  id                               UUID         NOT NULL DEFAULT gen_random_uuid(),
  concurso_ceetps_id               UUID         NOT NULL REFERENCES concursos_ceetps(id) ON DELETE CASCADE,
  apellido                         VARCHAR(120) NOT NULL,
  nombre                           VARCHAR(120) NOT NULL,
  dni                              VARCHAR(20),
  cuil                             VARCHAR(20),
  email                            VARCHAR(200),
  telefono                         VARCHAR(40),
  observaciones                    TEXT,
  entrego_documentacion            BOOLEAN      NOT NULL DEFAULT false,
  admitido                         BOOLEAN,
  motivo_no_admision               TEXT,
  reclamo_admisibilidad            BOOLEAN      NOT NULL DEFAULT false,
  resultado_reclamo_admisibilidad  TEXT,
  presento_examen                  BOOLEAN      NOT NULL DEFAULT false,
  nota_examen                      DOUBLE PRECISION,
  reclamo_examen                   BOOLEAN      NOT NULL DEFAULT false,
  resultado_reclamo_examen         TEXT,
  puntaje_cv                       DOUBLE PRECISION,
  puntaje_entrevista               DOUBLE PRECISION,
  orden_merito                     INTEGER,
  created_at                       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at                       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT inscriptos_ceetps_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS inscriptos_ceetps_concurso_ceetps_id_idx ON inscriptos_ceetps (concurso_ceetps_id);
CREATE INDEX IF NOT EXISTS inscriptos_ceetps_cuil_idx ON inscriptos_ceetps (cuil);
