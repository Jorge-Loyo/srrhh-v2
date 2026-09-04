WITH
base AS (
  SELECT ph.fecha_asignada, ph.id_sial_rol, ph.cuil, e.nombre AS escalafon
  FROM padron_historico ph
  JOIN cargos c ON c.id = ph.cargo_id
  JOIN escalafones e ON e.id = c.escalafon_id
  WHERE ph.cuil IS NOT NULL
    AND ph.fecha_asignada = (SELECT min(fecha_asignada) FROM padron_historico)
),
fechas AS (
  SELECT DISTINCT fecha_asignada FROM padron_snapshots WHERE estado = 'aprobado' ORDER BY fecha_asignada
),
altas AS (
  SELECT
    ps.fecha_asignada,
    d.id_sial_rol,
    split_part((d.valor_nuevo::jsonb->>'cuil_y_rol'), '-', 1) AS cuil,
    COALESCE(
      (SELECT e2.nombre FROM ocupaciones o2
       JOIN cargos c2 ON c2.id = o2.cargo_id
       JOIN escalafones e2 ON e2.id = c2.escalafon_id
       WHERE o2.id_sial_rol = d.id_sial_rol LIMIT 1),
      (d.valor_nuevo::jsonb->>'escalafon')
    ) AS escalafon
  FROM padron_diff d
  JOIN padron_snapshots ps ON ps.id = d.snapshot_id
  WHERE d.tipo = 'nuevo'
    AND (d.valor_nuevo::jsonb->>'cuil_y_rol') IS NOT NULL
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
),
resultado AS (
  SELECT fecha, escalafon, count(DISTINCT cuil)::bigint AS personas
  FROM activos
  WHERE cuil IS NOT NULL AND escalafon IS NOT NULL
  GROUP BY fecha, escalafon
)
-- Ultimo punto de cada mes, solo CPH
SELECT r.fecha, r.escalafon, r.personas
FROM resultado r
WHERE r.fecha IN (SELECT max(fecha) FROM resultado GROUP BY to_char(fecha, 'YYYY-MM'))
  AND r.escalafon LIKE 'Nueva Carrera Prof%'
ORDER BY r.fecha;
