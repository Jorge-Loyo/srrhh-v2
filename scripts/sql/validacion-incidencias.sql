-- Validacion de la pestana "Baja sin concurso" de Incidencias (SOLO LECTURA).
-- Disenio: .agents/tasks/incidencias-tabs/design.md §11.
-- Lo corre Jorge en WSL contra Neon (los agentes no tienen acceso):
--   psql "$NEON_DIRECT" -P pager=off -f scripts/sql/validacion-incidencias.sql
-- Las vistas son TEMP: viven solo en la sesion de psql, no escriben ninguna tabla.
-- La vista v_inc_hechos es el MISMO cuerpo que obtenerHechosCandidatos() en
-- apps/api/src/modules/incidencias/incidencias.baja-sin-concurso.ts: si se cambia
-- una, cambiar la otra.

\echo '== Preparacion: vista temporal con los hechos de los candidatos (misma query que la API) =='
CREATE TEMP VIEW v_inc_hechos AS
WITH ult_padron AS (
  SELECT id, fecha_asignada, total_registros, ratio_tamano, advertencia_tamano
  FROM padron_snapshots
  WHERE estado::text = 'aprobado'
  ORDER BY fecha_asignada DESC
  LIMIT 1
),
ult_baja AS (
  SELECT id, fecha_archivo, estado::text AS estado
  FROM baja_sial_snapshots
  WHERE estado::text IN ('pendiente', 'aprobado')
  ORDER BY fecha_archivo DESC
  LIMIT 1
),
cand AS (
  SELECT c.*
  FROM cargos c
  WHERE c.deleted_at IS NULL
    AND (
      c.estado::text = 'validacion_vacante'
      OR (c.estado::text = 'vigente'
          AND NOT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL))
    )
),
occ AS (
  SELECT DISTINCT ON (o.cargo_id)
         o.cargo_id, o.hasta AS occ_hasta, p.cuil AS persona_cuil, p.apellido_nombre AS persona_nombre
  FROM ocupaciones o
  JOIN cand ON cand.id = o.cargo_id
  JOIN personas p ON p.id = o.persona_id
  ORDER BY o.cargo_id, (o.hasta IS NULL) DESC, o.hasta DESC NULLS LAST, o.desde DESC NULLS LAST
),
occ_max AS (
  SELECT o.cargo_id, max(o.hasta) AS ultima_hasta, max(o.desde) AS ultima_desde
  FROM ocupaciones o JOIN cand ON cand.id = o.cargo_id
  GROUP BY o.cargo_id
),
elim_hist AS (
  SELECT o.cargo_id, max(s.fecha_asignada) AS fecha_baja_padron
  FROM padron_diff d
  JOIN padron_snapshots s ON s.id = d.snapshot_id AND s.estado::text = 'aprobado'
  JOIN ocupaciones o ON o.id_sial_rol = d.id_sial_rol
  JOIN cand ON cand.id = o.cargo_id
  WHERE d.tipo::text = 'eliminado' AND d.campo IS NULL
  GROUP BY o.cargo_id
),
elim_ult AS (
  SELECT o.cargo_id
  FROM padron_diff d
  JOIN ult_padron u ON u.id = d.snapshot_id
  JOIN ocupaciones o ON o.id_sial_rol = d.id_sial_rol
  JOIN cand ON cand.id = o.cargo_id
  WHERE d.tipo::text = 'eliminado'
  UNION
  SELECT cand.id
  FROM padron_diff d
  JOIN ult_padron u ON u.id = d.snapshot_id
  JOIN cand ON cand.id_sial = d.id_sial_rol
  WHERE d.tipo::text = 'eliminado'
),
alta_pend AS (
  SELECT DISTINCT cand.id AS cargo_id
  FROM padron_diff d
  JOIN padron_snapshots s ON s.id = d.snapshot_id AND s.estado::text = 'aprobado'
  JOIN cand ON cand.id_sial IS NOT NULL
           AND (d.id_sial_rol = cand.id_sial OR starts_with(d.id_sial_rol, cand.id_sial || '-'))
  WHERE d.tipo::text = 'nuevo' AND d.aprobado IS NULL
    AND (d.campo IS NULL OR d.campo <> '__alta_desdoblada__')
),
bs AS (
  SELECT DISTINCT ON (r.cargo)
         r.cargo AS id_sial, r.cuil AS bs_cuil, r.ayn AS bs_ayn, r.cargo_hasta AS bs_cargo_hasta,
         r.mot_baja, r.doc_resp_baja
  FROM baja_sial_registros r
  JOIN ult_baja u ON u.id = r.snapshot_id
  JOIN cand ON cand.id_sial = r.cargo
  ORDER BY r.cargo, r.cargo_hasta DESC NULLS LAST
),
bs_primera AS (
  SELECT d.cargo AS id_sial, min(s.fecha_archivo) AS bs_primera_fecha
  FROM baja_sial_diffs d
  JOIN baja_sial_snapshots s ON s.id = d.snapshot_id
  WHERE d.tipo::text = 'nuevo' AND s.estado::text IN ('pendiente', 'aprobado')
    AND d.cargo IN (SELECT id_sial FROM cand WHERE id_sial IS NOT NULL)
  GROUP BY d.cargo
),
conc AS (
  SELECT x.cargo_id,
         bool_or(x.activo)     AS concurso_activo,
         bool_or(NOT x.activo) AS tuvo_concurso_cerrado
  FROM (
    SELECT cph.cargo_id, cph.estado::text IN ('no_iniciado','activo','suspendido') AS activo
      FROM concursos_cph cph WHERE cph.cargo_id IN (SELECT id FROM cand)
    UNION ALL
    SELECT ce.cargo_id, ce.estado::text IN ('sin_autorizar','autorizado','en_proceso') AS activo
      FROM concursos_ceetps ce WHERE ce.cargo_id IN (SELECT id FROM cand)
  ) x
  GROUP BY x.cargo_id
),
bf AS (
  SELECT DISTINCT ON (b.cargo_id) b.cargo_id, b.estado::text AS baja_estado, b.genera_concurso
  FROM bajas b JOIN cand ON cand.id = b.cargo_id
  ORDER BY b.cargo_id, b.fecha_baja DESC, b.created_at DESC
)
SELECT
  cand.id AS cargo_id, cand.codigo, cand.id_sial,
  cand.estado::text AS estado, cand.sub_estado::text AS sub_estado, cand.estado_desde,
  cand.literal_puesto, cand.especialidad_legacy,
  h.sigla AS hospital_sigla, e.nombre AS carrera,
  occ.persona_cuil, occ.persona_nombre,
  (occ.cargo_id IS NOT NULL AND occ.occ_hasta IS NULL) AS tiene_ocupante_vigente,
  occ_max.ultima_hasta AS ocupacion_hasta,
  occ_max.ultima_desde AS ocupacion_desde_ult,
  cand.tipo_origen,
  (conc.concurso_activo IS TRUE) AS concurso_activo,
  (conc.tuvo_concurso_cerrado IS TRUE) AS tuvo_concurso_cerrado,
  (alta_pend.cargo_id IS NOT NULL) AS alta_pendiente,
  (bs.id_sial IS NOT NULL) AS en_baja_sial,
  bs.bs_cuil, bs.bs_ayn, bs.bs_cargo_hasta, bs.mot_baja, bs.doc_resp_baja, bs_primera.bs_primera_fecha,
  (elim_ult.cargo_id IS NOT NULL) AS ausente_ultimo_padron,
  elim_hist.fecha_baja_padron,
  bf.baja_estado, bf.genera_concurso AS baja_genera_concurso
