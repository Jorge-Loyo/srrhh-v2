-- =============================================================================
-- fix_especialidades_personas.sql
-- =============================================================================
-- Paso 1: Normaliza personas.especialidad_principal desde ref_especialidades_cuil
--         usando la especialidad CPH canónica (con tildes, formato correcto).
--
-- Paso 2: Limpia los persona_designada_id del backfill (todos vienen de
--         cargo_sial → ocupación actual, no de la especialidad del concurso).
--
-- Paso 3: Reporte final de estado.
--
-- Ejecutar: wsl docker exec srrhh_postgres psql -U srrhh_user -d srrhh_db -f /scripts/fix_especialidades_personas.sql
-- =============================================================================

BEGIN;

-- =============================================================================
-- PASO 1: Normalizar especialidad_principal en personas
-- =============================================================================
-- Para CUILs con una sola especialidad distinta de "Sin Especialidad": usar esa.
-- Para CUILs con múltiples especialidades reales: usar la más frecuente,
--   excluyendo "Sin Especialidad" (es un valor de relleno, no una especialidad real).
-- Para CUILs donde todas las entradas son "Sin Especialidad": no tocar.
-- =============================================================================

-- CTE: especialidad canónica por CUIL
-- Lógica: la especialidad más frecuente en ref_especialidades_cuil tipo=cph,
-- excluyendo "Sin Especialidad" salvo que sea la única opción.
WITH esp_canonica AS (
  SELECT DISTINCT ON (cuil)
    cuil,
    especialidad
  FROM (
    SELECT
      cuil,
      especialidad,
      count(*) AS freq,
      -- "Sin Especialidad" va al final del orden
      CASE WHEN especialidad = 'Sin Especialidad' THEN 1 ELSE 0 END AS es_sin_esp
    FROM ref_especialidades_cuil
    WHERE tipo = 'cph'
    GROUP BY cuil, especialidad
  ) ranked
  ORDER BY cuil, es_sin_esp ASC, freq DESC
)
UPDATE personas p
SET
  especialidad_principal = ec.especialidad,
  updated_at = now()
FROM esp_canonica ec
WHERE p.cuil = ec.cuil
  -- Solo actualizar si el valor va a cambiar
  AND p.especialidad_principal IS DISTINCT FROM ec.especialidad
  -- No pisar con "Sin Especialidad" si ya tiene una especialidad real
  AND NOT (ec.especialidad = 'Sin Especialidad' AND p.especialidad_principal IS NOT NULL);

-- Resultado del paso 1
DO $$
DECLARE v_count INT;
BEGIN
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'PASO 1 — personas.especialidad_principal actualizadas: %', v_count;
END $$;

-- =============================================================================
-- PASO 2: Limpiar persona_designada_id del backfill
-- =============================================================================
-- Todos los 281 persona_designada_id actuales vienen del script
-- backfill_persona_designada.mjs (cargo_sial → ocupación actual).
-- Ese match es incorrecto: la persona que ocupa el cargo HOY puede no ser
-- la que ganó el concurso histórico.
-- Se nullea persona_designada_id en todos los concursos donde:
--   - tiene persona_designada_id seteado
--   - tiene cargo_sial (origen del backfill)
--   - NO tiene resolucion_designacion (los que sí la tienen son datos reales)
-- =============================================================================

UPDATE concursos_cph
SET
  persona_designada_id = NULL,
  updated_at = now()
WHERE persona_designada_id IS NOT NULL
  AND cargo_sial IS NOT NULL
  AND (resolucion_designacion IS NULL OR resolucion_designacion = '');

DO $$
DECLARE v_count INT;
BEGIN
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'PASO 2 — persona_designada_id limpiados (backfill sin resolucion): %', v_count;
END $$;

-- =============================================================================
-- PASO 3: Reporte final
-- =============================================================================

DO $$
DECLARE
  v_personas_con_esp     INT;
  v_personas_sin_esp     INT;
  v_concursos_con_pd     INT;
  v_concursos_sin_pd     INT;
  v_mismatch_activos     INT;
BEGIN
  SELECT count(*) INTO v_personas_con_esp FROM personas WHERE especialidad_principal IS NOT NULL;
  SELECT count(*) INTO v_personas_sin_esp FROM personas WHERE especialidad_principal IS NULL;
  SELECT count(*) INTO v_concursos_con_pd FROM concursos_cph WHERE persona_designada_id IS NOT NULL;
  SELECT count(*) INTO v_concursos_sin_pd FROM concursos_cph WHERE persona_designada_id IS NULL AND estado='finalizado';

  -- Mismatch: concursos activos con persona designada de especialidad diferente
  -- (usando ref_especialidades_cuil como fuente de verdad, no especialidad_principal)
  SELECT count(*) INTO v_mismatch_activos
  FROM concursos_cph cc
  JOIN personas p ON p.id = cc.persona_designada_id
  JOIN LATERAL (
    SELECT DISTINCT ON (cuil) especialidad
    FROM ref_especialidades_cuil
    WHERE tipo = 'cph' AND cuil = p.cuil
    ORDER BY cuil,
      CASE WHEN especialidad = 'Sin Especialidad' THEN 1 ELSE 0 END ASC,
      (SELECT count(*) FROM ref_especialidades_cuil r2 WHERE r2.cuil=p.cuil AND r2.tipo='cph' AND r2.especialidad=ref_especialidades_cuil.especialidad) DESC
  ) esp_ref ON true
  WHERE cc.estado = 'activo'
    AND cc.especialidad_solicitada IS NOT NULL
    AND lower(esp_ref.especialidad) != lower(cc.especialidad_solicitada);

  RAISE NOTICE '=== ESTADO FINAL ===';
  RAISE NOTICE 'Personas con especialidad:          %', v_personas_con_esp;
  RAISE NOTICE 'Personas sin especialidad:          %', v_personas_sin_esp;
  RAISE NOTICE 'Concursos con persona designada:    %', v_concursos_con_pd;
  RAISE NOTICE 'Concursos finalizados sin persona:  %', v_concursos_sin_pd;
  RAISE NOTICE 'Mismatch activos (esp. diferente):  %', v_mismatch_activos;
END $$;

COMMIT;
