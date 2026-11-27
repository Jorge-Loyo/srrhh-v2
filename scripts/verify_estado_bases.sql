SELECT
  'cargos'                AS tabla, COUNT(*) AS filas FROM cargos
UNION ALL SELECT 'ocupaciones',               COUNT(*) FROM ocupaciones
UNION ALL SELECT 'bajas',                     COUNT(*) FROM bajas
UNION ALL SELECT 'concursos',                 COUNT(*) FROM concursos
UNION ALL SELECT 'personas',                  COUNT(*) FROM personas
UNION ALL SELECT 'padron_historico',          COUNT(*) FROM padron_historico
UNION ALL SELECT 'padron_snapshots',          COUNT(*) FROM padron_snapshots
UNION ALL SELECT 'kpis_dotacion_snapshot',    COUNT(*) FROM kpis_dotacion_snapshot
ORDER BY tabla;
