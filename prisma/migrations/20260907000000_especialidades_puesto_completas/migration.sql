-- Migración: poblar especialidades_puesto desde PUESTO_ESP_MAP de bajasHelpers.ts
-- Los 3 puestos médicos principales (Medico de Planta, Especialista en la Guardia Medico,
-- Profesional Guardia Medico) ya tienen 97 especialidades c/u desde migración anterior.
-- Este script agrega los puestos restantes que tenían especialidades hardcodeadas en el frontend.

-- Bioquimico de Guardia
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'b2f96cbe-3f51-4c87-be6e-cf52aa80b2f3','Bioquimica Clinica Sin Especialidad',true),
  (gen_random_uuid(),'b2f96cbe-3f51-4c87-be6e-cf52aa80b2f3','Bioquimica',true),
  (gen_random_uuid(),'b2f96cbe-3f51-4c87-be6e-cf52aa80b2f3','Bioquimica Clinica (Quimica Clinica)',true),
  (gen_random_uuid(),'b2f96cbe-3f51-4c87-be6e-cf52aa80b2f3','Sin Especialidad',true),
  (gen_random_uuid(),'b2f96cbe-3f51-4c87-be6e-cf52aa80b2f3','Bioquimica Clinica (Bacteriologia)',true),
  (gen_random_uuid(),'b2f96cbe-3f51-4c87-be6e-cf52aa80b2f3','Bioquimica Clinica (Hematologia)',true)
ON CONFLICT DO NOTHING;

-- Bioquimico de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'dd98a014-e61f-47c9-a900-979012198e45','Bioquimica Clinica (Bacteriologia)',true),
  (gen_random_uuid(),'dd98a014-e61f-47c9-a900-979012198e45','Bioquimica Clinica (Microbiologia Clinica)',true),
  (gen_random_uuid(),'dd98a014-e61f-47c9-a900-979012198e45','Bioquimica Clinica (Quimica Clinica)',true),
  (gen_random_uuid(),'dd98a014-e61f-47c9-a900-979012198e45','Bioquimica Clinica Sin Especialidad',true),
  (gen_random_uuid(),'dd98a014-e61f-47c9-a900-979012198e45','Bioquimica',true),
  (gen_random_uuid(),'dd98a014-e61f-47c9-a900-979012198e45','Bioquimica Clinica (Genetica)',true),
  (gen_random_uuid(),'dd98a014-e61f-47c9-a900-979012198e45','Bioquimica Clinica (Lactancia)',true)
ON CONFLICT DO NOTHING;

-- Experto en Fisica Radiante de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'1974c1bf-b600-4d5d-8b35-88d5e3368ce4','Radioterapia o Terapia Radiante',true)
ON CONFLICT DO NOTHING;

-- Farmaceutico de Guardia
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'6ebb5c48-0307-47b4-8fb1-9ffbdae5eefe','Farmacia Hospitalaria',true)
ON CONFLICT DO NOTHING;

-- Farmaceutico de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'db758642-0b2c-46f6-bbc3-11165f5ec5fc','Farmacia Hospitalaria',true)
ON CONFLICT DO NOTHING;

-- Fonoaudiologo de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'e4c15ccb-c33c-4ffb-9ffa-1df485a0c183','Fonoaudiologia',true)
ON CONFLICT DO NOTHING;

-- Kinesiologo de Guardia
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'42d0667d-6376-474c-bcf0-92fb067d3eac','Kinesiologia',true)
ON CONFLICT DO NOTHING;

-- Kinesiologo de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'2f3e8e10-139d-42a5-bf2f-f4b16e831cd4','Kinesiologia',true)
ON CONFLICT DO NOTHING;

-- Lic. en Ciencias de la Educ. de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'55eb474b-d20e-44e0-93fa-6cd0668fbeda','Ciencias de la Educacion',true)
ON CONFLICT DO NOTHING;

-- Musicoterapeuta de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'e69be31a-1b57-4361-942a-5c2f14c7bf76','Musicoterapia',true)
ON CONFLICT DO NOTHING;

-- Nutricionista de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'cfd29878-e9df-4b1c-b343-dae3e75b2f1d','Lic. en Nutricion',true)
ON CONFLICT DO NOTHING;

-- Obstetrica de Guardia
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'593f750f-0cd8-46cd-885d-59252aad7fce','Obstetrica',true)
ON CONFLICT DO NOTHING;

-- Obstetrica de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'c4af2ed9-9cfe-4287-9e81-98c7c6e28af3','Obstetrica',true)
ON CONFLICT DO NOTHING;

-- Odontologo de Guardia
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'c70ee0f9-b10d-43b9-aa99-5ebda3efc684','Odontologia General',true),
  (gen_random_uuid(),'c70ee0f9-b10d-43b9-aa99-5ebda3efc684','Odontopediatria',true)
ON CONFLICT DO NOTHING;

-- Odontologo de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'0825b790-3524-4a0e-8f29-6a970a158ca3','Odontologia General',true),
  (gen_random_uuid(),'0825b790-3524-4a0e-8f29-6a970a158ca3','Periodoncia',true),
  (gen_random_uuid(),'0825b790-3524-4a0e-8f29-6a970a158ca3','Ortodoncia y Ortopedia Maxilar',true),
  (gen_random_uuid(),'0825b790-3524-4a0e-8f29-6a970a158ca3','Odontopediatria',true),
  (gen_random_uuid(),'0825b790-3524-4a0e-8f29-6a970a158ca3','Endodoncia',true),
  (gen_random_uuid(),'0825b790-3524-4a0e-8f29-6a970a158ca3','Cirugia y Traumatologia Bucomaxilofacial',true)
ON CONFLICT DO NOTHING;

-- Psicologo de Guardia
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'95c549ad-b0ab-4bdb-899e-e8a6214d8a34','Psicologia Clinica',true)
ON CONFLICT DO NOTHING;

-- Psicologo de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'55944a7c-9b7c-4384-b1bf-3435f6b0b919','Psicologia Clinica',true),
  (gen_random_uuid(),'55944a7c-9b7c-4384-b1bf-3435f6b0b919','Psicologia Infantil',true)
ON CONFLICT DO NOTHING;

-- Psicopedagogo de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'80b1aff3-9e2f-4c7a-b112-789166941d7c','Psicopedagogia',true)
ON CONFLICT DO NOTHING;

-- Sociologo de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'fe8e58e7-6e21-4713-ad9b-fbc03501276c','Sociologia',true)
ON CONFLICT DO NOTHING;

-- Terapista Ocupacional de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'02cf8a11-76d6-4a6c-9d0d-c5c7876d94ff','Terapia Ocupacional',true)
ON CONFLICT DO NOTHING;

-- Trabajador Social de Guardia
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'a4482fbf-0c67-49e3-92be-ce062f6e2f42','Trabajo Social y Servicio Social',true)
ON CONFLICT DO NOTHING;

-- Trabajador Social de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'a271a894-7d11-4a79-be47-568988bb59c6','Trabajo Social y Servicio Social',true)
ON CONFLICT DO NOTHING;

-- Biologo de Planta
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo) VALUES
  (gen_random_uuid(),'46e852cc-59ab-4cf5-b0e4-87264c80741c','Sin Especialidad',true)
ON CONFLICT DO NOTHING;
