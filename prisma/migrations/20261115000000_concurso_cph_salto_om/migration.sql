-- Paso 5b: salto a designación desde una orden de mérito existente.
-- Trazabilidad en concursos_cph: cuándo se hizo el salto y qué integrante de la
-- OM se usó. Solo agrega 2 columnas nullable y una FK (ON DELETE SET NULL).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS y FK dentro de DO $$ con chequeo en
-- pg_constraint, así re-ejecutarla no falla.
--
-- MANUAL: NO ejecutar con `prisma migrate dev/deploy` (el backend local apunta
-- a Neon producción). Jorge corre este .sql a mano en Neon Y la marca resuelta
-- ANTES del push, porque Render corre `prisma migrate deploy` en cada arranque
-- (Doc/Desarrollo/DEPLOY_PRODUCCION.md sección 7, trampa 1):
--   psql "$NEON_DIRECT" -f prisma/migrations/20261115000000_concurso_cph_salto_om/migration.sql
--   DATABASE_URL="$NEON_DIRECT" npx prisma migrate resolve --applied 20261115000000_concurso_cph_salto_om --schema=./prisma/schema.prisma
ALTER TABLE concursos_cph ADD COLUMN IF NOT EXISTS salto_om_at TIMESTAMPTZ;
ALTER TABLE concursos_cph ADD COLUMN IF NOT EXISTS salto_om_integrante_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'concursos_cph_salto_om_integrante_id_fkey'
  ) THEN
    ALTER TABLE concursos_cph
      ADD CONSTRAINT concursos_cph_salto_om_integrante_id_fkey
      FOREIGN KEY (salto_om_integrante_id) REFERENCES orden_merito_integrantes(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
