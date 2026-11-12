-- Paso 1 del bloque "Concurso autorizado": columna `autorizado_at` en el
-- concurso base. La llena (en un paso posterior) el evento "SGRASV aprobó el
-- pedido de autorización" (cierre de la Etapa 1), igual para CPH y CEETPS.
-- Un concurso con motivo_concurso = 'nuevo_cargo' NO cuenta como activo para el
-- cargo (cargos.sub_estado / Incidencias) hasta tener autorizado_at.
--
-- Sin backfill: los concursos existentes quedan en NULL y NO cambian de
-- comportamiento (solo 'nuevo_cargo' depende de esta columna).
--
-- Idempotente (ADD COLUMN IF NOT EXISTS) para poder re-correrlo sin error.
--
-- MANUAL: NO ejecutar con `prisma migrate dev/deploy` (el backend local apunta
-- a Neon producción). Jorge corre este .sql a mano en Neon Y la marca resuelta
-- ANTES del push, porque Render corre `prisma migrate deploy` en cada arranque
-- (Doc/Desarrollo/DEPLOY_PRODUCCION.md sección 7, trampa 1):
--   psql "$NEON_DIRECT" -f prisma/migrations/20261112000000_concurso_autorizado_at/migration.sql
--   DATABASE_URL="$NEON_DIRECT" npx prisma migrate resolve --applied 20261112000000_concurso_autorizado_at --schema=./prisma/schema.prisma
BEGIN;
ALTER TABLE concursos ADD COLUMN IF NOT EXISTS autorizado_at TIMESTAMPTZ NULL;
COMMIT;
