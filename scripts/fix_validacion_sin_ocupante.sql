-- Fix: validacion_vacante sin ocupante histórico → vigente / vacante
-- Excluye HIS- (ninguno aplica pero por seguridad)

BEGIN;

CREATE TEMP TABLE _ajustados AS
SELECT c.codigo
FROM cargos c
WHERE c.estado::text = 'validacion_vacante'
  AND c.deleted_at IS NULL
  AND c.codigo NOT LIKE 'HIS-%'
  AND NOT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id);

UPDATE cargos
SET estado       = 'vigente',
    sub_estado   = 'vacante',
    estado_desde = NULL,
    updated_at   = NOW()
WHERE codigo IN (SELECT codigo FROM _ajustados);

SELECT 'ajustados' AS resultado, COUNT(*) AS n FROM _ajustados;

SELECT codigo FROM _ajustados ORDER BY codigo;

COMMIT;
