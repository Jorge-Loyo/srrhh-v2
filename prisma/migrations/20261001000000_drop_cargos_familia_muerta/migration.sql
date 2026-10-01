-- A21-7: eliminar cod_familia / lit_familia de cargos — columnas muertas.
-- 0/48k filas las usan, ningún flujo del padrón ni del alta las escribe, y el
-- único consumidor (panel de detalle, campo "Familia") mostraba siempre vacío.
ALTER TABLE "cargos" DROP COLUMN IF EXISTS "cod_familia";
ALTER TABLE "cargos" DROP COLUMN IF EXISTS "lit_familia";