FROM cand
LEFT JOIN hospitales h   ON h.id = cand.hospital_id
LEFT JOIN escalafones e  ON e.id = cand.escalafon_id
LEFT JOIN occ            ON occ.cargo_id = cand.id
LEFT JOIN occ_max        ON occ_max.cargo_id = cand.id
LEFT JOIN conc           ON conc.cargo_id = cand.id
LEFT JOIN alta_pend      ON alta_pend.cargo_id = cand.id
LEFT JOIN bs             ON bs.id_sial = cand.id_sial
LEFT JOIN bs_primera     ON bs_primera.id_sial = cand.id_sial
LEFT JOIN elim_ult       ON elim_ult.cargo_id = cand.id
LEFT JOIN elim_hist      ON elim_hist.cargo_id = cand.id
LEFT JOIN bf             ON bf.cargo_id = cand.id;

CREATE TEMP VIEW v_inc_clasif AS
SELECT h.*,
  CASE   -- espejo SQL de clasificarCargo(); NO usa sub_estado (design §3.2)
    WHEN h.estado NOT IN ('vigente','validacion_vacante') THEN 'sin_clasificar'
    WHEN h.estado = 'vigente' AND h.tiene_ocupante_vigente THEN 'ocupado'
    WHEN h.concurso_activo THEN 'en_concurso'
    WHEN h.alta_pendiente THEN 'alta_pendiente'
    WHEN NOT h.tiene_ocupante_vigente
         AND (h.en_baja_sial OR h.ausente_ultimo_padron OR h.estado = 'validacion_vacante') THEN 'baja_sin_concurso'
    ELSE 'sin_clasificar'
  END AS grupo
