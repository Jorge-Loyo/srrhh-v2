ALTER TYPE "EstadoCargo" ADD VALUE IF NOT EXISTS 'validacion_vacante';
ALTER TABLE cargos ADD COLUMN IF NOT EXISTS estado_desde DATE;
