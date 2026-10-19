-- ============================================================================
-- Crear 4 grupos NUEVOS (transversales, todas las carreras) asignando el campo
-- especialidades_puesto.grupo a las especialidades que correspondan.
--
-- Grupos y alcance (confirmado con el usuario):
--   Enfermería     -> enfermeria, enfermeria pediatrica, enfermeria en perinatologia,
--                     enfermeria en cuidados criticos y emergencias,
--                     enfermeria general integral y comunitaria
--   Anestesiología -> anestesiologia, anestesiologia pediatrica
--   Oftalmología   -> oftalmologia
--   Neumonología   -> neumonologia, neumotisiologia
--
-- Match por nombre EXACTO (lower/trim) para no pescar variantes no deseadas.
-- Transversal: NO filtra por carrera (el grupo aplica a la especialidad en todos
-- los puestos/carreras donde exista).
-- ============================================================================

-- Mapa nombre_especialidad -> grupo nuevo.
CREATE TEMP TABLE _grp (nombre text, grupo text);
INSERT INTO _grp (nombre, grupo) VALUES
  ('enfermeria',                                      'Enfermería'),
  ('enfermeria pediatrica',                           'Enfermería'),
  ('enfermeria en perinatologia',                     'Enfermería'),
  ('enfermeria en cuidados criticos y emergencias',   'Enfermería'),
  ('enfermeria general integral y comunitaria',       'Enfermería'),
  ('anestesiologia',                                  'Anestesiología'),
  ('anestesiologia pediatrica',                       'Anestesiología'),
  ('oftalmologia',                                    'Oftalmología'),
  ('neumonologia',                                    'Neumonología'),
  ('neumotisiologia',                                 'Neumonología');

-- ─── DRY-RUN: por grupo, cuántas filas de catálogo matchean, su grupo actual,
--     y cuántos cargos vigentes quedarían agrupados ───────────────────────────
SELECT g.grupo AS grupo_nuevo,
       ep.nombre AS especialidad,
       count(DISTINCT ep.id) AS filas_catalogo,
       string_agg(DISTINCT coalesce(ep.grupo,'(sin grupo)'), ', ') AS grupo_actual,
       count(DISTINCT CASE WHEN c.estado='vigente' THEN c.id END) AS cargos_vigentes
FROM _grp g
JOIN especialidades_puesto ep ON lower(trim(ep.nombre)) = g.nombre
LEFT JOIN cargos c ON c.especialidad_puesto_id = ep.id
GROUP BY g.grupo, ep.nombre
ORDER BY g.grupo, ep.nombre;
