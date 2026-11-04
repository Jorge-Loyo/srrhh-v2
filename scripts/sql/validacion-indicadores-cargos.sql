-- Validación de Indicadores de cargos (Reportes > Indicadores de cargos).
-- LA CORRE JORGE EN WSL CON DATOS REALES: los agentes no tienen acceso a Neon y este
-- archivo no contiene cifras. Solo lectura: únicamente SELECT y CREATE TEMP VIEW (vistas
-- de la sesión, se descartan al cerrar).
--
-- Uso (psql 13+ por \if :{?var}):
--   psql "$NEON_DIRECT" -P pager=off -v corte=2026-10-31 -f scripts/sql/validacion-indicadores-cargos.sql
--   mes actual:  -v corte=$(date +%F)
--   override opcional de la carga inicial (design §5.4): -v carga_inicial_override=YYYY-MM-DD
--
-- Qué comprobar: V1 -> total_independiente = total_vista = suma_hojas (diferencia 0);
-- V1c -> vigente = ocupado + vacante + concurso y total = vigente + validacion + no_vigente
-- + indeterminado. Implementa la cascada R1..R9 como CASE de SQL: una segunda
-- implementación, escrita aparte del TypeScript, para comparar con la pantalla.
-- Con corte = hoy, el resultado debe coincidir con la columna "Mes actual" de la pantalla.
-- Abajo, V2..V9 miden la calidad del método (ver design.md §12).

\set tz 'America/Argentina/Buenos_Aires'
\set sub_estados '''a-autzn'',''b-sorteo jur'',''c-dispo de llamado'',''c2-inscripcion ex'',''d-examen publicado'',''e-orden de merito'',''f-ifacs'',''g-insal'',''i-carga docu'',''j-apto med'',''k-ite'',''l-pycto de reso'''
-- (esa línea la valida cargos-indicadores.sql-script.test.ts contra SUB_ESTADOS_CONCURSO_CPH: 12 valores.
--  las 4 etapas finales ('n-designado','o-alta sial','h-tad','m-reso a la firma') se agregan en línea solo para ADMISIÓN: el corte se decide por fechas, §5.1)

-- Override opcional de la carga inicial (§5.4). Uso: -v carga_inicial_override=2026-11-05 ; por defecto vacío (sin override)
\if :{?carga_inicial_override}
\else
  \set carga_inicial_override ''
\endif

DROP VIEW IF EXISTS pg_temp.v_ind_hoja;      -- calificado con pg_temp: nunca toca una vista permanente homónima
DROP VIEW IF EXISTS pg_temp.v_ind_hechos;

