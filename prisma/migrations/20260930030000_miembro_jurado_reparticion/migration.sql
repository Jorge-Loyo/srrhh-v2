-- Repartición del cargo del miembro del jurado (descripcion_repa) — para saber
-- "jefe de qué" (unidad/servicio) en el card del jurado.
ALTER TABLE "miembros_jurado_sorteados" ADD COLUMN IF NOT EXISTS "reparticion" VARCHAR(200);
