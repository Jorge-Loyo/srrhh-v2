-- =============================================================================
-- AJUSTES POST FASE 1
-- =============================================================================

BEGIN;

-- 1. DROP columnas huérfanas de solicitudes_alta (misma decisión C1)
ALTER TABLE solicitudes_alta DROP COLUMN IF EXISTS agrupador;
ALTER TABLE solicitudes_alta DROP COLUMN IF EXISTS unificador_puesto;

-- 2. Renombrar constraint FK cargo_ejecucion_id a nombre canónico
--    para que el db pull genere nombres limpios en el schema
ALTER TABLE cargos
  RENAME CONSTRAINT fk_cargo_ejecucion TO cargos_cargo_ejecucion_id_fkey;

COMMIT;
