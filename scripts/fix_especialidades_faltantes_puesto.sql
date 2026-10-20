-- ============================================================================
-- Agrega al catalogo especialidades_puesto las especialidades que el PADRON
-- trae para un puesto de Suplentes(23)/Residencias(24) pero que NO existen en
-- el catalogo de ESE puesto (los "sin-match" reales, 17 ocupaciones).
--
-- Las 10 especialidades involucradas YA EXISTEN en el catalogo en forma canonica
-- (minuscula, sin tilde) colgando de OTROS puestos — verificado. Este script las
-- agrega tambien al puesto que las necesita, reusando ese nombre canonico (no
-- inventa formas nuevas). Tras esto, los 17 cargos matchean su especialidad del
-- padron (regla: el padron manda; antes agregar al catalogo que dejar vacio una
-- especialidad legitima).
--
-- NO vacia ni reapunta cargos: solo INSERTA filas de catalogo faltantes. El
-- match cargo->especialidad lo resuelve despues fix_especialidad_suplentes.sql /
-- el desdoblado (para 24 ya aplicado; los de 24 que quedaron vacios por falta de
-- catalogo se recuperan corriendo de nuevo la correccion de especialidad).
--
-- OPCION (b) — alcance acotado: se agregan SOLO las especialidades cuyo PUESTO
-- calza con ellas (nutricion->nutricionista de guardia, psicopedagogia->
-- psicopedagogo de guardia, kinesiologia->kinesiologo de guardia, etc.). Se
-- EXCLUYE el puesto "especialista en la guardia medico": ahi aparecen
-- especialidades no-medicas (psicologo, obstetrica, psicologia clinica/medica,
-- adolescencia, gastroenterologia infantil, cuidados paliativos) que muy
-- probablemente son PUESTO mal asignado en el padron, no especialidad faltante.
-- Esos casos se dejan intactos para revision manual (no se agregan al catalogo
-- ni se vacian).
--
-- Idempotente: NOT EXISTS; correr dos veces no duplica. Transaccional.
-- ============================================================================

CREATE OR REPLACE FUNCTION norm_esp(txt text) RETURNS text AS $$
  SELECT trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    lower(unaccent(coalesce(txt, ''))),
    '\([^)]*\)', ' ', 'g'), '•', ' ', 'g'), '-', ' ', 'g'), '\s+', ' ', 'g'));
$$ LANGUAGE sql IMMUTABLE;


-- ############################################################################
-- ## SECCION A — DRY-RUN (SOLO SELECT)                                        ##
-- ############################################################################
-- Muestra, por cada (puesto, especialidad del padron sin match), el nombre
-- canonico que se insertaria (tomado de como ya figura en el catalogo).
WITH ult AS (
  SELECT DISTINCT ON (ph.id_sial_rol) ph.id_sial_rol, ph.especialidad AS esp_padron
  FROM padron_historico ph
  WHERE ph.especialidad IS NOT NULL AND trim(ph.especialidad) <> ''
  ORDER BY ph.id_sial_rol, ph.fecha_asignada DESC
),
faltantes AS (
  SELECT DISTINCT c.puesto_cargo_id, pcd.nombre AS puesto, norm_esp(u.esp_padron) AS esp_norm
  FROM ocupaciones o
  JOIN cargos c  ON c.id = o.cargo_id AND c.estado='vigente' AND o.hasta IS NULL
  JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo IN ('23','24')
  JOIN puestos_cargo pcd ON pcd.id = c.puesto_cargo_id
  JOIN ult u ON u.id_sial_rol = o.id_sial_rol
  WHERE NOT EXISTS (
    SELECT 1 FROM especialidades_puesto ep2
    WHERE ep2.puesto_cargo_id = c.puesto_cargo_id AND norm_esp(ep2.nombre) = norm_esp(u.esp_padron)
  )
  -- OPCION (b): excluir el puesto de guardia medica (casos dudosos a revision).
  AND norm_esp(pcd.nombre) <> norm_esp('especialista en la guardia medico')
),
canon AS (  -- nombre canonico ya existente en el catalogo para cada esp_norm
  SELECT DISTINCT ON (norm_esp(nombre)) norm_esp(nombre) AS esp_norm, nombre AS nombre_canonico
  FROM especialidades_puesto ORDER BY norm_esp(nombre), nombre
)
SELECT f.puesto, c.nombre_canonico AS especialidad_a_agregar
FROM faltantes f
LEFT JOIN canon c ON c.esp_norm = f.esp_norm
ORDER BY f.puesto, c.nombre_canonico;


