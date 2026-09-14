-- Hallazgo 2026-09-14: los modelos BajaSialSnapshot/BajaSialDiff/BajaSialRegistro
-- estaban en schema.prisma (y bajas-sial.service.ts ya los usaba activamente
-- con SQL crudo) pero NUNCA se había generado la migración que crea estas 3
-- tablas — `prisma migrate status` decía "up to date" porque no hay ninguna
-- migración pendiente, simplemente nunca existió una para esto. Cualquier
-- carga de "Bajas Salud" fallaba con `relation "baja_sial_snapshots" does
-- not exist` (42P01). De paso, el modelo BajaSialDiff le faltaban 4 columnas
-- (cod_registro, hospital, especialidad, cod_reg) que el propio
-- procesarSnapshot()/getBajasSialDiffService() ya usan en su INSERT/SELECT
-- — sin esto la carga hubiera fallado igual, un paso más adelante, con
-- "column does not exist". Se agregan acá también.
--
-- DDL calcada de la convención usada en 0_init/migration.sql para
-- padron_snapshots/padron_diff (mismo patrón de tipos, mismos nombres de
-- constraint).

CREATE TABLE "baja_sial_snapshots" (
    "id" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "fecha_archivo" DATE NOT NULL,
    "total_registros" INTEGER NOT NULL DEFAULT 0,
    "nuevas" INTEGER NOT NULL DEFAULT 0,
    "salidas" INTEGER NOT NULL DEFAULT 0,
    "modificadas" INTEGER NOT NULL DEFAULT 0,
    "estado" "EstadoSnapshot" NOT NULL DEFAULT 'procesando',
    "error_msg" TEXT,
    "procesado_por" UUID,
    "aprobado_por" UUID,
    "aprobado_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "baja_sial_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "baja_sial_diffs" (
    "id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "tipo" "TipoDiff" NOT NULL,
    "cargo" VARCHAR(30) NOT NULL,
    "cuil" VARCHAR(20) NOT NULL,
    "ayn" VARCHAR(200) NOT NULL,
    "escalafon" VARCHAR(100),
    "lit_puesto" VARCHAR(200),
    "mot_baja" VARCHAR(200),
    "cargo_hasta" DATE,
    "existe_en_personas" BOOLEAN NOT NULL DEFAULT false,
    "tiene_ocup_activa" BOOLEAN NOT NULL DEFAULT false,
    "cod_registro" VARCHAR(30),
    "hospital" VARCHAR(20),
    "especialidad" VARCHAR(200),
    "cod_reg" VARCHAR(10),
    "campo" VARCHAR(100),
    "valor_anterior" TEXT,
    "valor_nuevo" TEXT,

    CONSTRAINT "baja_sial_diffs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "baja_sial_registros" (
    "id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "cargo" VARCHAR(30) NOT NULL,
    "cuil" VARCHAR(20) NOT NULL,
    "ayn" VARCHAR(200) NOT NULL,
    "num_doc" VARCHAR(20),
    "sexo" VARCHAR(1),
    "fec_nacim" DATE,
    "edad" INTEGER,
    "cod_rep" VARCHAR(20),
    "desc_rep" VARCHAR(200),
    "escalafon" VARCHAR(100),
    "regimen" VARCHAR(100),
    "sit_rev" VARCHAR(100),
    "cod_reg" VARCHAR(20),
    "lit_cod_reg" VARCHAR(200),
    "puesto" VARCHAR(20),
    "lit_puesto" VARCHAR(200),
    "cod_agrup" VARCHAR(20),
    "lit_agrup" VARCHAR(200),
    "cargo_desde" DATE,
    "cargo_hasta" DATE,
    "doc_resp_alta" VARCHAR(200),
    "doc_resp_baja" VARCHAR(200),
    "mot_baja" VARCHAR(200),
    "car_codigo" VARCHAR(50),
    "funcion" VARCHAR(100),

    CONSTRAINT "baja_sial_registros_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "baja_sial_diffs_snapshot_id_idx" ON "baja_sial_diffs"("snapshot_id");
CREATE INDEX "baja_sial_diffs_tipo_idx" ON "baja_sial_diffs"("tipo");
CREATE INDEX "baja_sial_diffs_cuil_idx" ON "baja_sial_diffs"("cuil");

CREATE INDEX "baja_sial_registros_snapshot_id_idx" ON "baja_sial_registros"("snapshot_id");
CREATE INDEX "baja_sial_registros_cuil_idx" ON "baja_sial_registros"("cuil");

ALTER TABLE "baja_sial_diffs" ADD CONSTRAINT "baja_sial_diffs_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "baja_sial_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "baja_sial_registros" ADD CONSTRAINT "baja_sial_registros_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "baja_sial_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
