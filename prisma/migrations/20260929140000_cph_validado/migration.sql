-- Etapa 5 — validación contra el padrón. true cuando el padrón trae a la
-- persona con un id SIAL rol cuyo cargo coincide en carrera (escalafón) y
-- especialidad con el concurso.
ALTER TABLE "concursos_cph" ADD COLUMN "validado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "concursos_cph" ADD COLUMN "validado_at" TIMESTAMPTZ;
ALTER TABLE "concursos_cph" ADD COLUMN "validado_id_sial_rol" VARCHAR(50);
