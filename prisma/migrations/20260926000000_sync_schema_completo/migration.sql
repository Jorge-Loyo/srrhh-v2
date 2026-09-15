-- CreateEnum
CREATE TYPE "MotivoConcurso" AS ENUM ('nuevo_cargo', 'alta_por_baja');

-- CreateEnum
CREATE TYPE "EstadoOrdenMerito" AS ENUM ('vigente', 'prorrogada', 'vencida');

-- CreateEnum
CREATE TYPE "EstadoPostulacion" AS ENUM ('inscripto', 'admitido', 'rechazado');

-- AlterEnum
BEGIN;
CREATE TYPE "EstadoConcursoCph_new" AS ENUM ('no_iniciado', 'activo', 'finalizado', 'suspendido');
ALTER TABLE "concursos_cph" ALTER COLUMN "estado" DROP DEFAULT;
ALTER TABLE "concursos_cph" ALTER COLUMN "estado" TYPE "EstadoConcursoCph_new" USING ("estado"::text::"EstadoConcursoCph_new");
ALTER TYPE "EstadoConcursoCph" RENAME TO "EstadoConcursoCph_old";
ALTER TYPE "EstadoConcursoCph_new" RENAME TO "EstadoConcursoCph";
DROP TYPE "EstadoConcursoCph_old";
ALTER TABLE "concursos_cph" ALTER COLUMN "estado" SET DEFAULT 'no_iniciado';
COMMIT;

-- AlterEnum
ALTER TYPE "TipoNotificacion" ADD VALUE 'concurso_iniciado';

-- DropForeignKey
ALTER TABLE "baja_sial_diffs" DROP CONSTRAINT "baja_sial_diffs_snapshot_id_fkey";

-- DropForeignKey
ALTER TABLE "baja_sial_registros" DROP CONSTRAINT "baja_sial_registros_snapshot_id_fkey";

-- DropForeignKey
ALTER TABLE "bajas" DROP CONSTRAINT "bajas_cargo_id_fkey";

-- DropForeignKey
ALTER TABLE "bajas" DROP CONSTRAINT "bajas_hospital_id_fkey";

-- DropForeignKey
ALTER TABLE "bajas" DROP CONSTRAINT "bajas_persona_id_fkey";

-- DropForeignKey
ALTER TABLE "bajas" DROP CONSTRAINT "bajas_registrado_por_fkey";

-- DropForeignKey
ALTER TABLE "cargos" DROP CONSTRAINT "cargos_especialidad_id_fkey";

-- DropForeignKey
ALTER TABLE "concursos" DROP CONSTRAINT "concursos_baja_id_fkey";

-- DropForeignKey
ALTER TABLE "concursos_cph" DROP CONSTRAINT "concursos_cph_codigo_registro_solicitado_id_fkey";

-- DropForeignKey
ALTER TABLE "escalafon_codigos_registro" DROP CONSTRAINT "escalafon_codigos_registro_escalafon_id_fkey";

-- DropForeignKey
ALTER TABLE "solicitudes_alta" DROP CONSTRAINT "solicitudes_alta_escalafon_id_fkey";

-- DropForeignKey
ALTER TABLE "solicitudes_alta" DROP CONSTRAINT "solicitudes_alta_hospital_id_fkey";

-- DropForeignKey
ALTER TABLE "usuarios" DROP CONSTRAINT "usuarios_role_id_fkey";

-- DropIndex
DROP INDEX "cargos_especialidad_id_idx";

-- DropIndex
DROP INDEX "usuarios_role_id_idx";

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "metodo" VARCHAR(10),
ADD COLUMN     "ruta" VARCHAR(300);

-- AlterTable
ALTER TABLE "autorizaciones" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "baja_sial_diffs" ALTER COLUMN "id" DROP DEFAULT,
DROP COLUMN "tipo",
ADD COLUMN     "tipo" "TipoDiff" NOT NULL,
ALTER COLUMN "existe_en_personas" SET NOT NULL,
ALTER COLUMN "tiene_ocup_activa" SET NOT NULL;

-- AlterTable
ALTER TABLE "baja_sial_registros" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "baja_sial_snapshots" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "total_registros" SET NOT NULL,
ALTER COLUMN "nuevas" SET NOT NULL,
ALTER COLUMN "salidas" SET NOT NULL,
ALTER COLUMN "modificadas" SET NOT NULL,
DROP COLUMN "estado",
ADD COLUMN     "estado" "EstadoSnapshot" NOT NULL DEFAULT 'procesando',
ALTER COLUMN "created_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "bajas" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "cargos" DROP COLUMN "especialidad_id";

