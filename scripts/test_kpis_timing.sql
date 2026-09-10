\timing on
WITH
base AS (
  SELECT ph.id_sial_rol, ph.cuil, ph.escalafon
  FROM padron_historico ph
  WHERE ph.fecha_asignada = (SELECT min(fecha_asignada) FROM padron_historico)
    AND ph.cuil IS NOT NULL AND ph.escalafon IS NOT NULL
),
fechas AS (
  SELECT DISTINCT ps.fecha_asignada
  FROM padron_snapshots ps
  WHERE ps.estado = 'aprobado'
  ORDER BY fecha_asignada
),
altas AS (
  SELECT ps.fecha_asignada, d.id_sial_rol,
    split_part(d.valor_nuevo::jsonb->>'cuil_y_rol','-',1) AS cuil,
    d.valor_nuevo::jsonb->>'escalafon' AS escalafon
  FROM padron_diff d
  JOIN padron_snapshots ps ON ps.id = d.snapshot_id
  WHERE d.tipo = 'nuevo' AND d.valor_nuevo IS NOT NULL
),
bajas AS (
  SELECT ps.fecha_asignada, d.id_sial_rol
  FROM padron_diff d
  JOIN padron_snapshots ps ON ps.id = d.snapshot_id
  WHERE d.tipo = 'eliminado'
),
activos AS (
  SELECT f.fecha_asignada AS fecha, b.cuil, b.escalafon
  FROM fechas f
  JOIN base b ON true
  LEFT JOIN bajas bj ON bj.id_sial_rol = b.id_sial_rol AND bj.fecha_asignada <= f.fecha_asignada
  WHERE bj.id_sial_rol IS NULL
  UNION ALL
  SELECT f.fecha_asignada AS fecha, a.cuil, a.escalafon
  FROM fechas f
  JOIN altas a ON a.fecha_asignada <= f.fecha_asignada
  LEFT JOIN bajas bj ON bj.id_sial_rol = a.id_sial_rol AND bj.fecha_asignada <= f.fecha_asignada
  WHERE bj.id_sial_rol IS NULL AND a.cuil IS NOT NULL AND a.escalafon IS NOT NULL
)
SELECT fecha, escalafon, count(DISTINCT cuil)::bigint AS personas
FROM activos
WHERE cuil IS NOT NULL AND escalafon IS NOT NULL
GROUP BY fecha, escalafon
ORDER BY fecha, escalafon;
