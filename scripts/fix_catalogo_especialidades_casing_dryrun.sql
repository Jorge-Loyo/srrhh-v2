-- DRY-RUN de la curaduria del catalogo especialidades_puesto. SOLO SELECT.
-- Ver fix_catalogo_especialidades_casing.sql para el detalle.

CREATE OR REPLACE FUNCTION norm_esp(txt text) RETURNS text AS $$
  SELECT trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    lower(unaccent(coalesce(txt, ''))),
    '\([^)]*\)', ' ', 'g'), '•', ' ', 'g'), '-', ' ', 'g'), '\s+', ' ', 'g'));
$$ LANGUAGE sql IMMUTABLE;

-- A.1 — Casing (esperado: Pediatria 16, Psicologia 20).
SELECT 'casing' AS op, nombre AS actual, lower(nombre) AS nuevo, count(*) AS n
FROM especialidades_puesto WHERE nombre <> lower(nombre)
GROUP BY nombre ORDER BY nombre;

-- A.2 — Bullet a fusionar.
SELECT 'bullet' AS op, b.nombre AS a_borrar, canon.nombre AS canonica
FROM especialidades_puesto b
JOIN especialidades_puesto canon
  ON canon.puesto_cargo_id = b.puesto_cargo_id AND canon.id <> b.id
 AND canon.nombre = trim(regexp_replace(b.nombre, '•', '', 'g'))
WHERE b.nombre LIKE '%•%' ORDER BY b.nombre;

-- A.3 — Parentesis redundante a fusionar (NO bioquimica).
SELECT 'parentesis' AS op, p.nombre AS a_fusionar, canon.nombre AS canonica
FROM especialidades_puesto p
JOIN especialidades_puesto canon
  ON canon.puesto_cargo_id = p.puesto_cargo_id AND canon.id <> p.id
 AND norm_esp(canon.nombre) = norm_esp(p.nombre) AND canon.nombre NOT LIKE '%(%'
WHERE p.nombre LIKE '%(%' AND lower(p.nombre) NOT LIKE 'bioquimica%'
ORDER BY p.nombre;

-- A.4 — Cargos a reapuntar por las fusiones.
WITH a_fusionar AS (
  SELECT b.id AS from_id FROM especialidades_puesto b
  JOIN especialidades_puesto canon
    ON canon.puesto_cargo_id = b.puesto_cargo_id AND canon.id <> b.id
   AND canon.nombre = trim(regexp_replace(b.nombre, '•', '', 'g'))
  WHERE b.nombre LIKE '%•%'
  UNION
  SELECT p.id FROM especialidades_puesto p
  JOIN especialidades_puesto canon
    ON canon.puesto_cargo_id = p.puesto_cargo_id AND canon.id <> p.id
   AND norm_esp(canon.nombre) = norm_esp(p.nombre) AND canon.nombre NOT LIKE '%(%'
  WHERE p.nombre LIKE '%(%' AND lower(p.nombre) NOT LIKE 'bioquimica%'
)
SELECT 'cargos a reapuntar' AS info, count(*) AS n
FROM cargos c JOIN a_fusionar f ON f.from_id = c.especialidad_puesto_id;

-- A.5 — Control: bioquimica NO entra en la fusion (debe listar sus subespecialidades intactas).
SELECT 'bioquimica (NO se toca)' AS control, count(*) AS filas_bioquimica
FROM especialidades_puesto WHERE lower(nombre) LIKE 'bioquimica%';
