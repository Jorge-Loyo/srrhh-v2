-- S25: grupo/especialidad "padre" para agrupar sub-especialidades sin reescribir
-- las especialidades existentes. NULL = sin agrupar.
ALTER TABLE "especialidades_puesto" ADD COLUMN "grupo" VARCHAR(120);

-- Índice para filtrar/agrupar por grupo (ej. todas las de "Bioquímica Clínica").
CREATE INDEX "especialidades_puesto_grupo_idx" ON "especialidades_puesto" ("grupo");
