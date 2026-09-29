-- CreateEnum
CREATE TYPE "EstadoCargo" AS ENUM ('vigente', 'no_vigente', 'validacion_vacante');

-- CreateEnum
CREATE TYPE "EstadoSnapshot" AS ENUM ('procesando', 'pendiente', 'aprobado', 'rechazado', 'error');

-- CreateEnum
CREATE TYPE "TipoDiff" AS ENUM ('nuevo', 'modificado', 'eliminado');

-- CreateEnum
CREATE TYPE "TipoConcurso" AS ENUM ('cph', 'ceetps', 'sin_concurso');

-- CreateEnum
CREATE TYPE "MotivoConcurso" AS ENUM ('nuevo_cargo', 'alta_por_baja');

-- CreateEnum
CREATE TYPE "EstadoConcursoCph" AS ENUM ('no_iniciado', 'activo', 'finalizado', 'suspendido');

-- CreateEnum
CREATE TYPE "EstadoConcursoCeetps" AS ENUM ('sin_autorizar', 'autorizado', 'en_proceso', 'finalizado', 'desierto');

-- CreateEnum
CREATE TYPE "EstadoBaja" AS ENUM ('resolucion_a_la_firma', 'pendiente', 'confirmada', 'anulada');

-- CreateEnum
CREATE TYPE "TipoAutorizacion" AS ENUM ('concurso_cph', 'alta_cargo', 'baja_cargo');

-- CreateEnum
CREATE TYPE "EstadoAutorizacion" AS ENUM ('pendiente', 'aprobada', 'rechazada');

-- CreateEnum
CREATE TYPE "SolicitudAltaEstado" AS ENUM ('pendiente', 'aprobada', 'rechazada');

-- CreateEnum
CREATE TYPE "EstadoOrdenMerito" AS ENUM ('vigente', 'prorrogada', 'vencida');

-- CreateEnum
CREATE TYPE "ModalidadPuesto" AS ENUM ('pof', 'pou', 'ambos');

-- CreateEnum
CREATE TYPE "TipoPuesto" AS ENUM ('ejecucion', 'conduccion');

