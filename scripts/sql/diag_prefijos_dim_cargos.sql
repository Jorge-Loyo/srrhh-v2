SELECT
  regexp_replace(codigo_cargo, '-[0-9]{6}$', '') AS prefijo,
  count(*)::int AS total,
  count(*) FILTER (WHERE estado = 'vigente')::int AS vigentes,
  count(*) FILTER (WHERE estado = 'validacion_vacante')::int AS en_validacion
FROM dim_cargos
GROUP BY 1
ORDER BY total DESC;
