SELECT 
  COUNT(*) FILTER (WHERE puesto_codigo_sial IS NOT NULL) AS puesto_codigo_sial_notnull,
  COUNT(*) FILTER (WHERE cod_agrupamiento IS NOT NULL)   AS cod_agrupamiento_notnull,
  COUNT(*) FILTER (WHERE agrupamiento IS NOT NULL)       AS agrupamiento_notnull,
  COUNT(*)                                               AS total
FROM cargos;

SELECT 
  COUNT(*) FILTER (WHERE dias_guardia != '{}' AND dias_guardia IS NOT NULL) AS dias_guardia_notnull,
  COUNT(*)                                                                   AS total
FROM ocupaciones;

-- Muestra de valores distintos de dias_guardia
SELECT DISTINCT dias_guardia 
FROM ocupaciones 
WHERE dias_guardia != '{}'
LIMIT 10;

-- Muestra de valores distintos de cod_agrupamiento / agrupamiento
SELECT DISTINCT cod_agrupamiento, agrupamiento
FROM cargos
WHERE cod_agrupamiento IS NOT NULL
LIMIT 10;

-- puesto_codigo_sial: muestra de valores
SELECT DISTINCT puesto_codigo_sial
FROM cargos
WHERE puesto_codigo_sial IS NOT NULL
LIMIT 10;
