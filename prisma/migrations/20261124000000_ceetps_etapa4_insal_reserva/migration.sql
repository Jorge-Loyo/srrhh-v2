-- Wizard CEETPS, Etapa 4 (IFACS / INSAL): reserva del candidato a notificar por
-- INSAL (con su respuesta y los que rechazaron el cargo).
-- 3 columnas nuevas en concursos_ceetps. Idempotente (IF NOT EXISTS).
--
-- MANUAL: NO ejecutar con `prisma migrate dev/deploy` contra ninguna base real
-- (Render corre `prisma migrate deploy` en cada arranque; ver
-- Doc/Desarrollo/DEPLOY_PRODUCCION.md sección 7, trampa 1). Se aplica a mano con
-- psql y se marca resuelta ANTES del push:
--   psql "$NEON_DIRECT" -f prisma/migrations/20261124000000_ceetps_etapa4_insal_reserva/migration.sql
--   DATABASE_URL="$NEON_DIRECT" npx prisma migrate resolve --applied 20261124000000_ceetps_etapa4_insal_reserva --schema=./prisma/schema.prisma

ALTER TABLE concursos_ceetps ADD COLUMN IF NOT EXISTS insal_aceptado         BOOLEAN;
ALTER TABLE concursos_ceetps ADD COLUMN IF NOT EXISTS insal_rechazados       UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE concursos_ceetps ADD COLUMN IF NOT EXISTS inscripto_reservado_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'concursos_ceetps_inscripto_reservado_id_fkey'
  ) THEN
    ALTER TABLE concursos_ceetps
      ADD CONSTRAINT concursos_ceetps_inscripto_reservado_id_fkey
      FOREIGN KEY (inscripto_reservado_id) REFERENCES inscriptos_ceetps(id) ON DELETE SET NULL;
  END IF;
END $$;
