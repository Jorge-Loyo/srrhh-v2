-- Recalculo masivo de cargos.sub_estado — corrige el PASADO (datos existentes
-- en Neon). Disenio: .agents/tasks/fix-sub-estado/design.md.
--
-- Contexto: cargos.sub_estado (enum "SubEstadoCargo": ocupado | vacante |
-- concurso; null fuera de 'vigente') quedo desincronizado porque varios flujos
-- cambiaban cargos.estado o las ocupaciones sin recalcular el sub_estado. El
-- Entregable 1 (fix en el codigo) cierra esos huecos para que NO se repita;
-- este script corrige los datos ya guardados.
--
-- LA VERDAD DEL SUB-ESTADO (identica a apps/api/.../cargos/subEstado.ts y a las
-- cascadas de incidencias.clasificacion.ts / kpis/cargos-indicadores.clasificacion.ts):
--   1. estado <> 'vigente' (no_vigente | validacion_vacante | otro) -> NULL
--   2. vigente + ocupante vigente (ocupaciones.hasta IS NULL)        -> 'ocupado'
--   3. vigente, sin ocupante, con concurso ACTIVO vinculado          -> 'concurso'
--   4. vigente, sin ocupante, sin concurso activo                    -> 'vacante'
-- "Concurso activo" = espejo exacto del CTE `conc` de
-- incidencias.baja-sin-concurso.ts:
--   - CPH activo   : concursos_cph.estado    IN ('no_iniciado','activo','suspendido')  (NOT 'finalizado')
--   - CEETPS activo: concursos_ceetps.estado IN ('sin_autorizar','autorizado','en_proceso') (NOT 'finalizado','desierto')
-- Enums terminales confirmados en prisma/schema.prisma (EstadoConcursoCph /
-- EstadoConcursoCeetps). El sub_estado solo distingue ocupado/vacante/concurso:
-- no existe 'indeterminado' (ese valor es de la RECONSTRUCCION del pasado en
-- reportes/Incidencias, no del presente persistido). Un caso 'indeterminado'
-- real en vivo cae en 'vacante' por la regla 4 (nunca se inventa un valor).
--
-- Lo corre Jorge en WSL contra Neon (los agentes no tienen acceso):
--   psql "$NEON_DIRECT" -P pager=off -f scripts/sql/recalcular-sub-estado-cargos.sql
--
-- DRY-RUN por defecto: todo corre dentro de una transaccion que termina en
-- ROLLBACK. Para aplicar de verdad, comentar la linea ROLLBACK final y
-- descomentar la linea COMMIT.
--
-- Idempotente: el UPDATE solo escribe donde el valor nuevo difiere del actual
-- (sub_estado IS DISTINCT FROM esperado); una segunda corrida no cambia filas.

\echo '== Vista de calculo del sub_estado esperado (solo lectura) =='
-- calc: por cada cargo vivo, su sub_estado actual y el esperado segun la regla.
CREATE TEMP VIEW v_calc_sub_estado AS
SELECT c.id,
       c.estado::text AS estado,
       c.sub_estado   AS actual,
       (CASE
          WHEN c.estado <> 'vigente' THEN NULL
          WHEN EXISTS (SELECT 1 FROM ocupaciones o
                        WHERE o.cargo_id = c.id AND o.hasta IS NULL) THEN 'ocupado'
          WHEN EXISTS (SELECT 1 FROM concursos_cph cph
                        WHERE cph.cargo_id = c.id
                          AND cph.estado::text IN ('no_iniciado','activo','suspendido'))
            OR EXISTS (SELECT 1 FROM concursos_ceetps ce
                        WHERE ce.cargo_id = c.id
                          AND ce.estado::text IN ('sin_autorizar','autorizado','en_proceso')) THEN 'concurso'
          ELSE 'vacante'
        END)::"SubEstadoCargo" AS esperado
FROM cargos c
WHERE c.deleted_at IS NULL;

BEGIN;

\echo '== DIAGNOSTICO (antes del update, solo lectura) =='

\echo '-- Casos inconsistentes (los mismos de la validacion V4): deben reproducir el conteo del diagnostico --'
SELECT 'vigente sin sub_estado' AS caso, count(*) AS cargos
  FROM v_calc_sub_estado WHERE estado = 'vigente' AND actual IS NULL
UNION ALL
SELECT 'no vigente/validacion con sub_estado', count(*)
  FROM v_calc_sub_estado WHERE estado <> 'vigente' AND actual IS NOT NULL
