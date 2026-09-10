-- Backfill completo de kpis_dotacion_snapshot: un punto por mes (ultimo snapshot del mes)
-- Reconstruye el estado activo de cada id_sial_rol en cada corte mensual
-- usando padron_historico + padron_diff eliminados.
-- Tarda ~37s pero se ejecuta una sola vez.

DELETE FROM kpis_dotacion_snapshot;

INSERT INTO kpis_dotacion_snapshot (fecha, escalafon, personas)
WITH
cortes AS (
  SELECT DISTINCT
    max(fecha_asignada) OVER (PARTITION BY date_trunc('month', fecha_asignada)) AS corte
  FROM padron_snapshots
  WHERE estado = 'aprobado'
),
fechas AS (
  SELECT DISTINCT corte FROM cortes
),
roles AS (
  SELECT DISTINCT ON (ph.id_sial_rol)
    ph.id_sial_rol,
    ph.cargo_id,
    p.cuil
  FROM padron_historico ph
  JOIN personas p ON p.id = ph.persona_id
  WHERE p.cuil IS NOT NULL
  ORDER BY ph.id_sial_rol, ph.fecha_asignada ASC
),
bajas AS (
  SELECT d.id_sial_rol, ps.fecha_asignada AS fecha_baja
  FROM padron_diff d
  JOIN padron_snapshots ps ON ps.id = d.snapshot_id
  WHERE d.tipo = 'eliminado'
),
activos AS (
  SELECT
    f.corte,
    r.id_sial_rol,
    r.cargo_id,
    r.cuil
  FROM fechas f
  JOIN roles r ON true
  WHERE EXISTS (
    SELECT 1 FROM padron_historico ph2
    WHERE ph2.id_sial_rol = r.id_sial_rol
      AND ph2.fecha_asignada <= f.corte
  )
  AND NOT EXISTS (
    SELECT 1 FROM bajas b
    WHERE b.id_sial_rol = r.id_sial_rol
      AND b.fecha_baja <= f.corte
      AND NOT EXISTS (
        SELECT 1 FROM padron_historico ph3
        WHERE ph3.id_sial_rol = r.id_sial_rol
          AND ph3.fecha_asignada > b.fecha_baja
          AND ph3.fecha_asignada <= f.corte
      )
  )
)
SELECT
  a.corte AS fecha,
  e.nombre AS escalafon,
  count(DISTINCT a.cuil)::integer AS personas
FROM activos a
JOIN cargos c ON c.id = a.cargo_id
JOIN escalafones e ON e.id = c.escalafon_id
GROUP BY a.corte, e.nombre
ORDER BY a.corte, personas DESC;
