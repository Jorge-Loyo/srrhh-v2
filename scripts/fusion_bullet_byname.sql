-- ============================================================================
-- Fusión de especialidades con "• " contra su gemela limpia — POR NOMBRE.
-- Portable a cualquier base (Neon/local): NO usa ids hardcodeados, resuelve los
-- pares (viejo con •, nuevo limpio) por puesto_cargo_id + nombre en runtime.
-- Reapunta cargos / concursos_cph / solicitudes_alta y borra las filas con "•".
-- Todo en transacción. Idempotente: si no hay "•", no hace nada.
-- ============================================================================

BEGIN;

-- Pares (viejo = con •, nuevo = gemela limpia en el mismo puesto).
CREATE TEMP TABLE _fusion ON COMMIT DROP AS
SELECT viejo.id AS viejo, limpio.id AS nuevo
FROM especialidades_puesto viejo
JOIN especialidades_puesto limpio
  ON limpio.puesto_cargo_id = viejo.puesto_cargo_id
 AND limpio.nombre = trim(regexp_replace(viejo.nombre, '^•\s*', ''))
WHERE viejo.nombre LIKE '•%';

-- Diagnóstico de cuántos pares se resolvieron (debe ser 19 si Neon = estado local inicial).
SELECT count(*) AS pares_a_fusionar FROM _fusion;

-- 1. Reapuntar cargos.
UPDATE cargos c SET especialidad_puesto_id = f.nuevo
FROM _fusion f WHERE c.especialidad_puesto_id = f.viejo;

-- 2. Reapuntar concursos_cph.
UPDATE concursos_cph cc SET especialidad_puesto_solicitada_id = f.nuevo
FROM _fusion f WHERE cc.especialidad_puesto_solicitada_id = f.viejo;

-- 3. Reapuntar solicitudes_alta.
UPDATE solicitudes_alta sa SET especialidad_puesto_id = f.nuevo
FROM _fusion f WHERE sa.especialidad_puesto_id = f.viejo;

-- 4. Borrar las especialidades con "•" ya vaciadas de referencias.
DELETE FROM especialidades_puesto ep USING _fusion f WHERE ep.id = f.viejo;

-- Verificación: no deben quedar especialidades con "•".
SELECT count(*) AS quedan_con_bullet FROM especialidades_puesto WHERE nombre LIKE '•%';

COMMIT;
