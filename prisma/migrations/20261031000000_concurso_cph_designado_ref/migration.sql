-- MANUAL: lo corre Jorge en Neon (prisma migrate deploy). El workflow NO ejecuta NADA contra la DB.
-- Paso 2 — tercera vía "elegir candidato" (carga manual por referencia).
-- Guarda sólo la referencia del designado (CUIL + nombre + id_sial_rol tipeado)
-- sin crear Persona. Columnas nullable nuevas: no requieren backfill.
ALTER TABLE "concursos_cph" ADD COLUMN "designado_ref_cuil"        VARCHAR(11);
ALTER TABLE "concursos_cph" ADD COLUMN "designado_ref_nombre"      VARCHAR(200);
ALTER TABLE "concursos_cph" ADD COLUMN "designado_ref_id_sial_rol" VARCHAR(50);
