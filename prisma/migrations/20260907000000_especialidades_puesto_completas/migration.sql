-- Migración: poblar especialidades_puesto desde PUESTO_ESP_MAP de bajasHelpers.ts
-- Los 3 puestos médicos principales (Medico de Planta, Especialista en la Guardia Medico,
-- Profesional Guardia Medico) ya tienen 97 especialidades c/u desde migración anterior.
-- Este script agrega los puestos restantes que tenían especialidades hardcodeadas en el frontend.
--
-- Reescrita (Agustin, 2026-09-02): la versión original de Jorge insertaba con
-- puesto_cargo_id hardcodeado a mano (UUIDs de su base local) — falló acá con
-- FK violation porque esos UUIDs no existen en ningún otro Postgres (mismo
-- error de portabilidad ya visto antes en 20260902000003_unificar_docentes).
-- Reescrita con el patrón que ya usa 20260902_fix_especialidades: lookup por
-- nombre de puesto (INSERT ... SELECT ... CROSS JOIN), sin escalafón como
-- filtro — cada nombre de puesto existe en 2 escalafones (Médicos y Carrera
-- Profesional Hospitalaria) y el precedente ya establecido es cargar la
-- especialidad en ambos, no solo en uno.

-- Bioquimico de Guardia
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES
  ('Bioquimica Clinica Sin Especialidad'),
  ('Bioquimica'),
  ('Bioquimica Clinica (Quimica Clinica)'),
  ('Sin Especialidad'),
  ('Bioquimica Clinica (Bacteriologia)'),
  ('Bioquimica Clinica (Hematologia)')
) AS esp(nombre)
WHERE pc.nombre = 'Bioquimico de Guardia'
ON CONFLICT DO NOTHING;

-- Bioquimico de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES
  ('Bioquimica Clinica (Bacteriologia)'),
  ('Bioquimica Clinica (Microbiologia Clinica)'),
  ('Bioquimica Clinica (Quimica Clinica)'),
  ('Bioquimica Clinica Sin Especialidad'),
  ('Bioquimica'),
  ('Bioquimica Clinica (Genetica)'),
  ('Bioquimica Clinica (Lactancia)')
) AS esp(nombre)
WHERE pc.nombre = 'Bioquimico de Planta'
ON CONFLICT DO NOTHING;

-- Experto en Fisica Radiante de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES ('Radioterapia o Terapia Radiante')) AS esp(nombre)
WHERE pc.nombre = 'Experto en Fisica Radiante de Planta'
ON CONFLICT DO NOTHING;

-- Farmaceutico de Guardia
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES ('Farmacia Hospitalaria')) AS esp(nombre)
WHERE pc.nombre = 'Farmaceutico de Guardia'
ON CONFLICT DO NOTHING;

-- Farmaceutico de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES ('Farmacia Hospitalaria')) AS esp(nombre)
WHERE pc.nombre = 'Farmaceutico de Planta'
ON CONFLICT DO NOTHING;

-- Fonoaudiologo de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES ('Fonoaudiologia')) AS esp(nombre)
WHERE pc.nombre = 'Fonoaudiologo de Planta'
ON CONFLICT DO NOTHING;

-- Kinesiologo de Guardia
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES ('Kinesiologia')) AS esp(nombre)
WHERE pc.nombre = 'Kinesiologo de Guardia'
ON CONFLICT DO NOTHING;

-- Kinesiologo de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES ('Kinesiologia')) AS esp(nombre)
WHERE pc.nombre = 'Kinesiologo de Planta'
ON CONFLICT DO NOTHING;

-- Lic. en Ciencias de la Educ. de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES ('Ciencias de la Educacion')) AS esp(nombre)
WHERE pc.nombre = 'Lic. en Ciencias de la Educ. de Planta'
ON CONFLICT DO NOTHING;

-- Musicoterapeuta de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES ('Musicoterapia')) AS esp(nombre)
WHERE pc.nombre = 'Musicoterapeuta de Planta'
ON CONFLICT DO NOTHING;

-- Nutricionista de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES ('Lic. en Nutricion')) AS esp(nombre)
WHERE pc.nombre = 'Nutricionista de Planta'
ON CONFLICT DO NOTHING;

-- Obstetrica de Guardia
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES ('Obstetrica')) AS esp(nombre)
WHERE pc.nombre = 'Obstetrica de Guardia'
ON CONFLICT DO NOTHING;

-- Obstetrica de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES ('Obstetrica')) AS esp(nombre)
WHERE pc.nombre = 'Obstetrica de Planta'
ON CONFLICT DO NOTHING;

-- Odontologo de Guardia
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES
  ('Odontologia General'),
  ('Odontopediatria')
) AS esp(nombre)
WHERE pc.nombre = 'Odontologo de Guardia'
ON CONFLICT DO NOTHING;

-- Odontologo de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES
  ('Odontologia General'),
  ('Periodoncia'),
  ('Ortodoncia y Ortopedia Maxilar'),
  ('Odontopediatria'),
  ('Endodoncia'),
  ('Cirugia y Traumatologia Bucomaxilofacial')
) AS esp(nombre)
WHERE pc.nombre = 'Odontologo de Planta'
ON CONFLICT DO NOTHING;

-- Psicologo de Guardia
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES ('Psicologia Clinica')) AS esp(nombre)
WHERE pc.nombre = 'Psicologo de Guardia'
ON CONFLICT DO NOTHING;

-- Psicologo de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES
  ('Psicologia Clinica'),
  ('Psicologia Infantil')
) AS esp(nombre)
WHERE pc.nombre = 'Psicologo de Planta'
ON CONFLICT DO NOTHING;

-- Psicopedagogo de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES ('Psicopedagogia')) AS esp(nombre)
WHERE pc.nombre = 'Psicopedagogo de Planta'
ON CONFLICT DO NOTHING;

-- Sociologo de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES ('Sociologia')) AS esp(nombre)
WHERE pc.nombre = 'Sociologo de Planta'
ON CONFLICT DO NOTHING;

-- Terapista Ocupacional de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES ('Terapia Ocupacional')) AS esp(nombre)
WHERE pc.nombre = 'Terapista Ocupacional de Planta'
ON CONFLICT DO NOTHING;

-- Trabajador Social de Guardia
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES ('Trabajo Social y Servicio Social')) AS esp(nombre)
WHERE pc.nombre = 'Trabajador Social de Guardia'
ON CONFLICT DO NOTHING;

-- Trabajador Social de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES ('Trabajo Social y Servicio Social')) AS esp(nombre)
WHERE pc.nombre = 'Trabajador Social de Planta'
ON CONFLICT DO NOTHING;

-- Biologo de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo)
SELECT gen_random_uuid(), pc.id, esp.nombre, true
FROM puestos_cargo pc
CROSS JOIN (VALUES ('Sin Especialidad')) AS esp(nombre)
WHERE pc.nombre = 'Biologo de Planta'
ON CONFLICT DO NOTHING;