-- AlterTable
ALTER TABLE "concursos" ADD COLUMN     "motivo_concurso" "MotivoConcurso";

-- AlterTable
ALTER TABLE "concursos_ceetps" DROP COLUMN "cantidad_cargos";

-- AlterTable
ALTER TABLE "concursos_cph" DROP COLUMN "cantidad_cargos",
ADD COLUMN     "cambio_especialidad" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ifacs" VARCHAR(200),
ADD COLUMN     "insal" VARCHAR(200),
ADD COLUMN     "motivo_cambio_especialidad" TEXT,
ADD COLUMN     "q_inscriptos" INTEGER;

-- AlterTable
ALTER TABLE "especialidades_puesto" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "notificaciones" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "padron_diff" ALTER COLUMN "aprobado" DROP NOT NULL,
ALTER COLUMN "aprobado" DROP DEFAULT;

-- AlterTable
ALTER TABLE "permisos" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "puestos_cargo" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "ip" VARCHAR(64);

-- AlterTable
ALTER TABLE "roles" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "solicitudes_alta" ADD COLUMN     "baja_origen_id" UUID,
ADD COLUMN     "es_transferencia" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "cargos_creados_ids" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- DropTable
DROP TABLE "escalafon_codigos_registro";

-- DropTable
DROP TABLE "especialidades";

-- DropTable
DROP TABLE "puestos";

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

