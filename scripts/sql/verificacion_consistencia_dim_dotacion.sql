-- ============================================================
-- 6.4.6 — Verificación de consistencia /dotacion vs /dim-dotacion
-- ============================================================
-- Compara la foto actual de actividad entre:
--   LEGACY : ocupaciones (o.hasta IS NULL + c.estado='vigente')
--   NUEVO  : dim_actividad_hechos (fecha_hasta IS NULL)
--
-- Ejecutar contra Neon_BD. Sin modificaciones a la BD.
-- ============================================================

-- ── 1. Totales globales ──────────────────────────────────────
SELECT
  'legacy'  AS fuente,
  count(*)  AS total_activos
FROM ocupaciones o
JOIN cargos c ON c.id = o.cargo_id
WHERE o.hasta IS NULL AND c.estado = 'vigente'

UNION ALL

SELECT
  'dim'     AS fuente,
  count(*)  AS total_activos
FROM dim_actividad_hechos
WHERE fecha_hasta IS NULL;

-- ── 2. En dim pero NO en ocupaciones (por id_sial_rol) ───────
-- Estos son puestos que el padrón MSGC tiene activos pero el
-- sistema operativo no tiene como ocupación vigente.
SELECT
  dah.id_sial_rol,
  dah.cuil,
  dah.situacion_revista,
  dah.fecha_desde,
  dah.codigo_cargo
FROM dim_actividad_hechos dah
WHERE dah.fecha_hasta IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM ocupaciones o
    WHERE o.id_sial_rol = dah.id_sial_rol
      AND o.hasta IS NULL
  )
ORDER BY dah.fecha_desde DESC
LIMIT 100;

-- ── 3. En ocupaciones pero NO en dim (por id_sial_rol) ───────
-- Estos son puestos que el sistema operativo tiene vigentes
-- pero dim_actividad_hechos no tiene abiertos.
-- Filtro: solo ocupaciones con id_sial_rol no nulo (las que
-- vienen del padrón MSGC — las manuales no tienen id_sial_rol).
SELECT
  o.id_sial_rol,
  o.cuil,
  o.situacion_revista,
  c.codigo AS codigo_cargo,
  h.sigla  AS efector
FROM ocupaciones o
JOIN cargos c    ON c.id = o.cargo_id
JOIN hospitales h ON h.id = c.hospital_id
WHERE o.hasta IS NULL
  AND c.estado = 'vigente'
  AND o.id_sial_rol IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM dim_actividad_hechos dah
    WHERE dah.id_sial_rol = o.id_sial_rol
      AND dah.fecha_hasta IS NULL
  )
ORDER BY h.sigla, o.id_sial_rol
LIMIT 100;

-- ── 4. Conteo de discrepancias (resumen ejecutivo) ───────────
WITH
  legacy AS (
    SELECT o.id_sial_rol
    FROM ocupaciones o
    JOIN cargos c ON c.id = o.cargo_id
    WHERE o.hasta IS NULL AND c.estado = 'vigente'
      AND o.id_sial_rol IS NOT NULL
  ),
  dim AS (
    SELECT id_sial_rol
    FROM dim_actividad_hechos
    WHERE fecha_hasta IS NULL
  )
SELECT
  (SELECT count(*) FROM legacy)                                    AS legacy_total,
  (SELECT count(*) FROM dim)                                       AS dim_total,
  (SELECT count(*) FROM dim    WHERE id_sial_rol NOT IN (SELECT id_sial_rol FROM legacy)) AS en_dim_no_legacy,
  (SELECT count(*) FROM legacy WHERE id_sial_rol NOT IN (SELECT id_sial_rol FROM dim))   AS en_legacy_no_dim,
  (SELECT count(*) FROM legacy WHERE id_sial_rol IN (SELECT id_sial_rol FROM dim))       AS en_ambos;

-- ── 5. Discrepancias por efector ─────────────────────────────
-- Compara el conteo de activos por efector entre ambas fuentes.
-- Diferencias grandes indican efectores con datos desincronizados.
WITH
  legacy_por_efector AS (
    SELECT h.sigla AS efector, count(*) AS total
    FROM ocupaciones o
    JOIN cargos c     ON c.id = o.cargo_id
    JOIN hospitales h ON h.id = c.hospital_id
    WHERE o.hasta IS NULL AND c.estado = 'vigente'
    GROUP BY h.sigla
  ),
  dim_por_efector AS (
    SELECT pue.efector, count(*) AS total
    FROM dim_actividad_hechos dah
    LEFT JOIN dim_puestos pue ON pue.id_sial_rol = dah.id_sial_rol
    WHERE dah.fecha_hasta IS NULL
    GROUP BY pue.efector
  )
SELECT
  coalesce(l.efector, d.efector) AS efector,
  coalesce(l.total, 0)           AS legacy_total,
  coalesce(d.total, 0)           AS dim_total,
  coalesce(d.total, 0) - coalesce(l.total, 0) AS diferencia
FROM legacy_por_efector l
FULL OUTER JOIN dim_por_efector d ON d.efector = l.efector
ORDER BY abs(coalesce(d.total, 0) - coalesce(l.total, 0)) DESC;

-- ── 6. Discrepancias por código de registro (carrera) ────────
WITH
  legacy_por_cr AS (
    SELECT cr.codigo AS codigo_registro, count(*) AS total
    FROM ocupaciones o
    JOIN cargos c           ON c.id = o.cargo_id
    LEFT JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
    WHERE o.hasta IS NULL AND c.estado = 'vigente'
    GROUP BY cr.codigo
  ),
  dim_por_cr AS (
    SELECT pue.codigo_registro, count(*) AS total
    FROM dim_actividad_hechos dah
    LEFT JOIN dim_puestos pue ON pue.id_sial_rol = dah.id_sial_rol
    WHERE dah.fecha_hasta IS NULL
    GROUP BY pue.codigo_registro
  )
SELECT
  coalesce(l.codigo_registro, d.codigo_registro) AS codigo_registro,
  coalesce(l.total, 0)                            AS legacy_total,
  coalesce(d.total, 0)                            AS dim_total,
  coalesce(d.total, 0) - coalesce(l.total, 0)    AS diferencia
FROM legacy_por_cr l
FULL OUTER JOIN dim_por_cr d ON d.codigo_registro = l.codigo_registro
ORDER BY abs(coalesce(d.total, 0) - coalesce(l.total, 0)) DESC;
