-- =============================================================================
-- Backfill del tipo/motivo de concurso (concursos.motivo_concurso)
-- Fuente de verdad: Doc/Planificacion/Sprints/SPRINT_tipo_concurso.md §4 (D3/D4)
-- =============================================================================
--
-- MANUAL: lo corre Jorge en Neon. El workflow NO ejecuta NADA contra la DB.
-- Requiere que ya se haya aplicado
-- prisma/migrations/20261030000000_motivo_concurso_tipos (enum MotivoConcurso
-- extendido con 'retencion_de_cargo' y 'cobertura_dotacion').
--
-- El tipo vive SOLO en `concursos.motivo_concurso` (enum MotivoConcurso). NO
-- existe columna de tipo en concursos_cph / concursos_ceetps — por eso todo el
-- backfill se hace sobre `concursos`.
--
-- Regla de inferencia (D3) — se calcula EN VIVO contra los datos, no se
-- hardcodean los números de concurso:
--   1. retencion_de_cargo: el cargo de la baja asociada (match por número de
--      expediente EX-ANIO-NUMERO entre concursos_cph.ee_baja y bajas.ee_baja)
--      está ocupado HOY (ocupaciones.hasta IS NULL) con una situacion_revista
--      que contiene 'retencion'.
--   2. alta_por_baja: tiene baja asociada (por ee_baja), excepto los ya
--      marcados retencion_de_cargo.
--   3. cobertura_dotacion: el resto (sin baja asociada).
--
-- Además (D4): recodificar el `codigo` del cargo de los concursos de retención
-- insertando -R- (CPH-POF-017530 -> CPH-POF-R-017530), verificando que el
-- nuevo código no colisione con otro cargo existente.
--
-- Orden (§4): 1) retencion, 2) alta_por_baja, 3) cobertura_dotacion, 4) -R-.
-- Idempotente: se puede re-correr (las condiciones acotan los UPDATE y el
-- chequeo de colisión del paso 4 ya evita duplicar el -R-).
--
-- Normalización del expediente: EX-ANIO-NUMERO. El número de expediente real es
-- la porción NNNNNNNN de 'EX-2026-47161926-...-GCABA-...'. Se compara solo esa
-- clave (anio + numero) para tolerar sufijos/reparticiones distintas entre el
-- ee_baja del concurso y el de la baja. El helper fn_nro_ee extrae 'ANIO-NUMERO'.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- Helper: clave normalizada del expediente ('ANIO-NUMERO' de EX-ANIO-NUMERO-...)
-- Devuelve NULL si el texto no matchea el patrón EX-ANIO-NUMERO.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.fn_nro_ee(ee text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT (regexp_match(upper(coalesce(ee, '')), 'EX-(\d{4})-0*(\d+)'))[1]
         || '-' ||
         (regexp_match(upper(coalesce(ee, '')), 'EX-(\d{4})-0*(\d+)'))[2]
  WHERE regexp_match(upper(coalesce(ee, '')), 'EX-(\d{4})-0*(\d+)') IS NOT NULL;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) retencion_de_cargo
--    El cargo de la baja asociada (match por nro de expediente entre
--    concursos_cph.ee_baja y bajas.ee_baja) está ocupado hoy con
--    situacion_revista que contiene 'retencion'.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE concursos co
SET motivo_concurso = 'retencion_de_cargo'
FROM concursos_cph cc
WHERE cc.concurso_id = co.id
  AND pg_temp.fn_nro_ee(cc.ee_baja) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM bajas b
    JOIN ocupaciones oc ON oc.cargo_id = b.cargo_id AND oc.hasta IS NULL
    WHERE pg_temp.fn_nro_ee(b.ee_baja) = pg_temp.fn_nro_ee(cc.ee_baja)
      AND lower(unaccent(coalesce(oc.situacion_revista, ''))) LIKE '%retencion%'
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 2) alta_por_baja
--    Tiene baja asociada (baja_id no nulo) y aún no quedó marcado como
--    retencion_de_cargo en el paso 1.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE concursos co
SET motivo_concurso = 'alta_por_baja'
WHERE co.baja_id IS NOT NULL
  AND co.motivo_concurso IS DISTINCT FROM 'retencion_de_cargo';

-- ─────────────────────────────────────────────────────────────────────────
-- 3) cobertura_dotacion
--    El resto: sin baja asociada y sin tipo asignado por los pasos 1/2.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE concursos co
SET motivo_concurso = 'cobertura_dotacion'
WHERE co.baja_id IS NULL
  AND co.motivo_concurso IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Recodificar -R- el código del cargo de los concursos de retención.
--    CPH-POF-017530 -> CPH-POF-R-017530 (inserta -R- antes del secuencial de
--    6 dígitos). Se aplica SOLO a cargos cuyo código aún no es remplazante
--    (sin -R- / -TTR-) y verificando que el nuevo código NO colisione con otro
--    cargo existente.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE cargos ca
SET codigo = regexp_replace(ca.codigo, '-(\d{6})$', '-R-\1')
WHERE EXISTS (
    SELECT 1 FROM concursos co
    WHERE co.cargo_id = ca.id
      AND co.motivo_concurso = 'retencion_de_cargo'
  )
  AND ca.codigo ~ '-\d{6}$'
  AND ca.codigo !~ '-(R|TTR)-\d{6}$'
  -- Chequeo de colisión: el nuevo código no debe existir ya en otro cargo.
  AND NOT EXISTS (
    SELECT 1 FROM cargos c2
    WHERE c2.codigo = regexp_replace(ca.codigo, '-(\d{6})$', '-R-\1')
  );

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- Chequeo post-backfill
--   (a) reparto por motivo (control de volúmenes vs §3 del .md: ~2 retención,
--       alta_por_baja y cobertura_dotacion el resto).
--   (b) concursos sin tipo asignado (debería dar 0 si todo concurso entra en
--       alguna de las 3 ramas).
-- ─────────────────────────────────────────────────────────────────────────
SELECT coalesce(motivo_concurso::text, '(sin tipo)') AS motivo, COUNT(*)
FROM concursos
GROUP BY motivo_concurso
ORDER BY motivo;

SELECT 'sin_tipo' AS problema, COUNT(*)
FROM concursos
WHERE motivo_concurso IS NULL;
