-- Etapa 2 CPH: tipo de gestión del concurso (centralizado / descentralizado)
ALTER TABLE "concursos_cph"
  ADD COLUMN IF NOT EXISTS "tipo_gestion" VARCHAR(20);
