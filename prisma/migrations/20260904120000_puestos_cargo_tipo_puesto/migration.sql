-- Falta detectada al probar el Wizard de Concursos CPH (2026-09-04): el
-- modelo PuestoCargo de schema.prisma tiene `tipoPuesto` (@map "tipo_puesto")
-- desde antes, pero nunca se escribió la migración que agrega la columna —
-- `prisma migrate status` decía "up to date" (todas las migraciones QUE
-- EXISTEN como archivo están aplicadas) mientras la columna real faltaba en
-- la base. Rompía con 500 ("column puestos_cargo.tipo_puesto does not
-- exist") cualquier consulta a /api/v1/puestos-cargo y
-- /api/v1/puestos-cargo/especialidades — el selector de Puesto/Especialidad
-- de la etapa de Designación en Concursos CPH/CEETPS y en Alta de Cargos por
-- Estructura.
CREATE TYPE "TipoPuesto" AS ENUM ('ejecucion', 'conduccion');

ALTER TABLE "puestos_cargo"
  ADD COLUMN "tipo_puesto" "TipoPuesto" NOT NULL DEFAULT 'ejecucion';

-- Backfill: los 10 puestos de conducción sembrados en
-- 20260903_puestos_faltantes ("para boton Estructura", Art. 78/91 Ley 6035)
-- ya existían antes de que existiera esta columna, así que quedaron con el
-- default 'ejecucion' recién puesto arriba. Sin este UPDATE, el botón
-- "Estructura" (tipoPuesto=conduccion) quedaría con el dropdown vacío.
UPDATE "puestos_cargo" SET "tipo_puesto" = 'conduccion'
WHERE "nombre" IN (
  'Jefe de Seccion (06)', 'Jefe de Unidad (05)', 'Jefe de Division (04)',
  'Jefe de Departamento (02)', 'Director (01)'
);
