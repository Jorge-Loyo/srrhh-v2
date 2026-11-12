-- ============================================================================
-- CURADURIA DEL CATALOGO especialidades_puesto: casing, bullet y paréntesis
-- redundante. Deja el catalogo canonico (minuscula, sin bullet, sin parentesis
-- redundante) SIN romper la excepcion Bioquimica ni las ñ legitimas.
--
-- DIAGNOSTICO (BD local 2026-10, verificado):
--   - 1659 especialidades. 36 con mayuscula = solo "Pediatria" (16) y
--     "Psicologia" (20). Ninguna choca con su minuscula en el mismo puesto
--     (ya_existe_minuscula=0 en las 36) -> UPDATE directo, sin fusion.
--   - 8 con ñ: TODAS legitimas (pañolero, niñez, albañil, año, diseño,
--     acompañante). NO se tocan (la ñ no es un tilde).
--   - Duplicados por parentesis redundante (mismo puesto, misma esp fuera del
--     parentesis): anatomia patologica (patologia), clinica medica (medicina
--     interna), obstetricia (clinica obstetrica). CANONICA = sin parentesis.
--   - Duplicados por bullet: "• enfermeria...", "• interdisciplinaria...".
--     CANONICA = sin bullet.
--
-- EXCEPCION BIOQUIMICA (NO TOCAR): "bioquimica clinica (bacteriologia)",
-- "(quimica clinica)", "(micologia)", etc. son SUBESPECIALIDADES REALES, no
-- aclaraciones redundantes. Se EXCLUYEN de la fusion de parentesis. Quedan
-- como estan.
--
-- FUSION: cuando dos filas del MISMO puesto colapsan a la misma canonica, se
-- reapuntan los cargos a la fila canonica (la sin parentesis / sin bullet) y
-- se borra la fila sobrante. Si la canonica no existe aun, se renombra la
-- sobrante en vez de borrar.
--
-- SEGURIDAD: todo APLICAR en BEGIN;...COMMIT;. ROLLBACK revierte entero.
-- ============================================================================

CREATE OR REPLACE FUNCTION norm_esp(txt text) RETURNS text AS $$
  SELECT trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    lower(unaccent(coalesce(txt, ''))),
    '\([^)]*\)', ' ', 'g'), '•', ' ', 'g'), '-', ' ', 'g'), '\s+', ' ', 'g'));
$$ LANGUAGE sql IMMUTABLE;


-- ############################################################################
-- ## SECCION A — DRY-RUN (SOLO SELECT)                                        ##
-- ############################################################################

-- A.1 — Casing: "Pediatria"/"Psicologia" -> minuscula (36 filas, sin choque).
SELECT 'casing' AS op, nombre AS actual, lower(nombre) AS nuevo, count(*) AS n
FROM especialidades_puesto
WHERE nombre <> lower(nombre)
GROUP BY nombre ORDER BY nombre;

-- A.2 — Bullet: filas con "•" que tienen una gemela sin bullet en el mismo puesto.
SELECT 'bullet' AS op, b.id, b.nombre AS a_borrar, canon.nombre AS canonica, canon.id AS canon_id
FROM especialidades_puesto b
JOIN especialidades_puesto canon
  ON canon.puesto_cargo_id = b.puesto_cargo_id
 AND canon.id <> b.id
 AND canon.nombre = trim(regexp_replace(b.nombre, '•', '', 'g'))
WHERE b.nombre LIKE '%•%'
ORDER BY b.nombre;

-- A.3 — Parentesis redundante (NO bioquimica): fila "x (y)" con gemela "x" en el
--       mismo puesto. La canonica es la SIN parentesis.
SELECT 'parentesis' AS op, p.id, p.nombre AS a_fusionar, canon.nombre AS canonica, canon.id AS canon_id
FROM especialidades_puesto p
JOIN especialidades_puesto canon
  ON canon.puesto_cargo_id = p.puesto_cargo_id
 AND canon.id <> p.id
 AND norm_esp(canon.nombre) = norm_esp(p.nombre)
 AND canon.nombre NOT LIKE '%(%'          -- la canonica es la sin parentesis
