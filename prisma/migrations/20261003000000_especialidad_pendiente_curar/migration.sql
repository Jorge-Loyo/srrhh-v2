-- S22-6: la auto-alta revisable del Dotaneitor marca los valores nuevos del
-- catálogo con `pendiente_curar=true`. `puestos_cargo` ya tenía la columna;
-- `especialidades_puesto` no — se agrega para poder marcar especialidades
-- auto-dadas de alta por el pipeline y mostrarlas en la pantalla de curado.
ALTER TABLE "especialidades_puesto"
  ADD COLUMN IF NOT EXISTS "pendiente_curar" BOOLEAN NOT NULL DEFAULT false;