FROM v_inc_hechos h;

\echo '== V0. Latencia de la query de hechos (cota: > 3 s => abrir backlog de indice padron_diff(id_sial_rol)) =='
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF) SELECT count(*) FROM v_inc_hechos;

\echo '== V1. Cargos por estado / sub_estado (contexto) =='
SELECT estado::text, sub_estado::text, count(*)
FROM cargos WHERE deleted_at IS NULL
GROUP BY 1,2 ORDER BY 1,2;

\echo '== V2. INVARIANTE: la suma de los grupos debe ser igual al total de cargos =='
-- (a) Control INDEPENDIENTE de la clasificacion (solo tabla cargos + EXISTS; sin NULLs en la particion)
WITH base AS (
  SELECT
    count(*)                                                            AS total,
    count(*) FILTER (WHERE c.estado::text = 'no_vigente')               AS no_vigente,
    count(*) FILTER (WHERE c.estado::text = 'vigente' AND oc.tiene)     AS ocupado,
    count(*) FILTER (WHERE c.estado::text = 'vigente' AND NOT oc.tiene) AS vigente_sin_ocupante,
    count(*) FILTER (WHERE c.estado::text = 'validacion_vacante')       AS validacion_vacante
  FROM cargos c
  CROSS JOIN LATERAL (SELECT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL) AS tiene) oc
  WHERE c.deleted_at IS NULL
)
SELECT total,
       no_vigente + ocupado + vigente_sin_ocupante + validacion_vacante AS suma_control,
       (no_vigente + ocupado + vigente_sin_ocupante + validacion_vacante) = total AS control_ok,
       (SELECT count(*) FROM v_inc_hechos) AS candidatos_vista,
       vigente_sin_ocupante + validacion_vacante AS candidatos_esperados,
       (SELECT count(*) FROM v_inc_hechos) = vigente_sin_ocupante + validacion_vacante AS candidatos_ok
FROM base;
-- Esperado: control_ok = t y candidatos_ok = t. Si control_ok = f hay estados fuera del enum; si candidatos_ok = f la vista pierde cargos.

