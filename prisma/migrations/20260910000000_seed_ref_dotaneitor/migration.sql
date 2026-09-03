-- =============================================================================
-- Seed: datos hardcodeados de Dotaneitor → tablas ref_*
-- Migración del paso 14 de Doc/Dotaneitor_Analisis.md
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- ref_abreviaturas_tecnicas
-- -----------------------------------------------------------------------------
INSERT INTO ref_abreviaturas_tecnicas (id, sigla, activo) VALUES
  (gen_random_uuid(), 'SECC', true),
  (gen_random_uuid(), 'UNID', true),
  (gen_random_uuid(), 'DIV', true),
  (gen_random_uuid(), 'DEPT', true),
  (gen_random_uuid(), 'GO', true),
  (gen_random_uuid(), 'SGO', true),
  (gen_random_uuid(), 'SS', true),
  (gen_random_uuid(), 'SGA', true),
  (gen_random_uuid(), 'CESAC', true),
  (gen_random_uuid(), 'CESACS', true),
  (gen_random_uuid(), 'SUP', true),
  (gen_random_uuid(), 'SDHOS', true),
  (gen_random_uuid(), 'CEETPS', true),
  (gen_random_uuid(), 'NCE', true),
  (gen_random_uuid(), 'SAME', true),
  (gen_random_uuid(), 'UCO', true),
  (gen_random_uuid(), 'CODEI', true),
  (gen_random_uuid(), 'CYMAT', true),
  (gen_random_uuid(), 'EDUC', true),
  (gen_random_uuid(), 'HOSP', true),
  (gen_random_uuid(), 'INST', true),
  (gen_random_uuid(), 'MAT', true),
  (gen_random_uuid(), 'COMP', true),
  (gen_random_uuid(), 'HTAL', true),
  (gen_random_uuid(), 'CTRO', true),
  (gen_random_uuid(), 'MANT', true),
  (gen_random_uuid(), 'EPID', true),
  (gen_random_uuid(), 'ASIST', true),
  (gen_random_uuid(), 'RESID', true),
  (gen_random_uuid(), 'GUAR', true),
  (gen_random_uuid(), 'TEC', true),
  (gen_random_uuid(), 'PEDIAT', true),
  (gen_random_uuid(), 'UPE', true),
  (gen_random_uuid(), 'CPH', true),
  (gen_random_uuid(), 'UTI', true),
  (gen_random_uuid(), 'ACV', true),
  (gen_random_uuid(), 'USOVNI', true),
  (gen_random_uuid(), 'SARIP', true),
  (gen_random_uuid(), 'CADEA', true),
  (gen_random_uuid(), 'SADOFE', true),
  (gen_random_uuid(), 'IT', true),
  (gen_random_uuid(), 'PG', true),
  (gen_random_uuid(), 'DG', true),
  (gen_random_uuid(), 'TM', true),
  (gen_random_uuid(), 'TT', true),
  (gen_random_uuid(), 'TN', true),
  (gen_random_uuid(), 'MS', true),
  (gen_random_uuid(), 'CEMAR', true),
  (gen_random_uuid(), 'RR', true),
  (gen_random_uuid(), 'HH', true),
  (gen_random_uuid(), 'SECR', true),
  (gen_random_uuid(), 'APS', true),
  (gen_random_uuid(), 'I', true),
  (gen_random_uuid(), 'II', true),
  (gen_random_uuid(), 'III', true),
  (gen_random_uuid(), 'IV', true),
  (gen_random_uuid(), 'V', true),
  (gen_random_uuid(), 'VI', true),
  (gen_random_uuid(), 'VII', true),
  (gen_random_uuid(), 'VIII', true),
  (gen_random_uuid(), 'IX', true),
  (gen_random_uuid(), 'X', true),
  (gen_random_uuid(), 'XI', true),
  (gen_random_uuid(), 'XII', true),
  (gen_random_uuid(), 'XIII', true),
  (gen_random_uuid(), 'XIV', true),
  (gen_random_uuid(), 'XV', true),
  (gen_random_uuid(), 'HGNRG', true),
  (gen_random_uuid(), 'HGACA', true),
  (gen_random_uuid(), 'HGADS', true),
  (gen_random_uuid(), 'HGAJAF', true),
  (gen_random_uuid(), 'HGARM', true),
  (gen_random_uuid(), 'HGACD', true),
  (gen_random_uuid(), 'HGAPP', true),
  (gen_random_uuid(), 'HGAIP', true),
  (gen_random_uuid(), 'HGAP', true),
  (gen_random_uuid(), 'HBR', true),
  (gen_random_uuid(), 'HGATA', true),
  (gen_random_uuid(), 'HGNPE', true),
  (gen_random_uuid(), 'HGAT', true),
  (gen_random_uuid(), 'HGAVS', true),
  (gen_random_uuid(), 'HGAZ', true),
  (gen_random_uuid(), 'GCABA', true),
  (gen_random_uuid(), 'MSGC', true),
  (gen_random_uuid(), 'SIAL', true),
  (gen_random_uuid(), 'SIGEHOS', true)
