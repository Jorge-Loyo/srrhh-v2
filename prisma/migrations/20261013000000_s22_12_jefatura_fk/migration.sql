-- S22-12 Opción B: FK de jefatura (ocupaciones → puestos_cargo).
-- Aditivo: no toca codigo_jefaturas ni ningún campo existente. Nullable para no
-- frenar filas cuyo puesto de conducción no exista aún en el catálogo.

ALTER TABLE "ocupaciones"
  ADD COLUMN IF NOT EXISTS "cargo_jefatura_puesto_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ocupaciones_cargo_jefatura_puesto_id_fkey'
  ) THEN
    ALTER TABLE "ocupaciones"
      ADD CONSTRAINT "ocupaciones_cargo_jefatura_puesto_id_fkey"
      FOREIGN KEY ("cargo_jefatura_puesto_id") REFERENCES "puestos_cargo"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ocupaciones_cargo_jefatura_puesto_id_idx"
  ON "ocupaciones"("cargo_jefatura_puesto_id");
