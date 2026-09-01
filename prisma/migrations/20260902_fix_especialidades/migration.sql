-- Limpiar seed incorrecto
DELETE FROM especialidades_puesto;

-- ─── Puestos medicos humanos: 95 especialidades (filas sin puesto en el Excel) ──
-- Aplica a: Medico de Planta, Profesional Guardia Medico, Especialista en la Guardia Medico
-- en ambos escalafones (Medicos + Carrera Profesional Hospitalaria)
INSERT INTO especialidades_puesto (puesto_cargo_id, nombre)
SELECT pc.id, esp.nombre
FROM puestos_cargo pc
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
  ('Medicina del Deporte'),
  ('Medicina del Trabajo'),
  ('Medicina General y/o Familiar'),
  ('Medicina Legal'),
  ('Medicina Nuclear'),
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
  ('Urologia Infantil')
) AS esp(nombre)
WHERE pc.escalafon_id IN (
  '31402d78-f420-4b72-9f69-42f0c0644fca',
  '6fa1454a-b739-4d66-a805-fd962e3797bf'
)
AND pc.nombre IN (
  'Medico de Planta',
  'Profesional Guardia Medico',
  'Especialista en la Guardia Medico'
)
ON CONFLICT DO NOTHING;

-- ─── Medico Veterinario: solo especialidades veterinarias ────────────────────
INSERT INTO especialidades_puesto (puesto_cargo_id, nombre)
SELECT pc.id, esp.nombre
FROM puestos_cargo pc
CROSS JOIN (VALUES
  ('Veterinaria'),
  ('Veterinaria en Salud Publica')
) AS esp(nombre)
WHERE pc.escalafon_id IN (
  '31402d78-f420-4b72-9f69-42f0c0644fca',
  '6fa1454a-b739-4d66-a805-fd962e3797bf'
)
AND pc.nombre IN (
  'Medico Veterinario de Planta',
  'Medico Veterinario de Guardia'
)
ON CONFLICT DO NOTHING;
