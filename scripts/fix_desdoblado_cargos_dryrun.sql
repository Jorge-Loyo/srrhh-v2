-- DRY-RUN del desdoblado de cargos compartidos (Residencias 24 / Docentes 07).
-- SOLO SELECT, no modifica nada. Ver fix_desdoblado_cargos.sql para el detalle.
-- norm_esp CON trim (critico para el match de especialidad).

CREATE OR REPLACE FUNCTION norm_esp(txt text) RETURNS text AS $$
  SELECT trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    lower(unaccent(coalesce(txt, ''))),
    '\([^)]*\)', ' ', 'g'), '•', ' ', 'g'), '-', ' ', 'g'), '\s+', ' ', 'g'));
$$ LANGUAGE sql IMMUTABLE;

-- A.1 — Totales REALES por registro (solo ocupaciones activas por situacion_revista).
--       cargos_multi = cargos compartidos; nuevos = cargos que se crearian.
SELECT t.registro,
       count(*)                       AS cargos_multi,
       sum(t.ocup_activas)            AS ocup_activas_totales,
       sum(t.ocup_activas) - count(*) AS cargos_nuevos_a_crear,
       max(t.ocup_activas)            AS max_en_un_cargo
FROM (
  SELECT c.id, cr.codigo AS registro, count(o.id) AS ocup_activas
  FROM cargos c
  JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo IN ('24','07')
  JOIN ocupaciones o ON o.cargo_id = c.id AND o.hasta IS NULL
                    AND lower(unaccent(o.situacion_revista)) = 'activo'
  GROUP BY c.id, cr.codigo
  HAVING count(o.id) > 1
) t
GROUP BY t.registro ORDER BY t.registro;

-- A.2 — Proximo codigo libre por prefijo (esperado RES-005254, DOC-000460).
SELECT p.prefijo,
       max((substring(c.codigo from 5))::int) AS max_num_actual,
       p.prefijo || lpad((max((substring(c.codigo from 5))::int) + 1)::text, 6, '0') AS proximo_libre
FROM (VALUES ('RES-'), ('DOC-')) AS p(prefijo)
JOIN cargos c ON c.codigo LIKE p.prefijo || '%' AND substring(c.codigo from 5) ~ '^[0-9]{6}$'
GROUP BY p.prefijo ORDER BY p.prefijo;

-- A.3 — Muestra de la especialidad que se asignaria a cada rol activo de un
--       cargo compartido de 24 (match por su PROPIO padron; NULL = queda vacio).
WITH compartidos AS (
  SELECT c.id AS cargo_id, c.codigo AS cargo_codigo, c.puesto_cargo_id,
         min(o.id_sial_rol) AS titular_rol
  FROM cargos c
  JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo = '24'
  JOIN ocupaciones o ON o.cargo_id = c.id AND o.hasta IS NULL
                    AND lower(unaccent(o.situacion_revista)) = 'activo'
  GROUP BY c.id, c.codigo, c.puesto_cargo_id
  HAVING count(o.id) > 1
),
roles_activos AS (
  SELECT cp.cargo_codigo, cp.puesto_cargo_id, o.id_sial_rol,
         (o.id_sial_rol = cp.titular_rol) AS es_titular
  FROM compartidos cp
  JOIN ocupaciones o ON o.cargo_id = cp.cargo_id AND o.hasta IS NULL
                    AND lower(unaccent(o.situacion_revista)) = 'activo'
),
ult_padron AS (
  SELECT DISTINCT ON (ph.id_sial_rol) ph.id_sial_rol, ph.especialidad AS esp_raw
  FROM padron_historico ph
  WHERE ph.especialidad IS NOT NULL AND trim(ph.especialidad) <> ''
  ORDER BY ph.id_sial_rol, ph.fecha_asignada DESC
)
SELECT ra.cargo_codigo, ra.es_titular, ra.id_sial_rol,
       up.esp_raw AS especialidad_padron,
       ep.nombre  AS especialidad_que_se_asignaria
FROM roles_activos ra
LEFT JOIN ult_padron up ON up.id_sial_rol = ra.id_sial_rol
LEFT JOIN especialidades_puesto ep
       ON ep.puesto_cargo_id = ra.puesto_cargo_id
      AND norm_esp(ep.nombre) = norm_esp(up.esp_raw)
WHERE ra.cargo_codigo = 'RES-003243'
ORDER BY ra.es_titular DESC, ra.id_sial_rol;

-- A.4 — Zombies (hasta=NULL no activas) que NO se desdoblan, por registro.
SELECT cr.codigo AS registro,
       count(*) FILTER (WHERE lower(unaccent(o.situacion_revista)) <> 'activo') AS zombie_total,
       count(*) FILTER (WHERE lower(unaccent(o.situacion_revista)) =  'activo') AS activas_total
FROM cargos c
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo IN ('24','07')
JOIN ocupaciones o ON o.cargo_id = c.id AND o.hasta IS NULL
GROUP BY cr.codigo ORDER BY cr.codigo;
