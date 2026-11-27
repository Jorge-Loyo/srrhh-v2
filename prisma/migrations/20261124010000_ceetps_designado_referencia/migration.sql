-- Wizard CEETPS, Etapa 5: designado cargado por referencia (CUIL + nombre) cuando
-- todavía no está en el padrón. 3 columnas nullable en concursos_ceetps. Idempotente.
--
-- MANUAL: NO ejecutar con `prisma migrate dev/deploy` contra ninguna base real
-- (Render corre `prisma migrate deploy` en cada arranque; ver
-- Doc/Desarrollo/DEPLOY_PRODUCCION.md sección 7, trampa 1). Se aplica a mano con
-- psql y se marca resuelta ANTES del push:
--   psql "$NEON_DIRECT" -f prisma/migrations/20261124010000_ceetps_designado_referencia/migration.sql
--   DATABASE_URL="$NEON_DIRECT" npx prisma migrate resolve --applied 20261124010000_ceetps_designado_referencia --schema=./prisma/schema.prisma

ALTER TABLE concursos_ceetps ADD COLUMN IF NOT EXISTS designado_ref_cuil        VARCHAR(11);
ALTER TABLE concursos_ceetps ADD COLUMN IF NOT EXISTS designado_ref_nombre      VARCHAR(200);
ALTER TABLE concursos_ceetps ADD COLUMN IF NOT EXISTS designado_ref_id_sial_rol VARCHAR(50);
