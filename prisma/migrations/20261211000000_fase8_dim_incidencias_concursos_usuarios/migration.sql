-- Fase 8: formalizar todos los cambios aplicados con db push desde 20261210000000.
-- Incluye: renames de tablas, nuevos enums, nuevas tablas dim_incidencias/dim_concurso/dim_gestionables,
-- tablas pou_ocupacion_puestos, pou_decreto renombradas, dim_sync_corridas, dim_organigrama_uploads.

-- ─── 1. Renames de tablas ─────────────────────────────────────────────────────
ALTER TABLE IF EXISTS "usuarios"                   RENAME TO "dim_usuarios";
ALTER TABLE IF EXISTS "organigramas"               RENAME TO "dim_organigrama";
ALTER TABLE IF EXISTS "organigrama_uploads"        RENAME TO "dim_organigrama_uploads";
ALTER TABLE IF EXISTS "pou"                        RENAME TO "dim_pou_ocupacion";
ALTER TABLE IF EXISTS "sync_corridas"              RENAME TO "dim_sync_corridas";
ALTER TABLE IF EXISTS "pou_decreto_mapeo_hospital" RENAME TO "dim_pou_decreto_mapeo";
ALTER TABLE IF EXISTS "pou_decreto"                RENAME TO "dim_pou_decreto";
ALTER TABLE IF EXISTS "pou_decreto_cargas"         RENAME TO "dim_pou_decreto_cargas";

-- Renombrar índices de organigramas
ALTER INDEX IF EXISTS "organigramas_codigo_reparticion_key"      RENAME TO "dim_organigrama_codigo_reparticion_key";
ALTER INDEX IF EXISTS "organigramas_sigla_idx"                   RENAME TO "dim_organigrama_sigla_idx";
ALTER INDEX IF EXISTS "organigramas_padre_idx"                   RENAME TO "dim_organigrama_padre_idx";
ALTER INDEX IF EXISTS "organigramas_universo_totalizador_idx"    RENAME TO "dim_organigrama_universo_totalizador_idx";

-- Renombrar índices de pou
ALTER INDEX IF EXISTS "pou_sigla_idx"                            RENAME TO "dim_pou_ocupacion_sigla_idx";
ALTER INDEX IF EXISTS "pou_sigla_perfil_especialidad_key"        RENAME TO "dim_pou_ocupacion_sigla_perfil_especialidad_key";

-- Renombrar índices de pou_decreto
ALTER INDEX IF EXISTS "pou_decreto_sigla_perfil_especialidad_key" RENAME TO "dim_pou_decreto_sigla_perfil_especialidad_key";
ALTER INDEX IF EXISTS "pou_decreto_sigla_idx"                     RENAME TO "dim_pou_decreto_sigla_idx";
ALTER INDEX IF EXISTS "pou_decreto_cargas_created_at_idx"         RENAME TO "dim_pou_decreto_cargas_created_at_idx";

-- Renombrar índices de pou_decreto_mapeo_hospital
ALTER INDEX IF EXISTS "pou_decreto_mapeo_hospital_sigla_idx"      RENAME TO "dim_pou_decreto_mapeo_sigla_idx";

