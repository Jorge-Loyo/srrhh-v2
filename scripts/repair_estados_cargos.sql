-- R-3: Reconciliación de estado de cargos post-reparación
-- Cargos no_vigente con ocupación activa → marcar vigente (inconsistencia)

UPDATE cargos c
SET estado = 'vigente', updated_at = NOW()
WHERE c.estado = 'no_vigente'
  AND EXISTS (
    SELECT 1 FROM ocupaciones o
    WHERE o.cargo_id = c.id AND o.hasta IS NULL
  );

-- Reporte
SELECT estado, COUNT(*) FROM cargos GROUP BY estado ORDER BY estado;
