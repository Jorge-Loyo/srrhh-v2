-- S3-11: índice GIN para full-text search en personas.apellido_nombre.
-- Índice funcional (expression index) sobre to_tsvector('spanish', ...) —
-- no requiere una columna generada nueva en el modelo, Postgres indexa la
-- expresión directamente. Usado por personas.service.ts (listPersonasService)
-- en la condición `to_tsvector('spanish', apellido_nombre) @@ plainto_tsquery(...)`.
CREATE INDEX IF NOT EXISTS "idx_personas_apellido_nombre_fts"
  ON "personas"
  USING GIN (to_tsvector('spanish', "apellido_nombre"));
