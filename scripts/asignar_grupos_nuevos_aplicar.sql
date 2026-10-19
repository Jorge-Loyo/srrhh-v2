-- ============================================================================
-- APLICAR los 4 grupos nuevos (transversales). Ver asignar_grupos_nuevos.sql
-- para el dry-run. Todas las especialidades objetivo están "(sin grupo)" hoy,
-- así que no se pisa ningún grupo existente.
-- Todo en transacción.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _grp (nombre text, grupo text) ON COMMIT DROP;
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

UPDATE especialidades_puesto ep
SET grupo = g.grupo
FROM _grp g
WHERE lower(trim(ep.nombre)) = g.nombre
  AND (ep.grupo IS NULL OR trim(ep.grupo) = '');

-- Verificación: reparto final de las especialidades tocadas.
SELECT ep.grupo, count(*) AS filas_catalogo
FROM especialidades_puesto ep
WHERE ep.grupo IN ('Enfermería','Anestesiología','Oftalmología','Neumonología')
GROUP BY ep.grupo
ORDER BY ep.grupo;

COMMIT;