ON CONFLICT (sigla) DO NOTHING;

-- -----------------------------------------------------------------------------
-- ref_abreviaturas_titulo
-- -----------------------------------------------------------------------------
INSERT INTO ref_abreviaturas_titulo (id, titulo, activo) VALUES
  (gen_random_uuid(), 'DRA', true),
  (gen_random_uuid(), 'PROF', true),
  (gen_random_uuid(), 'MED', true),
  (gen_random_uuid(), 'DIR', true),
  (gen_random_uuid(), 'LIC', true)
ON CONFLICT (titulo) DO NOTHING;

-- -----------------------------------------------------------------------------
-- ref_conectores_minuscula
-- -----------------------------------------------------------------------------
INSERT INTO ref_conectores_minuscula (id, conector, activo) VALUES
  (gen_random_uuid(), 'de', true),
  (gen_random_uuid(), 'del', true),
  (gen_random_uuid(), 'la', true),
  (gen_random_uuid(), 'las', true),
  (gen_random_uuid(), 'los', true),
  (gen_random_uuid(), 'el', true),
  (gen_random_uuid(), 'y', true),
  (gen_random_uuid(), 'e', true),
  (gen_random_uuid(), 'en', true),
  (gen_random_uuid(), 'por', true),
  (gen_random_uuid(), 'para', true),
  (gen_random_uuid(), 'con', true),
  (gen_random_uuid(), 'sin', true),
  (gen_random_uuid(), 'a', true),
  (gen_random_uuid(), 'al', true),
  (gen_random_uuid(), 'o', true)
ON CONFLICT (conector) DO NOTHING;

-- -----------------------------------------------------------------------------
-- ref_sufijos_ordinales
-- -----------------------------------------------------------------------------
INSERT INTO ref_sufijos_ordinales (id, sufijo, activo) VALUES
  (gen_random_uuid(), 'er', true),
  (gen_random_uuid(), 'ero', true),
  (gen_random_uuid(), 'do', true),
  (gen_random_uuid(), 'da', true),
  (gen_random_uuid(), 'ro', true),
  (gen_random_uuid(), 'ra', true),
  (gen_random_uuid(), 'to', true),
  (gen_random_uuid(), 'ta', true),
  (gen_random_uuid(), 'vo', true),
  (gen_random_uuid(), 'va', true),
  (gen_random_uuid(), 'mo', true),
  (gen_random_uuid(), 'ma', true),
  (gen_random_uuid(), 'no', true),
  (gen_random_uuid(), 'na', true)
ON CONFLICT (sufijo) DO NOTHING;

-- -----------------------------------------------------------------------------
-- ref_correcciones_especialidad
-- -----------------------------------------------------------------------------
INSERT INTO ref_correcciones_especialidad (id, original, correccion, activo) VALUES
  (gen_random_uuid(), 'CIRUGIA TORAXICA', 'Cirugía Torácica', true),
  (gen_random_uuid(), 'PSIQUATRIA', 'Psiquiatría', true),
  (gen_random_uuid(), 'PSIQUIATRA', 'Psiquiatría', true),
  (gen_random_uuid(), 'TRABAJO SOCIAL Y SERVICIO SOCIAL', 'Trabajo Social', true)
ON CONFLICT (original) DO NOTHING;

