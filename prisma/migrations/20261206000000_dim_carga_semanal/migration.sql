-- CreateEnum
CREATE TYPE "TipoCargaSemanal" AS ENUM ('cargos_salud', 'bajas_salud', 'arbol', 'ocupacion_pou');

-- CreateEnum
CREATE TYPE "EstadoCargaSemanal" AS ENUM ('procesando', 'completado', 'error');

-- CreateTable: sesión central por subida
CREATE TABLE "dim_carga_sesiones" (
    "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo"           "TipoCargaSemanal" NOT NULL,
    "fecha_archivo"  DATE,
    "estado"         "EstadoCargaSemanal" NOT NULL DEFAULT 'procesando',
    "error_msg"      TEXT,
    "informe"        JSONB,
    "usuario_id"     UUID,
    "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "finalizado_at"  TIMESTAMPTZ(6),

    CONSTRAINT "dim_carga_sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable: archivo físico por sesión
CREATE TABLE "dim_carga_archivos" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "sesion_id"  UUID NOT NULL,
    "filename"   VARCHAR(255) NOT NULL,
    "filas"      INTEGER NOT NULL DEFAULT 0,
    "sha256"     VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "dim_carga_archivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable: cambios campo a campo
CREATE TABLE "dim_carga_diffs" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "sesion_id"       UUID NOT NULL,
    "tabla_afectada"  VARCHAR(50) NOT NULL,
    "tipo_diff"       "TipoDiff" NOT NULL,
    "clave"           VARCHAR(50) NOT NULL,
    "campo"           VARCHAR(100),
    "valor_anterior"  TEXT,
    "valor_nuevo"     TEXT,

    CONSTRAINT "dim_carga_diffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: foto completa del padrón por carga
CREATE TABLE "dim_carga_padron_snapshot" (
    "id"               SERIAL NOT NULL,
    "sesion_id"        UUID NOT NULL,
    "fecha_corte"      DATE NOT NULL,
    "id_sial_rol"      VARCHAR(12) NOT NULL,
    "cuil"             VARCHAR(11),
    "apellido_nombre"  VARCHAR(200),
    "codigo_registro"  VARCHAR(10),
    "lit_cod_reg"      VARCHAR(150),
    "cod_rep"          VARCHAR(10),
    "desc_rep"         VARCHAR(200),
    "literal_puesto"   VARCHAR(200),
    "especialidad"     VARCHAR(200),
    "situacion_revista" VARCHAR(50),
    "jcat"             VARCHAR(10),
    "cargo_desde"      DATE,
    "cargo_hasta"      DATE,

    CONSTRAINT "dim_carga_padron_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable: métricas agregadas por período
CREATE TABLE "dim_carga_kpis_periodo" (
    "id"               SERIAL NOT NULL,
    "sesion_id"        UUID NOT NULL,
    "fecha_corte"      DATE NOT NULL,
    "anio"             INTEGER NOT NULL,
    "mes"              INTEGER NOT NULL,
    "codigo_registro"  VARCHAR(10),
    "efector"          VARCHAR(20),
    "total_activos"    INTEGER NOT NULL DEFAULT 0,
    "total_vacantes"   INTEGER NOT NULL DEFAULT 0,
    "total_nuevos"     INTEGER NOT NULL DEFAULT 0,
    "total_bajas"      INTEGER NOT NULL DEFAULT 0,
    "total_personas"   INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "dim_carga_kpis_periodo_pkey" PRIMARY KEY ("id")
);

-- FKs
ALTER TABLE "dim_carga_sesiones"
    ADD CONSTRAINT "dim_carga_sesiones_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "dim_carga_archivos"
    ADD CONSTRAINT "dim_carga_archivos_sesion_id_fkey"
    FOREIGN KEY ("sesion_id") REFERENCES "dim_carga_sesiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dim_carga_diffs"
    ADD CONSTRAINT "dim_carga_diffs_sesion_id_fkey"
    FOREIGN KEY ("sesion_id") REFERENCES "dim_carga_sesiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dim_carga_padron_snapshot"
    ADD CONSTRAINT "dim_carga_padron_snapshot_sesion_id_fkey"
    FOREIGN KEY ("sesion_id") REFERENCES "dim_carga_sesiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dim_carga_kpis_periodo"
    ADD CONSTRAINT "dim_carga_kpis_periodo_sesion_id_fkey"
    FOREIGN KEY ("sesion_id") REFERENCES "dim_carga_sesiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique
ALTER TABLE "dim_carga_kpis_periodo"
    ADD CONSTRAINT "dim_carga_kpis_periodo_fecha_corte_codigo_registro_efector_key"
    UNIQUE ("fecha_corte", "codigo_registro", "efector");

-- Índices dim_carga_sesiones
CREATE INDEX "dim_carga_sesiones_tipo_estado_idx"   ON "dim_carga_sesiones"("tipo", "estado");
CREATE INDEX "dim_carga_sesiones_fecha_archivo_idx" ON "dim_carga_sesiones"("fecha_archivo");
CREATE INDEX "dim_carga_sesiones_created_at_idx"    ON "dim_carga_sesiones"("created_at");

-- Índices dim_carga_archivos
CREATE INDEX "dim_carga_archivos_sesion_id_idx" ON "dim_carga_archivos"("sesion_id");

-- Índices dim_carga_diffs
CREATE INDEX "dim_carga_diffs_sesion_id_idx"              ON "dim_carga_diffs"("sesion_id");
CREATE INDEX "dim_carga_diffs_sesion_tabla_idx"           ON "dim_carga_diffs"("sesion_id", "tabla_afectada");
CREATE INDEX "dim_carga_diffs_sesion_tipo_idx"            ON "dim_carga_diffs"("sesion_id", "tipo_diff");
CREATE INDEX "dim_carga_diffs_clave_idx"                  ON "dim_carga_diffs"("clave");

-- Índices dim_carga_padron_snapshot
CREATE INDEX "dim_carga_padron_snapshot_sesion_id_idx"        ON "dim_carga_padron_snapshot"("sesion_id");
CREATE INDEX "dim_carga_padron_snapshot_fecha_corte_idx"      ON "dim_carga_padron_snapshot"("fecha_corte");
CREATE INDEX "dim_carga_padron_snapshot_cuil_idx"             ON "dim_carga_padron_snapshot"("cuil");
CREATE INDEX "dim_carga_padron_snapshot_id_sial_rol_idx"      ON "dim_carga_padron_snapshot"("id_sial_rol");
CREATE INDEX "dim_carga_padron_snapshot_codigo_registro_idx"  ON "dim_carga_padron_snapshot"("codigo_registro");
CREATE INDEX "dim_carga_padron_snapshot_cod_rep_idx"          ON "dim_carga_padron_snapshot"("cod_rep");
CREATE INDEX "dim_carga_padron_snapshot_fecha_cr_idx"         ON "dim_carga_padron_snapshot"("fecha_corte", "codigo_registro");
CREATE INDEX "dim_carga_padron_snapshot_cuil_fecha_idx"       ON "dim_carga_padron_snapshot"("cuil", "fecha_corte");

-- Índices dim_carga_kpis_periodo
CREATE INDEX "dim_carga_kpis_periodo_sesion_id_idx"       ON "dim_carga_kpis_periodo"("sesion_id");
CREATE INDEX "dim_carga_kpis_periodo_anio_mes_idx"        ON "dim_carga_kpis_periodo"("anio", "mes");
CREATE INDEX "dim_carga_kpis_periodo_codigo_registro_idx" ON "dim_carga_kpis_periodo"("codigo_registro");
CREATE INDEX "dim_carga_kpis_periodo_efector_idx"         ON "dim_carga_kpis_periodo"("efector");
