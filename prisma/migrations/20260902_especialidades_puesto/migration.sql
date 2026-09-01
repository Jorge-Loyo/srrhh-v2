-- Tabla de especialidades por puesto_cargo
-- Un puesto puede tener N especialidades; una especialidad puede aplicar a N puestos
CREATE TABLE "especialidades_puesto" (
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "puesto_cargo_id" UUID         NOT NULL,
  "nombre"          VARCHAR(200) NOT NULL,
  "activo"          BOOLEAN      NOT NULL DEFAULT true,
  CONSTRAINT "especialidades_puesto_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "especialidades_puesto_puesto_cargo_id_fkey"
    FOREIGN KEY ("puesto_cargo_id") REFERENCES "puestos_cargo"("id")
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "especialidades_puesto_puesto_cargo_id_nombre_key"
    UNIQUE ("puesto_cargo_id", "nombre")
);

CREATE INDEX "especialidades_puesto_puesto_cargo_id_idx"
  ON "especialidades_puesto"("puesto_cargo_id");

-- ─── SEED: las 99 especialidades aplican a todos los puestos CPH medicos ──────
-- Puestos CPH medicos en escalafon "Medicos" (id: 31402d78-...)
-- POF: Medico de Planta, Medico Veterinario de Planta
-- POU: Profesional Guardia Medico, Especialista en la Guardia Medico, Medico Veterinario de Guardia

INSERT INTO "especialidades_puesto" ("puesto_cargo_id", "nombre")
SELECT pc.id, esp.nombre
FROM "puestos_cargo" pc
CROSS JOIN (VALUES
  ('Ablacion e Implantacion de Organos'),
  ('Adolescencia'),
  ('Alergia e Inmunopatologia'),
  ('Anatomia Patologica'),
  ('Anestesiologia'),
  ('Angiologia General y Hemodinamia'),
  ('Asistencia Respiratoria Intensiva'),
  ('Auditoria Medica'),
  ('Cardiologia'),
  ('Cardiologia Infantil'),
  ('Cirugia Cardiovascular'),
  ('Cirugia Cardiaca Infantil'),
  ('Cirugia Gastroenterologica'),
  ('Cirugia General'),
  ('Cirugia Infantil'),
  ('Cirugia Invasiva Minima'),
  ('Cirugia Plastica y Reparadora'),
  ('Cirugia Toracica'),
  ('Cirugia Vascular Periferica'),
  ('Cirugia de Cabeza y Cuello'),
  ('Clinica Medica'),
  ('Coloproctologia'),
  ('Cuidados Paliativos Medicos'),
  ('Dermatologia'),
  ('Dermatologia Infantil'),
  ('Diagnostico por Imagenes'),
  ('Electroneurofisiologia'),
  ('Emergentologia'),
  ('Endocrinologia'),
  ('Endocrinologia Infantil'),
  ('Endoscopia'),
  ('Enfermedades Infecciosas (Infectologia)'),
  ('Epidemiologia'),
  ('Fisiatra (Medicina Fisica y Rehabilitacion)'),
  ('Gastroenterologia'),
  ('Gastroenterologia Infantil'),
  ('Genetica Medica'),
  ('Geriatria'),
  ('Ginecologia'),
  ('Hematologia'),
  ('Hematologia Infantil'),
  ('Hematologia y Oncologia Infantil'),
  ('Hemodinamia'),
  ('Hemoterapia'),
  ('Hemoterapia e Inmunohematologia'),
  ('Hepatologia'),
  ('Infectologia'),
  ('Infectologia Infantil'),
  ('Inmunologia'),
  ('Inmunologia Infantil'),
  ('Mastologia'),
  ('Medicina General y/o Familiar'),
  ('Medicina Legal'),
  ('Medicina Nuclear'),
  ('Medicina del Deporte'),
  ('Medicina del Trabajo'),
  ('Medico Nutricionista'),
  ('Nefrologia'),
  ('Nefrologia Infantil'),
  ('Neonatologia'),
  ('Neumonologia'),
  ('Neumonologia Infantil'),
  ('Neumotisiologia'),
  ('Neurocirugia'),
  ('Neurocirugia Infantil'),
  ('Neurologia'),
  ('Neurologia Infantil'),
  ('Nutricion'),
  ('Nutricion Infantil'),
  ('Obstetricia'),
  ('Oftalmologia'),
  ('Oncologia'),
  ('Oncologia Infantil'),
  ('Ortopedia y Traumatologia'),
  ('Ortopedia y Traumatologia Infantil'),
  ('Otorrinolaringologia'),
  ('Pediatria'),
  ('Proctologia'),
  ('Psicopatologia y Salud Mental'),
  ('Psiquiatria'),
  ('Psiquiatria Infanto Juvenil'),
  ('Quemados'),
  ('Radiologia (Radiodiagnostico)'),
  ('Radioterapia (Terapia Radiante)'),
  ('Recuperador Cardiovascular'),
  ('Reumatologia'),
  ('Reumatologia Infantil'),
  ('Sin Especialidad'),
  ('Terapia Intensiva'),
  ('Terapia Intensiva Infantil'),
  ('Tocoginecologia'),
  ('Toxicologia'),
  ('Transplante Renal'),
  ('Trasplante Hepatico y Cirugia Hepatobiliar'),
  ('Traumatologia'),
  ('Urologia'),
  ('Urologia Infantil'),
  ('Veterinaria'),
  ('Veterinaria en Salud Publica')
) AS esp(nombre)
WHERE pc.escalafon_id IN (
  '31402d78-f420-4b72-9f69-42f0c0644fca',  -- Medicos
  '6fa1454a-b739-4d66-a805-fd962e3797bf'   -- Carrera Profesional Hospitalaria
)
AND pc.nombre IN (
  'Medico de Planta',
  'Medico Veterinario de Planta',
  'Profesional Guardia Medico',
  'Especialista en la Guardia Medico',
  'Medico Veterinario de Guardia'
)
ON CONFLICT DO NOTHING;