CREATE TEMP VIEW v_ind_hechos AS
WITH base AS (
  SELECT c.id, c.codigo_registro_id, c.estado::text AS estado,
         CASE WHEN c.estado_desde IS NULL THEN 'null'
              WHEN c.estado_desde <= :'corte'::date THEN 'le' ELSE 'gt' END AS ed_rel
  FROM cargos c
  WHERE ((c.created_at AT TIME ZONE :'tz')::date <= :'corte'::date
         OR (c.created_at AT TIME ZONE :'tz')::date <= nullif(:'carga_inicial_override', '')::date)  -- override (§5.4)
    AND (c.deleted_at IS NULL OR (c.deleted_at AT TIME ZONE :'tz')::date > :'corte'::date)
),
occ_rows AS (
  SELECT o.cargo_id,
         coalesce(nullif(lower(unaccent(trim(coalesce(h.situacion_revista, o.situacion_revista)))), ''),
                  '(sin dato)') AS sit,
         (h.situacion_revista IS NULL) AS sit_aprox
  FROM ocupaciones o
  JOIN base b ON b.id = o.cargo_id
  LEFT JOIN LATERAL (
    SELECT ph.situacion_revista FROM padron_historico ph
    WHERE ph.id_sial_rol = o.id_sial_rol AND ph.fecha_asignada <= :'corte'::date
    ORDER BY ph.fecha_asignada DESC LIMIT 1
  ) h ON true
  WHERE coalesce(o.desde, (o.created_at AT TIME ZONE :'tz')::date) <= :'corte'::date
    AND (o.hasta IS NULL OR o.hasta > :'corte'::date)
),
occ AS (
  SELECT cargo_id, array_agg(DISTINCT sit ORDER BY sit) AS sits, bool_or(sit_aprox) AS sit_aprox
  FROM occ_rows GROUP BY cargo_id
),
conc_rows AS (
  -- MISMO texto que sqlConcursos(corte) del servicio (§6.1), válido para el mes actual (corte = hoy) y el anterior
  SELECT cc.cargo_id, cc.fecha_autorizacion AS ini,
         least(
           cc.fecha_dispo_desierta,
           (SELECT min(coalesce(o2.desde, (o2.created_at AT TIME ZONE :'tz')::date)) FROM ocupaciones o2
             WHERE o2.cargo_id = cc.cargo_id
               AND coalesce(o2.desde, (o2.created_at AT TIME ZONE :'tz')::date) >= cc.fecha_autorizacion),
           (SELECT min((x.created_at AT TIME ZONE :'tz')::date) FROM concursos_cph x
             WHERE x.cargo_id = cc.cargo_id AND (x.created_at, x.id) > (cc.created_at, cc.id))
         ) AS fin,
         false AS cierre_sin_fecha
  FROM concursos_cph cc JOIN base b ON b.id = cc.cargo_id
  WHERE cc.fecha_autorizacion IS NOT NULL OR cc.fecha_dispo_desierta IS NOT NULL
     OR lower(cc.sub_estado) IN (:sub_estados, 'n-designado', 'o-alta sial', 'h-tad', 'm-reso a la firma')
  UNION ALL
  SELECT ce.cargo_id, ce.fecha_autorizacion,
         (SELECT min(coalesce(o2.desde, (o2.created_at AT TIME ZONE :'tz')::date)) FROM ocupaciones o2
           WHERE o2.cargo_id = ce.cargo_id
             AND coalesce(o2.desde, (o2.created_at AT TIME ZONE :'tz')::date) >= ce.fecha_autorizacion),
         (ce.estado::text IN ('finalizado','desierto'))
  FROM concursos_ceetps ce JOIN base b ON b.id = ce.cargo_id
  WHERE ce.estado::text IN ('autorizado','en_proceso','finalizado','desierto')
),
conc AS (
  SELECT cargo_id,
    bool_or(coalesce(ini <= :'corte'::date, false) AND NOT (cierre_sin_fecha AND fin IS NULL)
            AND (fin IS NULL OR fin > :'corte'::date)) AS si,
    bool_or(NOT coalesce(fin <= :'corte'::date, false)
            AND (ini IS NULL OR (cierre_sin_fecha AND fin IS NULL AND ini <= :'corte'::date))) AS desconocido
  FROM conc_rows GROUP BY cargo_id
)
SELECT b.id, b.codigo_registro_id, b.estado, b.ed_rel, occ.sits, coalesce(occ.sit_aprox, false) AS sit_aprox,
       CASE WHEN conc.si THEN 'si' WHEN conc.desconocido THEN 'desconocido' ELSE 'no' END AS concurso
FROM base b LEFT JOIN occ ON occ.cargo_id = b.id LEFT JOIN conc ON conc.cargo_id = b.id;

CREATE TEMP VIEW v_ind_hoja AS
SELECT f.*,
  CASE
    WHEN f.estado NOT IN ('vigente','validacion_vacante','no_vigente') THEN 'indeterminado'              -- R1
    WHEN f.estado = 'no_vigente'         AND f.ed_rel = 'le'   THEN 'no_vigente'                          -- R2a (aprox: pudo ser validación, V5b)
    WHEN f.estado = 'validacion_vacante' AND f.ed_rel = 'le'   THEN 'validacion'                          -- R2 (exacto)
    WHEN f.estado = 'no_vigente'         AND f.ed_rel = 'null' THEN 'no_vigente'                          -- R2b
    WHEN f.estado = 'validacion_vacante' AND f.ed_rel = 'null' THEN 'validacion'                          -- R2b
    WHEN f.sits IS NOT NULL THEN 'ocupado'                                                                -- R3
    WHEN f.concurso = 'si' THEN 'concurso'                                                                -- R4
    WHEN f.concurso = 'desconocido' THEN 'indeterminado'                                                  -- R5
    WHEN f.estado = 'vigente' AND f.ed_rel = 'gt' THEN 'indeterminado'                                    -- R6
    WHEN f.estado = 'no_vigente' THEN 'validacion'                                                        -- R7
    WHEN f.estado = 'validacion_vacante' THEN 'indeterminado'                                             -- R8
    ELSE 'vacante'                                                                                        -- R9
  END AS hoja
