-- Prefijos de código interno por literal de código de registro
SELECT
  cr.literal        AS literal_cod_registro,
  cr.codigo,
  SPLIT_PART(c.codigo, '-', 1) AS prefijo,
  COUNT(*)          AS cantidad
FROM cargos c
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
WHERE c.codigo IS NOT NULL
GROUP BY cr.literal, cr.codigo, SPLIT_PART(c.codigo, '-', 1)
ORDER BY cr.literal, cantidad DESC;
