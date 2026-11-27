-- Renombrar dim_cargos.sigla -> efector y agregar FK a dim_efectores
-- NOT VALID: no valida filas existentes (el script _normalizar-sigla-dim-cargos.ts
-- debe ejecutarse antes de llamar a VALIDATE CONSTRAINT).

ALTER TABLE "dim_cargos" RENAME COLUMN "sigla" TO "efector";

ALTER TABLE "dim_cargos"
    ADD CONSTRAINT "dim_cargos_efector_fkey"
    FOREIGN KEY ("efector") REFERENCES "dim_efectores"("sigla")
    ON DELETE SET NULL ON UPDATE CASCADE
    NOT VALID;

CREATE INDEX IF NOT EXISTS "dim_cargos_efector_idx" ON "dim_cargos"("efector");
