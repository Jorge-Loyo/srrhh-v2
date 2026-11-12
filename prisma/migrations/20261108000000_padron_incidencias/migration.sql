-- FASE 3 (paso 12 del padrón, design §D.2): tabla nueva `padron_incidencias`
-- (una fila por incidencia del ciclo de vida del cargo, persistida por snapshot
-- en el paso 12 de aprobarSnapshotService) + índice compuesto nuevo en
-- `padron_diff` por (snapshot_id, id_sial_rol).
--
-- `estado_anterior`/`estado_nuevo` son JSONB (divergencia DELIBERADA con
-- padron_diff.valor_* TEXT: una incidencia resume un estado de forma variable,
-- no un escalar — design §D.2). `tipo` es un VARCHAR con slug (no enum).
--
-- El índice de `padron_diff` se agrega ADYACENTE: NO recrea ni toca
-- `padron_diff_pkey` (id) ni `padron_diff_snapshot_id_idx` (snapshot_id), que
-- siguen intactos. Justificado por el join del paso 12
-- (padron_diff JOIN ocupaciones ON o.id_sial_rol = d.id_sial_rol filtrado por
-- snapshot_id), mismo patrón que elim_hist/elim_ult de
-- incidencias.baja-sin-concurso.ts (design §C.3).
--
-- Nombres de índice/constraint estilo Prisma (coinciden con los que genera el
-- schema declarativo). Todo idempotente (IF NOT EXISTS) para poder re-correrlo
-- sin error.
--
-- MANUAL: NO ejecutar con `prisma migrate dev/deploy` (el backend local apunta a
-- Neon producción). El usuario (Jorge) corre este .sql en Neon al desplegar.

-- ─── Tabla padron_incidencias ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "padron_incidencias" (
  "id"              UUID NOT NULL,
  "snapshot_id"     UUID NOT NULL,
  "cargo_id"        UUID,
  "id_sial"         VARCHAR(50),
  "id_sial_rol"     VARCHAR(50),
  "tipo"            VARCHAR(40) NOT NULL,
  "estado_anterior" JSONB,
  "estado_nuevo"    JSONB,
  "detalle"         TEXT,
  "resuelta"        BOOLEAN NOT NULL DEFAULT false,
  "resolucion"      VARCHAR(50),
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "padron_incidencias_pkey" PRIMARY KEY ("id")
);

-- FK al snapshot (ON DELETE CASCADE, igual que padron_diff): borrar un snapshot
-- se lleva sus incidencias.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'padron_incidencias_snapshot_id_fkey'
  ) THEN
    ALTER TABLE "padron_incidencias"
      ADD CONSTRAINT "padron_incidencias_snapshot_id_fkey"
      FOREIGN KEY ("snapshot_id") REFERENCES "padron_snapshots"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- FK al cargo (opcional, sin cascade): el cargo puede estar null para tipos sin
-- cargo materializado.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'padron_incidencias_cargo_id_fkey'
  ) THEN
    ALTER TABLE "padron_incidencias"
      ADD CONSTRAINT "padron_incidencias_cargo_id_fkey"
      FOREIGN KEY ("cargo_id") REFERENCES "cargos"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "padron_incidencias_snapshot_id_idx"
  ON "padron_incidencias" ("snapshot_id");
CREATE INDEX IF NOT EXISTS "padron_incidencias_cargo_id_idx"
  ON "padron_incidencias" ("cargo_id");
CREATE INDEX IF NOT EXISTS "padron_incidencias_tipo_idx"
  ON "padron_incidencias" ("tipo");
CREATE INDEX IF NOT EXISTS "padron_incidencias_snapshot_id_tipo_idx"
  ON "padron_incidencias" ("snapshot_id", "tipo");

-- ─── Índice adyacente en padron_diff (NO recrea los existentes) ──────────────
CREATE INDEX IF NOT EXISTS "padron_diff_snapshot_id_id_sial_rol_idx"
  ON "padron_diff" ("snapshot_id", "id_sial_rol");
