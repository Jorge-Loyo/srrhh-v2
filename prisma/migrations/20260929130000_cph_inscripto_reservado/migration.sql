-- Etapa 4 — candidato del orden de mérito reservado para el INSAL, apuntando
-- al InscriptoConcurso (NO al padrón de personas). La designación oficial que
-- resuelve contra el padrón es en Etapa 5 (persona_designada_id).
-- Nullable: se limpia cuando el candidato no acepta el cargo.
-- onDelete: SetNull — si se borra el inscripto, la reserva queda en null.
ALTER TABLE "concursos_cph" ADD COLUMN "inscripto_reservado_id" UUID;

ALTER TABLE "concursos_cph"
  ADD CONSTRAINT "concursos_cph_inscripto_reservado_id_fkey"
  FOREIGN KEY ("inscripto_reservado_id")
  REFERENCES "inscriptos_concurso"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
