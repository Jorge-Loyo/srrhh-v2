-- =============================================================================
-- Migración: especialidades vacía → tabla poblada + FK desde cargos
-- 1. Poblar especialidades con los 181 valores distintos de cargos.especialidad
-- 2. Agregar cargos.especialidad_id (UUID FK → especialidades, nullable)
-- 3. Migrar datos: setear especialidad_id en cada cargo que tenga especialidad
-- 4. Renombrar cargos.especialidad → cargos.especialidad_legacy (deprecado)
-- =============================================================================

BEGIN;

-- ── 1. Poblar especialidades ──────────────────────────────────────────────────
INSERT INTO especialidades (id, nombre, prioritaria, activo)
SELECT
  gen_random_uuid(),
  especialidad,
  -- Marcar como prioritarias las definidas en Doc/Dotaneitor_Analisis.md paso 16
  especialidad IN (
    'Cardiologia', 'Cirugia General', 'Clinica Medica (Medicina Interna)',
    'Ginecologia', 'Neurologia', 'Oftalmologia', 'Ortopedia y Traumatologia',
    'Pediatria (Clinica Pediatrica)', 'Psiquiatria', 'Tocoginecologia',
    'Anestesiologia', 'Cirugia Infantil', 'Cirugia Infantil Pediatrica',
    'Diagnostico por Imagenes', 'Endocrinologia', 'Farmacia Hospitalaria',
    'Fonoaudiología', 'Kinesiologia', 'Otorrinolaringologia',
    'Odontologia General', 'Endodoncia', 'Odontopediatria',
    'Ortodoncia', 'Periodoncia',
    'Psicologia Clinica', 'Psicología Clínica', 'Psicologia Infantil'
  ),
  true
FROM (
  SELECT DISTINCT especialidad
  FROM cargos
  WHERE especialidad IS NOT NULL AND especialidad != ''
) sub
ON CONFLICT (nombre) DO NOTHING;

-- ── 2. Agregar columna especialidad_id ────────────────────────────────────────
ALTER TABLE cargos ADD COLUMN IF NOT EXISTS especialidad_id UUID REFERENCES especialidades(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cargos_especialidad_id_idx ON cargos(especialidad_id);

-- ── 3. Migrar datos ───────────────────────────────────────────────────────────
UPDATE cargos c
SET especialidad_id = e.id
FROM especialidades e
WHERE c.especialidad = e.nombre
  AND c.especialidad IS NOT NULL
  AND c.especialidad != '';

-- ── 4. Renombrar campo texto a _legacy ────────────────────────────────────────
ALTER TABLE cargos RENAME COLUMN especialidad TO especialidad_legacy;

COMMIT;

-- Verificación
SELECT
  (SELECT COUNT(*) FROM especialidades) AS total_especialidades,
  (SELECT COUNT(*) FROM cargos WHERE especialidad_id IS NOT NULL) AS cargos_con_fk,
  (SELECT COUNT(*) FROM cargos WHERE especialidad_legacy IS NOT NULL AND especialidad_id IS NULL) AS cargos_sin_migrar,
  (SELECT COUNT(*) FROM especialidades WHERE prioritaria = true) AS prioritarias;
