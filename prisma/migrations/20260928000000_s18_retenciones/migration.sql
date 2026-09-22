-- S18-1: retención y cadena de cargos (R/TTR)
--
-- Esta carpeta tiene un SEGUNDO archivo, "indice_periodo_hasta.sql", que NO
-- se aplica solo — `prisma migrate deploy`/`dev` únicamente ejecuta el
-- archivo literalmente llamado "migration.sql". Como en este repo todas las
-- migraciones se aplican a mano (shadow DB rota — ver notas del sprint 18),
-- hay que correr también ese segundo archivo con
-- `prisma db execute --file .../indice_periodo_hasta.sql --url ...`.

ALTER TABLE "cargos"
  ADD COLUMN "tipo_origen"      VARCHAR(5),
  ADD COLUMN "cargo_retenido_id" UUID,
  ADD COLUMN "cargo_base_id"     UUID,
  ADD COLUMN "periodo_desde"     DATE,
  ADD COLUMN "periodo_hasta"     DATE,
  ADD COLUMN "periodo_renovado"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "fecha_renovacion"  DATE;

ALTER TABLE "cargos"
  ADD CONSTRAINT "cargos_cargo_retenido_id_fkey"
  FOREIGN KEY ("cargo_retenido_id")
  REFERENCES "cargos"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cargos"
  ADD CONSTRAINT "cargos_cargo_base_id_fkey"
  FOREIGN KEY ("cargo_base_id")
  REFERENCES "cargos"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_cargos_cargo_base_id"     ON "cargos" ("cargo_base_id");
CREATE INDEX "idx_cargos_cargo_retenido_id" ON "cargos" ("cargo_retenido_id");
