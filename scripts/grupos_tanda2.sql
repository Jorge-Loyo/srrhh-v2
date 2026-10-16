-- ============================================================================
-- Tanda 2 de grupos (transversal, todas las carreras):
--   A) MERGE: unificar "Bioquímica Clínica" dentro de "Bioquímica"
--      (las 22 especialidades de Bioquímica Clínica pasan a Bioquímica).
--   B) COMPLETAR HUECOS: especialidades SIN grupo cuya rama ya tiene grupo.
--      Solo toca filas con grupo NULL/'' (no pisa grupos existentes).
--        asistente social, trabajador social, licenciado en servicio social -> Trabajo Social
--        nutricionista, licenciado en nutricion, nutricion clinica          -> Nutrición
--        bioquimico (fila suelta)                                           -> Bioquímica
--        farmaceutico                                                       -> Farmacia
--        fonoaudiologia                                                     -> Fonoaudiología
--        kinesiologo                                                        -> Kinesiología
--   NO se toca: terapeuta social (queda sin grupo, decisión del usuario).
-- Todo en transacción.
-- ============================================================================

BEGIN;

-- ── A) MERGE Bioquímica Clínica -> Bioquímica ──
UPDATE especialidades_puesto SET grupo = 'Bioquímica' WHERE grupo = 'Bioquímica Clínica';

-- ── B) Completar huecos (solo filas sin grupo) ──
CREATE TEMP TABLE _grp (nombre text, grupo text) ON COMMIT DROP;
INSERT INTO _grp (nombre, grupo) VALUES
  ('asistente social',               'Trabajo Social'),
  ('trabajador social',              'Trabajo Social'),
  ('licenciado en servicio social',  'Trabajo Social'),
  ('nutricionista',                  'Nutrición'),
  ('licenciado en nutricion',        'Nutrición'),
  ('nutricion clinica',              'Nutrición'),
  ('bioquimico',                     'Bioquímica'),
  ('farmaceutico',                   'Farmacia'),
  ('fonoaudiologia',                 'Fonoaudiología'),
  ('kinesiologo',                    'Kinesiología');

UPDATE especialidades_puesto ep
SET grupo = g.grupo
FROM _grp g
WHERE lower(trim(ep.nombre)) = g.nombre
  AND (ep.grupo IS NULL OR trim(ep.grupo) = '');

-- ── Verificación ──
SELECT 'Bioquímica Clínica restante (debe ser 0)' AS chequeo, count(*) AS n
FROM especialidades_puesto WHERE grupo = 'Bioquímica Clínica'
UNION ALL
SELECT 'Bioquímica total', count(*) FROM especialidades_puesto WHERE grupo = 'Bioquímica'
UNION ALL
SELECT 'Trabajo Social total', count(*) FROM especialidades_puesto WHERE grupo = 'Trabajo Social'
UNION ALL
SELECT 'Nutrición total', count(*) FROM especialidades_puesto WHERE grupo = 'Nutrición'
UNION ALL
SELECT 'Farmacia total', count(*) FROM especialidades_puesto WHERE grupo = 'Farmacia'
UNION ALL
SELECT 'Fonoaudiología total', count(*) FROM especialidades_puesto WHERE grupo = 'Fonoaudiología'
UNION ALL
SELECT 'Kinesiología total', count(*) FROM especialidades_puesto WHERE grupo = 'Kinesiología';

COMMIT;
