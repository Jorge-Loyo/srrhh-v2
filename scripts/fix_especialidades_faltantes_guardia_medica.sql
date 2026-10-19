-- ============================================================================
-- Agrega al catalogo las 11 especialidades faltantes del puesto "especialista
-- en la guardia medico" (y "lic. en psicologia de guardia") de Suplentes(23)/
-- Residencias(24) que quedaron pendientes de la tanda anterior (opcion b).
--
-- El usuario REVISO y CONFIRMO que las 11 son correctas (4 de reg 24:
-- adolescencia, gastroenterologia infantil, interdisciplinaria cuidados
-- paliativos medicos, psicologia clinica; 7 de reg 23: obstetrica x3,
-- psicologo x4). Todas existen en forma canonica en el catalogo (otro puesto);
-- se agregan al puesto que las necesita reusando ese nombre. No vacia ni
-- reapunta. Idempotente. Transaccional.
-- ============================================================================

CREATE OR REPLACE FUNCTION norm_esp(txt text) RETURNS text AS $$
  SELECT trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    lower(unaccent(coalesce(txt, ''))),
    '\([^)]*\)', ' ', 'g'), '•', ' ', 'g'), '-', ' ', 'g'), '\s+', ' ', 'g'));
$$ LANGUAGE sql IMMUTABLE;

-- A — DRY-RUN
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
  WHERE NOT EXISTS (SELECT 1 FROM especialidades_puesto ep2
    WHERE ep2.puesto_cargo_id = c.puesto_cargo_id AND norm_esp(ep2.nombre) = norm_esp(u.esp_padron))
),
canon AS (
  SELECT DISTINCT ON (norm_esp(nombre)) norm_esp(nombre) AS esp_norm, nombre AS nombre_canonico
  FROM especialidades_puesto ORDER BY norm_esp(nombre), nombre
)
SELECT f.puesto, c.nombre_canonico AS especialidad_a_agregar
FROM faltantes f LEFT JOIN canon c ON c.esp_norm = f.esp_norm
ORDER BY f.puesto, c.nombre_canonico;

-- B — APLICAR
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
  JOIN ult u ON u.id_sial_rol = o.id_sial_rol
  WHERE NOT EXISTS (SELECT 1 FROM especialidades_puesto ep2
    WHERE ep2.puesto_cargo_id = c.puesto_cargo_id AND norm_esp(ep2.nombre) = norm_esp(u.esp_padron))
),
canon AS (
  SELECT DISTINCT ON (norm_esp(nombre)) norm_esp(nombre) AS esp_norm, nombre AS nombre_canonico
  FROM especialidades_puesto ORDER BY norm_esp(nombre), nombre
)
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre)
SELECT gen_random_uuid(), f.puesto_cargo_id, c.nombre_canonico
FROM faltantes f
JOIN canon c ON c.esp_norm = f.esp_norm
WHERE NOT EXISTS (SELECT 1 FROM especialidades_puesto e2
  WHERE e2.puesto_cargo_id = f.puesto_cargo_id AND norm_esp(e2.nombre) = f.esp_norm);

COMMIT;

-- C — VERIFICACION: sin-match restantes en 23/24 (esperado 0).
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
WHERE NOT EXISTS (SELECT 1 FROM especialidades_puesto ep2
  WHERE ep2.puesto_cargo_id = c.puesto_cargo_id AND norm_esp(ep2.nombre) = norm_esp(u.esp_padron))
GROUP BY cr.codigo ORDER BY cr.codigo;
