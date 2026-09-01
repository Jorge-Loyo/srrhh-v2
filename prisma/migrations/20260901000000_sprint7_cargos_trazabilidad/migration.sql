-- S7-1: Trazabilidad del alta manual de cargos (RF-11/12/13)
-- Agrega expediente, fecha_desde y created_by_id a la tabla cargos.

ALTER TABLE "cargos"
  ADD COLUMN IF NOT EXISTS "expediente"     VARCHAR(150),
  ADD COLUMN IF NOT EXISTS "fecha_desde"    DATE,
  ADD COLUMN IF NOT EXISTS "created_by_id"  UUID;

ALTER TABLE "cargos"
  ADD CONSTRAINT "cargos_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "usuarios"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
