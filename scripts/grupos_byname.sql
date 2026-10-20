-- ============================================================================
-- Asignación de grupos (transversal, por NOMBRE) — portable a Neon/local.
-- Reúne todo lo decidido en las tandas 1 y 2:
--   - Grupos NUEVOS: Enfermería, Anestesiología, Oftalmología, Neumonología.
--   - Merge: "Bioquímica Clínica" -> "Bioquímica".
--   - Huecos completados hacia grupos existentes (solo filas sin grupo).
-- Idempotente: reasigna por nombre; correr varias veces da el mismo resultado.
-- Todo en transacción.
-- ============================================================================

BEGIN;

-- ── Merge Bioquímica Clínica -> Bioquímica (unificación de grupos) ──
UPDATE especialidades_puesto SET grupo = 'Bioquímica' WHERE grupo = 'Bioquímica Clínica';

-- ── Asignación por nombre exacto (normalizado lower/trim) ──
CREATE TEMP TABLE _grp (nombre text, grupo text) ON COMMIT DROP;
INSERT INTO _grp (nombre, grupo) VALUES
  -- Grupos NUEVOS
  ('enfermeria',                                      'Enfermería'),
  ('enfermeria pediatrica',                           'Enfermería'),
  ('enfermeria en perinatologia',                     'Enfermería'),
  ('enfermeria en cuidados criticos y emergencias',   'Enfermería'),
  ('enfermeria general integral y comunitaria',       'Enfermería'),
  ('anestesiologia',                                  'Anestesiología'),
  ('anestesiologia pediatrica',                       'Anestesiología'),
  ('oftalmologia',                                    'Oftalmología'),
  ('neumonologia',                                    'Neumonología'),
  ('neumotisiologia',                                 'Neumonología'),
  -- Huecos a grupos existentes
  ('asistente social',                                'Trabajo Social'),
  ('trabajador social',                               'Trabajo Social'),
  ('licenciado en servicio social',                   'Trabajo Social'),
  ('nutricionista',                                   'Nutrición'),
  ('licenciado en nutricion',                         'Nutrición'),
  ('nutricion clinica',                               'Nutrición'),
  ('bioquimico',                                      'Bioquímica'),
  ('farmaceutico',                                    'Farmacia'),
  ('fonoaudiologia',                                  'Fonoaudiología'),
  ('kinesiologo',                                     'Kinesiología');

-- Solo toca filas sin grupo (no pisa grupos ya asignados).
UPDATE especialidades_puesto ep
SET grupo = g.grupo
FROM _grp g
WHERE lower(trim(ep.nombre)) = g.nombre
  AND (ep.grupo IS NULL OR trim(ep.grupo) = '');

-- Verificación: reparto de los grupos tocados.
SELECT grupo, count(*) AS filas FROM especialidades_puesto
WHERE grupo IN ('Enfermería','Anestesiología','Oftalmología','Neumonología',
                'Bioquímica','Trabajo Social','Nutrición','Farmacia','Fonoaudiología','Kinesiología')
GROUP BY grupo ORDER BY grupo;
-- Debe ser 0:
SELECT count(*) AS bioquimica_clinica_restante FROM especialidades_puesto WHERE grupo = 'Bioquímica Clínica';

COMMIT;
