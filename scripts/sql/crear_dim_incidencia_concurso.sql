-- =============================================================================
-- Migración: dim_incidencias + dim_concurso + dim_concurso_cph + dim_concurso_ceetps
-- Fase 8 — Sprint actual
-- Ejecutar manualmente con: psql $DATABASE_URL -f scripts/sql/crear_dim_incidencia_concurso.sql
-- =============================================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE "TipoIncidencia" AS ENUM ('baja_gestionable', 'puesto_nuevo_gestionable');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EstadoIncidencia" AS ENUM ('pendiente', 'resuelta', 'descartada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- dim_concurso (padre)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dim_concurso (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo             "TipoConcurso" NOT NULL,
  motivo_origen    VARCHAR(30) NOT NULL,
  efector          VARCHAR(20) NOT NULL REFERENCES dim_efectores(sigla),
  codigo_registro  VARCHAR(10) NOT NULL,
  literal_puesto   VARCHAR(200) NOT NULL,
  especialidad     VARCHAR(200),
  codigo_cargo     VARCHAR(30),
  estado           VARCHAR(20) NOT NULL DEFAULT 'no_iniciado',
  observaciones    TEXT,
  sesion_id        UUID REFERENCES dim_carga_sesiones(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dim_concurso_tipo_estado    ON dim_concurso(tipo, estado);
CREATE INDEX IF NOT EXISTS idx_dim_concurso_efector_cr     ON dim_concurso(efector, codigo_registro);
CREATE INDEX IF NOT EXISTS idx_dim_concurso_sesion         ON dim_concurso(sesion_id);

-- -----------------------------------------------------------------------------
-- dim_incidencias
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dim_incidencias (
  id               UUID             NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo             "TipoIncidencia" NOT NULL,
  estado           "EstadoIncidencia" NOT NULL DEFAULT 'pendiente',
  sesion_id        UUID             NOT NULL REFERENCES dim_carga_sesiones(id),
  id_sial_rol      VARCHAR(12),
  codigo_registro  VARCHAR(10)      NOT NULL,
  efector          VARCHAR(20)      NOT NULL REFERENCES dim_efectores(sigla),
  literal_puesto   VARCHAR(200)     NOT NULL,
  especialidad     VARCHAR(200),
  cuil             VARCHAR(11),
  codigo_cargo     VARCHAR(30),
  concurso_id      UUID             UNIQUE REFERENCES dim_concurso(id),
  resolucion       VARCHAR(500),
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dim_incidencias_sesion      ON dim_incidencias(sesion_id);
CREATE INDEX IF NOT EXISTS idx_dim_incidencias_tipo_estado ON dim_incidencias(tipo, estado);
CREATE INDEX IF NOT EXISTS idx_dim_incidencias_efector_cr  ON dim_incidencias(efector, codigo_registro);
CREATE INDEX IF NOT EXISTS idx_dim_incidencias_id_sial_rol ON dim_incidencias(id_sial_rol);

-- -----------------------------------------------------------------------------
-- dim_concurso_cph (hijo CPH — Etapa 1)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dim_concurso_cph (
  id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  concurso_id       UUID        NOT NULL UNIQUE REFERENCES dim_concurso(id) ON DELETE CASCADE,
  ee_baja           VARCHAR(150),
  fecha_baja        DATE,
  ee_concurso       VARCHAR(150),
  fecha_ee_concurso DATE,
  if_autorizacion   VARCHAR(150),
  fecha_autorizacion DATE,
  tipo_gestion      VARCHAR(20),
  sub_estado        VARCHAR(50),
  sub_estado_3      VARCHAR(50),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- dim_concurso_ceetps (hijo CEETPS — Etapa 1)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dim_concurso_ceetps (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  concurso_id          UUID        NOT NULL UNIQUE REFERENCES dim_concurso(id) ON DELETE CASCADE,
  expediente_concurso  VARCHAR(150),
  fecha_caratulacion   DATE,
  if_autorizacion      VARCHAR(150),
  fecha_autorizacion   DATE,
  tipo_gestion         VARCHAR(20),
  sub_estado           VARCHAR(50),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger updated_at para las 3 tablas nuevas
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_dim_incidencias_updated_at
    BEFORE UPDATE ON dim_incidencias
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_dim_concurso_updated_at
    BEFORE UPDATE ON dim_concurso
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_dim_concurso_cph_updated_at
    BEFORE UPDATE ON dim_concurso_cph
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_dim_concurso_ceetps_updated_at
    BEFORE UPDATE ON dim_concurso_ceetps
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