-- -----------------------------------------------------------------------------
-- ref_correcciones_lit_puesto
-- cod_reg NULL = aplica a todos los cod_reg
-- -----------------------------------------------------------------------------
INSERT INTO ref_correcciones_lit_puesto (id, cod_reg, original, correccion, activo) VALUES
  (gen_random_uuid(), NULL, 'FARMACIA', 'Técnico en Farmacia', true),
  (gen_random_uuid(), NULL, 'LABORATORIO', 'Técnico en Laboratorio', true),
  (gen_random_uuid(), NULL, 'LABORATORIO DE PATOLOGIA', 'Técnico en Laboratorio de Patología', true),
  (gen_random_uuid(), NULL, 'ESTERILIZACION', 'Técnico en Esterilización', true),
  (gen_random_uuid(), NULL, 'NECROPSIA', 'Técnico en Necropsia', true),
  (gen_random_uuid(), NULL, 'PRACTICAS CARDIOLOGICAS', 'Técnico en Prácticas Cardiológicas', true),
  (gen_random_uuid(), NULL, 'ASISTENCIA DENTAL', 'Técnico en Asistencia Dental', true),
  (gen_random_uuid(), NULL, 'HEMOTERAPIA', 'Técnico en Hemoterapia', true),
  (gen_random_uuid(), NULL, 'RADIOLOGIA', 'Técnico en Radiología', true),
  (gen_random_uuid(), NULL, 'NUTRICIONISTA DIETISTA DE PLANTA', 'Nutricionista de Planta', true),
  (gen_random_uuid(), NULL, 'NUTRICIONISTA DIETISTA DE GUARDIA', 'Nutricionista de Guardia', true),
  (gen_random_uuid(), NULL, 'LIC. EN NUTRICION DE GUARDIA', 'Lic. en Nutrición de Guardia', true),
  (gen_random_uuid(), NULL, 'KINESIOLOGO FISIATRA DE GUARDIA', 'Kinesiologo de Guardia', true),
  (gen_random_uuid(), NULL, 'KINESIOLOGO FISIATRA DE PLANTA', 'Kinesiologo de Planta', true),
  (gen_random_uuid(), NULL, 'LIC. KINESIOLOGIA DE GUARDIA', 'Lic. en Kinesiología de Guardia', true),
  (gen_random_uuid(), NULL, 'LIC. KINESIOLOGIA DE PLANTA', 'Lic. en Kinesiología de Planta', true),
  (gen_random_uuid(), NULL, 'LIC. BIOQUIMICO DE GUARDIA', 'Lic. en Bioquímica de Guardia', true),
  (gen_random_uuid(), NULL, 'LIC. BIOQUIMICO DE PLANTA', 'Lic. en Bioquímica de Planta', true),
  (gen_random_uuid(), NULL, 'LIC. EN PSICOLOGIA DE GUARDIA', 'Lic. en Psicología de Guardia', true),
  (gen_random_uuid(), NULL, 'LIC. EN PSICOPEDAGOGIA DE GUARDIA', 'Lic. en Psicopedagogía de Guardia', true),
  (gen_random_uuid(), NULL, 'LICENCIADO EN PSICOLOGIA / PSICOLOGO', 'Lic. en Psicología de Planta', true),
  (gen_random_uuid(), NULL, 'LIC. EN SERVICIO SOCIAL SALUD DE PLANTA', 'Lic. en Servicio Social de Planta', true),
  (gen_random_uuid(), NULL, 'LIC. EN CIENCIAS EDUC. DE PLANTA', 'Lic. en Ciencias de la Educ. de Planta', true),
  (gen_random_uuid(), NULL, 'LIC. EN COMUNICACION SOCIAL O EN CS.DE LA COMUNICACION', 'Lic. en Comunicación Social', true),
  (gen_random_uuid(), NULL, 'LICENCIADO EN COMUNICACION SOCIAL', 'Lic. en Comunicación Social', true),
  (gen_random_uuid(), NULL, 'OPERADOR CONVIVENCIAL EN NINÑEZ Y/O ADOLESCENCIA', 'Operador Convivencial en Niñez y/o Adolescencia', true),
  (gen_random_uuid(), NULL, 'ANALISTA DE CONTROL DE GESTION OPERATIVOADMINISTRATIVA', 'Analista de Control de Gestión Operativo Administrativa', true),
  (gen_random_uuid(), '23', 'MEDICO', 'Suplente de Guardia', true),
  (gen_random_uuid(), '37', 'MEDICO VETERINARIO', 'Medico Veterinario de Planta', true),
  (gen_random_uuid(), '37', 'LICENCIADO EN KINESIOLOGIA', 'Lic. en Kinesiología de Planta', true),
  (gen_random_uuid(), '23', 'LICENCIADO EN KINESIOLOGIA', 'Lic. en Kinesiología de Guardia', true),
  (gen_random_uuid(), '37', 'LIC. EN KINESIOLOGIA', 'Lic. en Kinesiología de Planta', true),
  (gen_random_uuid(), '23', 'LIC. EN KINESIOLOGIA', 'Lic. en Kinesiología de Guardia', true),
  (gen_random_uuid(), '37', 'LIC. EN TERAPIA OCUPACIONAL', 'Lic. en Terapia Ocupacional de Planta', true)
ON CONFLICT (cod_reg, original) DO NOTHING;

