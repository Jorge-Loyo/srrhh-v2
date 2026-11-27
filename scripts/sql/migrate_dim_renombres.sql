-- Migración: renombrar tablas a prefijo dim_
-- Preserva todos los datos con ALTER TABLE RENAME

BEGIN;

-- 1. organigrama
ALTER TABLE organigramas RENAME TO dim_organigrama;
ALTER TABLE organigrama_uploads RENAME TO dim_organigrama_uploads;

-- 2. pou → dim_pou_ocupacion
ALTER TABLE pou RENAME TO dim_pou_ocupacion;
-- FK sigla → dim_efectores (nueva)
ALTER TABLE dim_pou_ocupacion
  ADD CONSTRAINT dim_pou_ocupacion_sigla_fkey
  FOREIGN KEY (sigla) REFERENCES dim_efectores(sigla);

-- 3. Nueva tabla dim_pou_ocupacion_puestos
CREATE TABLE dim_pou_ocupacion_puestos (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pou_id               UUID NOT NULL REFERENCES dim_pou_ocupacion(id),
  id_sial_rol          VARCHAR(30) NOT NULL REFERENCES dim_puestos(id_sial_rol),
  vinculado_manualmente BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (pou_id, id_sial_rol)
);
CREATE INDEX dim_pou_ocupacion_puestos_id_sial_rol_idx ON dim_pou_ocupacion_puestos(id_sial_rol);

-- 4. pou_decreto*
ALTER TABLE pou_decreto_mapeo_hospital RENAME TO dim_pou_decreto_mapeo;
ALTER TABLE pou_decreto RENAME TO dim_pou_decreto;
ALTER TABLE pou_decreto_cargas RENAME TO dim_pou_decreto_cargas;

-- 5. sync_corridas
ALTER TABLE sync_corridas RENAME TO dim_sync_corridas;

-- Normalizar tipo en dim_organigrama: trim + uppercase (excepto el outlier 'Ministerio')
UPDATE dim_organigrama SET tipo = UPPER(TRIM(tipo));

COMMIT;