-- (b) Reparto por grupo y suma final
WITH base AS (
  SELECT
    count(*)                                                            AS total,
    count(*) FILTER (WHERE c.estado::text = 'no_vigente')               AS no_vigente,
    count(*) FILTER (WHERE c.estado::text = 'vigente' AND oc.tiene)     AS ocupado
  FROM cargos c
  CROSS JOIN LATERAL (SELECT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL) AS tiene) oc
  WHERE c.deleted_at IS NULL
),
cl AS (SELECT grupo, count(*) n FROM v_inc_clasif GROUP BY grupo)
SELECT 'no_vigente' AS grupo, no_vigente AS n FROM base
UNION ALL SELECT 'ocupado', ocupado FROM base
UNION ALL SELECT grupo, n FROM cl
UNION ALL SELECT '== SUMA DE GRUPOS', (SELECT no_vigente + ocupado FROM base) + COALESCE((SELECT sum(n) FROM cl),0)
UNION ALL SELECT '== TOTAL CARGOS',   total FROM base;
-- Esperado: SUMA DE GRUPOS = TOTAL CARGOS (si no, avisar: bug de clasificacion).

\echo '== V3. Tamano de Baja sin concurso por origen y estado del cargo =='
SELECT CASE WHEN en_baja_sial THEN 'baja_sial' ELSE 'padron' END AS origen,
       estado, count(*)
FROM v_inc_clasif WHERE grupo = 'baja_sin_concurso'
GROUP BY 1,2 ORDER BY 1,2;

\echo '== V3b. Cuantos estan en baja SIAL Y tambien ausentes del padron (ambos) =='
SELECT count(*) FILTER (WHERE en_baja_sial AND ausente_ultimo_padron) AS ambos,
       count(*) FILTER (WHERE en_baja_sial AND NOT ausente_ultimo_padron) AS solo_baja_sial,
       count(*) FILTER (WHERE NOT en_baja_sial AND ausente_ultimo_padron) AS solo_padron,
       count(*) FILTER (WHERE NOT en_baja_sial AND NOT ausente_ultimo_padron) AS solo_validacion_vacante
FROM v_inc_clasif WHERE grupo = 'baja_sin_concurso';

\echo '== V4. Calidad de datos: sub_estado persistido vs hechos (informativo; la clasificacion NO usa sub_estado) =='
SELECT 'vigente CON ocupante vigente y sub_estado <> ocupado (o NULL)' AS caso, count(*)
  FROM cargos c WHERE c.deleted_at IS NULL AND c.estado::text='vigente'
   AND EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id=c.id AND o.hasta IS NULL)
   AND COALESCE(c.sub_estado::text,'') <> 'ocupado'
UNION ALL SELECT 'vigente SIN ocupante y sub_estado = ocupado', count(*)
  FROM cargos c WHERE c.deleted_at IS NULL AND c.estado::text='vigente'
   AND NOT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id=c.id AND o.hasta IS NULL)
   AND c.sub_estado::text = 'ocupado'
UNION ALL SELECT 'sub_estado = concurso SIN concurso activo (candidatos)', count(*)
  FROM v_inc_hechos WHERE sub_estado = 'concurso' AND NOT concurso_activo
UNION ALL SELECT 'concurso activo y sub_estado <> concurso (candidatos)', count(*)
  FROM v_inc_hechos WHERE concurso_activo AND COALESCE(sub_estado,'') <> 'concurso'
UNION ALL SELECT 'ocupado (vigente+ocupante) CON concurso activo (grupo 2 gana)', count(*)
  FROM cargos c WHERE c.deleted_at IS NULL AND c.estado::text='vigente'
   AND EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id=c.id AND o.hasta IS NULL)
   AND (EXISTS (SELECT 1 FROM concursos_cph x WHERE x.cargo_id=c.id AND x.estado::text IN ('no_iniciado','activo','suspendido'))
     OR EXISTS (SELECT 1 FROM concursos_ceetps y WHERE y.cargo_id=c.id AND y.estado::text IN ('sin_autorizar','autorizado','en_proceso')))
UNION ALL SELECT 'validacion_vacante CON ocupante vigente (inconsistente)', count(*)
  FROM v_inc_hechos WHERE estado='validacion_vacante' AND tiene_ocupante_vigente