-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('concurso_estancado', 'concurso_iniciado', 'baja_pendiente', 'autorizacion_pendiente', 'autorizacion_resuelta', 'vencimiento_conduccion');

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
    "apellido" VARCHAR(120),
    "nombre" VARCHAR(120),
    "fecha_nacimiento" DATE,
    "sexo" VARCHAR(10),
    "especialidad_principal" VARCHAR(200),
    "especialidad_cph" VARCHAR(200),
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
    "codigo" VARCHAR(30),
    "hospital_id" UUID NOT NULL,
    "escalafon_id" UUID NOT NULL,
    "codigo_registro_id" UUID,
    "puesto_cargo_id" UUID NOT NULL,
    "especialidad_puesto_id" UUID,
    "literal_puesto" VARCHAR(200),
    "especialidad_legacy" VARCHAR(200),
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
    "estado_desde" DATE,
    "expediente" VARCHAR(150),
    "fecha_desde" DATE,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "tipo_origen" VARCHAR(5),
    "cargo_retenido_id" UUID,
    "cargo_base_id" UUID,
    "periodo_desde" DATE,
    "periodo_hasta" DATE,
    "periodo_renovado" BOOLEAN NOT NULL DEFAULT false,
    "fecha_renovacion" DATE,
    "doc_renovacion" TEXT,

    CONSTRAINT "cargos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocupaciones" (
    "id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,
    "cargo_id" UUID NOT NULL,
    "id_sial_rol" VARCHAR(50) NOT NULL,
    "cuil" VARCHAR(11),
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
    "dias_guardia" TEXT[],
    "cargo_desde" DATE,
    "cargo_hasta" DATE,
    "snapshot_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ocupaciones_pkey" PRIMARY KEY ("id")
);

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
    "aprobado" BOOLEAN,
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
    "cuil" VARCHAR(11),
    "escalafon" VARCHAR(50),
    "hospital_sigla" VARCHAR(20),
    "literal_puesto" VARCHAR(200),
    "especialidad" VARCHAR(200),
    "agrupador" VARCHAR(150),
    "unificador_puesto" VARCHAR(200),
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
    "baja_id" UUID,
    "origen" VARCHAR(50) NOT NULL,
    "fecha_vacante" DATE NOT NULL,
    "motivo" VARCHAR(200),
    "expediente" VARCHAR(150),
    "tipo_concurso" "TipoConcurso" NOT NULL,
    "motivo_concurso" "MotivoConcurso",
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
    "sub_estado_3" VARCHAR(50),
    "especialidad_solicitada" VARCHAR(200),
    "puesto_solicitado" VARCHAR(200),
    "puesto_cargo_solicitado_id" UUID,
    "especialidad_puesto_solicitada_id" UUID,
    "ee_baja" VARCHAR(150),
    "fecha_baja" DATE,
    "ee_concurso" VARCHAR(150),
    "fecha_ee_concurso" DATE,
    "if_autorizacion" VARCHAR(150),
    "fecha_autorizacion" DATE,
    "sorteo_jurado" DATE,
    "tipo_gestion" VARCHAR(20),
    "disposicion" VARCHAR(100),
    "fecha_insc_desde" DATE,
    "fecha_insc_hasta" DATE,
    "inscripcion_cerrada" BOOLEAN NOT NULL DEFAULT false,
    "fecha_cierre_inscripcion" DATE,
    "presentados_confirmados" BOOLEAN NOT NULL DEFAULT false,
    "orden_merito_confirmado" BOOLEAN NOT NULL DEFAULT false,
    "fecha_examen" DATE,
    "fecha_orden_merito" DATE,
    "fecha_ifacs" DATE,
    "fecha_insal" DATE,
    "ee_designacion" VARCHAR(150),
    "carga_documentacion" BOOLEAN,
    "fecha_apto_medico" DATE,
    "fecha_ite" DATE,
    "proyecto_resolucion" BOOLEAN,
    "reso_a_la_firma" BOOLEAN,
    "resolucion_designacion" VARCHAR(100),
    "fecha_resolucion" DATE,
    "cargo_sial" VARCHAR(50),
    "dispo_desierta" VARCHAR(50),
    "fecha_dispo_desierta" DATE,
    "persona_designada_id" UUID,
    "suspendido" BOOLEAN NOT NULL DEFAULT false,
    "ifacs" VARCHAR(200),
    "insal" VARCHAR(200),
    "insal_aceptado" BOOLEAN,
    "insal_rechazados" TEXT[],
    "inscripto_reservado_id" UUID,
    "validado" BOOLEAN NOT NULL DEFAULT false,
    "validado_at" TIMESTAMPTZ,
    "validado_id_sial_rol" VARCHAR(50),
    "cambio_especialidad" BOOLEAN NOT NULL DEFAULT false,
    "motivo_cambio_especialidad" TEXT,
    "q_inscriptos" INTEGER,
    "pendiente_autorizacion" BOOLEAN NOT NULL DEFAULT false,
    "aprobado_director" BOOLEAN NOT NULL DEFAULT false,
    "sigla_solicitada" VARCHAR(20),
    "codigo_registro_solicitado_id" UUID,
    "observaciones" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "concursos_cph_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jornadas_sorteo" (
    "id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "titulo" VARCHAR(200),
    "estado" VARCHAR(20) NOT NULL DEFAULT 'planificada',
    "observaciones" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "jornadas_sorteo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jornada_sorteo_concursos" (
    "jornada_id" UUID NOT NULL,
    "concurso_cph_id" UUID NOT NULL,

    CONSTRAINT "jornada_sorteo_concursos_pkey" PRIMARY KEY ("jornada_id","concurso_cph_id")
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
CREATE TABLE "sorteos_jurado" (
    "id" UUID NOT NULL,
    "concurso_cph_id" UUID NOT NULL,
    "fecha_sorteo" DATE NOT NULL,
    "semilla" VARCHAR(64) NOT NULL,
    "criterios" JSONB NOT NULL,
    "ambito" VARCHAR(20) NOT NULL,
    "observaciones" TEXT,
    "confirmado" BOOLEAN NOT NULL DEFAULT false,
    "confirmado_at" TIMESTAMPTZ,
    "confirmado_por_id" UUID,
    "generado_por_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sorteos_jurado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "miembros_jurado_sorteados" (
    "id" UUID NOT NULL,
    "sorteo_jurado_id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,
    "rol" VARCHAR(10) NOT NULL,
    "orden" INTEGER NOT NULL,
    "apellido_nombre" VARCHAR(200) NOT NULL,
    "cuil" VARCHAR(11) NOT NULL,
    "hospital_id" UUID,
    "hospital_nombre" VARCHAR(200),
    "puesto" VARCHAR(200),
    "reparticion" VARCHAR(200),
    "especialidad" VARCHAR(200),
    "ambito" VARCHAR(20) NOT NULL,
    "regla_aplicada" INTEGER,
    "cumple_especialidad" BOOLEAN NOT NULL DEFAULT false,
    "es_conduccion" BOOLEAN NOT NULL DEFAULT false,
    "antiguedad_anios" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "miembros_jurado_sorteados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inscriptos_concurso" (
    "id" UUID NOT NULL,
    "concurso_cph_id" UUID NOT NULL,
    "persona_id" UUID,
    "apellido" VARCHAR(120) NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "dni" VARCHAR(20),
    "cuil" VARCHAR(20),
    "sexo" VARCHAR(4),
    "fecha_nacimiento" DATE,
    "nacionalidad" VARCHAR(80),
    "telefono" VARCHAR(40),
    "email" VARCHAR(200),
    "titulo" VARCHAR(200),
    "matricula" VARCHAR(80),
    "especialidad" VARCHAR(200),
    "presento_examen" BOOLEAN NOT NULL DEFAULT false,
    "nota" DOUBLE PRECISION,
    "orden_merito" INTEGER,
    "observaciones" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "inscriptos_concurso_pkey" PRIMARY KEY ("id")
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
    "puesto_cargo_solicitado_id" UUID,
    "dispo_llamado" VARCHAR(500),
    "carga_horaria" SMALLINT,
    "apertura_2x18" BOOLEAN NOT NULL DEFAULT false,
    "informe_apertura" VARCHAR(150),
    "expediente_concurso_2" VARCHAR(150),
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
CREATE TABLE "bajas" (
    "id" UUID NOT NULL,
    "cargo_id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "persona_id" UUID,
    "fecha_baja" DATE NOT NULL,
    "tipo_baja" VARCHAR(100),
    "motivo" VARCHAR(500),
    "tipificador_origen" VARCHAR(200),
    "ee_baja" VARCHAR(500),
    "partida_presupuestaria" VARCHAR(100),
    "doc_respaldatoria" VARCHAR(500),
    "fecha_pase_paralelo" DATE,
    "carga_horaria" INTEGER,
    "genera_concurso" BOOLEAN NOT NULL DEFAULT true,
    "estado" "EstadoBaja" NOT NULL DEFAULT 'pendiente',
    "observaciones" TEXT,
    "registrado_por" UUID,
    "padron_vinculado_at" TIMESTAMPTZ,
    "snapshot_vinculado_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bajas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "autorizaciones" (
    "id" UUID NOT NULL,
    "tipo" "TipoAutorizacion" NOT NULL,
    "referencia_id" UUID NOT NULL,
    "referencia_tipo" VARCHAR(50) NOT NULL,
    "estado" "EstadoAutorizacion" NOT NULL DEFAULT 'pendiente',
    "resolver_por_rol_slug" VARCHAR(40) NOT NULL,
    "solicitado_por_id" UUID,
    "resuelto_por_id" UUID,
    "observaciones" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "autorizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_alta" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "escalafon_id" UUID NOT NULL,
    "codigo_registro_id" UUID,
    "puesto_cargo_id" UUID NOT NULL,
    "especialidad_puesto_id" UUID,
    "literal_puesto" VARCHAR(200) NOT NULL,
    "especialidad" VARCHAR(200),
    "agrupador" VARCHAR(150),
    "unificador_puesto" VARCHAR(200),
    "regimen" VARCHAR(50),
    "expediente" VARCHAR(150),
    "desde" DATE,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "estado" "SolicitudAltaEstado" NOT NULL DEFAULT 'pendiente',
    "baja_origen_id" UUID,
    "es_transferencia" BOOLEAN NOT NULL DEFAULT false,
    "solicitado_por_id" UUID,
    "cargos_creados_ids" UUID[],
    "observaciones" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "solicitudes_alta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_jerarquias" (
    "rol_hijo_slug" VARCHAR(40) NOT NULL,
    "rol_padre_slug" VARCHAR(40) NOT NULL,

    CONSTRAINT "role_jerarquias_pkey" PRIMARY KEY ("rol_hijo_slug","rol_padre_slug")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role_id" UUID NOT NULL,
    "hospital_id" UUID,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" VARCHAR(255),
    "es_sistema" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permisos" (
    "id" UUID NOT NULL,
    "modulo" VARCHAR(40) NOT NULL,
    "accion" VARCHAR(40) NOT NULL,
    "descripcion" VARCHAR(255),

    CONSTRAINT "permisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permisos" (
    "role_id" UUID NOT NULL,
    "permiso_id" UUID NOT NULL,

    CONSTRAINT "role_permisos_pkey" PRIMARY KEY ("role_id","permiso_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "family_id" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revocado" BOOLEAN NOT NULL DEFAULT false,
    "ip" VARCHAR(64),
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
    "metodo" VARCHAR(10),
    "ruta" VARCHAR(300),
    "cambios" JSONB,
    "ip" VARCHAR(64),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
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
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "motivo_anulado" VARCHAR(300),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orden_merito_integrantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puestos_cargo" (
    "id" UUID NOT NULL,
    "escalafon_id" UUID NOT NULL,
    "modalidad" "ModalidadPuesto" NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "tipo_puesto" "TipoPuesto" NOT NULL DEFAULT 'ejecucion',
    "pendiente_curar" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "puestos_cargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "especialidades_puesto" (
    "id" UUID NOT NULL,
    "puesto_cargo_id" UUID NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "especialidades_puesto_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" UUID NOT NULL,
    "tipo" "TipoNotificacion" NOT NULL,
    "rol_slug" VARCHAR(40) NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "mensaje" TEXT NOT NULL,
    "origen_tipo" VARCHAR(50),
    "origen_id" UUID,
    "origen_key" VARCHAR(200),
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "creada_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leida_at" TIMESTAMPTZ,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX "hospitales_sigla_key" ON "hospitales"("sigla");

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
CREATE UNIQUE INDEX "escalafones_codigo_key" ON "escalafones"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "codigos_registro_codigo_key" ON "codigos_registro"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "personas_cuil_key" ON "personas"("cuil");

-- CreateIndex
CREATE INDEX "personas_numero_doc_idx" ON "personas"("numero_doc");

-- CreateIndex
CREATE INDEX "personas_especialidad_cph_idx" ON "personas"("especialidad_cph");

-- CreateIndex
CREATE UNIQUE INDEX "cargos_id_sial_key" ON "cargos"("id_sial");

-- CreateIndex
CREATE UNIQUE INDEX "cargos_codigo_key" ON "cargos"("codigo");

-- CreateIndex
CREATE INDEX "cargos_hospital_id_idx" ON "cargos"("hospital_id");

-- CreateIndex
CREATE INDEX "cargos_escalafon_id_idx" ON "cargos"("escalafon_id");

-- CreateIndex
CREATE INDEX "cargos_estado_idx" ON "cargos"("estado");

-- CreateIndex
CREATE INDEX "cargos_cargo_base_id_idx" ON "cargos"("cargo_base_id");

-- CreateIndex
CREATE INDEX "cargos_cargo_retenido_id_idx" ON "cargos"("cargo_retenido_id");

-- CreateIndex
CREATE INDEX "cargos_puesto_cargo_id_idx" ON "cargos"("puesto_cargo_id");

-- CreateIndex
CREATE INDEX "cargos_especialidad_puesto_id_idx" ON "cargos"("especialidad_puesto_id");

-- CreateIndex
CREATE UNIQUE INDEX "ocupaciones_id_sial_rol_key" ON "ocupaciones"("id_sial_rol");

-- CreateIndex
CREATE INDEX "ocupaciones_persona_id_idx" ON "ocupaciones"("persona_id");

-- CreateIndex
CREATE INDEX "ocupaciones_cargo_id_idx" ON "ocupaciones"("cargo_id");

-- CreateIndex
CREATE INDEX "ocupaciones_hasta_idx" ON "ocupaciones"("hasta");

-- CreateIndex
CREATE INDEX "roles_persona_persona_id_idx" ON "roles_persona"("persona_id");

-- CreateIndex
CREATE INDEX "roles_persona_id_sial_idx" ON "roles_persona"("id_sial");

-- CreateIndex
CREATE INDEX "roles_persona_cargo_id_idx" ON "roles_persona"("cargo_id");

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
CREATE INDEX "padron_historico_cargo_id_idx" ON "padron_historico"("cargo_id");

-- CreateIndex
CREATE INDEX "padron_historico_cuil_idx" ON "padron_historico"("cuil");

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
CREATE INDEX "concursos_cph_sub_estado_idx" ON "concursos_cph"("sub_estado");

-- CreateIndex
CREATE INDEX "jornadas_sorteo_fecha_idx" ON "jornadas_sorteo"("fecha");

-- CreateIndex
CREATE INDEX "jornada_sorteo_concursos_concurso_cph_id_idx" ON "jornada_sorteo_concursos"("concurso_cph_id");

-- CreateIndex
CREATE INDEX "concursos_cph_desiertos_concurso_cph_id_idx" ON "concursos_cph_desiertos"("concurso_cph_id");

-- CreateIndex
CREATE INDEX "sorteos_jurado_concurso_cph_id_idx" ON "sorteos_jurado"("concurso_cph_id");

-- CreateIndex
CREATE INDEX "miembros_jurado_sorteados_sorteo_jurado_id_idx" ON "miembros_jurado_sorteados"("sorteo_jurado_id");

-- CreateIndex
CREATE INDEX "inscriptos_concurso_concurso_cph_id_idx" ON "inscriptos_concurso"("concurso_cph_id");

-- CreateIndex
CREATE INDEX "inscriptos_concurso_cuil_idx" ON "inscriptos_concurso"("cuil");

-- CreateIndex
CREATE INDEX "inscriptos_concurso_persona_id_idx" ON "inscriptos_concurso"("persona_id");

-- CreateIndex
CREATE UNIQUE INDEX "concursos_ceetps_concurso_id_key" ON "concursos_ceetps"("concurso_id");

-- CreateIndex
CREATE INDEX "concursos_ceetps_hospital_id_idx" ON "concursos_ceetps"("hospital_id");

-- CreateIndex
CREATE INDEX "concursos_ceetps_escalafon_id_idx" ON "concursos_ceetps"("escalafon_id");

-- CreateIndex
CREATE INDEX "concursos_ceetps_estado_idx" ON "concursos_ceetps"("estado");

-- CreateIndex
CREATE INDEX "bajas_cargo_id_idx" ON "bajas"("cargo_id");

-- CreateIndex
CREATE INDEX "bajas_hospital_id_idx" ON "bajas"("hospital_id");

-- CreateIndex
CREATE INDEX "bajas_estado_idx" ON "bajas"("estado");

-- CreateIndex
CREATE INDEX "autorizaciones_referencia_id_idx" ON "autorizaciones"("referencia_id");

-- CreateIndex
CREATE INDEX "autorizaciones_resolver_por_rol_slug_estado_idx" ON "autorizaciones"("resolver_por_rol_slug", "estado");

-- CreateIndex
CREATE INDEX "solicitudes_alta_hospital_id_idx" ON "solicitudes_alta"("hospital_id");

-- CreateIndex
CREATE INDEX "solicitudes_alta_estado_idx" ON "solicitudes_alta"("estado");

-- CreateIndex
CREATE INDEX "solicitudes_alta_puesto_cargo_id_idx" ON "solicitudes_alta"("puesto_cargo_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_username_key" ON "usuarios"("username");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_slug_key" ON "roles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "permisos_modulo_accion_key" ON "permisos"("modulo", "accion");

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
CREATE INDEX "puestos_cargo_escalafon_id_modalidad_idx" ON "puestos_cargo"("escalafon_id", "modalidad");

-- CreateIndex
CREATE UNIQUE INDEX "puestos_cargo_escalafon_id_modalidad_nombre_key" ON "puestos_cargo"("escalafon_id", "modalidad", "nombre");

-- CreateIndex
CREATE INDEX "especialidades_puesto_puesto_cargo_id_idx" ON "especialidades_puesto"("puesto_cargo_id");

-- CreateIndex
CREATE UNIQUE INDEX "especialidades_puesto_puesto_cargo_id_nombre_key" ON "especialidades_puesto"("puesto_cargo_id", "nombre");

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

-- CreateIndex
CREATE UNIQUE INDEX "notificaciones_origen_key_key" ON "notificaciones"("origen_key");

-- CreateIndex
CREATE INDEX "notificaciones_rol_slug_leida_idx" ON "notificaciones"("rol_slug", "leida");

-- CreateIndex
CREATE INDEX "notificaciones_tipo_idx" ON "notificaciones"("tipo");

-- CreateIndex
CREATE INDEX "notificaciones_creada_at_idx" ON "notificaciones"("creada_at");

-- CreateIndex
CREATE INDEX "baja_sial_diffs_snapshot_id_idx" ON "baja_sial_diffs"("snapshot_id");

-- CreateIndex
CREATE INDEX "baja_sial_diffs_tipo_idx" ON "baja_sial_diffs"("tipo");

-- CreateIndex
CREATE INDEX "baja_sial_diffs_cuil_idx" ON "baja_sial_diffs"("cuil");

-- CreateIndex
CREATE INDEX "baja_sial_registros_snapshot_id_idx" ON "baja_sial_registros"("snapshot_id");

-- CreateIndex
CREATE INDEX "baja_sial_registros_cuil_idx" ON "baja_sial_registros"("cuil");

-- AddForeignKey
ALTER TABLE "organigrama_uploads" ADD CONSTRAINT "organigrama_uploads_subido_por_id_fkey" FOREIGN KEY ("subido_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigos_registro" ADD CONSTRAINT "codigos_registro_escalafon_id_fkey" FOREIGN KEY ("escalafon_id") REFERENCES "escalafones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_escalafon_id_fkey" FOREIGN KEY ("escalafon_id") REFERENCES "escalafones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_codigo_registro_id_fkey" FOREIGN KEY ("codigo_registro_id") REFERENCES "codigos_registro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_puesto_cargo_id_fkey" FOREIGN KEY ("puesto_cargo_id") REFERENCES "puestos_cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_especialidad_puesto_id_fkey" FOREIGN KEY ("especialidad_puesto_id") REFERENCES "especialidades_puesto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_cargo_retenido_id_fkey" FOREIGN KEY ("cargo_retenido_id") REFERENCES "cargos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_cargo_base_id_fkey" FOREIGN KEY ("cargo_base_id") REFERENCES "cargos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocupaciones" ADD CONSTRAINT "ocupaciones_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocupaciones" ADD CONSTRAINT "ocupaciones_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocupaciones" ADD CONSTRAINT "ocupaciones_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "padron_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles_persona" ADD CONSTRAINT "roles_persona_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles_persona" ADD CONSTRAINT "roles_persona_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "concursos" ADD CONSTRAINT "concursos_baja_id_fkey" FOREIGN KEY ("baja_id") REFERENCES "bajas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_cph" ADD CONSTRAINT "concursos_cph_codigo_registro_solicitado_id_fkey" FOREIGN KEY ("codigo_registro_solicitado_id") REFERENCES "codigos_registro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_cph" ADD CONSTRAINT "concursos_cph_concurso_id_fkey" FOREIGN KEY ("concurso_id") REFERENCES "concursos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_cph" ADD CONSTRAINT "concursos_cph_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_cph" ADD CONSTRAINT "concursos_cph_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_cph" ADD CONSTRAINT "concursos_cph_puesto_cargo_solicitado_id_fkey" FOREIGN KEY ("puesto_cargo_solicitado_id") REFERENCES "puestos_cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_cph" ADD CONSTRAINT "concursos_cph_especialidad_puesto_solicitada_id_fkey" FOREIGN KEY ("especialidad_puesto_solicitada_id") REFERENCES "especialidades_puesto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_cph" ADD CONSTRAINT "concursos_cph_persona_designada_id_fkey" FOREIGN KEY ("persona_designada_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_cph" ADD CONSTRAINT "concursos_cph_inscripto_reservado_id_fkey" FOREIGN KEY ("inscripto_reservado_id") REFERENCES "inscriptos_concurso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jornadas_sorteo" ADD CONSTRAINT "jornadas_sorteo_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jornada_sorteo_concursos" ADD CONSTRAINT "jornada_sorteo_concursos_jornada_id_fkey" FOREIGN KEY ("jornada_id") REFERENCES "jornadas_sorteo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jornada_sorteo_concursos" ADD CONSTRAINT "jornada_sorteo_concursos_concurso_cph_id_fkey" FOREIGN KEY ("concurso_cph_id") REFERENCES "concursos_cph"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "inscriptos_concurso" ADD CONSTRAINT "inscriptos_concurso_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_ceetps" ADD CONSTRAINT "concursos_ceetps_concurso_id_fkey" FOREIGN KEY ("concurso_id") REFERENCES "concursos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_ceetps" ADD CONSTRAINT "concursos_ceetps_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_ceetps" ADD CONSTRAINT "concursos_ceetps_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_ceetps" ADD CONSTRAINT "concursos_ceetps_escalafon_id_fkey" FOREIGN KEY ("escalafon_id") REFERENCES "escalafones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_ceetps" ADD CONSTRAINT "concursos_ceetps_puesto_cargo_solicitado_id_fkey" FOREIGN KEY ("puesto_cargo_solicitado_id") REFERENCES "puestos_cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos_ceetps" ADD CONSTRAINT "concursos_ceetps_persona_designada_id_fkey" FOREIGN KEY ("persona_designada_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bajas" ADD CONSTRAINT "bajas_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bajas" ADD CONSTRAINT "bajas_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bajas" ADD CONSTRAINT "bajas_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bajas" ADD CONSTRAINT "bajas_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bajas" ADD CONSTRAINT "bajas_snapshot_vinculado_id_fkey" FOREIGN KEY ("snapshot_vinculado_id") REFERENCES "padron_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "autorizaciones" ADD CONSTRAINT "autorizaciones_solicitado_por_id_fkey" FOREIGN KEY ("solicitado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "autorizaciones" ADD CONSTRAINT "autorizaciones_resuelto_por_id_fkey" FOREIGN KEY ("resuelto_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_alta" ADD CONSTRAINT "solicitudes_alta_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_alta" ADD CONSTRAINT "solicitudes_alta_escalafon_id_fkey" FOREIGN KEY ("escalafon_id") REFERENCES "escalafones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_alta" ADD CONSTRAINT "solicitudes_alta_codigo_registro_id_fkey" FOREIGN KEY ("codigo_registro_id") REFERENCES "codigos_registro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_alta" ADD CONSTRAINT "solicitudes_alta_puesto_cargo_id_fkey" FOREIGN KEY ("puesto_cargo_id") REFERENCES "puestos_cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_alta" ADD CONSTRAINT "solicitudes_alta_especialidad_puesto_id_fkey" FOREIGN KEY ("especialidad_puesto_id") REFERENCES "especialidades_puesto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_alta" ADD CONSTRAINT "solicitudes_alta_baja_origen_id_fkey" FOREIGN KEY ("baja_origen_id") REFERENCES "bajas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_alta" ADD CONSTRAINT "solicitudes_alta_solicitado_por_id_fkey" FOREIGN KEY ("solicitado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permisos" ADD CONSTRAINT "role_permisos_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permisos" ADD CONSTRAINT "role_permisos_permiso_id_fkey" FOREIGN KEY ("permiso_id") REFERENCES "permisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "puestos_cargo" ADD CONSTRAINT "puestos_cargo_escalafon_id_fkey" FOREIGN KEY ("escalafon_id") REFERENCES "escalafones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "especialidades_puesto" ADD CONSTRAINT "especialidades_puesto_puesto_cargo_id_fkey" FOREIGN KEY ("puesto_cargo_id") REFERENCES "puestos_cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baja_sial_diffs" ADD CONSTRAINT "baja_sial_diffs_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "baja_sial_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baja_sial_registros" ADD CONSTRAINT "baja_sial_registros_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "baja_sial_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