-- ############################################################################
-- ## SECCION B — APLICAR (BEGIN ... COMMIT)                                   ##
-- ############################################################################
BEGIN;

WITH ult AS (
  SELECT DISTINCT ON (ph.id_sial_rol) ph.id_sial_rol, ph.especialidad AS esp_padron
  FROM padron_historico ph
  WHERE ph.especialidad IS NOT NULL AND trim(ph.especialidad) <> ''
  ORDER BY ph.id_sial_rol, ph.fecha_asignada DESC
),
faltantes AS (
  SELECT DISTINCT c.puesto_cargo_id, norm_esp(u.esp_padron) AS esp_norm
  FROM ocupaciones o
  JOIN cargos c  ON c.id = o.cargo_id AND c.estado='vigente' AND o.hasta IS NULL
  JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo IN ('23','24')
  JOIN puestos_cargo pcd ON pcd.id = c.puesto_cargo_id
  JOIN ult u ON u.id_sial_rol = o.id_sial_rol
  WHERE NOT EXISTS (
    SELECT 1 FROM especialidades_puesto ep2
    WHERE ep2.puesto_cargo_id = c.puesto_cargo_id AND norm_esp(ep2.nombre) = norm_esp(u.esp_padron)
  )
  -- OPCION (b): excluir el puesto de guardia medica (casos dudosos a revision).
  AND norm_esp(pcd.nombre) <> norm_esp('especialista en la guardia medico')
),
canon AS (
  SELECT DISTINCT ON (norm_esp(nombre)) norm_esp(nombre) AS esp_norm, nombre AS nombre_canonico
  FROM especialidades_puesto ORDER BY norm_esp(nombre), nombre
)
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre)
SELECT gen_random_uuid(), f.puesto_cargo_id, c.nombre_canonico
FROM faltantes f
JOIN canon c ON c.esp_norm = f.esp_norm     -- solo si existe forma canonica (las 10 existen)
WHERE NOT EXISTS (   -- idempotencia: no reinsertar si ya quedo
  SELECT 1 FROM especialidades_puesto e2
  WHERE e2.puesto_cargo_id = f.puesto_cargo_id AND norm_esp(e2.nombre) = f.esp_norm
);

COMMIT;


-- ############################################################################
-- ## SECCION C — VERIFICACION                                                 ##
-- ############################################################################
-- Sin-match restantes en 23/24 (esperado 0 — todas las especialidades existian
-- en forma canonica, asi que se agregaron todas).
WITH ult AS (
  SELECT DISTINCT ON (ph.id_sial_rol) ph.id_sial_rol, ph.especialidad AS esp_padron
  FROM padron_historico ph
  WHERE ph.especialidad IS NOT NULL AND trim(ph.especialidad) <> ''
  ORDER BY ph.id_sial_rol, ph.fecha_asignada DESC
)
SELECT cr.codigo AS registro, count(*) AS sin_match_restantes
FROM ocupaciones o
JOIN cargos c  ON c.id = o.cargo_id AND c.estado='vigente' AND o.hasta IS NULL
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo IN ('23','24')
JOIN ult u ON u.id_sial_rol = o.id_sial_rol
WHERE NOT EXISTS (
  SELECT 1 FROM especialidades_puesto ep2
  WHERE ep2.puesto_cargo_id = c.puesto_cargo_id AND norm_esp(ep2.nombre) = norm_esp(u.esp_padron)
)
GROUP BY cr.codigo ORDER BY cr.codigo;
