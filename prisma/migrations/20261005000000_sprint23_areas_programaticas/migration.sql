-- CreateEnum
CREATE TYPE "NivelCesac" AS ENUM ('unidad', 'unidad_con_seccion');

-- CreateEnum
CREATE TYPE "TipoUnidadFija" AS ENUM ('cemar', 'centro_odontologico_infantil', 'red_odontologia');

-- CreateEnum
CREATE TYPE "NivelOrganicoUnidadFija" AS ENUM ('division', 'division_con_seccion', 'unidad', 'fuera_de_nivel');

-- AlterTable
ALTER TABLE "cargos" ADD COLUMN     "cesac_id" UUID,
ADD COLUMN     "unidad_fija_id" UUID;

-- CreateTable
CREATE TABLE "areas_programaticas" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "hospital_id" UUID NOT NULL,
    "codigo_reparticion" VARCHAR(20),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "areas_programaticas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cesacs" (
    "id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "nombre" VARCHAR(150),
    "direccion" VARCHAR(200),
    "barrio" VARCHAR(100),
    "nivel" "NivelCesac" NOT NULL,
    "area_programatica_id" UUID NOT NULL,
    "codigo_reparticion" VARCHAR(20),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cesacs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidades_fijas_apayc" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "tipo" "TipoUnidadFija" NOT NULL,
    "nivel_organico" "NivelOrganicoUnidadFija" NOT NULL,
    "codigo_reparticion" VARCHAR(20),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "unidades_fijas_apayc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "areas_programaticas_nombre_key" ON "areas_programaticas"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "areas_programaticas_hospital_id_key" ON "areas_programaticas"("hospital_id");

-- CreateIndex
CREATE UNIQUE INDEX "areas_programaticas_codigo_reparticion_key" ON "areas_programaticas"("codigo_reparticion");

-- CreateIndex
CREATE UNIQUE INDEX "cesacs_numero_key" ON "cesacs"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "cesacs_codigo_reparticion_key" ON "cesacs"("codigo_reparticion");

-- CreateIndex
CREATE INDEX "cesacs_area_programatica_id_idx" ON "cesacs"("area_programatica_id");

-- CreateIndex
CREATE UNIQUE INDEX "unidades_fijas_apayc_codigo_reparticion_key" ON "unidades_fijas_apayc"("codigo_reparticion");

-- CreateIndex
CREATE INDEX "cargos_cesac_id_idx" ON "cargos"("cesac_id");

-- CreateIndex
CREATE INDEX "cargos_unidad_fija_id_idx" ON "cargos"("unidad_fija_id");

-- AddForeignKey
ALTER TABLE "areas_programaticas" ADD CONSTRAINT "areas_programaticas_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cesacs" ADD CONSTRAINT "cesacs_area_programatica_id_fkey" FOREIGN KEY ("area_programatica_id") REFERENCES "areas_programaticas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_cesac_id_fkey" FOREIGN KEY ("cesac_id") REFERENCES "cesacs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_unidad_fija_id_fkey" FOREIGN KEY ("unidad_fija_id") REFERENCES "unidades_fijas_apayc"("id") ON DELETE SET NULL ON UPDATE CASCADE;