-- CreateTable
CREATE TABLE "organigrama_uploads" (
    "id" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "filas" INTEGER NOT NULL,
    "subido_por_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organigrama_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpis_dotacion_snapshot" (
    "fecha" DATE NOT NULL,
    "escalafon" VARCHAR(100) NOT NULL,
    "personas" INTEGER NOT NULL,

    CONSTRAINT "kpis_dotacion_snapshot_pkey" PRIMARY KEY ("fecha","escalafon")
);

-- CreateTable
CREATE TABLE "pou" (
    "id" UUID NOT NULL,
    "sigla" VARCHAR(10) NOT NULL,
    "descripcion_sigla" VARCHAR(100),
    "perfil" VARCHAR(50) NOT NULL,
    "especialidad" VARCHAR(100) NOT NULL,
    "dotacion_diaria" INTEGER,
    "dotacion_sem" INTEGER,
    "dotacion_total" INTEGER,
    "activos" INTEGER,
    "tecnicos" INTEGER,
    "vacantes" INTEGER,

    CONSTRAINT "pou_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concursos_cph_desiertos" (
    "id" UUID NOT NULL,
    "concurso_cph_id" UUID NOT NULL,
    "nro_ronda" INTEGER NOT NULL,
    "dispo_desierta" VARCHAR(50) NOT NULL,
    "fecha_dispo_desierta" DATE NOT NULL,
    "sorteo_jurado" DATE,
    "disposicion" VARCHAR(100),
    "fecha_insc_desde" DATE,
    "fecha_insc_hasta" DATE,
    "fecha_examen" DATE,
    "fecha_orden_merito" DATE,
    "q_inscriptos" INTEGER,
    "ee_designacion" VARCHAR(150),
    "carga_documentacion" BOOLEAN,
    "fecha_apto_medico" DATE,
    "fecha_ite" DATE,
    "proyecto_resolucion" BOOLEAN,
    "reso_a_la_firma" BOOLEAN,
    "resolucion_designacion" VARCHAR(100),
    "fecha_resolucion" DATE,
    "cargo_sial" VARCHAR(50),
    "observaciones" TEXT,
    "registrado_por_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concursos_cph_desiertos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etiquetas" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "color" VARCHAR(20),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "etiquetas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etiquetas_cargo" (
    "etiqueta_id" UUID NOT NULL,
    "cargo_id" UUID NOT NULL,

    CONSTRAINT "etiquetas_cargo_pkey" PRIMARY KEY ("etiqueta_id","cargo_id")
);

-- CreateTable
CREATE TABLE "etiquetas_concurso_cph" (
    "etiqueta_id" UUID NOT NULL,
    "concurso_cph_id" UUID NOT NULL,

    CONSTRAINT "etiquetas_concurso_cph_pkey" PRIMARY KEY ("etiqueta_id","concurso_cph_id")
);

-- CreateTable
CREATE TABLE "etiquetas_baja" (
    "etiqueta_id" UUID NOT NULL,
    "baja_id" UUID NOT NULL,

    CONSTRAINT "etiquetas_baja_pkey" PRIMARY KEY ("etiqueta_id","baja_id")
);

-- CreateTable
CREATE TABLE "etiquetas_solicitud_alta" (
    "etiqueta_id" UUID NOT NULL,
    "solicitud_alta_id" UUID NOT NULL,

    CONSTRAINT "etiquetas_solicitud_alta_pkey" PRIMARY KEY ("etiqueta_id","solicitud_alta_id")
);

-- CreateTable
CREATE TABLE "ordenes_merito" (
    "id" UUID NOT NULL,
    "concurso_cph_id" UUID NOT NULL,
    "especialidad" VARCHAR(200) NOT NULL,
    "puesto" VARCHAR(200),
    "expediente" VARCHAR(200),
    "fecha_publicacion" DATE NOT NULL,
    "fecha_vencimiento" DATE NOT NULL,
    "fecha_prorroga" DATE,
    "estado" "EstadoOrdenMerito" NOT NULL DEFAULT 'vigente',
    "observaciones" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ordenes_merito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orden_merito_integrantes" (
    "id" UUID NOT NULL,
    "orden_merito_id" UUID NOT NULL,
    "persona_id" UUID,
    "cuil" VARCHAR(11) NOT NULL,
    "apellido_nombre" VARCHAR(200) NOT NULL,
    "especialidad" VARCHAR(200),
    "posicion" INTEGER NOT NULL,
    "designado" BOOLEAN NOT NULL DEFAULT false,
    "concurso_cph_designado_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orden_merito_integrantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postulantes" (
    "id" UUID NOT NULL,
    "persona_id" UUID,
    "cuil" VARCHAR(11) NOT NULL,
    "apellido_nombre" VARCHAR(200) NOT NULL,
    "especialidad" VARCHAR(200),
    "es_externo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "postulantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postulantes_concurso" (
    "id" UUID NOT NULL,
    "postulante_id" UUID NOT NULL,
    "concurso_cph_id" UUID NOT NULL,
    "fecha_postulacion" DATE NOT NULL,
    "estado" "EstadoPostulacion" NOT NULL DEFAULT 'inscripto',
    "observaciones" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "postulantes_concurso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organigramas_codigo_reparticion_key" ON "organigramas"("codigo_reparticion");

-- CreateIndex
CREATE INDEX "organigramas_sigla_idx" ON "organigramas"("sigla");

-- CreateIndex
CREATE INDEX "organigramas_padre_idx" ON "organigramas"("padre");

-- CreateIndex
CREATE INDEX "organigramas_universo_totalizador_idx" ON "organigramas"("universo_totalizador");

-- CreateIndex
CREATE INDEX "kpis_dotacion_snapshot_fecha_idx" ON "kpis_dotacion_snapshot"("fecha");

-- CreateIndex
CREATE INDEX "pou_sigla_idx" ON "pou"("sigla");

-- CreateIndex
CREATE UNIQUE INDEX "pou_sigla_perfil_especialidad_key" ON "pou"("sigla", "perfil", "especialidad");

-- CreateIndex
CREATE INDEX "concursos_cph_desiertos_concurso_cph_id_idx" ON "concursos_cph_desiertos"("concurso_cph_id");

-- CreateIndex
CREATE UNIQUE INDEX "etiquetas_nombre_key" ON "etiquetas"("nombre");

-- CreateIndex
CREATE INDEX "ordenes_merito_especialidad_estado_idx" ON "ordenes_merito"("especialidad", "estado");

-- CreateIndex
CREATE INDEX "orden_merito_integrantes_cuil_idx" ON "orden_merito_integrantes"("cuil");

-- CreateIndex
CREATE UNIQUE INDEX "orden_merito_integrantes_orden_merito_id_posicion_key" ON "orden_merito_integrantes"("orden_merito_id", "posicion");

-- CreateIndex
CREATE UNIQUE INDEX "orden_merito_integrantes_orden_merito_id_cuil_key" ON "orden_merito_integrantes"("orden_merito_id", "cuil");

-- CreateIndex
CREATE UNIQUE INDEX "postulantes_persona_id_key" ON "postulantes"("persona_id");

-- CreateIndex
CREATE UNIQUE INDEX "postulantes_cuil_key" ON "postulantes"("cuil");

-- CreateIndex
CREATE INDEX "postulantes_concurso_concurso_cph_id_idx" ON "postulantes_concurso"("concurso_cph_id");

-- CreateIndex
CREATE UNIQUE INDEX "postulantes_concurso_postulante_id_concurso_cph_id_key" ON "postulantes_concurso"("postulante_id", "concurso_cph_id");

-- CreateIndex
CREATE INDEX "baja_sial_diffs_tipo_idx" ON "baja_sial_diffs"("tipo");

-- AddForeignKey
ALTER TABLE "organigrama_uploads" ADD CONSTRAINT "organigrama_uploads_subido_por_id_fkey" FOREIGN KEY ("subido_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos" ADD CONSTRAINT "concursos_baja_id_fkey" FOREIGN KEY ("baja_id") REFERENCES "bajas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_cph" ADD CONSTRAINT "concursos_cph_codigo_registro_solicitado_id_fkey" FOREIGN KEY ("codigo_registro_solicitado_id") REFERENCES "codigos_registro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_cph_desiertos" ADD CONSTRAINT "concursos_cph_desiertos_concurso_cph_id_fkey" FOREIGN KEY ("concurso_cph_id") REFERENCES "concursos_cph"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_cph_desiertos" ADD CONSTRAINT "concursos_cph_desiertos_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bajas" ADD CONSTRAINT "bajas_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bajas" ADD CONSTRAINT "bajas_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bajas" ADD CONSTRAINT "bajas_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bajas" ADD CONSTRAINT "bajas_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_alta" ADD CONSTRAINT "solicitudes_alta_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_alta" ADD CONSTRAINT "solicitudes_alta_escalafon_id_fkey" FOREIGN KEY ("escalafon_id") REFERENCES "escalafones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_alta" ADD CONSTRAINT "solicitudes_alta_baja_origen_id_fkey" FOREIGN KEY ("baja_origen_id") REFERENCES "bajas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "ordenes_merito" ADD CONSTRAINT "ordenes_merito_concurso_cph_id_fkey" FOREIGN KEY ("concurso_cph_id") REFERENCES "concursos_cph"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_merito_integrantes" ADD CONSTRAINT "orden_merito_integrantes_orden_merito_id_fkey" FOREIGN KEY ("orden_merito_id") REFERENCES "ordenes_merito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_merito_integrantes" ADD CONSTRAINT "orden_merito_integrantes_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_merito_integrantes" ADD CONSTRAINT "orden_merito_integrantes_concurso_cph_designado_id_fkey" FOREIGN KEY ("concurso_cph_designado_id") REFERENCES "concursos_cph"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postulantes" ADD CONSTRAINT "postulantes_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postulantes_concurso" ADD CONSTRAINT "postulantes_concurso_postulante_id_fkey" FOREIGN KEY ("postulante_id") REFERENCES "postulantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postulantes_concurso" ADD CONSTRAINT "postulantes_concurso_concurso_cph_id_fkey" FOREIGN KEY ("concurso_cph_id") REFERENCES "concursos_cph"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baja_sial_diffs" ADD CONSTRAINT "baja_sial_diffs_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "baja_sial_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baja_sial_registros" ADD CONSTRAINT "baja_sial_registros_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "baja_sial_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "autorizaciones_rol_estado_idx" RENAME TO "autorizaciones_resolver_por_rol_slug_estado_idx";

-- RenameIndex
ALTER INDEX "idx_baja_sial_diffs_cuil" RENAME TO "baja_sial_diffs_cuil_idx";

-- RenameIndex
ALTER INDEX "idx_baja_sial_diffs_snapshot" RENAME TO "baja_sial_diffs_snapshot_id_idx";

-- RenameIndex
ALTER INDEX "idx_baja_sial_diffs_tipo" RENAME TO "baja_sial_diffs_tipo_idx";

-- RenameIndex
ALTER INDEX "idx_baja_sial_reg_cuil" RENAME TO "baja_sial_registros_cuil_idx";

-- RenameIndex
ALTER INDEX "idx_baja_sial_reg_snapshot" RENAME TO "baja_sial_registros_snapshot_id_idx";

