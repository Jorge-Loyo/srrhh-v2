-- =============================================================================
-- AUDITORÍA DE CONSISTENCIA — LÓGICA DE CARGOS
-- Doc/Contrato_logica-cargo.md
--
-- Cómo correr:
--   psql $DATABASE_URL -f scripts/auditoria-cargos.sql
--
-- Resultado esperado cuando todo está OK: 0 filas en cada check.
-- =============================================================================

\echo ''
\echo '======================================================================'
\echo 'CHECK 1 — Cargos no_vigente con ocupación activa (hasta IS NULL)'
\echo 'Regla: un cargo no_vigente NO puede tener ocupaciones activas.'
\echo '======================================================================'

SELECT
  c.id            AS cargo_id,
  c.codigo        AS codigo_cargo,
  c.estado        AS estado_cargo,
  o.id            AS ocupacion_id,
  o.id_sial_rol,
  p.apellido_nombre,
  p.cuil,
  o.situacion_revista,
  o.desde
FROM cargos c
JOIN ocupaciones o ON o.cargo_id = c.id AND o.hasta IS NULL
JOIN personas p    ON p.id = o.persona_id
WHERE c.estado = 'no_vigente'
ORDER BY c.codigo, o.desde;

\echo ''
\echo '======================================================================'
\echo 'CHECK 2 — Cargos con más de una ocupación activa simultánea'
\echo 'Regla: solo puede existir UNA ocupación activa (hasta IS NULL) por cargo.'
\echo '======================================================================'

SELECT
  c.id            AS cargo_id,
  c.codigo        AS codigo_cargo,
  c.estado        AS estado_cargo,
  COUNT(o.id)     AS ocupaciones_activas,
  STRING_AGG(
    p.apellido_nombre || ' (' || o.id_sial_rol || ')',
    ' | ' ORDER BY o.desde
  )               AS personas
FROM cargos c
JOIN ocupaciones o ON o.cargo_id = c.id AND o.hasta IS NULL
JOIN personas p    ON p.id = o.persona_id
GROUP BY c.id, c.codigo, c.estado
HAVING COUNT(o.id) > 1
ORDER BY ocupaciones_activas DESC, c.codigo;

\echo ''
\echo '======================================================================'
\echo 'CHECK 3 — Concursos activos sobre cargos no_vigente'
\echo 'Regla: no puede generarse un concurso sobre un cargo no_vigente.'
\echo '======================================================================'

SELECT
  c.id            AS cargo_id,
  c.codigo        AS codigo_cargo,
  c.estado        AS estado_cargo,
  con.id          AS concurso_id,
  con.tipo_concurso,
  con.fecha_vacante,
  -- Estado del sub-concurso CPH si existe
  cph.estado      AS estado_cph,
  cph.sub_estado  AS sub_estado_cph,
  -- Estado del sub-concurso CEETPS si existe
  cee.estado      AS estado_ceetps
FROM cargos c
JOIN concursos con ON con.cargo_id = c.id
LEFT JOIN concursos_cph  cph ON cph.concurso_id = con.id
LEFT JOIN concursos_ceetps cee ON cee.concurso_id = con.id
WHERE c.estado = 'no_vigente'
  AND (
    -- CPH no cerrado
    (cph.id IS NOT NULL AND cph.estado NOT IN ('finalizado', 'desierto'))
    OR
    -- CEETPS no cerrado
    (cee.id IS NOT NULL AND cee.estado NOT IN ('finalizado', 'desierto'))
    OR
    -- Concurso sin sub-tipo (sin_concurso)
    (cph.id IS NULL AND cee.id IS NULL)
  )
ORDER BY c.codigo, con.fecha_vacante;

\echo ''
\echo '======================================================================'
\echo 'CHECK 4 — Cargos duplicados por identidad estructural'
\echo 'Regla: el cargo se identifica por (hospital, escalafon, codigo_repa,'
\echo '       literal_puesto). No deben existir dos cargos con la misma clave.'
\echo '======================================================================'

