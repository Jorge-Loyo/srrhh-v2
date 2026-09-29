/*
  Warnings:

  - You are about to drop the column `cuil_y_rol` on the `ocupaciones` table. All the data in the column will be lost.
  - You are about to drop the column `diasGuardia` on the `ocupaciones` table. All the data in the column will be lost.
  - You are about to drop the `postulantes` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `postulantes_concurso` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "EstadoBaja" ADD VALUE 'resolucion_a_la_firma';

-- DropForeignKey
ALTER TABLE "concursos_cph_desiertos" DROP CONSTRAINT "concursos_cph_desiertos_concurso_cph_id_fkey";

-- DropForeignKey
ALTER TABLE "concursos_cph_desiertos" DROP CONSTRAINT "concursos_cph_desiertos_registrado_por_id_fkey";

-- DropForeignKey
ALTER TABLE "etiquetas_baja" DROP CONSTRAINT "etiquetas_baja_baja_id_fkey";

-- DropForeignKey
ALTER TABLE "etiquetas_baja" DROP CONSTRAINT "etiquetas_baja_etiqueta_id_fkey";

-- DropForeignKey
ALTER TABLE "etiquetas_cargo" DROP CONSTRAINT "etiquetas_cargo_cargo_id_fkey";

-- DropForeignKey
ALTER TABLE "etiquetas_cargo" DROP CONSTRAINT "etiquetas_cargo_etiqueta_id_fkey";

-- DropForeignKey
ALTER TABLE "etiquetas_concurso_cph" DROP CONSTRAINT "etiquetas_concurso_cph_concurso_cph_id_fkey";

-- DropForeignKey
ALTER TABLE "etiquetas_concurso_cph" DROP CONSTRAINT "etiquetas_concurso_cph_etiqueta_id_fkey";

-- DropForeignKey
ALTER TABLE "etiquetas_solicitud_alta" DROP CONSTRAINT "etiquetas_solicitud_alta_etiqueta_id_fkey";

-- DropForeignKey
ALTER TABLE "etiquetas_solicitud_alta" DROP CONSTRAINT "etiquetas_solicitud_alta_solicitud_alta_id_fkey";

-- DropForeignKey
ALTER TABLE "inscriptos_concurso" DROP CONSTRAINT "inscriptos_concurso_concurso_cph_id_fkey";

-- DropForeignKey
ALTER TABLE "miembros_jurado_sorteados" DROP CONSTRAINT "miembros_jurado_sorteados_persona_id_fkey";

-- DropForeignKey
ALTER TABLE "miembros_jurado_sorteados" DROP CONSTRAINT "miembros_jurado_sorteados_sorteo_jurado_id_fkey";

-- DropForeignKey
ALTER TABLE "orden_merito_integrantes" DROP CONSTRAINT "omi_concurso_cph_designado_fkey";

-- DropForeignKey
ALTER TABLE "orden_merito_integrantes" DROP CONSTRAINT "omi_orden_merito_fkey";

-- DropForeignKey
ALTER TABLE "orden_merito_integrantes" DROP CONSTRAINT "omi_persona_fkey";

-- DropForeignKey
ALTER TABLE "ordenes_merito" DROP CONSTRAINT "ordenes_merito_concurso_cph_fkey";

-- DropForeignKey
ALTER TABLE "organigrama_uploads" DROP CONSTRAINT "organigrama_uploads_subido_por_id_fkey";

-- DropForeignKey
ALTER TABLE "postulantes" DROP CONSTRAINT "postulantes_persona_fkey";

-- DropForeignKey
ALTER TABLE "postulantes" DROP CONSTRAINT "postulantes_persona_id_fkey";

-- DropForeignKey
ALTER TABLE "postulantes_concurso" DROP CONSTRAINT "pc_concurso_cph_fkey";

-- DropForeignKey
ALTER TABLE "postulantes_concurso" DROP CONSTRAINT "pc_postulante_fkey";

-- DropForeignKey
ALTER TABLE "postulantes_concurso" DROP CONSTRAINT "postulantes_concurso_concurso_cph_id_fkey";

-- DropForeignKey
ALTER TABLE "postulantes_concurso" DROP CONSTRAINT "postulantes_concurso_postulante_id_fkey";

-- DropForeignKey
ALTER TABLE "solicitudes_alta" DROP CONSTRAINT "solicitudes_alta_baja_origen_id_fkey";

-- DropForeignKey
ALTER TABLE "sorteos_jurado" DROP CONSTRAINT "sorteos_jurado_concurso_cph_id_fkey";

-- DropForeignKey
ALTER TABLE "sorteos_jurado" DROP CONSTRAINT "sorteos_jurado_confirmado_por_id_fkey";

-- DropForeignKey
ALTER TABLE "sorteos_jurado" DROP CONSTRAINT "sorteos_jurado_generado_por_id_fkey";

-- AlterTable
ALTER TABLE "concursos_cph" ALTER COLUMN "insal_rechazados" DROP DEFAULT;

-- AlterTable
ALTER TABLE "concursos_cph_desiertos" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "etiquetas" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "inscriptos_concurso" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "jornadas_sorteo" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "miembros_jurado_sorteados" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ocupaciones" DROP COLUMN "cuil_y_rol",
DROP COLUMN "diasGuardia",
ADD COLUMN     "cuil" VARCHAR(11),
ADD COLUMN     "dias_guardia" TEXT[];

-- AlterTable
ALTER TABLE "orden_merito_integrantes" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ordenes_merito" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "organigrama_uploads" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "personas" ADD COLUMN     "apellido" VARCHAR(120),
ADD COLUMN     "nombre" VARCHAR(120);

-- AlterTable
ALTER TABLE "sorteos_jurado" ALTER COLUMN "id" DROP DEFAULT;

-- DropTable
DROP TABLE "postulantes";

-- DropTable
DROP TABLE "postulantes_concurso";

-- DropEnum
DROP TYPE "EstadoPostulacion";

-- CreateTable
CREATE TABLE "roles_persona" (
    "id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,
    "id_sial" VARCHAR(50) NOT NULL,
    "nro_rol" VARCHAR(10),
    "cargo_id" UUID,
    "desde" DATE,
    "hasta" DATE,
    "id_sial_rol" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "roles_persona_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "roles_persona_persona_id_idx" ON "roles_persona"("persona_id");

-- CreateIndex
CREATE INDEX "roles_persona_id_sial_idx" ON "roles_persona"("id_sial");

-- CreateIndex
CREATE INDEX "roles_persona_cargo_id_idx" ON "roles_persona"("cargo_id");

-- AddForeignKey
ALTER TABLE "organigrama_uploads" ADD CONSTRAINT "organigrama_uploads_subido_por_id_fkey" FOREIGN KEY ("subido_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles_persona" ADD CONSTRAINT "roles_persona_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles_persona" ADD CONSTRAINT "roles_persona_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_cph_desiertos" ADD CONSTRAINT "concursos_cph_desiertos_concurso_cph_id_fkey" FOREIGN KEY ("concurso_cph_id") REFERENCES "concursos_cph"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_cph_desiertos" ADD CONSTRAINT "concursos_cph_desiertos_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sorteos_jurado" ADD CONSTRAINT "sorteos_jurado_concurso_cph_id_fkey" FOREIGN KEY ("concurso_cph_id") REFERENCES "concursos_cph"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sorteos_jurado" ADD CONSTRAINT "sorteos_jurado_generado_por_id_fkey" FOREIGN KEY ("generado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sorteos_jurado" ADD CONSTRAINT "sorteos_jurado_confirmado_por_id_fkey" FOREIGN KEY ("confirmado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miembros_jurado_sorteados" ADD CONSTRAINT "miembros_jurado_sorteados_sorteo_jurado_id_fkey" FOREIGN KEY ("sorteo_jurado_id") REFERENCES "sorteos_jurado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miembros_jurado_sorteados" ADD CONSTRAINT "miembros_jurado_sorteados_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscriptos_concurso" ADD CONSTRAINT "inscriptos_concurso_concurso_cph_id_fkey" FOREIGN KEY ("concurso_cph_id") REFERENCES "concursos_cph"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_alta" ADD CONSTRAINT "solicitudes_alta_baja_origen_id_fkey" FOREIGN KEY ("baja_origen_id") REFERENCES "bajas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiquetas_cargo" ADD CONSTRAINT "etiquetas_cargo_etiqueta_id_fkey" FOREIGN KEY ("etiqueta_id") REFERENCES "etiquetas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiquetas_cargo" ADD CONSTRAINT "etiquetas_cargo_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiquetas_concurso_cph" ADD CONSTRAINT "etiquetas_concurso_cph_etiqueta_id_fkey" FOREIGN KEY ("etiqueta_id") REFERENCES "etiquetas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiquetas_concurso_cph" ADD CONSTRAINT "etiquetas_concurso_cph_concurso_cph_id_fkey" FOREIGN KEY ("concurso_cph_id") REFERENCES "concursos_cph"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiquetas_baja" ADD CONSTRAINT "etiquetas_baja_etiqueta_id_fkey" FOREIGN KEY ("etiqueta_id") REFERENCES "etiquetas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiquetas_baja" ADD CONSTRAINT "etiquetas_baja_baja_id_fkey" FOREIGN KEY ("baja_id") REFERENCES "bajas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiquetas_solicitud_alta" ADD CONSTRAINT "etiquetas_solicitud_alta_etiqueta_id_fkey" FOREIGN KEY ("etiqueta_id") REFERENCES "etiquetas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiquetas_solicitud_alta" ADD CONSTRAINT "etiquetas_solicitud_alta_solicitud_alta_id_fkey" FOREIGN KEY ("solicitud_alta_id") REFERENCES "solicitudes_alta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_cargos_cargo_base_id" RENAME TO "cargos_cargo_base_id_idx";

-- RenameIndex
ALTER INDEX "idx_cargos_cargo_retenido_id" RENAME TO "cargos_cargo_retenido_id_idx";
