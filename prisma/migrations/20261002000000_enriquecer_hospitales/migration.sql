-- Enriquece el catálogo de hospitales con la metadata del maestro "Siglas MSGC":
-- nombre resumido, comuna, coordenadas, tamaño y tipificación SSAH. Todas
-- nullable (las reparticiones de Nivel Central/Bienestar no tienen datos de
-- hospital asistencial). universo_totalizador/tipo/monovalencia ya existían;
-- este backfill de datos se hace aparte (scripts/import-hospitales-siglas.ts).
ALTER TABLE "hospitales"
  ADD COLUMN IF NOT EXISTS "nombre_resumido"   VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "comuna"            VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "coordenadas"       VARCHAR(60),
  ADD COLUMN IF NOT EXISTS "tamanio"           VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "tipificacion_ssah" VARCHAR(100);