SELECT
  h.sigla                 AS hospital,
  e.nombre                AS escalafon,
  c.codigo_repa,
  c.literal_puesto,
  COUNT(c.id)             AS cantidad_cargos,
  STRING_AGG(
    c.codigo || ' [' || c.estado || ']',
    ' | ' ORDER BY c.codigo
  )                       AS codigos
FROM cargos c
JOIN hospitales  h ON h.id = c.hospital_id
JOIN escalafones e ON e.id = c.escalafon_id
WHERE c.codigo_repa    IS NOT NULL
  AND c.literal_puesto IS NOT NULL
GROUP BY h.sigla, e.nombre, c.codigo_repa, c.literal_puesto
HAVING COUNT(c.id) > 1
ORDER BY cantidad_cargos DESC, h.sigla, c.literal_puesto;

\echo ''
\echo '======================================================================'
\echo 'CHECK 5 — Bajas sin cierre de ocupación'
\echo 'Regla: al registrar una baja, la ocupación activa debe cerrarse'
\echo '       (hasta = fecha_baja) en la misma transacción.'
\echo '======================================================================'

SELECT
  b.id            AS baja_id,
  c.codigo        AS codigo_cargo,
  c.estado        AS estado_cargo,
  b.fecha_baja,
  b.tipo_baja,
  b.estado        AS estado_baja,
  o.id            AS ocupacion_id,
  o.id_sial_rol,
  p.apellido_nombre,
  o.hasta         AS ocupacion_hasta
FROM bajas b
JOIN cargos c      ON c.id = b.cargo_id
JOIN ocupaciones o ON o.cargo_id = b.cargo_id AND o.hasta IS NULL
JOIN personas p    ON p.id = o.persona_id
WHERE c.estado = 'no_vigente'
  -- La ocupación debería estar cerrada pero no lo está
  AND o.hasta IS NULL
ORDER BY b.fecha_baja DESC, c.codigo;

\echo ''
\echo '======================================================================'
\echo 'RESUMEN'
\echo '======================================================================'

SELECT
  'CHECK 1 - no_vigente con ocupacion activa'  AS check_nombre,
  COUNT(*)                                      AS filas_inconsistentes
FROM cargos c
JOIN ocupaciones o ON o.cargo_id = c.id AND o.hasta IS NULL
WHERE c.estado = 'no_vigente'

UNION ALL

SELECT
  'CHECK 2 - multiples ocupaciones activas',
  COUNT(*) FROM (
    SELECT c.id
    FROM cargos c
    JOIN ocupaciones o ON o.cargo_id = c.id AND o.hasta IS NULL
    GROUP BY c.id
    HAVING COUNT(o.id) > 1
  ) sub

UNION ALL

SELECT
  'CHECK 3 - concursos activos en no_vigente',
  COUNT(*)
FROM cargos c
JOIN concursos con ON con.cargo_id = c.id
LEFT JOIN concursos_cph  cph ON cph.concurso_id = con.id
LEFT JOIN concursos_ceetps cee ON cee.concurso_id = con.id
WHERE c.estado = 'no_vigente'
  AND (
    (cph.id IS NOT NULL AND cph.estado NOT IN ('finalizado', 'desierto'))
    OR (cee.id IS NOT NULL AND cee.estado NOT IN ('finalizado', 'desierto'))
    OR (cph.id IS NULL AND cee.id IS NULL)
  )

UNION ALL

SELECT
  'CHECK 4 - cargos duplicados por identidad',
  COUNT(*) FROM (
    SELECT c.codigo_repa, c.literal_puesto, c.hospital_id, c.escalafon_id
    FROM cargos c
    WHERE c.codigo_repa IS NOT NULL AND c.literal_puesto IS NOT NULL
    GROUP BY c.codigo_repa, c.literal_puesto, c.hospital_id, c.escalafon_id
    HAVING COUNT(c.id) > 1
  ) sub

UNION ALL

SELECT
  'CHECK 5 - bajas sin cierre de ocupacion',
  COUNT(*)
FROM bajas b
JOIN cargos c      ON c.id = b.cargo_id
JOIN ocupaciones o ON o.cargo_id = b.cargo_id AND o.hasta IS NULL
WHERE c.estado = 'no_vigente'

ORDER BY check_nombre;
