-- AlterTable
ALTER TABLE "concursos_cph" ADD COLUMN     "carga_documentacion" BOOLEAN,
ADD COLUMN     "cargo_sial" VARCHAR(50),
ADD COLUMN     "dispo_desierta" VARCHAR(50),
ADD COLUMN     "fecha_baja" DATE,
ADD COLUMN     "fecha_dispo_desierta" DATE,
ADD COLUMN     "fecha_ee_concurso" DATE,
ADD COLUMN     "fecha_resolucion" DATE,
ADD COLUMN     "proyecto_resolucion" BOOLEAN,
ADD COLUMN     "reso_a_la_firma" BOOLEAN,
ADD COLUMN     "sub_estado_3" VARCHAR(50);

-- CreateIndex
CREATE INDEX "concursos_cph_sub_estado_idx" ON "concursos_cph"("sub_estado");

