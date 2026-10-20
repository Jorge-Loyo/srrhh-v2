-- DRY-RUN (solo SELECT) de la correccion de especialidad de SUPLENTES (cod_reg 23).
-- NO modifica nada. Ver cabecera de fix_especialidad_suplentes.sql para el detalle.

CREATE OR REPLACE FUNCTION norm_esp(txt text) RETURNS text AS $$
  SELECT trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    lower(unaccent(coalesce(txt, ''))),
    '\([^)]*\)', ' ', 'g'), '•', ' ', 'g'), '-', ' ', 'g'), '\s+', ' ', 'g'));
$$ LANGUAGE sql IMMUTABLE;

-- A.1 — cuantos cargos se corregirian.
WITH ult AS (
  SELECT DISTINCT ON (ph.id_sial_rol) ph.id_sial_rol, ph.especialidad AS esp_padron
  FROM padron_historico ph
  WHERE ph.especialidad IS NOT NULL AND trim(ph.especialidad) <> ''
  ORDER BY ph.id_sial_rol, ph.fecha_asignada DESC
),
cand AS (
  SELECT c.id AS cargo_id, c.especialidad_puesto_id AS esp_actual_id, c.puesto_cargo_id, u.esp_padron,
         (SELECT ep.id FROM especialidades_puesto ep
           WHERE ep.puesto_cargo_id = c.puesto_cargo_id
             AND norm_esp(ep.nombre) = norm_esp(u.esp_padron) LIMIT 1) AS esp_correcta_id
  FROM ocupaciones o
  JOIN cargos c ON c.id = o.cargo_id AND c.estado = 'vigente' AND o.hasta IS NULL
  JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo = '23'
  JOIN ult u ON u.id_sial_rol = o.id_sial_rol
  WHERE norm_esp(u.esp_padron) NOT LIKE 'bioquimica%'
)
SELECT 'A CORREGIR (23 Suplentes)' AS seccion, count(*) AS n
FROM cand WHERE esp_correcta_id IS NOT NULL AND esp_correcta_id IS DISTINCT FROM esp_actual_id;

-- A.2 — detalle (muestra hasta 80).
WITH ult AS (
  SELECT DISTINCT ON (ph.id_sial_rol) ph.id_sial_rol, ph.especialidad AS esp_padron
  FROM padron_historico ph
  WHERE ph.especialidad IS NOT NULL AND trim(ph.especialidad) <> ''
  ORDER BY ph.id_sial_rol, ph.fecha_asignada DESC
),
cand AS (
  SELECT c.id AS cargo_id, c.codigo, c.especialidad_puesto_id AS esp_actual_id, c.puesto_cargo_id,
         ea.nombre AS esp_actual_nombre, u.esp_padron,
         (SELECT ep.id FROM especialidades_puesto ep
           WHERE ep.puesto_cargo_id = c.puesto_cargo_id
             AND norm_esp(ep.nombre) = norm_esp(u.esp_padron) LIMIT 1) AS esp_correcta_id
  FROM ocupaciones o
  JOIN cargos c ON c.id = o.cargo_id AND c.estado = 'vigente' AND o.hasta IS NULL
  JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo = '23'
  JOIN ult u ON u.id_sial_rol = o.id_sial_rol
  LEFT JOIN especialidades_puesto ea ON ea.id = c.especialidad_puesto_id
  WHERE norm_esp(u.esp_padron) NOT LIKE 'bioquimica%'
)
SELECT codigo, esp_padron AS padron, esp_actual_nombre AS actual_incorrecta,
       (SELECT nombre FROM especialidades_puesto WHERE id = esp_correcta_id) AS nueva_correcta
FROM cand
WHERE esp_correcta_id IS NOT NULL AND esp_correcta_id IS DISTINCT FROM esp_actual_id
ORDER BY esp_padron LIMIT 80;