-- ─── 2. Enums nuevos ─────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "DimTipoIncidencia" AS ENUM ('baja_gestionable', 'puesto_nuevo_gestionable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DimEstadoIncidencia" AS ENUM ('pendiente', 'resuelta', 'descartada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3. dim_gestionables ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "dim_gestionables" (
  "codigo_registro"  VARCHAR(10)  NOT NULL,
  "tipo_concurso"    VARCHAR(10),
  "genera_cargos"    BOOLEAN      NOT NULL DEFAULT true,
  "supervisada"      BOOLEAN      NOT NULL DEFAULT false,
  "regimen_override" VARCHAR(100),
  "activo"           BOOLEAN      NOT NULL DEFAULT true,
  CONSTRAINT "dim_gestionables_pkey" PRIMARY KEY ("codigo_registro"),
  CONSTRAINT "dim_gestionables_codigo_registro_fkey"
    FOREIGN KEY ("codigo_registro") REFERENCES "dim_carreras"("codigo_registro")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "dim_gestionables_tipo_concurso_idx" ON "dim_gestionables"("tipo_concurso");

-- ─── 4. dim_pou_ocupacion_puestos ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "dim_pou_ocupacion_puestos" (
  "id"                    UUID        NOT NULL DEFAULT gen_random_uuid(),
  "pou_id"                UUID        NOT NULL,
  "id_sial_rol"           VARCHAR(30) NOT NULL,
  "vinculado_manualmente" BOOLEAN     NOT NULL DEFAULT false,
  CONSTRAINT "dim_pou_ocupacion_puestos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dim_pou_ocupacion_puestos_pou_id_id_sial_rol_key" UNIQUE ("pou_id", "id_sial_rol"),
  CONSTRAINT "dim_pou_ocupacion_puestos_pou_id_fkey"
    FOREIGN KEY ("pou_id") REFERENCES "dim_pou_ocupacion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "dim_pou_ocupacion_puestos_id_sial_rol_fkey"
    FOREIGN KEY ("id_sial_rol") REFERENCES "dim_puestos"("id_sial_rol")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "dim_pou_ocupacion_puestos_id_sial_rol_idx" ON "dim_pou_ocupacion_puestos"("id_sial_rol");

-- ─── 5. pou_especialidad_mapeo ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "pou_especialidad_mapeo" (
  "especialidad_pou"   VARCHAR(100) NOT NULL,
  "especialidad_cargo" VARCHAR(200) NOT NULL,
  CONSTRAINT "pou_especialidad_mapeo_pkey" PRIMARY KEY ("especialidad_pou", "especialidad_cargo")
);

-- ─── 6. dim_organigrama_uploads (FK actualizada al nuevo nombre) ──────────────
-- La tabla ya fue renombrada en el paso 1. Solo aseguramos que la FK apunte a dim_usuarios.
-- Si la FK ya existe con el nombre viejo, la recreamos.
ALTER TABLE "dim_organigrama_uploads"
  DROP CONSTRAINT IF EXISTS "organigrama_uploads_subido_por_id_fkey";
ALTER TABLE "dim_organigrama_uploads"
  ADD CONSTRAINT "dim_organigrama_uploads_subido_por_id_fkey"
    FOREIGN KEY ("subido_por_id") REFERENCES "dim_usuarios"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 7. dim_incidencias ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "dim_incidencias" (
  "id"              UUID                  NOT NULL DEFAULT gen_random_uuid(),
  "tipo"            "DimTipoIncidencia"   NOT NULL,
  "estado"          "DimEstadoIncidencia" NOT NULL DEFAULT 'pendiente',
  "sesion_id"       UUID                  NOT NULL,
  "id_sial_rol"     VARCHAR(12),
  "codigo_registro" VARCHAR(10)           NOT NULL,
  "efector"         VARCHAR(20)           NOT NULL,
  "literal_puesto"  VARCHAR(200)          NOT NULL,
  "especialidad"    VARCHAR(200),
  "cuil"            VARCHAR(11),
  "codigo_cargo"    VARCHAR(30),
  "concurso_id"     UUID                  UNIQUE,
  "resolucion"      VARCHAR(500),
  "created_at"      TIMESTAMPTZ           NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ           NOT NULL DEFAULT now(),
  CONSTRAINT "dim_incidencias_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dim_incidencias_sesion_id_fkey"
    FOREIGN KEY ("sesion_id") REFERENCES "dim_carga_sesiones"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "dim_incidencias_efector_fkey"
    FOREIGN KEY ("efector") REFERENCES "dim_efectores"("sigla")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "dim_incidencias_sesion_id_idx"           ON "dim_incidencias"("sesion_id");
CREATE INDEX IF NOT EXISTS "dim_incidencias_tipo_estado_idx"          ON "dim_incidencias"("tipo", "estado");
CREATE INDEX IF NOT EXISTS "dim_incidencias_efector_cod_registro_idx" ON "dim_incidencias"("efector", "codigo_registro");
CREATE INDEX IF NOT EXISTS "dim_incidencias_id_sial_rol_idx"          ON "dim_incidencias"("id_sial_rol");

-- ─── 8. dim_concurso ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "dim_concurso" (
  "id"                 UUID            NOT NULL DEFAULT gen_random_uuid(),
  "tipo"               "TipoConcurso"  NOT NULL,
  "motivo_origen"      VARCHAR(30)     NOT NULL,
  "efector"            VARCHAR(20)     NOT NULL,
  "codigo_registro"    VARCHAR(10)     NOT NULL,
  "literal_puesto"     VARCHAR(200)    NOT NULL,
  "especialidad"       VARCHAR(200),
  "codigo_cargo"       VARCHAR(30),
  "estado"             VARCHAR(20)     NOT NULL DEFAULT 'no_iniciado',
  "observaciones"      TEXT,
  "sesion_id"          UUID,
  "concurso_legacy_id" UUID,
  "created_at"         TIMESTAMPTZ     NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ     NOT NULL DEFAULT now(),
  CONSTRAINT "dim_concurso_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dim_concurso_efector_fkey"
    FOREIGN KEY ("efector") REFERENCES "dim_efectores"("sigla")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "dim_concurso_sesion_id_fkey"
    FOREIGN KEY ("sesion_id") REFERENCES "dim_carga_sesiones"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "dim_concurso_tipo_estado_idx"         ON "dim_concurso"("tipo", "estado");
CREATE INDEX IF NOT EXISTS "dim_concurso_efector_cod_registro_idx" ON "dim_concurso"("efector", "codigo_registro");
CREATE INDEX IF NOT EXISTS "dim_concurso_sesion_id_idx"            ON "dim_concurso"("sesion_id");
CREATE INDEX IF NOT EXISTS "dim_concurso_concurso_legacy_id_idx"   ON "dim_concurso"("concurso_legacy_id");

-- FK diferida: dim_incidencias.concurso_id → dim_concurso.id
ALTER TABLE "dim_incidencias"
  ADD CONSTRAINT "dim_incidencias_concurso_id_fkey"
    FOREIGN KEY ("concurso_id") REFERENCES "dim_concurso"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 9. dim_concurso_cph ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "dim_concurso_cph" (
  "id"                     UUID        NOT NULL DEFAULT gen_random_uuid(),
  "concurso_id"            UUID        NOT NULL UNIQUE,
  "ee_baja"                VARCHAR(150),
  "fecha_baja"             DATE,
  "ee_concurso"            VARCHAR(150),
  "fecha_ee_concurso"      DATE,
  "if_autorizacion"        VARCHAR(150),
  "fecha_autorizacion"     DATE,
  "tipo_gestion"           VARCHAR(20),
  "sub_estado"             VARCHAR(50),
  "sub_estado_3"           VARCHAR(50),
  "concurso_cph_legacy_id" UUID,
  "created_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "dim_concurso_cph_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dim_concurso_cph_concurso_id_fkey"
    FOREIGN KEY ("concurso_id") REFERENCES "dim_concurso"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "dim_concurso_cph_legacy_id_idx" ON "dim_concurso_cph"("concurso_cph_legacy_id");

-- ─── 10. dim_concurso_ceetps ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "dim_concurso_ceetps" (
  "id"                       UUID        NOT NULL DEFAULT gen_random_uuid(),
  "concurso_id"              UUID        NOT NULL UNIQUE,
  "expediente_concurso"      VARCHAR(150),
  "fecha_caratulacion"       DATE,
  "if_autorizacion"          VARCHAR(150),
  "fecha_autorizacion"       DATE,
  "tipo_gestion"             VARCHAR(20),
  "sub_estado"               VARCHAR(50),
  "concurso_ceetps_legacy_id" UUID,
  "created_at"               TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "dim_concurso_ceetps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dim_concurso_ceetps_concurso_id_fkey"
    FOREIGN KEY ("concurso_id") REFERENCES "dim_concurso"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "dim_concurso_ceetps_legacy_id_idx" ON "dim_concurso_ceetps"("concurso_ceetps_legacy_id");

-- ─── 11. Columna jornada_enfermeria en dim_cargos ─────────────────────────────
ALTER TABLE "dim_cargos" ADD COLUMN IF NOT EXISTS "jornada_enfermeria" VARCHAR(3);