-- -----------------------------------------------------------------------------
-- ref_especialidad_por_puesto
-- -----------------------------------------------------------------------------
INSERT INTO ref_especialidad_por_puesto (id, agrupador, especialidad, pureza_pct, activo) VALUES
  (gen_random_uuid(), 'Asistente Social de Guardia', 'Trabajo Social', 100, true),
  (gen_random_uuid(), 'Asistente Social de Planta', 'Trabajo Social', 90, true),
  (gen_random_uuid(), 'Bioquímico de Guardia', 'Bioquímica Clínica sin Especialidad', 85, true),
  (gen_random_uuid(), 'Bioquímico de Planta', 'Bioquímica Clínica (Química Clínica)', 55, true),
  (gen_random_uuid(), 'Experto en Física Radiante de Planta', 'Radioterapia (Física Radiante)', NULL, true),
  (gen_random_uuid(), 'Farmacéutico de Guardia', 'Farmacia Hospitalaria', 99, true),
  (gen_random_uuid(), 'Farmacéutico de Planta', 'Farmacia Hospitalaria', 97, true),
  (gen_random_uuid(), 'Fonoaudiólogo de Guardia', 'Fonoaudiología', NULL, true),
  (gen_random_uuid(), 'Fonoaudiólogo de Planta', 'Fonoaudiología', 100, true),
  (gen_random_uuid(), 'Kinesiólogo de Guardia', 'Kinesiología', 98, true),
  (gen_random_uuid(), 'Kinesiólogo de Planta', 'Kinesiología', 99, true),
  (gen_random_uuid(), 'Lic. en Kinesiología de Guardia', 'Kinesiología', 100, true),
  (gen_random_uuid(), 'Lic. en Nutrición de Guardia', 'Lic. en Nutrición', 100, true),
  (gen_random_uuid(), 'Lic. en Psicología de Guardia', 'Psicología Clínica', 100, true),
  (gen_random_uuid(), 'Lic. en Psicopedagogía de Guardia', 'Psicopedagogía', NULL, true),
  (gen_random_uuid(), 'Licenciado en Obstetricia - Obstétrica', 'Obstetricia', NULL, true),
  (gen_random_uuid(), 'Musicoterapeuta de Planta', 'Musicoterapia', 100, true),
  (gen_random_uuid(), 'Médico Veterinario de Planta', 'Veterinaria', 91, true),
  (gen_random_uuid(), 'Médico de Planta', 'Sin Especialidad', NULL, true),
  (gen_random_uuid(), 'Nutricionista de Guardia', 'Lic. en Nutrición', 100, true),
  (gen_random_uuid(), 'Nutricionista de Planta', 'Lic. en Nutrición', 92, true),
  (gen_random_uuid(), 'Obstétrica de Guardia', 'Obstétrica', 95, true),
  (gen_random_uuid(), 'Obstétrica de Planta', 'Obstétrica', 93, true),
  (gen_random_uuid(), 'Especialista en la Guardia Médico', 'Clínica Médica (Medicina Interna)', NULL, true),
  (gen_random_uuid(), 'Odontólogo de Guardia', 'Odontología General', 91, true),
  (gen_random_uuid(), 'Odontólogo de Planta', 'Odontología General', 62, true),
  (gen_random_uuid(), 'Profesional Guardia Médico', 'Sin Especialidad', NULL, true),
  (gen_random_uuid(), 'Psicopedagogo de Guardia', 'Psicopedagogía', NULL, true),
  (gen_random_uuid(), 'Psicopedagogo de Planta', 'Psicopedagogía', 99, true),
  (gen_random_uuid(), 'Psicólogo de Guardia', 'Psicología Clínica', 86, true),
  (gen_random_uuid(), 'Psicólogo de Planta', 'Psicología Clínica', 93, true),
  (gen_random_uuid(), 'Terapeuta Ocupacional de Planta', 'Terapia Ocupacional', 100, true),
  (gen_random_uuid(), 'Terapista Ocupacional de Guardia', 'Terapia Ocupacional', NULL, true),
  (gen_random_uuid(), 'Terapista Ocupacional de Planta', 'Terapia Ocupacional', 97, true),
  (gen_random_uuid(), 'Trabajador Social de Guardia', 'Trabajo Social', 97, true),
  (gen_random_uuid(), 'Trabajador Social de Planta', 'Trabajo Social', 86, true),
  (gen_random_uuid(), 'Técnico en Laboratorio de Análisis Clínicos', 'Laboratorio (Análisis Clínicos)', NULL, true)
ON CONFLICT (agrupador) DO NOTHING;

COMMIT;
