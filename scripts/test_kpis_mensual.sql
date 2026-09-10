\timing on
-- Para cada mes: id_sial_rol activos = aparecen en padron_historico hasta ese mes
-- y NO tienen diff 'eliminado' hasta ese mes.
-- El escalafon canonico viene de cargo_id -> escalafones.nombre.
-- El ultimo snapshot de cada mes define la fecha de corte.
WITH
cortes AS (
  SELECT DISTINCT
    date_trunc('month', fecha_asignada)::date AS mes,
    max(fecha_asignada) OVER (PARTITION BY date_trunc('month', fecha_asignada)) AS ultimo_del_mes
  FROM padron_snapshots
  WHERE estado = 'aprobado'
),
fechas AS (
  SELECT DISTINCT ultimo_del_mes AS corte FROM cortes
),
-- Todos los id_sial_rol que alguna vez aparecieron en padron_historico
-- con su cargo y cuil (la primera aparicion tiene los datos completos)
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
-- Bajas: id_sial_rol con diff 'eliminado' y en qué fecha
bajas AS (
  SELECT d.id_sial_rol, ps.fecha_asignada AS fecha_baja
  FROM padron_diff d
  JOIN padron_snapshots ps ON ps.id = d.snapshot_id
  WHERE d.tipo = 'eliminado'
),
-- Para cada corte mensual: roles activos = aparecen en historico hasta ese corte
-- y no tienen baja hasta ese corte (o tienen baja pero luego reaparecen)
activos AS (
  SELECT
    f.corte,
    r.id_sial_rol,
    r.cargo_id,
    r.cuil
  FROM fechas f
  JOIN roles r ON true
  -- Debe existir en padron_historico hasta este corte
  WHERE EXISTS (
    SELECT 1 FROM padron_historico ph2
    WHERE ph2.id_sial_rol = r.id_sial_rol
      AND ph2.fecha_asignada <= f.corte
  )
  -- No debe tener baja vigente al corte (o si tuvo baja, debe haber reaparecido despues)
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
