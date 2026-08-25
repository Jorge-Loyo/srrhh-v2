-- CreateEnum
CREATE TYPE "EstadoCargo" AS ENUM ('vigente', 'no_vigente');

-- CreateEnum
CREATE TYPE "EstadoSnapshot" AS ENUM ('procesando', 'pendiente', 'aprobado', 'rechazado', 'error');

-- CreateEnum
CREATE TYPE "TipoDiff" AS ENUM ('nuevo', 'modificado', 'eliminado');

-- CreateEnum
CREATE TYPE "TipoConcurso" AS ENUM ('cph', 'ceetps', 'sin_concurso');

-- CreateEnum
CREATE TYPE "EstadoConcursoCph" AS ENUM ('no_iniciado', 'activo', 'finalizado', 'suspendido', 'desierto');

-- CreateEnum
CREATE TYPE "EstadoConcursoCeetps" AS ENUM ('sin_autorizar', 'autorizado', 'en_proceso', 'finalizado', 'desierto');

-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('admin', 'editor', 'viewer', 'director', 'concursales_cph', 'concursales_ceetps');

-- CreateTable
CREATE TABLE "hospitales" (
    "id" UUID NOT NULL,
    "sigla" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "universo_totalizador" VARCHAR(100),
    "tipo" VARCHAR(100),
    "monovalencia" VARCHAR(100),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "hospitales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalafones" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "escalafones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "codigos_registro" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "literal" VARCHAR(100) NOT NULL,
    "escalafon_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "codigos_registro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personas" (
    "id" UUID NOT NULL,
    "cuil" VARCHAR(11) NOT NULL,
    "numero_doc" VARCHAR(20),
    "tipo_doc" VARCHAR(10),
    "apellido_nombre" VARCHAR(200) NOT NULL,
    "fecha_nacimiento" DATE,
    "sexo" VARCHAR(10),
    "especialidad_principal" VARCHAR(200),
    "telefono" VARCHAR(20),
    "mail_personal" VARCHAR(255),
    "mail_laboral" VARCHAR(255),
    "domicilio" VARCHAR(255),
    "localidad" VARCHAR(150),
    "provincia" VARCHAR(100),
    "antiguedad_desde" DATE,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cargos" (
    "id" UUID NOT NULL,
    "id_sial" VARCHAR(50) NOT NULL,
    "hospital_id" UUID NOT NULL,
    "escalafon_id" UUID NOT NULL,
    "codigo_registro_id" UUID,
    "literal_puesto" VARCHAR(200),
    "especialidad" VARCHAR(200),
    "agrupador" VARCHAR(150),
    "unificador_puesto" VARCHAR(200),
    "regimen" VARCHAR(50),
    "codigo_repa" VARCHAR(20),
    "descripcion_repa" VARCHAR(200),
    "cod_agrupamiento" VARCHAR(20),
    "agrupamiento" VARCHAR(150),
    "cod_familia" VARCHAR(20),
    "lit_familia" VARCHAR(150),
    "puesto_codigo_sial" VARCHAR(20),
    "estado" "EstadoCargo" NOT NULL DEFAULT 'vigente',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "cargos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocupaciones" (
    "id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,
    "cargo_id" UUID NOT NULL,
    "id_sial_rol" VARCHAR(50) NOT NULL,
    "cuil_y_rol" VARCHAR(80),
    "situacion_revista" VARCHAR(50),
    "estado_persona" VARCHAR(50),
    "desde" DATE,
    "hasta" DATE,
    "codigo_jefaturas" VARCHAR(10),
    "jefe_escalafon" VARCHAR(50),
    "documentacion_jefatura" TEXT,
    "comentarios_jefaturas" TEXT,
    "escritorio" VARCHAR(100),
    "pou_desde" DATE,
    "documentacion_pou" TEXT,
    "comision" VARCHAR(150),
    "repa_comision" VARCHAR(200),
    "sr_doc_respaldo" TEXT,
    "sr_comentario" TEXT,
    "cr_comentario" TEXT,
    "fecha_bloqueo" DATE,
    "bloqueo_comentario" TEXT,
    "bloq_motivo" VARCHAR(200),
    "cod_situacion" VARCHAR(10),
    "documentacion_del_rol" TEXT,
    "documentacion_baja" TEXT,
    "diasGuardia" TEXT[],
    "snapshot_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ocupaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "padron_snapshots" (
    "id" UUID NOT NULL,
    "fecha_asignada" DATE NOT NULL,
    "filename" VARCHAR(200) NOT NULL,
    "total_registros" INTEGER NOT NULL,
    "procesado_por" UUID,
    "estado" "EstadoSnapshot" NOT NULL DEFAULT 'pendiente',
    "aprobado_por" UUID,
    "aprobado_at" TIMESTAMPTZ,
    "paso_actual" VARCHAR(100),
    "error_msg" TEXT,
    "archivo_resultado_path" VARCHAR(500),
    "archivo_calidad_path" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "padron_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "padron_diff" (
    "id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "tipo" "TipoDiff" NOT NULL,
    "id_sial_rol" VARCHAR(50) NOT NULL,
    "campo" VARCHAR(100),
    "valor_anterior" TEXT,
    "valor_nuevo" TEXT,
    "aprobado" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "padron_diff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "padron_historico" (
    "id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "fecha_asignada" DATE NOT NULL,
    "persona_id" UUID NOT NULL,
    "cargo_id" UUID NOT NULL,
    "id_sial_rol" VARCHAR(50) NOT NULL,
    "escalafon" VARCHAR(50),
    "hospital_sigla" VARCHAR(20),
    "literal_puesto" VARCHAR(200),
    "especialidad" VARCHAR(200),
    "agrupador" VARCHAR(150),
    "estado_persona" VARCHAR(50),
    "situacion_revista" VARCHAR(50),

    CONSTRAINT "padron_historico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concursos" (
    "id" UUID NOT NULL,
    "persona_id" UUID,
    "cargo_id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "origen" VARCHAR(50) NOT NULL,
    "fecha_vacante" DATE NOT NULL,
    "motivo" VARCHAR(200),
    "expediente" VARCHAR(150),
    "tipo_concurso" "TipoConcurso" NOT NULL,
    "registrado_por" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concursos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concursos_cph" (
    "id" UUID NOT NULL,
    "concurso_id" UUID NOT NULL,
    "cargo_id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "estado" "EstadoConcursoCph" NOT NULL DEFAULT 'no_iniciado',
    "sub_estado" VARCHAR(50),
    "especialidad_solicitada" VARCHAR(200),
    "ee_baja" VARCHAR(150),
    "ee_concurso" VARCHAR(150),
    "fecha_autorizacion" DATE,
    "sorteo_jurado" DATE,
    "disposicion" VARCHAR(100),
    "fecha_insc_desde" DATE,
    "fecha_insc_hasta" DATE,
    "fecha_examen" DATE,
    "fecha_orden_merito" DATE,
    "fecha_ifacs" DATE,
    "fecha_insal" DATE,
    "ee_designacion" VARCHAR(150),
    "fecha_apto_medico" DATE,
    "fecha_ite" DATE,
    "resolucion_designacion" VARCHAR(100),
    "persona_designada_id" UUID,
    "suspendido" BOOLEAN NOT NULL DEFAULT false,
    "observaciones" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "concursos_cph_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concursos_ceetps" (
    "id" UUID NOT NULL,
    "concurso_id" UUID NOT NULL,
    "cargo_id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "escalafon_id" UUID NOT NULL,
    "estado" "EstadoConcursoCeetps" NOT NULL DEFAULT 'sin_autorizar',
    "expediente_concurso" VARCHAR(150),
    "puesto_solicitado" VARCHAR(200),
    "dispo_llamado" VARCHAR(500),
    "fecha_ifacs" DATE,
    "fecha_insal" DATE,
    "expediente_designacion" VARCHAR(150),
    "dispo_designacion" VARCHAR(500),
    "resolucion_designacion" VARCHAR(500),
    "persona_designada_id" UUID,
    "observaciones" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "concursos_ceetps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "rol" "RolUsuario" NOT NULL,
    "hospital_id" UUID,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "family_id" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revocado" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "usuario_id" UUID,
    "accion" VARCHAR(32) NOT NULL,
    "entidad" VARCHAR(64) NOT NULL,
    "entidad_id" VARCHAR(64),
    "cambios" JSONB,
    "ip" VARCHAR(64),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "especialidades" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "prioritaria" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "especialidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puestos" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "puestos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ref_agrupadores" (
    "id" UUID NOT NULL,
    "cruce" VARCHAR(300) NOT NULL,
    "escalafon" VARCHAR(150) NOT NULL,
    "lit_puesto" VARCHAR(200) NOT NULL,
    "agrupador" VARCHAR(150) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ref_agrupadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ref_unificadores_puesto" (
    "id" UUID NOT NULL,
    "cruce" VARCHAR(400) NOT NULL,
    "lit_cod_reg" VARCHAR(150) NOT NULL,
    "lit_puesto" VARCHAR(200) NOT NULL,
    "unificador" VARCHAR(200) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ref_unificadores_puesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ref_especialidades_cuil" (
    "id" UUID NOT NULL,
    "tipo" VARCHAR(20) NOT NULL,
    "cuil" VARCHAR(11) NOT NULL,
    "cuil_y_rol" VARCHAR(50),
    "especialidad" VARCHAR(200) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ref_especialidades_cuil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ref_abreviaturas_tecnicas" (
    "id" UUID NOT NULL,
    "sigla" VARCHAR(50) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ref_abreviaturas_tecnicas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ref_abreviaturas_titulo" (
    "id" UUID NOT NULL,
    "titulo" VARCHAR(50) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ref_abreviaturas_titulo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ref_correcciones_lit_puesto" (
    "id" UUID NOT NULL,
    "cod_reg" VARCHAR(10),
    "original" VARCHAR(200) NOT NULL,
    "correccion" VARCHAR(200) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ref_correcciones_lit_puesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ref_correcciones_especialidad" (
    "id" UUID NOT NULL,
    "original" VARCHAR(200) NOT NULL,
    "correccion" VARCHAR(200) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ref_correcciones_especialidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ref_especialidad_por_puesto" (
    "id" UUID NOT NULL,
    "agrupador" VARCHAR(150) NOT NULL,
    "especialidad" VARCHAR(200) NOT NULL,
    "pureza_pct" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ref_especialidad_por_puesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ref_conectores_minuscula" (
    "id" UUID NOT NULL,
    "conector" VARCHAR(30) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ref_conectores_minuscula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ref_sufijos_ordinales" (
    "id" UUID NOT NULL,
    "sufijo" VARCHAR(10) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ref_sufijos_ordinales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hospitales_sigla_key" ON "hospitales"("sigla");

-- CreateIndex
CREATE UNIQUE INDEX "escalafones_codigo_key" ON "escalafones"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "codigos_registro_codigo_key" ON "codigos_registro"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "personas_cuil_key" ON "personas"("cuil");

-- CreateIndex
CREATE INDEX "personas_numero_doc_idx" ON "personas"("numero_doc");

-- CreateIndex
CREATE UNIQUE INDEX "cargos_id_sial_key" ON "cargos"("id_sial");

-- CreateIndex
CREATE INDEX "cargos_hospital_id_idx" ON "cargos"("hospital_id");

-- CreateIndex
CREATE INDEX "cargos_escalafon_id_idx" ON "cargos"("escalafon_id");

-- CreateIndex
CREATE INDEX "cargos_estado_idx" ON "cargos"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "ocupaciones_id_sial_rol_key" ON "ocupaciones"("id_sial_rol");

-- CreateIndex
CREATE INDEX "ocupaciones_persona_id_idx" ON "ocupaciones"("persona_id");

-- CreateIndex
CREATE INDEX "ocupaciones_cargo_id_idx" ON "ocupaciones"("cargo_id");

-- CreateIndex
CREATE INDEX "ocupaciones_hasta_idx" ON "ocupaciones"("hasta");

-- CreateIndex
CREATE UNIQUE INDEX "padron_snapshots_fecha_asignada_key" ON "padron_snapshots"("fecha_asignada");

-- CreateIndex
CREATE INDEX "padron_diff_snapshot_id_idx" ON "padron_diff"("snapshot_id");

-- CreateIndex
CREATE INDEX "padron_historico_snapshot_id_idx" ON "padron_historico"("snapshot_id");

-- CreateIndex
CREATE INDEX "padron_historico_fecha_asignada_idx" ON "padron_historico"("fecha_asignada");

-- CreateIndex
CREATE INDEX "padron_historico_persona_id_idx" ON "padron_historico"("persona_id");

-- CreateIndex
CREATE INDEX "concursos_hospital_id_idx" ON "concursos"("hospital_id");

-- CreateIndex
CREATE INDEX "concursos_tipo_concurso_idx" ON "concursos"("tipo_concurso");

-- CreateIndex
CREATE UNIQUE INDEX "concursos_cph_concurso_id_key" ON "concursos_cph"("concurso_id");

-- CreateIndex
CREATE INDEX "concursos_cph_hospital_id_idx" ON "concursos_cph"("hospital_id");

-- CreateIndex
CREATE INDEX "concursos_cph_estado_idx" ON "concursos_cph"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "concursos_ceetps_concurso_id_key" ON "concursos_ceetps"("concurso_id");

-- CreateIndex
CREATE INDEX "concursos_ceetps_hospital_id_idx" ON "concursos_ceetps"("hospital_id");

-- CreateIndex
CREATE INDEX "concursos_ceetps_escalafon_id_idx" ON "concursos_ceetps"("escalafon_id");

-- CreateIndex
CREATE INDEX "concursos_ceetps_estado_idx" ON "concursos_ceetps"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_username_key" ON "usuarios"("username");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "audit_logs_usuario_id_idx" ON "audit_logs"("usuario_id");

-- CreateIndex
CREATE INDEX "audit_logs_entidad_idx" ON "audit_logs"("entidad");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "especialidades_nombre_key" ON "especialidades"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "puestos_nombre_key" ON "puestos"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "ref_agrupadores_cruce_key" ON "ref_agrupadores"("cruce");

-- CreateIndex
CREATE UNIQUE INDEX "ref_unificadores_puesto_cruce_key" ON "ref_unificadores_puesto"("cruce");

-- CreateIndex
CREATE INDEX "ref_especialidades_cuil_tipo_cuil_idx" ON "ref_especialidades_cuil"("tipo", "cuil");

-- CreateIndex
CREATE UNIQUE INDEX "ref_abreviaturas_tecnicas_sigla_key" ON "ref_abreviaturas_tecnicas"("sigla");

-- CreateIndex
CREATE UNIQUE INDEX "ref_abreviaturas_titulo_titulo_key" ON "ref_abreviaturas_titulo"("titulo");

-- CreateIndex
CREATE UNIQUE INDEX "ref_correcciones_lit_puesto_cod_reg_original_key" ON "ref_correcciones_lit_puesto"("cod_reg", "original");

-- CreateIndex
CREATE UNIQUE INDEX "ref_correcciones_especialidad_original_key" ON "ref_correcciones_especialidad"("original");

-- CreateIndex
CREATE UNIQUE INDEX "ref_especialidad_por_puesto_agrupador_key" ON "ref_especialidad_por_puesto"("agrupador");

-- CreateIndex
CREATE UNIQUE INDEX "ref_conectores_minuscula_conector_key" ON "ref_conectores_minuscula"("conector");

-- CreateIndex
CREATE UNIQUE INDEX "ref_sufijos_ordinales_sufijo_key" ON "ref_sufijos_ordinales"("sufijo");

-- AddForeignKey
ALTER TABLE "codigos_registro" ADD CONSTRAINT "codigos_registro_escalafon_id_fkey" FOREIGN KEY ("escalafon_id") REFERENCES "escalafones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_escalafon_id_fkey" FOREIGN KEY ("escalafon_id") REFERENCES "escalafones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_codigo_registro_id_fkey" FOREIGN KEY ("codigo_registro_id") REFERENCES "codigos_registro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocupaciones" ADD CONSTRAINT "ocupaciones_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocupaciones" ADD CONSTRAINT "ocupaciones_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocupaciones" ADD CONSTRAINT "ocupaciones_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "padron_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "padron_snapshots" ADD CONSTRAINT "padron_snapshots_procesado_por_fkey" FOREIGN KEY ("procesado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "padron_snapshots" ADD CONSTRAINT "padron_snapshots_aprobado_por_fkey" FOREIGN KEY ("aprobado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "padron_diff" ADD CONSTRAINT "padron_diff_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "padron_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "padron_historico" ADD CONSTRAINT "padron_historico_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "padron_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "padron_historico" ADD CONSTRAINT "padron_historico_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "padron_historico" ADD CONSTRAINT "padron_historico_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos" ADD CONSTRAINT "concursos_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos" ADD CONSTRAINT "concursos_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos" ADD CONSTRAINT "concursos_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos" ADD CONSTRAINT "concursos_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_cph" ADD CONSTRAINT "concursos_cph_concurso_id_fkey" FOREIGN KEY ("concurso_id") REFERENCES "concursos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_cph" ADD CONSTRAINT "concursos_cph_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_cph" ADD CONSTRAINT "concursos_cph_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_cph" ADD CONSTRAINT "concursos_cph_persona_designada_id_fkey" FOREIGN KEY ("persona_designada_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_ceetps" ADD CONSTRAINT "concursos_ceetps_concurso_id_fkey" FOREIGN KEY ("concurso_id") REFERENCES "concursos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_ceetps" ADD CONSTRAINT "concursos_ceetps_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_ceetps" ADD CONSTRAINT "concursos_ceetps_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_ceetps" ADD CONSTRAINT "concursos_ceetps_escalafon_id_fkey" FOREIGN KEY ("escalafon_id") REFERENCES "escalafones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_ceetps" ADD CONSTRAINT "concursos_ceetps_persona_designada_id_fkey" FOREIGN KEY ("persona_designada_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

