-- Wizard CEETPS, Etapa 5: historial de candidatos que no fueron aptos. Cuando un
-- candidato queda "No apto", sus datos de la designación se guardan acá (para
-- entender por qué se extendió el concurso) y el concurso vuelve a la asignación
-- de candidato. Tabla nueva, idempotente.
--
-- MANUAL: no ejecutar con `prisma migrate deploy` (ver DEPLOY_PRODUCCION.md §7).
--   psql "$NEON_DIRECT" -f prisma/migrations/20261124030000_ceetps_historial_designacion/migration.sql
--   DATABASE_URL="$NEON_DIRECT" npx prisma migrate resolve --applied 20261124030000_ceetps_historial_designacion --schema=./prisma/schema.prisma

CREATE TABLE IF NOT EXISTS designaciones_historial_ceetps (
  id                 UUID         NOT NULL DEFAULT gen_random_uuid(),
  concurso_ceetps_id UUID         NOT NULL REFERENCES concursos_ceetps(id) ON DELETE CASCADE,
  inscripto_id       UUID,
  apellido_nombre    VARCHAR(200) NOT NULL,
  cuil               VARCHAR(20),
  motivo             VARCHAR(20)  NOT NULL,
  numero_nota        VARCHAR(100),
  datos              JSONB        NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT designaciones_historial_ceetps_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS designaciones_historial_ceetps_concurso_ceetps_id_idx
  ON designaciones_historial_ceetps (concurso_ceetps_id);
