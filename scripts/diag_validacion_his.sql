SELECT
  COUNT(*) AS total_sin_ocupante,
  COUNT(*) FILTER (WHERE c.codigo LIKE 'HIS-%') AS his,
  COUNT(*) FILTER (WHERE c.codigo NOT LIKE 'HIS-%') AS no_his
FROM cargos c
WHERE c.estado::text = 'validacion_vacante'
  AND c.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id);
