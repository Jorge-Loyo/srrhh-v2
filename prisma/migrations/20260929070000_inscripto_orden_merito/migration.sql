-- Etapa 3 CPH: posición en el orden de mérito por inscripto presentado
ALTER TABLE "inscriptos_concurso"
  ADD COLUMN IF NOT EXISTS "orden_merito" INTEGER;
