-- Etapa 3 CPH: marcar si cada inscripto se presentó al examen
ALTER TABLE "inscriptos_concurso"
  ADD COLUMN IF NOT EXISTS "presento_examen" BOOLEAN NOT NULL DEFAULT false;
