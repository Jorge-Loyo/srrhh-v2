-- ¿Qué carreras (codigo_registro) aparecen en dim_puestos para los sin-match?
SELECT p.sigla, p.perfil, p.especialidad, dp.codigo_registro, count(*) as n
FROM pou p
JOIN dim_puestos dp
  ON dp.efector = p.sigla
  AND lower(dp.literal_puesto) = lower(p.perfil)
WHERE lower(coalesce(dp.especialidad,'')) != lower(coalesce(p.especialidad,''))
GROUP BY p.sigla, p.perfil, p.especialidad, dp.codigo_registro
ORDER BY n DESC
LIMIT 10;

-- ¿Los sin-match tienen dim_puestos con mismo efector+perfil pero distinta especialidad?
SELECT p.sigla, p.perfil, p.especialidad AS esp_pou,
       dp.especialidad AS esp_dim, dp.codigo_registro, count(*) as n
FROM pou p
LEFT JOIN dim_puestos dp
  ON dp.efector = p.sigla
  AND lower(dp.literal_puesto) = lower(p.perfil)
  AND lower(coalesce(dp.especialidad,'')) = lower(coalesce(p.especialidad,''))
WHERE dp.id_sial_rol IS NULL
  AND EXISTS (
    SELECT 1 FROM dim_puestos dp2
    WHERE dp2.efector = p.sigla AND lower(dp2.literal_puesto) = lower(p.perfil)
  )
LIMIT 10;

-- Cobertura si ignoramos especialidad (solo sigla+perfil)
SELECT
  count(*) AS total_pou,
  count(*) FILTER (WHERE cnt > 0) AS con_match_sin_esp,
  count(*) FILTER (WHERE cnt = 0) AS sin_match_sin_esp
FROM (
  SELECT p.sigla, p.perfil, p.especialidad, count(dp.id_sial_rol) AS cnt
  FROM pou p
  LEFT JOIN dim_puestos dp
    ON dp.efector = p.sigla
    AND lower(dp.literal_puesto) = lower(p.perfil)
  GROUP BY p.sigla, p.perfil, p.especialidad
) sub;

-- ¿Qué tienen los 307 sin match? ¿Existen en dim_puestos con ese efector?
SELECT p.sigla,
  count(*) AS sin_match,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM dim_puestos dp WHERE dp.efector = p.sigla
  )) AS efector_existe_en_dim
FROM pou p
LEFT JOIN dim_puestos dp
  ON dp.efector = p.sigla
  AND lower(dp.literal_puesto) = lower(p.perfil)
  AND lower(coalesce(dp.especialidad,'')) = lower(coalesce(p.especialidad,''))
WHERE dp.id_sial_rol IS NULL
GROUP BY p.sigla
ORDER BY sin_match DESC
LIMIT 10;
