-- Sorteo de jurado: confirmación del acta (borrador vs confirmado)

ALTER TABLE "sorteos_jurado"
  ADD COLUMN IF NOT EXISTS "confirmado"        BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "confirmado_at"     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "confirmado_por_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sorteos_jurado_confirmado_por_id_fkey'
  ) THEN
    ALTER TABLE "sorteos_jurado"
      ADD CONSTRAINT "sorteos_jurado_confirmado_por_id_fkey"
      FOREIGN KEY ("confirmado_por_id") REFERENCES "usuarios"("id");
  END IF;
END $$;
