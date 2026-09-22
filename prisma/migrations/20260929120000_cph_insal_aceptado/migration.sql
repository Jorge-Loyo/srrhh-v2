-- Respuesta al INSAL (Etapa 4 — propuesta, no designación oficial) y lista
-- de inscriptos que ya rechazaron el cargo (para no re-proponerlos).
ALTER TABLE "concursos_cph" ADD COLUMN "insal_aceptado" BOOLEAN;
ALTER TABLE "concursos_cph" ADD COLUMN "insal_rechazados" TEXT[] NOT NULL DEFAULT '{}';
