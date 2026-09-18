-- Etapa 3 CPH: confirmación de presentados y de orden de mérito
ALTER TABLE "concursos_cph"
  ADD COLUMN IF NOT EXISTS "presentados_confirmados" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "orden_merito_confirmado"  BOOLEAN NOT NULL DEFAULT false;
