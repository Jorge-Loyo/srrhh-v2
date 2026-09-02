-- ============================================================================
-- Migración: Normalización de escalafones por LITERAL CR + CODIGO DE REGISTRO
-- Fuente de verdad: Dotacion_procesada.xlsx columnas LITERAL CR / CODIGO DE REGISTRO
-- Regla de fusión: "Carrera Administrativa" (cod 19) → "Nueva Carrera Administrativa"
-- ============================================================================

-- 1. Tabla de relación escalafón canónico ↔ códigos de registro del Excel
CREATE TABLE escalafon_codigos_registro (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  escalafon_id UUID        NOT NULL REFERENCES escalafones(id),
  codigo_reg   VARCHAR(10) NOT NULL UNIQUE,
  literal_orig VARCHAR(100) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_escalafon_codigos_reg ON escalafon_codigos_registro(escalafon_id);

-- 2. Insertar los 13 escalafones canónicos (limpios, con código corto)
--    Usamos ON CONFLICT DO NOTHING para ser idempotente.
INSERT INTO escalafones (id, codigo, nombre, activo, created_at, updated_at) VALUES
  (gen_random_uuid(), '22',  'Nueva Carrera Prof. Hosp',              true, NOW(), NOW()),
  (gen_random_uuid(), '23',  'Salud - Guardias',                      true, NOW(), NOW()),
  (gen_random_uuid(), '24',  'Residencias',                           true, NOW(), NOW()),
  (gen_random_uuid(), '25',  'Autoridades Superiores',                true, NOW(), NOW()),
  (gen_random_uuid(), '17',  'Gabinete',                              true, NOW(), NOW()),
  (gen_random_uuid(), '17B', 'Régimen Modular Extraordinario PG',     true, NOW(), NOW()),
  (gen_random_uuid(), '60',  'Carrera Gerencial',                     true, NOW(), NOW()),
  (gen_random_uuid(), '65',  'Plantas Transitorias Acta 06/2014',     true, NOW(), NOW()),
  (gen_random_uuid(), '7',   'Docentes Históricos',                   true, NOW(), NOW()),
  (gen_random_uuid(), '70',  'Cuerpo Especialistas Profesionales',    true, NOW(), NOW()),
  (gen_random_uuid(), '83',  'Nueva Carrera Administrativa',          true, NOW(), NOW()),
  (gen_random_uuid(), '85',  'CEETPS',                                true, NOW(), NOW()),
  (gen_random_uuid(), '87',  'Nueva Carrera Enfermería',              true, NOW(), NOW())
ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, updated_at = NOW();

-- 3. Poblar escalafon_codigos_registro
--    Cada fila: codigo_reg del Excel → escalafon_id canónico
--    Nota: cod 19 ("Carrera Administrativa") y cod 83 ("Nueva Carrera Administrativa")
--    apuntan al mismo escalafón canónico (código '83').
INSERT INTO escalafon_codigos_registro (escalafon_id, codigo_reg, literal_orig)
SELECT e.id, v.codigo_reg, v.literal_orig
FROM (VALUES
  ('22',  '22',  'Nueva Carrera Prof. Hosp'),
  ('22',  '37',  'Nueva Carrera Prof. Hosp'),
  ('23',  '23',  'Salud - Guardias'),
  ('24',  '24',  'Residencias'),
  ('25',  '25',  'Autoridades Superiores'),
  ('17',  '17',  'Gabinete'),
  ('17B', '17B', 'Régimen Modular Extraordinario PG'),
  ('60',  '60',  'Carrera Gerencial'),
  ('65',  '65',  'Plantas Transitorias Acta 06/2014'),
  ('7',   '7',   'Docentes Históricos'),
  ('70',  '70',  'Cuerpo Especialistas Profesionales'),
  ('83',  '83',  'Nueva Carrera Administrativa'),
  ('83',  '19',  'Carrera Administrativa'),
  ('85',  '85',  'CEETPS'),
  ('87',  '87',  'Nueva Carrera Enfermería')
) AS v(esc_codigo, codigo_reg, literal_orig)
JOIN escalafones e ON e.codigo = v.esc_codigo
ON CONFLICT (codigo_reg) DO NOTHING;

-- 4. Backfill cargos.escalafon_id → escalafón canónico via codigos_registro
--    Los cargos ya tienen codigoRegistroId → codigos_registro.codigo → escalafon_codigos_registro
UPDATE cargos c
SET escalafon_id = ecr.escalafon_id,
    updated_at   = NOW()
FROM codigos_registro cr
JOIN escalafon_codigos_registro ecr ON ecr.codigo_reg = cr.codigo
WHERE c.codigo_registro_id = cr.id
  AND c.escalafon_id != ecr.escalafon_id;

-- 5. Backfill padron_historico.escalafon → nombre canónico
--    Cruza por cargo_id → cargos.escalafon_id → escalafones.nombre
UPDATE padron_historico ph
SET escalafon = e.nombre
FROM cargos c
JOIN escalafones e ON e.id = c.escalafon_id
WHERE ph.cargo_id = c.id
  AND (ph.escalafon IS NULL OR ph.escalafon != e.nombre);

-- 6. Marcar como inactivos los escalafones sucios (los que tienen código UUID-like)
--    Son los creados automáticamente por el pipeline antes de esta migración.
--    Se desactivan en vez de borrar para no romper FKs existentes.
UPDATE escalafones
SET activo = false, updated_at = NOW()
WHERE codigo NOT IN ('22','23','24','25','17','17B','60','65','7','70','83','85','87')
  AND activo = true;
