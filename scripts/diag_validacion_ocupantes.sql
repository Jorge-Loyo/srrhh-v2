-- Diagnóstico: cargos validacion_vacante según si tuvieron ocupante

SELECT
  COUNT(*) AS total_validacion,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id
  )) AS con_ocupacion_historica,
  COUNT(*) FILTER (WHERE NOT EXISTS (
    SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id
  )) AS sin_ocupacion_historica,
  COUNT(*) FILTER (WHERE c.id_sial IS NOT NULL) AS con_id_sial,
  COUNT(*) FILTER (WHERE c.id_sial IS NULL) AS sin_id_sial
FROM cargos c
WHERE c.estado::text = 'validacion_vacante'
  AND c.deleted_at IS NULL;
