-- Fix: cargos SG- tienen unificador_puesto = 'POU Guardia' incorrectamente.
-- El unificador correcto para la carrera Suplente de Guardia es 'Suplente de Guardia'.

-- Dry-run: ver cuántos cargos se afectan
SELECT COUNT(*), unificador_puesto
FROM cargos
WHERE codigo LIKE 'SG-%'
  AND unificador_puesto = 'POU Guardia'
  AND deleted_at IS NULL
GROUP BY unificador_puesto;

-- Aplicar:
UPDATE cargos
SET unificador_puesto = 'Suplente de Guardia'
WHERE codigo LIKE 'SG-%'
  AND unificador_puesto = 'POU Guardia'
  AND deleted_at IS NULL;
