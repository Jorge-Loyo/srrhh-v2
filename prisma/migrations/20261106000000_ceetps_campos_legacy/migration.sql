-- Migración: ceetps_campos_legacy
-- Agrega los campos del legacy (dotacion-rrhh) que faltaban en ConcursoCeetps:
--   · Fechas del proceso previo (caratulación, autorización, tipificador)
--   · Cambio de especialidad (bool + doc)
--   · Sub-estado granular (mirror de los 8 estados string del legacy)
--   · Campos de designación granulares (puesto designado, apto médico,
--     fecha proyecto dispo, alta SIAL, código SIAL)

ALTER TABLE "concursos_ceetps"
  -- Proceso previo al concurso
  ADD COLUMN "fecha_caratulacion"   DATE,
  ADD COLUMN "fecha_autorizacion"   DATE,
  ADD COLUMN "tipificador_origen"   VARCHAR(200),

  -- Cambio de especialidad (mismo patrón que cambio_especialidad en ConcursoCph)
  ADD COLUMN "cambio_especialidad"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "doc_cambio_especialidad" VARCHAR(500),

  -- Sub-estado granular (calculado server-side junto al estado principal)
  ADD COLUMN "sub_estado"           VARCHAR(30),

  -- Designación granular (recuperados del legacy)
  ADD COLUMN "puesto_designado"     VARCHAR(150),
  ADD COLUMN "estado_apto"          VARCHAR(100),
  ADD COLUMN "numero_apto_medico"   VARCHAR(100),
  ADD COLUMN "fecha_proyecto_dispo" DATE,
  ADD COLUMN "alta_sial"            BOOLEAN,
  ADD COLUMN "codigo_sial"          VARCHAR(100),

  -- Cantidad de cargos a cubrir (existía en el tipo TS pero faltaba en la BD)
  ADD COLUMN "cantidad_cargos"      INTEGER NOT NULL DEFAULT 1;

-- Índice para filtrar por sub-estado (el índice de estado ya existe)
CREATE INDEX "concursos_ceetps_sub_estado_idx" ON "concursos_ceetps"("sub_estado");

-- Backfill de sub_estado para concursos existentes (misma cascada que
-- calcEstadoCeetps, solo sobre los no terminales).
UPDATE "concursos_ceetps" SET "sub_estado" = CASE
  WHEN "dispo_designacion" IS NOT NULL AND "dispo_designacion" <> '' THEN 'DISPO_DESIGNACION'
  WHEN "expediente_designacion" IS NOT NULL AND "expediente_designacion" <> '' THEN 'TAD'
  WHEN "fecha_insal" IS NOT NULL THEN 'INSAL'
  WHEN "fecha_ifacs" IS NOT NULL THEN 'IFACS'
  WHEN "dispo_llamado" IS NOT NULL AND "dispo_llamado" <> '' THEN 'DISPO_LLAMADO'
  WHEN ("puesto_solicitado" IS NULL OR "puesto_solicitado" = '')
       AND ("expediente_concurso" IS NOT NULL AND "expediente_concurso" <> '') THEN 'EXP_CARATULADO'
  ELSE NULL
END
WHERE "estado" NOT IN ('finalizado', 'desierto')
  AND ("resolucion_designacion" IS NULL OR "resolucion_designacion" = '');
