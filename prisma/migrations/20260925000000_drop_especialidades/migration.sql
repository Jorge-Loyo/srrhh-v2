-- Drop FK y tabla especialidades (no usada en ninguna query activa)
ALTER TABLE cargos DROP COLUMN IF EXISTS especialidad_id;
DROP TABLE IF EXISTS especialidades CASCADE;