FROM v_ind_hechos f;

SELECT (SELECT count(*) FROM cargos c
         WHERE ((c.created_at AT TIME ZONE :'tz')::date <= :'corte'::date
                OR (c.created_at AT TIME ZONE :'tz')::date <= nullif(:'carga_inicial_override', '')::date)
           AND (c.deleted_at IS NULL OR (c.deleted_at AT TIME ZONE :'tz')::date > :'corte'::date)) AS total_independiente,
       (SELECT count(*) FROM v_ind_hoja) AS total_vista,
       (SELECT sum(n) FROM (SELECT hoja, count(*) n FROM v_ind_hoja GROUP BY hoja) x) AS suma_hojas;

-- V1d. Valores reales de situacion_revista (qué cae en 'ocupado_otra'): el catálogo activo/comision/retencion
-- de cargo solo está impuesto por zod en altas manuales, no en el padrón (hallazgo 6)
SELECT lower(unaccent(trim(coalesce(situacion_revista,'')))) AS sit, count(*) AS ocupaciones_vigentes
FROM ocupaciones WHERE hasta IS NULL GROUP BY 1 ORDER BY 2 DESC;
SELECT lower(unaccent(trim(coalesce(situacion_revista,'')))) AS sit, count(*) AS filas_historico
FROM padron_historico GROUP BY 1 ORDER BY 2 DESC;

-- V1b. Distribución por hoja (revisión visual: ¿cuánto cae en 'indeterminado'?)
SELECT hoja, count(*) FROM v_ind_hoja GROUP BY hoja ORDER BY 1;

-- V1c. Jerarquía de Jorge: vigente = ocupado + vacante + concurso; total = vigente + validacion + no_vigente + indeterminado
SELECT count(*) FILTER (WHERE hoja IN ('ocupado','vacante','concurso'))                                  AS vigente,
       count(*) FILTER (WHERE hoja = 'validacion')                                                       AS validacion,
       count(*) FILTER (WHERE hoja = 'no_vigente')                                                       AS no_vigente,
       count(*) FILTER (WHERE hoja = 'indeterminado')                                                    AS indeterminado,
       count(*)                                                                                          AS total
FROM v_ind_hoja;

-- V2. Por carrera, para comparar con la tabla de la pantalla
SELECT coalesce(cr.codigo, '(sin codigo)') AS carrera, h.hoja, count(*) AS cargos
FROM v_ind_hoja h LEFT JOIN codigos_registro cr ON cr.id = h.codigo_registro_id
GROUP BY 1, 2 ORDER BY 1, 2;

SELECT CASE WHEN c.estado = 'no_vigente' THEN 'no_vigente'
            WHEN c.estado = 'validacion_vacante' THEN 'validacion'
            WHEN EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL) THEN 'ocupado'
            ELSE 'vigente_sin_ocupante' END AS grupo,   -- = vacante + concurso + indeterminado de la vista
       count(*) AS cargos
FROM cargos c WHERE c.deleted_at IS NULL GROUP BY 1 ORDER BY 1;
SELECT count(*) AS total_vivo FROM cargos WHERE deleted_at IS NULL;
-- Comparación esperada con `-v corte=$(date +%F)` (sin override): no_vigente, validacion y ocupado idénticos a V1b;
-- vigente_sin_ocupante = vacante + concurso + indeterminado de V1b; total_vivo = total_independiente de V1.

SELECT CASE WHEN c.estado = 'vigente' THEN 'vigente/' || coalesce(c.sub_estado::text, 'null')
            ELSE c.estado::text END AS persistido,
       h.hoja AS reconstruido, count(*)
FROM v_ind_hoja h JOIN cargos c ON c.id = h.id GROUP BY 1, 2 ORDER BY 1, 2;

SELECT 'vigente/ocupado sin ocupante vigente' AS caso, count(*) FROM cargos c
 WHERE deleted_at IS NULL AND estado='vigente' AND sub_estado='ocupado'
   AND NOT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id=c.id AND o.hasta IS NULL)
UNION ALL SELECT 'vigente con ocupante vigente pero sub_estado vacante/concurso', count(*) FROM cargos c
 WHERE deleted_at IS NULL AND estado='vigente' AND sub_estado IN ('vacante','concurso')
   AND EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id=c.id AND o.hasta IS NULL)
