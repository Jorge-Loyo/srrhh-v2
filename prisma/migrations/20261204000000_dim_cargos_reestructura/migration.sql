-- Fase 4.3: reestructura dim_cargos
-- Renombres: carrera→literal_puesto, planta_guardia→modalidad, situacion→sub_estado
-- Eliminaciones: nombre_cargo, tipo, nivel_conduccion, acronimo, linea_pou,
--                universo, reparticion, unidad_arbol, bloque, suma_en_total
-- Agregados: especialidad_id FK→dim_especialidades, dia_pou

-- 1. Renombrar columnas
ALTER TABLE dim_cargos RENAME COLUMN carrera         TO literal_puesto;
ALTER TABLE dim_cargos RENAME COLUMN planta_guardia  TO modalidad;
ALTER TABLE dim_cargos RENAME COLUMN situacion       TO sub_estado;

-- 2. Normalizar modalidad: Planta→POF, resto con valor→POU
UPDATE dim_cargos SET modalidad = 'POF' WHERE modalidad = 'Planta';
UPDATE dim_cargos SET modalidad = 'POU'
  WHERE modalidad IS NOT NULL AND modalidad <> 'POF';

-- 3. Eliminar columnas prescindibles
ALTER TABLE dim_cargos
  DROP COLUMN IF EXISTS nombre_cargo,
  DROP COLUMN IF EXISTS tipo,
  DROP COLUMN IF EXISTS nivel_conduccion,
  DROP COLUMN IF EXISTS acronimo,
  DROP COLUMN IF EXISTS linea_pou,
  DROP COLUMN IF EXISTS universo,
  DROP COLUMN IF EXISTS reparticion,
  DROP COLUMN IF EXISTS unidad_arbol,
  DROP COLUMN IF EXISTS bloque,
  DROP COLUMN IF EXISTS suma_en_total;

-- 4. Agregar especialidad_id y dia_pou
ALTER TABLE dim_cargos
  ADD COLUMN especialidad_id INT,
  ADD COLUMN dia_pou         VARCHAR(20);

ALTER TABLE dim_cargos
  ADD CONSTRAINT dim_cargos_especialidad_id_fkey
  FOREIGN KEY (especialidad_id) REFERENCES dim_especialidades(id) NOT VALID;

CREATE INDEX idx_dim_cargos_especialidad_id ON dim_cargos(especialidad_id);
CREATE INDEX idx_dim_cargos_modalidad       ON dim_cargos(modalidad);
CREATE INDEX idx_dim_cargos_sub_estado      ON dim_cargos(sub_estado);
