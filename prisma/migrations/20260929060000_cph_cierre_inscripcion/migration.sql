-- Etapa 3 CPH: cierre del período de inscripción de exámenes
ALTER TABLE "concursos_cph"
  ADD COLUMN IF NOT EXISTS "inscripcion_cerrada"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "fecha_cierre_inscripcion"  DATE;