UNION ALL SELECT 'sin_clasificar (residual) TOTAL', count(*)
  FROM v_inc_clasif WHERE grupo='sin_clasificar';

\echo '== V4b. Desglose del residual sin_clasificar: por id_sial NULL y tipo_origen =='
SELECT (id_sial IS NULL) AS sin_id_sial, tipo_origen, estado, count(*)
FROM v_inc_clasif WHERE grupo='sin_clasificar'
GROUP BY 1,2,3 ORDER BY 4 DESC;

\echo '== V5. Solape con SIAL sin cargo: diffs nuevo pendientes cuyo id_sial YA existe como cargo (cualquier estado) =='
-- Esperado: 0 para candidatos (alta_pendiente). Para ocupado / en_concurso / no_vigente se tolera, pero se cuantifica.
-- Se aislan primero los diffs pendientes (MATERIALIZED) y recien despues se cruzan con cargos:
-- sin esto el planner puede recorrer cargos x padron_diff completo (miles de millones de comparaciones).
-- El cruce usa IGUALDAD exacta contra cargos.id_sial (indice unico), en dos ramas UNION:
--   (a) id_sial_rol == id_sial; (b) id_sial_rol = '<legajo>-<rol>-<cuil>-<rol>' -> id_sial = '<legajo>-<rol>'.
-- Una version previa con OR + starts_with(...) no podia usar el indice y superaba el statement_timeout.
-- Si no hay solape el resultado es 0 filas (= sin solape).
WITH pend AS MATERIALIZED (
  SELECT d.id, d.id_sial_rol
  FROM padron_diff d
  JOIN padron_snapshots s ON s.id = d.snapshot_id AND s.estado::text = 'aprobado'
  WHERE d.tipo::text = 'nuevo' AND d.aprobado IS NULL
    AND (d.campo IS NULL OR d.campo <> '__alta_desdoblada__')
),
m AS MATERIALIZED (
  SELECT p.id AS diff_id, c.id AS cargo_id, c.estado::text AS estado
  FROM pend p
  JOIN cargos c ON c.deleted_at IS NULL AND c.id_sial = p.id_sial_rol
  UNION
  SELECT p.id, c.id, c.estado::text
  FROM pend p
  JOIN cargos c ON c.deleted_at IS NULL
    AND c.id_sial = split_part(p.id_sial_rol, '-', 1) || '-' || split_part(p.id_sial_rol, '-', 2)
)
SELECT CASE
         WHEN m.estado = 'no_vigente' THEN 'no_vigente'
         WHEN m.estado = 'vigente'
              AND EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = m.cargo_id AND o.hasta IS NULL) THEN 'ocupado'
         ELSE COALESCE(k.grupo, 'en_concurso/otro')
       END AS grupo,
       count(DISTINCT m.diff_id) AS diffs_nuevo_pendientes_con_cargo
FROM m
LEFT JOIN v_inc_clasif k ON k.cargo_id = m.cargo_id
GROUP BY 1 ORDER BY 2 DESC;

\echo '== V6. Cobertura del cruce de baja SIAL: registros de la ultima carga sin cargo por id_sial cuyo CUIL fue ocupante de un cargo candidato sin baja SIAL =='
WITH ult AS (
  SELECT id FROM baja_sial_snapshots WHERE estado::text IN ('pendiente','aprobado')
  ORDER BY fecha_archivo DESC LIMIT 1
)
SELECT count(DISTINCT r.id) AS registros_sin_match_por_id_sial_pero_cuil_conocido
FROM baja_sial_registros r
JOIN ult ON ult.id = r.snapshot_id
LEFT JOIN cargos cx ON cx.id_sial = r.cargo
JOIN personas p ON replace(r.cuil,'-','') = p.cuil
JOIN ocupaciones o ON o.persona_id = p.id AND o.hasta IS NOT NULL
JOIN v_inc_hechos h ON h.cargo_id = o.cargo_id AND NOT h.en_baja_sial
WHERE cx.id IS NULL;
-- Si este numero es grande, hay bajas SIAL con id_sial distinto al del cargo (recodificacion): evaluar cruce adicional por CUIL.

