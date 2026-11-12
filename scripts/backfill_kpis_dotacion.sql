-- =====================================================================
-- Backfill completo de kpis_dotacion_snapshot — MOTOR UNIFICADO
-- =====================================================================
-- Un punto por mes (último snapshot aprobado del mes) × código de registro ×
-- situación de revista. Series por estado NO disjuntas + fila '(total)' por
-- carrera, todo count(DISTINCT cuil). Reconstruye el estado acumulado de
-- padron_historico + padron_diff a cada corte mensual.
--
-- FUENTE DE VERDAD del CTE de estado acumulado: la función TypeScript
-- `estadoActivoAcumuladoSql` en apps/api/src/modules/kpis/kpis.service.ts
-- (usada por la consulta individual y por el populate al aprobar). El bloque
-- `WITH ... cortes/corte_actual/bajas/hist/vigente ...` de abajo es una COPIA
-- TEXTUAL de lo que genera esa función (sin filtro de mes). Si se cambia la
-- lógica de estado allá, actualizar también acá.
--
-- Lo corre el USUARIO en Neon, DESPUÉS de scripts/normalizar_situacion_revista.sql.
-- Tarda unos segundos (un corte por mes). Idempotente: DELETE total + re-INSERT.
-- =====================================================================

DELETE FROM kpis_dotacion_snapshot;

INSERT INTO kpis_dotacion_snapshot (fecha, codigo_registro, situacion_revista, personas)
WITH
-- ── Copia textual de estadoActivoAcumuladoSql (sin filtro de mes) ──────────
cortes AS (
  SELECT DISTINCT
    date_trunc('month', fecha_asignada) AS mes,
    max(fecha_asignada) OVER (PARTITION BY date_trunc('month', fecha_asignada)) AS corte
  FROM padron_snapshots
  WHERE estado = 'aprobado'
),
corte_actual AS (SELECT max(corte) AS corte FROM cortes),
bajas AS (
  SELECT d.id_sial_rol, ps.fecha_asignada AS fecha_baja
  FROM padron_diff d
  JOIN padron_snapshots ps ON ps.id = d.snapshot_id
  WHERE d.tipo = 'eliminado'
),
hist AS (
  SELECT
    ph.id_sial_rol,
    ph.persona_id,
    ph.cargo_id,
    ph.literal_puesto,
    ph.especialidad,
    ph.hospital_sigla,
    ph.situacion_revista,
    ph.fecha_asignada,
    lead(ph.fecha_asignada) OVER (PARTITION BY ph.id_sial_rol ORDER BY ph.fecha_asignada) AS prox_fecha
  FROM padron_historico ph
),
vigente AS (
  SELECT
    c.corte,
    c.mes,
    h.id_sial_rol,
    h.persona_id,
    h.cargo_id,
    h.literal_puesto,
    h.especialidad,
    h.hospital_sigla,
    h.situacion_revista
  FROM cortes c
  JOIN hist h ON h.fecha_asignada <= c.corte AND (h.prox_fecha IS NULL OR h.prox_fecha > c.corte)
),
estado AS (
  SELECT v.*
  FROM vigente v
  WHERE NOT EXISTS (
    SELECT 1 FROM bajas b
    WHERE b.id_sial_rol = v.id_sial_rol
      AND b.fecha_baja <= v.corte
      AND NOT EXISTS (
        SELECT 1 FROM padron_historico ph3
        WHERE ph3.id_sial_rol = v.id_sial_rol
          AND ph3.fecha_asignada > b.fecha_baja
          AND ph3.fecha_asignada <= v.corte
      )
  )
  AND (
    v.corte <> (SELECT corte FROM corte_actual)
    OR EXISTS (
      SELECT 1 FROM ocupaciones o
      WHERE o.id_sial_rol = v.id_sial_rol AND o.hasta IS NULL
    )
  )
),
-- ── Normalización: código de registro + situación de revista ───────────────
norm AS (
  SELECT
    estado.corte,
    p.cuil,
    coalesce(cr.codigo, '(sin codigo)') AS codigo,
    coalesce(lower(unaccent(trim(estado.situacion_revista))), '(sin dato)') AS sit
  FROM estado
  JOIN cargos c ON c.id = estado.cargo_id
  LEFT JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
  JOIN personas p ON p.id = estado.persona_id
  WHERE p.cuil IS NOT NULL
)
-- Series por estado (NO disjuntas) + fila '(total)' por carrera. count(DISTINCT
-- cuil) en todos los casos; el total NO es la suma de los estados.
SELECT corte AS fecha, codigo, sit AS situacion_revista, count(DISTINCT cuil)::int AS personas
  FROM norm GROUP BY corte, codigo, sit
UNION ALL
SELECT corte AS fecha, codigo, '(total)' AS situacion_revista, count(DISTINCT cuil)::int AS personas
  FROM norm GROUP BY corte, codigo;

-- =====================================================================
-- Controles post-backfill (revisión manual; no modifican datos)
-- =====================================================================

-- Variantes residuales de situacion_revista en el estado acumulado del último
-- corte (deberían ser solo activo / comision / retencion de cargo / (sin dato)).
WITH ultimo AS (
  SELECT max(fecha) AS fecha FROM kpis_dotacion_snapshot
)
SELECT situacion_revista, count(*) AS filas_carrera
FROM kpis_dotacion_snapshot
WHERE fecha = (SELECT fecha FROM ultimo)
  AND situacion_revista <> '(total)'
GROUP BY situacion_revista
ORDER BY situacion_revista;

-- Personas en el bucket '(sin codigo)' (cargos sin codigo_registro_id) al último corte.
WITH ultimo AS (
  SELECT max(fecha) AS fecha FROM kpis_dotacion_snapshot
)
SELECT personas AS personas_sin_codigo_total
FROM kpis_dotacion_snapshot
WHERE fecha = (SELECT fecha FROM ultimo)
  AND codigo_registro = '(sin codigo)'
  AND situacion_revista = '(total)';

-- Personas con cargos vigentes en MÁS DE UN código de registro al corte más
-- reciente (métrica de control: una persona puede pertenecer legítimamente a
-- dos carreras; no se aplica regla de atribución única).
WITH cortes AS (
  SELECT DISTINCT
    max(fecha_asignada) OVER (PARTITION BY date_trunc('month', fecha_asignada)) AS corte
  FROM padron_snapshots WHERE estado = 'aprobado'
),
corte_actual AS (SELECT max(corte) AS corte FROM cortes),
hist AS (
  SELECT ph.id_sial_rol, ph.persona_id, ph.cargo_id, ph.fecha_asignada,
    lead(ph.fecha_asignada) OVER (PARTITION BY ph.id_sial_rol ORDER BY ph.fecha_asignada) AS prox_fecha
  FROM padron_historico ph
),
vigente AS (
  SELECT h.persona_id, h.cargo_id
  FROM corte_actual ca
  JOIN hist h ON h.fecha_asignada <= ca.corte AND (h.prox_fecha IS NULL OR h.prox_fecha > ca.corte)
),
por_persona AS (
  SELECT p.cuil, count(DISTINCT coalesce(cr.codigo, '(sin codigo)')) AS codigos
  FROM vigente v
  JOIN cargos c ON c.id = v.cargo_id
  LEFT JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
  JOIN personas p ON p.id = v.persona_id
  WHERE p.cuil IS NOT NULL
  GROUP BY p.cuil
)
SELECT count(*) AS personas_multi_codigo
FROM por_persona
WHERE codigos > 1;
