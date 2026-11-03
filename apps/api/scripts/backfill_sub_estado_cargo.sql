-- =============================================================================
-- Backfill del sub-estado del cargo (sub_estado)
-- Fuente de verdad: Doc/Planificacion/Sprints/SPRINT_estado_subestado_cargo.md §3
-- =============================================================================
--
-- MANUAL: lo corre Jorge en Neon. El workflow NO ejecuta NADA contra la DB.
-- Requiere que ya se haya aplicado prisma/migrations/20261029000000_cargo_sub_estado
-- (enum SubEstadoCargo + columna cargos.sub_estado).
--
-- Orden (§3): primero 3.2 (resolver los cargos en `validacion_vacante` a su
-- estado/sub_estado final) y DESPUÉS 3.1 (setear sub_estado a todos los que
-- quedan `vigente`, incluidos los recién promovidos). El chequeo 3.3 al final
-- debe dar 0 en ambas filas.
--
-- Definición del corte CPH "Etapa 2+" (concursosCph.calc.ts SUB_ESTADOS_POR_ETAPA
-- etapas 2..5): a-autzn, b-sorteo jur, c-dispo de llamado, c2-inscripcion ex,
-- d-examen publicado, e-orden de merito, f-ifacs, g-insal, h-tad, i-carga docu,
-- j-apto med, k-ite, l-pycto de reso, m-reso a la firma, n-designado, o-alta sial,
-- q-desierto.
-- Para el backfill a sub_estado='concurso' se EXCLUYEN:
--   * 'q-desierto'       → vuelve a Etapa 1 (§2 regla 4): queda en validación.
--   * 'm-reso a la firma' y 'h-tad' → los 21 "finalizado sin ocupante" (§4):
--     quedan en validación para revisar uno a uno.
-- Es decir, CPH→concurso = Etapa 2+ MENOS esos 3 sub_estados.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 3.2 — Cargos hoy en `validacion_vacante` (resolver estado + sub_estado)
-- ─────────────────────────────────────────────────────────────────────────

-- (a) CPH concurso Etapa 2+ (sin q-desierto / m-reso a la firma / h-tad)
--     → vigente / concurso
UPDATE cargos c
SET estado = 'vigente', sub_estado = 'concurso'
WHERE c.deleted_at IS NULL
  AND c.estado = 'validacion_vacante'
  AND EXISTS (
    SELECT 1 FROM concursos_cph cc
    WHERE cc.cargo_id = c.id
      AND lower(cc.sub_estado) IN (
        'a-autzn', 'b-sorteo jur', 'c-dispo de llamado',
        'c2-inscripcion ex', 'd-examen publicado', 'e-orden de merito',
        'f-ifacs', 'g-insal',
        'i-carga docu', 'j-apto med', 'k-ite', 'l-pycto de reso',
        'n-designado', 'o-alta sial'
      )
  );

-- (b) CEETPS concurso autorizado / en_proceso → vigente / concurso
UPDATE cargos c
SET estado = 'vigente', sub_estado = 'concurso'
WHERE c.deleted_at IS NULL
  AND c.estado = 'validacion_vacante'
  AND EXISTS (
    SELECT 1 FROM concursos_ceetps ce
    WHERE ce.cargo_id = c.id
      AND ce.estado IN ('autorizado', 'en_proceso')
  );

-- (c) CPH concurso Etapa 1 (no_iniciado / a-caratulado) → vigente / vacante.
--     Solo los que NO quedaron ya en 'concurso' por (a).
UPDATE cargos c
SET estado = 'vigente', sub_estado = 'vacante'
WHERE c.deleted_at IS NULL
  AND c.estado = 'validacion_vacante'
  AND EXISTS (
    SELECT 1 FROM concursos_cph cc
    WHERE cc.cargo_id = c.id
      AND lower(coalesce(cc.sub_estado, '')) IN ('no iniciado', 'a-caratulado')
  )
  -- No tiene ningún concurso CPH que lo califique como Etapa 2+ (evita pisar (a))
  AND NOT EXISTS (
    SELECT 1 FROM concursos_cph cc2
    WHERE cc2.cargo_id = c.id
      AND lower(cc2.sub_estado) IN (
        'a-autzn', 'b-sorteo jur', 'c-dispo de llamado',
        'c2-inscripcion ex', 'd-examen publicado', 'e-orden de merito',
        'f-ifacs', 'g-insal',
        'i-carga docu', 'j-apto med', 'k-ite', 'l-pycto de reso',
        'n-designado', 'o-alta sial'
      )
  );