WHERE p.nombre LIKE '%(%'
  AND lower(p.nombre) NOT LIKE 'bioquimica%'   -- EXCEPCION bioquimica: no tocar
ORDER BY p.nombre;

-- A.4 — Cuantos cargos se reapuntarian por las fusiones (bullet + parentesis).
WITH a_fusionar AS (
  SELECT b.id AS from_id, canon.id AS to_id
  FROM especialidades_puesto b
  JOIN especialidades_puesto canon
    ON canon.puesto_cargo_id = b.puesto_cargo_id AND canon.id <> b.id
   AND canon.nombre = trim(regexp_replace(b.nombre, '•', '', 'g'))
  WHERE b.nombre LIKE '%•%'
  UNION ALL
  SELECT p.id, canon.id
  FROM especialidades_puesto p
  JOIN especialidades_puesto canon
    ON canon.puesto_cargo_id = p.puesto_cargo_id AND canon.id <> p.id
   AND norm_esp(canon.nombre) = norm_esp(p.nombre) AND canon.nombre NOT LIKE '%(%'
  WHERE p.nombre LIKE '%(%' AND lower(p.nombre) NOT LIKE 'bioquimica%'
)
SELECT 'cargos a reapuntar' AS info, count(*) AS n
FROM cargos c JOIN a_fusionar f ON f.from_id = c.especialidad_puesto_id;


-- ############################################################################
-- ## SECCION B — APLICAR (BEGIN ... COMMIT)                                   ##
-- ############################################################################

BEGIN;

-- B.1 — Casing: bajar "Pediatria"/"Psicologia" a minuscula (sin choque, UPDATE directo).
UPDATE especialidades_puesto
   SET nombre = lower(nombre)
 WHERE nombre <> lower(nombre);

-- B.2 — Tabla temporal con los pares (sobrante -> canonica) de bullet + parentesis.
CREATE TEMP TABLE _fusion_esp AS
  SELECT b.id AS from_id, canon.id AS to_id
  FROM especialidades_puesto b
  JOIN especialidades_puesto canon
    ON canon.puesto_cargo_id = b.puesto_cargo_id AND canon.id <> b.id
   AND canon.nombre = trim(regexp_replace(b.nombre, '•', '', 'g'))
  WHERE b.nombre LIKE '%•%'
  UNION
  SELECT p.id, canon.id
  FROM especialidades_puesto p
  JOIN especialidades_puesto canon
    ON canon.puesto_cargo_id = p.puesto_cargo_id AND canon.id <> p.id
   AND norm_esp(canon.nombre) = norm_esp(p.nombre) AND canon.nombre NOT LIKE '%(%'
  WHERE p.nombre LIKE '%(%' AND lower(p.nombre) NOT LIKE 'bioquimica%';

-- B.3 — Reapuntar cargos de la fila sobrante a la canonica.
UPDATE cargos c
   SET especialidad_puesto_id = f.to_id, updated_at = now()
  FROM _fusion_esp f
 WHERE c.especialidad_puesto_id = f.from_id;

-- B.4 — Borrar las filas sobrantes ya sin cargos apuntando.
DELETE FROM especialidades_puesto ep USING _fusion_esp f WHERE ep.id = f.from_id;

DROP TABLE _fusion_esp;

-- Revisar que no haya error. Si algo no cuadra -> ROLLBACK.
COMMIT;


-- ############################################################################
-- ## SECCION C — VERIFICACION (SOLO SELECT)                                   ##
-- ############################################################################

-- C.1 — 0 con mayuscula (esperado 0).
SELECT count(*) AS con_mayuscula FROM especialidades_puesto WHERE nombre <> lower(nombre);

-- C.2 — 0 con bullet (esperado 0).
SELECT count(*) AS con_bullet FROM especialidades_puesto WHERE nombre LIKE '%•%';

-- C.3 — Duplicados por parentesis redundante restantes EXCLUYENDO bioquimica
--       (esperado 0). Bioquimica queda con sus subespecialidades = OK.
SELECT puesto_cargo_id, norm_esp(nombre), count(*)
FROM especialidades_puesto
WHERE lower(nombre) NOT LIKE 'bioquimica%'
GROUP BY puesto_cargo_id, norm_esp(nombre)
HAVING count(*) > 1;
