-- Crear enum y tabla puestos_cargo
CREATE TYPE "ModalidadPuesto" AS ENUM ('pof', 'pou', 'ambos');

CREATE TABLE "puestos_cargo" (
  "id"           UUID             NOT NULL DEFAULT gen_random_uuid(),
  "escalafon_id" UUID             NOT NULL,
  "modalidad"    "ModalidadPuesto" NOT NULL,
  "nombre"       VARCHAR(200)     NOT NULL,
  "activo"       BOOLEAN          NOT NULL DEFAULT true,
  CONSTRAINT "puestos_cargo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "puestos_cargo_escalafon_id_fkey"
    FOREIGN KEY ("escalafon_id") REFERENCES "escalafones"("id")
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "puestos_cargo_escalafon_id_modalidad_nombre_key"
    UNIQUE ("escalafon_id", "modalidad", "nombre")
);

CREATE INDEX "puestos_cargo_escalafon_id_modalidad_idx"
  ON "puestos_cargo"("escalafon_id", "modalidad");

-- ─── CPH Medicos (escalafon "Medicos") — POF ─────────────────────────────────
INSERT INTO "puestos_cargo" ("escalafon_id", "modalidad", "nombre") VALUES
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Medico de Planta'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Medico Veterinario de Planta'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Antropologo de Planta'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Asistente Social de Planta'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Bioquimico de Planta'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Biologo de Planta'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Experto en Fisica Radiante de Planta'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Farmaceutico de Planta'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Fonoaudiologo de Planta'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Kinesiologo de Planta'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Lic. en Ciencias de la Educ. de Planta'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Musicoterapeuta de Planta'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Nutricionista de Planta'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Obstetrica de Planta'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Odontologo de Planta'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Psicopedagogo de Planta'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Psicologo de Planta'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Sociologo de Planta'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Terapista Ocupacional de Planta'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Trabajador Social de Planta');

-- ─── CPH Medicos — POU ───────────────────────────────────────────────────────
INSERT INTO "puestos_cargo" ("escalafon_id", "modalidad", "nombre") VALUES
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Profesional Guardia Medico'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Especialista en la Guardia Medico'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Medico Veterinario de Guardia'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Asistente Social de Guardia'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Bacteriologo de Guardia'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Bioquimico de Guardia'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Biologo de Guardia'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Farmaceutico de Guardia'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Fonoaudiologo de Guardia'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Kinesiologo de Guardia'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Nutricionista de Guardia'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Obstetrica de Guardia'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Odontologo de Guardia'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Psicopedagogo de Guardia'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Psicologo de Guardia'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Terapista Ocupacional de Guardia'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Trabajador Social de Guardia');

-- ─── CPH (Carrera Profesional Hospitalaria) — mismos puestos ─────────────────
INSERT INTO "puestos_cargo" ("escalafon_id", "modalidad", "nombre")
  SELECT '6fa1454a-b739-4d66-a805-fd962e3797bf', modalidad, nombre
  FROM "puestos_cargo"
  WHERE escalafon_id = '31402d78-f420-4b72-9f69-42f0c0644fca'
  ON CONFLICT DO NOTHING;

-- ─── TEC (CEETPS) ─────────────────────────────────────────────────────────────
INSERT INTO "puestos_cargo" ("escalafon_id", "modalidad", "nombre") VALUES
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Bioterio'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Licenciado en Biotecnologia'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Licenciado en Instrumentacion Quirurgica'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Licenciado en Produccion de Bioimagenes'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Licenciado en Ortesis y Protesis'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Anestesiologia'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Asistencia Dental'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Biotecnologia'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Citologia'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Dialisis'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Esterilizacion'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Farmacia'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Hematologia'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Hemoterapia'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Instrumentacion Quirurgica'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Laboratorio'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Laboratorio de Patologia'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Mecanica Dental'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Medicina Nuclear'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Necropsia'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Neurofisiologia'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Perfusion'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Podologia'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Practicas Cardiologicas'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Quimica'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Radiologia'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Optica'),
  ('4650e709-2be7-4783-b970-802ce3b69a40', 'ambos', 'Tecnico en Ortesis y Protesis');

-- TEC tambien en "Carrera de Tecnicos de la Salud"
INSERT INTO "puestos_cargo" ("escalafon_id", "modalidad", "nombre")
  SELECT '96937230-3f5a-4e18-88a5-2916d6dc415a', modalidad, nombre
  FROM "puestos_cargo"
  WHERE escalafon_id = '4650e709-2be7-4783-b970-802ce3b69a40'
  ON CONFLICT DO NOTHING;

-- ─── ENF ─────────────────────────────────────────────────────────────────────
INSERT INTO "puestos_cargo" ("escalafon_id", "modalidad", "nombre") VALUES
  ('4327d209-987f-41b7-8e3f-4a8d81d99b5b', 'ambos', 'Enfermero Profesional'),
  ('4327d209-987f-41b7-8e3f-4a8d81d99b5b', 'ambos', 'Licenciado en Enfermeria');

-- ─── EG (Escalafon General) ───────────────────────────────────────────────────
INSERT INTO "puestos_cargo" ("escalafon_id", "modalidad", "nombre") VALUES
  ('52007555-1d09-4168-8cd3-cfd19b4d0695', 'ambos', 'Ayudante de Laboratorio, Hemoterapia, Farmacia y Drogueria'),
  ('52007555-1d09-4168-8cd3-cfd19b4d0695', 'ambos', 'Capellan'),
  ('52007555-1d09-4168-8cd3-cfd19b4d0695', 'ambos', 'Chofer de Ambulancia'),
  ('52007555-1d09-4168-8cd3-cfd19b4d0695', 'ambos', 'Cuidador Enfermero de Animales'),
  ('52007555-1d09-4168-8cd3-cfd19b4d0695', 'ambos', 'Hermana de Caridad'),
  ('52007555-1d09-4168-8cd3-cfd19b4d0695', 'ambos', 'Morguero'),
  ('52007555-1d09-4168-8cd3-cfd19b4d0695', 'ambos', 'Oxigenista'),
  ('52007555-1d09-4168-8cd3-cfd19b4d0695', 'ambos', 'Radio Operador'),
  ('52007555-1d09-4168-8cd3-cfd19b4d0695', 'ambos', 'Radio Operador de Emergencias');