-- (d) CEETPS sin_autorizar → vigente / vacante.
--     Solo los que NO quedaron ya en 'concurso' por (b).
UPDATE cargos c
SET estado = 'vigente', sub_estado = 'vacante'
WHERE c.deleted_at IS NULL
  AND c.estado = 'validacion_vacante'
  AND EXISTS (
    SELECT 1 FROM concursos_ceetps ce
    WHERE ce.cargo_id = c.id
      AND ce.estado = 'sin_autorizar'
  )
  AND NOT EXISTS (
    SELECT 1 FROM concursos_ceetps ce2
    WHERE ce2.cargo_id = c.id
      AND ce2.estado IN ('autorizado', 'en_proceso')
  );

-- (e) Grupo 4 — baja cargada, sin concurso → vigente / vacante.
--     "sin concurso" = sin fila en concursos / concursos_cph / concursos_ceetps.
UPDATE cargos c
SET estado = 'vigente', sub_estado = 'vacante'
WHERE c.deleted_at IS NULL
  AND c.estado = 'validacion_vacante'
  AND EXISTS (SELECT 1 FROM bajas b WHERE b.cargo_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM concursos        x WHERE x.cargo_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM concursos_cph    x WHERE x.cargo_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM concursos_ceetps x WHERE x.cargo_id = c.id);

-- Los que quedan en `validacion_vacante` NO se tocan (sub_estado permanece NULL):
--   * Grupo 1 (sin baja, sin concurso).
--   * CPH 'q-desierto' (vuelve a Etapa 1).
--   * CPH 'm-reso a la firma' / 'h-tad' (finalizados sin ocupante, se revisan 1x1).

-- ─────────────────────────────────────────────────────────────────────────
-- 3.1 — Todos los cargos `vigente` (setear sub_estado por la ocupación)
--       Incluye los recién promovidos en 3.2, EXCEPTO los que quedaron en
--       'concurso' (esos NO deben estar ocupados — respeta el invariante).
-- ─────────────────────────────────────────────────────────────────────────

-- ocupado: tiene ocupación vigente (hasta IS NULL)
UPDATE cargos c
SET sub_estado = 'ocupado'
WHERE c.deleted_at IS NULL
  AND c.estado = 'vigente'
  AND c.sub_estado IS DISTINCT FROM 'concurso'
  AND EXISTS (SELECT 1 FROM ocupaciones oc WHERE oc.cargo_id = c.id AND oc.hasta IS NULL);

-- vacante: sin ocupación vigente
UPDATE cargos c
SET sub_estado = 'vacante'
WHERE c.deleted_at IS NULL
  AND c.estado = 'vigente'
  AND c.sub_estado IS DISTINCT FROM 'concurso'
  AND NOT EXISTS (SELECT 1 FROM ocupaciones oc WHERE oc.cargo_id = c.id AND oc.hasta IS NULL);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- 3.3 — Chequeo de consistencia post-backfill (debe dar 0 en ambas filas)
-- ─────────────────────────────────────────────────────────────────────────
SELECT 'concurso_ocupado' AS problema, COUNT(*) FROM cargos c
  WHERE c.deleted_at IS NULL AND c.sub_estado = 'concurso'
    AND EXISTS (SELECT 1 FROM ocupaciones oc WHERE oc.cargo_id = c.id AND oc.hasta IS NULL)
UNION ALL
SELECT 'ocupado_sin_ocupacion', COUNT(*) FROM cargos c
  WHERE c.deleted_at IS NULL AND c.sub_estado = 'ocupado'
    AND NOT EXISTS (SELECT 1 FROM ocupaciones oc WHERE oc.cargo_id = c.id AND oc.hasta IS NULL);