\echo '== V7. Ultimo padron aprobado: salud del archivo y bajas nuevas vs previas =='
SELECT s.fecha_asignada, s.total_registros, s.ratio_tamano, s.advertencia_tamano,
       count(*) FILTER (WHERE d.tipo::text='eliminado' AND d.campo IS NULL)           AS eliminados_baja_nueva,
       count(*) FILTER (WHERE d.tipo::text='eliminado' AND d.campo = 'baja_previa')   AS eliminados_baja_previa
FROM padron_snapshots s
LEFT JOIN padron_diff d ON d.snapshot_id = s.id
WHERE s.id = (SELECT id FROM padron_snapshots WHERE estado::text='aprobado' ORDER BY fecha_asignada DESC LIMIT 1)
GROUP BY s.id, s.fecha_asignada, s.total_registros, s.ratio_tamano, s.advertencia_tamano;

\echo '== V8. No vigentes con evidencia de baja sin concurso (decision design 3.4: hoy fuera de la pestana) =='
SELECT count(*) AS no_vigentes_total,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM baja_sial_registros r
         WHERE r.cargo = c.id_sial
           AND r.snapshot_id = (SELECT id FROM baja_sial_snapshots WHERE estado::text IN ('pendiente','aprobado')
                                ORDER BY fecha_archivo DESC LIMIT 1))) AS con_registro_en_baja_sial,
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM concursos_cph x WHERE x.cargo_id = c.id AND x.estado::text IN ('no_iniciado','activo','suspendido'))
         AND NOT EXISTS (
         SELECT 1 FROM concursos_ceetps y WHERE y.cargo_id = c.id AND y.estado::text IN ('sin_autorizar','autorizado','en_proceso'))) AS sin_concurso_activo
FROM cargos c WHERE c.deleted_at IS NULL AND c.estado::text = 'no_vigente';

\echo '== V9. Paridad con la cola actual de SIAL sin cargo (debe coincidir con resumen.total de /pendientes) =='
SELECT count(*) AS sial_sin_cargo
FROM padron_diff d JOIN padron_snapshots s ON s.id = d.snapshot_id
WHERE d.tipo::text = 'nuevo' AND d.aprobado IS NULL AND s.estado::text = 'aprobado'
  AND (d.campo IS NULL OR d.campo <> '__alta_desdoblada__');

\echo '== V11. Episodios viejos de ausencia: fecha_baja_padron anterior a estado_desde o al inicio de la ultima ocupacion (design 4.3) =='
SELECT count(*) FILTER (WHERE estado = 'validacion_vacante' AND fecha_baja_padron < estado_desde)      AS vv_diff_anterior_a_estado_desde,
       count(*) FILTER (WHERE fecha_baja_padron < ocupacion_desde_ult)                                 AS diff_anterior_a_ultima_ocupacion,
       count(*) FILTER (WHERE fecha_baja_padron IS NOT NULL)                                           AS con_diff_total
FROM v_inc_clasif WHERE grupo = 'baja_sin_concurso';
-- Si diff_anterior_a_* es > 0, la regla de design 4.3 esta evitando mostrar una fecha vieja en esos cargos.

\echo '== V10. Muestra de 20 bajas sin concurso (para mirar a ojo) =='
SELECT codigo, id_sial, estado, sub_estado, en_baja_sial, bs_cargo_hasta, bs_primera_fecha,
       ausente_ultimo_padron, fecha_baja_padron, ocupacion_hasta, estado_desde, persona_nombre
FROM v_inc_clasif WHERE grupo = 'baja_sin_concurso'
ORDER BY COALESCE(bs_cargo_hasta, fecha_baja_padron, ocupacion_hasta, estado_desde) NULLS LAST
LIMIT 20;
