-- OrdenMeritoIntegrante: marcar integrantes anulados (ya no disponibles para
-- reutilizar) sin haber sido designados.
ALTER TABLE "orden_merito_integrantes"
  ADD COLUMN IF NOT EXISTS "anulado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "motivo_anulado" VARCHAR(300);