UNION ALL SELECT 'vigente sin sub_estado', count(*) FROM cargos
 WHERE deleted_at IS NULL AND estado='vigente' AND sub_estado IS NULL
UNION ALL SELECT 'no vigente/validación con sub_estado', count(*) FROM cargos
 WHERE deleted_at IS NULL AND estado<>'vigente' AND sub_estado IS NOT NULL
UNION ALL SELECT 'cargos con más de un ocupante vigente', count(*) FROM (
   SELECT cargo_id FROM ocupaciones WHERE hasta IS NULL GROUP BY 1 HAVING count(*) > 1) x;

SELECT count(DISTINCT cc.cargo_id) AS cargos_con_concurso_cph_solo_etapa1
FROM concursos_cph cc JOIN cargos c ON c.id = cc.cargo_id
WHERE c.deleted_at IS NULL AND cc.estado::text IN ('no_iniciado','activo','suspendido')
  AND lower(coalesce(cc.sub_estado,'')) NOT IN (:sub_estados)
  AND lower(coalesce(cc.sub_estado,'')) NOT IN ('n-designado','o-alta sial')
  AND cc.fecha_dispo_desierta IS NULL;

-- V4c. Qué sub_estados de hoy alimentan la hoja 'concurso' (corte = hoy, misma regla por fechas que el mes actual).
-- Dimensiona la decisión §15.3b: cuántos cargos cuentan como concurso por un h-tad / m-reso a la firma / n-designado /
-- o-alta sial sin ocupante vigente. Un cargo con varios concursos aparece una vez por sub_estado.
SELECT lower(coalesce(cc.sub_estado, '(null)')) AS sub_estado_hoy, count(DISTINCT h.id) AS cargos_en_hoja_concurso
FROM v_ind_hoja h JOIN concursos_cph cc ON cc.cargo_id = h.id
WHERE h.hoja = 'concurso'
GROUP BY 1 ORDER BY 2 DESC;
SELECT 'ceetps' AS origen, count(DISTINCT h.id) AS cargos_en_hoja_concurso
FROM v_ind_hoja h JOIN concursos_ceetps ce ON ce.cargo_id = h.id WHERE h.hoja = 'concurso';

-- Día de carga inicial de cargos (el que usa evaluarDisponibilidad) y distribución mensual
SELECT (created_at AT TIME ZONE :'tz')::date AS dia, count(*) FROM cargos GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 5;
SELECT date_trunc('month', created_at AT TIME ZONE :'tz')::date AS mes, count(*) FROM cargos GROUP BY 1 ORDER BY 1;
SELECT (min(created_at) AT TIME ZONE :'tz')::date AS primera_creacion_de_cargo FROM cargos;  -- ¿coincide con la carga inicial?
SELECT min(fecha_asignada) AS primer_snapshot_aprobado FROM padron_snapshots WHERE estado::text = 'aprobado';
-- estado_desde faltante por estado
SELECT estado::text, (estado_desde IS NULL) AS sin_fecha, count(*) FROM cargos
 WHERE deleted_at IS NULL GROUP BY 1, 2 ORDER BY 1, 2;
SELECT count(*) AS ocupaciones_sin_desde FROM ocupaciones WHERE desde IS NULL;
-- V5b. Hallazgo 1 (R2a): no_vigente con estado_desde cuya ocupación se cerró ese mismo día (firma de
-- 'validación → baja confirmada por el padrón', que no actualiza estado_desde). Dimensiona el sesgo de R2a.
SELECT count(*) AS no_vigente_con_firma_de_validacion_previa
FROM cargos c
WHERE c.deleted_at IS NULL AND c.estado = 'no_vigente' AND c.estado_desde IS NOT NULL
  AND EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta = c.estado_desde);
