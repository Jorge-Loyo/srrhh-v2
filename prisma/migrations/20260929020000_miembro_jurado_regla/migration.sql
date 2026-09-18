-- Sorteo de jurado: registrar la regla de elegibilidad aplicada a cada miembro
ALTER TABLE "miembros_jurado_sorteados"
  ADD COLUMN IF NOT EXISTS "regla_aplicada" INTEGER;
