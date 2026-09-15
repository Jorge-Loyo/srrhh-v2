-- S17-1: vinculación baja ↔ snapshot del padrón semanal
ALTER TABLE "bajas"
  ADD COLUMN "padron_vinculado_at"   TIMESTAMPTZ,
  ADD COLUMN "snapshot_vinculado_id" UUID;

ALTER TABLE "bajas"
  ADD CONSTRAINT "bajas_snapshot_vinculado_id_fkey"
  FOREIGN KEY ("snapshot_vinculado_id")
  REFERENCES "padron_snapshots"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