SELECT count(*) AS no_vigente_total, count(*) FILTER (WHERE estado_desde IS NOT NULL) AS con_estado_desde
FROM cargos WHERE deleted_at IS NULL AND estado = 'no_vigente';
-- V5c. Hallazgo 1 (rev. 3): concursos CPH que ya avanzaron a estados fuera de la lista en curso, autorizados
-- hasta el corte, y cuyo cargo NO tenía ocupante al corte. Son los que el método viejo perdía (sesgo concurso/vacante).
SELECT lower(cc.sub_estado) AS sub_estado_hoy, count(DISTINCT cc.cargo_id) AS cargos
FROM concursos_cph cc JOIN cargos c ON c.id = cc.cargo_id
WHERE cc.fecha_autorizacion <= :'corte'::date
  AND lower(cc.sub_estado) IN ('o-alta sial', 'h-tad', 'm-reso a la firma', 'n-designado')
  AND (c.created_at AT TIME ZONE :'tz')::date <= :'corte'::date
  AND NOT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id
                    AND coalesce(o.desde, (o.created_at AT TIME ZONE :'tz')::date) <= :'corte'::date
                    AND (o.hasta IS NULL OR o.hasta > :'corte'::date))
GROUP BY 1 ORDER BY 1;
-- V5d. Rondas desiertas (§5.5 4c): concursos con más de una ronda desierta; el desierto cierra con la fecha de la última
SELECT count(*) AS concursos_con_varias_rondas_desiertas FROM (
  SELECT concurso_cph_id FROM concursos_cph_desiertos GROUP BY 1 HAVING count(*) > 1) x;
-- concursos que producen 'desconocido'
SELECT count(DISTINCT cargo_id) AS cph_etapa2_sin_fecha_autorizacion FROM concursos_cph
 WHERE fecha_autorizacion IS NULL AND lower(sub_estado) IN (:sub_estados);
SELECT count(DISTINCT cargo_id) AS ceetps_cerrados FROM concursos_ceetps WHERE estado::text IN ('finalizado','desierto');

SELECT fecha, sum(personas) AS personas_evolucion
FROM kpis_dotacion_snapshot WHERE situacion_revista = '(total)' GROUP BY fecha ORDER BY fecha;
SELECT count(DISTINCT p.cuil) AS personas_ocupando_al_corte
FROM ocupaciones o JOIN personas p ON p.id = o.persona_id
WHERE coalesce(o.desde, (o.created_at AT TIME ZONE :'tz')::date) <= :'corte'::date
  AND (o.hasta IS NULL OR o.hasta > :'corte'::date);

SELECT count(DISTINCT b.cargo_id) FROM bajas b
WHERE b.fecha_baja <= :'corte'::date AND b.estado::text <> 'anulada'
  AND EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = b.cargo_id
              AND coalesce(o.desde, (o.created_at AT TIME ZONE :'tz')::date) <= :'corte'::date
              AND (o.hasta IS NULL OR o.hasta > :'corte'::date));

WITH casos(caso, ini, fin, cierre_sin_fecha, esperado) AS (VALUES
  ('autorizado antes, sin fin',   DATE '2026-09-01', NULL::date,       false, 'si'),
  ('autorizado después',          DATE '2026-11-02', NULL,             false, 'no'),
  ('sin fecha de autorización',   NULL::date,        NULL,             false, 'desconocido'),
  ('desierto antes del corte',    DATE '2026-08-01', DATE '2026-10-01',false, 'no'),
  ('desierto después del corte',  DATE '2026-08-01', DATE '2026-11-05',false, 'si'),
  ('desierto después, sin ini',   NULL,              DATE '2026-11-05',false, 'desconocido'),
  ('CEETPS cerrado, ini antes',   DATE '2026-08-01', NULL,             true,  'desconocido'),
  ('CEETPS cerrado, ini después', DATE '2026-11-03', NULL,             true,  'no'),
  ('o-alta sial, alta después',   DATE '2026-09-01', DATE '2026-11-10',false, 'si'),   -- fin = primera ocupación
  ('o-alta sial, alta cerrada antes', DATE '2026-09-01', DATE '2026-10-05',false, 'no'),
  ('CEETPS cerrado con alta después', DATE '2026-08-01', DATE '2026-11-03',true, 'si'))
SELECT caso, esperado,
  CASE WHEN coalesce(ini <= DATE '2026-10-31', false) AND NOT (cierre_sin_fecha AND fin IS NULL)
            AND (fin IS NULL OR fin > DATE '2026-10-31') THEN 'si'
       WHEN NOT coalesce(fin <= DATE '2026-10-31', false)
            AND (ini IS NULL OR (cierre_sin_fecha AND fin IS NULL AND ini <= DATE '2026-10-31')) THEN 'desconocido'
       ELSE 'no' END AS obtenido
FROM casos;

