-- Sync de cargos con el Excel MSGC (Fase 2): codigo_legacy + bitacora de corridas.
-- Solo agrega una columna nullable, un indice y una tabla nueva. cargo_base_id,
-- revision_dato y revision_motivo ya existen en cargos (no se tocan).
--
-- Idempotente (IF NOT EXISTS). MANUAL: NO ejecutar con `prisma migrate dev/deploy`
-- contra ninguna base real. Se aplica primero en la copia LOCAL (Docker). Para
-- Neon se arma una base nueva (ver decisiones-jorge.md, ronda 4).
ALTER TABLE cargos ADD COLUMN IF NOT EXISTS codigo_legacy TEXT;
CREATE INDEX IF NOT EXISTS cargos_codigo_legacy_idx ON cargos (codigo_legacy);

CREATE TABLE IF NOT EXISTS sync_corridas (
  id            UUID        NOT NULL DEFAULT gen_random_uuid(),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  modo          VARCHAR(20) NOT NULL,
  excel_sha256  VARCHAR(64),
  resumen       JSONB,
  CONSTRAINT sync_corridas_pkey PRIMARY KEY (id)
);
