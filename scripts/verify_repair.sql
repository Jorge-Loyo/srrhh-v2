-- R-5: Verificación de integridad post-reparación

SELECT '=== PERSONAS ===' as seccion, '' as check, 0 as total WHERE false
UNION ALL
SELECT '---', 'total_personas', COUNT(*) FROM personas
UNION ALL
SELECT '---', 'con_apellido', COUNT(*) FROM personas WHERE apellido IS NOT NULL AND apellido != ''
UNION ALL
SELECT '---', 'sin_apellido', COUNT(*) FROM personas WHERE apellido IS NULL OR apellido = ''
UNION ALL
SELECT '---', 'sin_ocupacion', COUNT(*) FROM personas p
  WHERE NOT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.persona_id = p.id)
UNION ALL
SELECT '=== OCUPACIONES ===', '', 0 WHERE false
UNION ALL
SELECT '---', 'total_ocupaciones', COUNT(*) FROM ocupaciones
UNION ALL
SELECT '---', 'activas_hasta_null', COUNT(*) FROM ocupaciones WHERE hasta IS NULL
UNION ALL
SELECT '---', 'cerradas_con_hasta', COUNT(*) FROM ocupaciones WHERE hasta IS NOT NULL
UNION ALL
SELECT '=== CARGOS ===', '', 0 WHERE false
UNION ALL
SELECT '---', 'total_cargos', COUNT(*) FROM cargos
UNION ALL
SELECT '---', 'vigentes', COUNT(*) FROM cargos WHERE estado = 'vigente'
UNION ALL
SELECT '---', 'no_vigentes', COUNT(*) FROM cargos WHERE estado = 'no_vigente'
UNION ALL
SELECT '---', 'validacion_vacante', COUNT(*) FROM cargos WHERE estado = 'validacion_vacante'
UNION ALL
SELECT '---', 'vigentes_sin_ocupacion', COUNT(*) FROM cargos c
  WHERE c.estado = 'vigente'
  AND NOT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL)
UNION ALL
SELECT '---', 'novigente_con_ocupacion', COUNT(*) FROM cargos c
  WHERE c.estado = 'no_vigente'
  AND EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL)
UNION ALL
SELECT '=== DIFFS ===', '', 0 WHERE false
UNION ALL
SELECT '---', 'diffs_nuevo_sin_ocupacion', COUNT(*) FROM padron_diff d
  WHERE d.tipo = 'nuevo'
  AND NOT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.id_sial_rol = d.id_sial_rol)
UNION ALL
SELECT '=== CASO ESPECIFICO ===', '', 0 WHERE false
UNION ALL
SELECT '---', 'jozami_cuil_27251686977_ocupaciones',
  (SELECT COUNT(*) FROM ocupaciones o JOIN personas p ON o.persona_id = p.id WHERE p.cuil = '27251686977')
UNION ALL
SELECT '---', 'jozami_apellido_ok',
  (SELECT COUNT(*) FROM personas WHERE cuil = '27251686977' AND apellido IS NOT NULL AND apellido != '');