UNION ALL
SELECT 'vigente/ocupado sin ocupante vigente', count(*)
  FROM v_calc_sub_estado WHERE estado = 'vigente' AND actual = 'ocupado' AND esperado <> 'ocupado'
UNION ALL
SELECT 'vigente con ocupante vigente pero sub_estado vacante/concurso', count(*)
  FROM v_calc_sub_estado WHERE estado = 'vigente' AND actual IN ('vacante','concurso') AND esperado = 'ocupado'
UNION ALL
SELECT 'vigente con concurso activo y sub_estado <> concurso', count(*)
  FROM v_calc_sub_estado WHERE estado = 'vigente' AND esperado = 'concurso' AND actual IS DISTINCT FROM 'concurso'::"SubEstadoCargo";

\echo '-- Filas que cambiaria el recalculo, por transicion actual -> esperado --'
SELECT coalesce(actual::text, 'null') AS actual,
       coalesce(esperado::text, 'null') AS esperado,
       count(*) AS filas
FROM v_calc_sub_estado
WHERE actual IS DISTINCT FROM esperado
GROUP BY 1, 2
ORDER BY filas DESC;

\echo '-- Total de filas que cambiaria el recalculo, por valor NUEVO --'
SELECT coalesce(esperado::text, 'null') AS valor_nuevo, count(*) AS filas
FROM v_calc_sub_estado
WHERE actual IS DISTINCT FROM esperado
GROUP BY 1
ORDER BY filas DESC;

\echo '== UPDATE: recalcular sub_estado de TODOS los cargos vivos (solo donde cambia) =='
-- Idempotente y acotado: solo toca las filas cuyo sub_estado difiere del
-- esperado. Actualiza updated_at.
UPDATE cargos c
SET sub_estado = v.esperado,
    updated_at = now()
FROM v_calc_sub_estado v
WHERE v.id = c.id
  AND c.sub_estado IS DISTINCT FROM v.esperado;

\echo '== VERIFICACION (despues del update, solo lectura): los 5 casos V4 deben dar 0 =='
-- Nota: v_calc_sub_estado recalcula sobre cargos.sub_estado ACTUAL, asi que
-- tras el UPDATE "actual" ya refleja lo recalculado y todas las discrepancias
-- quedan en 0 dentro de esta misma transaccion.
SELECT 'vigente sin sub_estado' AS caso, count(*) AS cargos FROM cargos
 WHERE deleted_at IS NULL AND estado = 'vigente' AND sub_estado IS NULL
UNION ALL
SELECT 'no vigente/validacion con sub_estado', count(*) FROM cargos
 WHERE deleted_at IS NULL AND estado <> 'vigente' AND sub_estado IS NOT NULL
UNION ALL
SELECT 'vigente/ocupado sin ocupante vigente', count(*) FROM cargos c
 WHERE deleted_at IS NULL AND estado = 'vigente' AND sub_estado = 'ocupado'
   AND NOT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL)
UNION ALL
SELECT 'vigente con ocupante vigente pero sub_estado vacante/concurso', count(*) FROM cargos c
 WHERE deleted_at IS NULL AND estado = 'vigente' AND sub_estado IN ('vacante','concurso')
   AND EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL)
UNION ALL
SELECT 'vigente con concurso activo y sub_estado <> concurso', count(*) FROM cargos c
 WHERE deleted_at IS NULL AND estado = 'vigente' AND sub_estado IS DISTINCT FROM 'concurso'::"SubEstadoCargo"
   AND NOT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL)
   AND (EXISTS (SELECT 1 FROM concursos_cph cph WHERE cph.cargo_id = c.id
                 AND cph.estado::text IN ('no_iniciado','activo','suspendido'))
     OR EXISTS (SELECT 1 FROM concursos_ceetps ce WHERE ce.cargo_id = c.id
                 AND ce.estado::text IN ('sin_autorizar','autorizado','en_proceso')));

\echo '-- Conteo final por sub_estado (cargos vivos) --'
SELECT coalesce(sub_estado::text, 'null') AS sub_estado, count(*) AS cargos
FROM cargos
WHERE deleted_at IS NULL
GROUP BY 1
ORDER BY cargos DESC;

-- DRY-RUN: descartar todo. Para aplicar de verdad, comentar la linea ROLLBACK
-- y descomentar la linea COMMIT.
ROLLBACK;
-- COMMIT;
