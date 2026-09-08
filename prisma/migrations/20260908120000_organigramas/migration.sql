-- Migración de funcionalidad legacy (dotacion-rrhh -> v2): estructura jerárquica
-- de organigrama. Tabla nueva, vacía hasta correr scripts/import_organigrama.mjs
-- (~4.300 filas, dump real ubicado en dotacion-rrhh/Doc/schema_only.sql). Ver
-- Doc/Planificacion/Sprints/POST_SPRINT_14_migracion_legacy_organigrama.md.

-- CreateTable
CREATE TABLE "organigramas" (
    "id" UUID NOT NULL,
    "lvl" INTEGER NOT NULL,
    "tipo" VARCHAR(50) NOT NULL,
    "codigo_reparticion" VARCHAR(20) NOT NULL,
    "universo_totalizador" VARCHAR(100),
    "regimen_empleo" VARCHAR(200),
    "desc_rep" VARCHAR(200),
    "sigla" VARCHAR(20) NOT NULL,
    "padre" VARCHAR(100),
    "path" VARCHAR(600) NOT NULL,
    "path_nombres" VARCHAR(1200) NOT NULL,

    CONSTRAINT "organigramas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organigramas_codigo_reparticion_key" ON "organigramas"("codigo_reparticion");

-- CreateIndex
CREATE INDEX "organigramas_sigla_idx" ON "organigramas"("sigla");

-- CreateIndex
CREATE INDEX "organigramas_padre_idx" ON "organigramas"("padre");

-- CreateIndex
CREATE INDEX "organigramas_universo_totalizador_idx" ON "organigramas"("universo_totalizador");
