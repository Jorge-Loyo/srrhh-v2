-- Tablas que NO deberian existir (resultado esperado: 0 filas)
SELECT 'tablas_dropeadas_quedan' AS check, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'roles_persona','refresh_tokens','audit_logs',
  'ref_agrupadores','ref_unificadores_puesto','ref_especialidades_cuil',
  'ref_correcciones_especialidad','ref_especialidad_por_puesto'
);

-- Columnas de cargos que NO deberian existir (esperado: 0 filas)
SELECT 'cols_cargos_quedan' AS check, column_name
FROM information_schema.columns
WHERE table_name = 'cargos'
AND column_name IN ('agrupador','unificador_puesto','puesto_codigo_sial','cod_agrupamiento','agrupamiento');

-- Columna nueva que SI debe existir (esperado: 1 fila)
SELECT 'cargo_ejecucion_id_existe' AS check, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'cargos' AND column_name = 'cargo_ejecucion_id';

-- Columnas de personas que NO deberian existir (esperado: 0 filas)
SELECT 'cols_personas_quedan' AS check, column_name
FROM information_schema.columns
WHERE table_name = 'personas' AND column_name IN ('apellido','nombre');

-- Columnas de padron_historico que NO deberian existir (esperado: 0 filas)
SELECT 'cols_padron_hist_quedan' AS check, column_name
FROM information_schema.columns
WHERE table_name = 'padron_historico'
AND column_name IN ('estado_persona','agrupador','unificador_puesto');

-- Columnas de ocupaciones que NO deberian existir (esperado: 0 filas)
SELECT 'cols_ocupaciones_quedan' AS check, column_name
FROM information_schema.columns
WHERE table_name = 'ocupaciones'
AND column_name IN ('estado_persona','dias_guardia');
