-- =============================================================================
-- CHECK: Consistencia de códigos de registro vs escalafón en cargos
-- =============================================================================

\echo ''
\echo '======================================================================'
\echo 'RESUMEN — Cargos por literal de código de registro + escalafón'
\echo '======================================================================'

SELECT
  cr.literal                                        AS literal_cod_registro,
  cr.codigo,
  e.nombre                                          AS escalafon,
  COUNT(c.id)                                       AS total_cargos,
  COUNT(CASE WHEN c.codigo IS NULL THEN 1 END)      AS sin_codigo_interno,
  COUNT(CASE WHEN c.estado = 'vigente' THEN 1 END)  AS vigentes,
  COUNT(CASE WHEN c.estado = 'no_vigente' THEN 1 END) AS no_vigentes,
  COUNT(CASE WHEN c.estado = 'validacion_vacante' THEN 1 END) AS en_validacion
FROM cargos c
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
JOIN escalafones e ON e.id = c.escalafon_id
GROUP BY cr.literal, cr.codigo, e.nombre
ORDER BY cr.literal, cr.codigo;

\echo ''
\echo '======================================================================'
\echo 'CHECK A — codigo_registro no pertenece al escalafon del cargo'
\echo 'Regla: cr.escalafon_id debe coincidir con c.escalafon_id'
\echo '======================================================================'

SELECT
  c.id            AS cargo_id,
  c.codigo        AS codigo_cargo,
  c.estado,
  cr.codigo       AS cod_registro,
  cr.literal      AS literal_cod_registro,
  e_cr.nombre     AS escalafon_del_codigo,
  e_c.nombre      AS escalafon_del_cargo
FROM cargos c
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
JOIN escalafones e_cr    ON e_cr.id = cr.escalafon_id
JOIN escalafones e_c     ON e_c.id = c.escalafon_id
WHERE cr.escalafon_id != c.escalafon_id
ORDER BY e_c.nombre, c.codigo;

\echo ''
\echo '======================================================================'
\echo 'CHECK B — Cargos cuyo codigo interno no empieza con el cod_registro'
\echo 'Nomenclatura esperada: {COD_REG}-... ej CPH-POU-000056 o 83-000001'
\echo '======================================================================'

SELECT
  c.codigo        AS codigo_cargo,
  cr.codigo       AS cod_registro,
  cr.literal      AS literal_cod_registro,
  c.estado
FROM cargos c
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
WHERE c.codigo IS NOT NULL
  AND c.codigo NOT ILIKE cr.codigo || '%'
  AND c.codigo NOT ILIKE 'CPH%'
  AND c.codigo NOT ILIKE 'CEETPS%'
  AND c.codigo NOT ILIKE 'ADM%'
  AND c.codigo NOT ILIKE 'ENF%'
ORDER BY cr.literal, c.codigo
LIMIT 50;

\echo ''
\echo '======================================================================'
\echo 'CHECK C — Cargos sin codigo_registro_id (no deberia haber ninguno)'
\echo '======================================================================'

SELECT COUNT(*) AS cargos_sin_codigo_registro FROM cargos WHERE codigo_registro_id IS NULL;

\echo ''
\echo '======================================================================'
\echo 'CHECK D — Cargos sin escalafon_id (no deberia haber ninguno)'
\echo '======================================================================'

SELECT COUNT(*) AS cargos_sin_escalafon FROM cargos WHERE escalafon_id IS NULL;

\echo ''
\echo '======================================================================'
\echo 'RESUMEN FINAL'
\echo '======================================================================'

SELECT 'A - cod_registro no coincide con escalafon' AS check_nombre,
  COUNT(*) AS inconsistencias
FROM cargos c
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
WHERE cr.escalafon_id != c.escalafon_id

UNION ALL

SELECT 'B - codigo interno no sigue nomenclatura',
  COUNT(*)
FROM cargos c
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
WHERE c.codigo IS NOT NULL
  AND c.codigo NOT ILIKE cr.codigo || '%'
  AND c.codigo NOT ILIKE 'CPH%'
  AND c.codigo NOT ILIKE 'CEETPS%'
  AND c.codigo NOT ILIKE 'ADM%'
  AND c.codigo NOT ILIKE 'ENF%'

UNION ALL

SELECT 'C - sin codigo_registro_id', COUNT(*) FROM cargos WHERE codigo_registro_id IS NULL

UNION ALL

SELECT 'D - sin escalafon_id', COUNT(*) FROM cargos WHERE escalafon_id IS NULL

ORDER BY check_nombre;
