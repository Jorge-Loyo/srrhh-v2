-- Guarda contra padrón parcial (SPRINT_guarda_padron_parcial.md): agrega a
-- `padron_snapshots` la columna PERSISTIDA `ratio_tamano` (Float, nullable) con
-- el ratio totalRegistros / total del último snapshot aprobado calculado al
-- terminar el pipeline, y `advertencia_tamano` (Text, nullable) con el mensaje
-- de advertencia cuando el ratio cae bajo PADRON_RATIO_MINIMO. null en ambos =
-- la guarda no aplicó (primer padrón sin aprobado previo) o el ratio fue normal.
--
-- Todo idempotente (ADD COLUMN IF NOT EXISTS) para poder re-correrlo sin error.
--
-- MANUAL: NO ejecutar con `prisma migrate dev/deploy` (el backend local apunta
-- a Neon producción). El usuario (Jorge) corre este .sql a mano en Neon.
ALTER TABLE padron_snapshots ADD COLUMN IF NOT EXISTS ratio_tamano DOUBLE PRECISION;
ALTER TABLE padron_snapshots ADD COLUMN IF NOT EXISTS advertencia_tamano TEXT;
