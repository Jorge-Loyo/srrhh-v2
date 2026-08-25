-- Búsqueda insensible a acentos (reportado por Jorge: escribir "medico" no
-- encontraba "Médico"). Se mantienen los datos guardados TAL COMO SON en el
-- padrón real (con acentos correctos — "Médico de Planta", "Psiquiatría"),
-- solo se normaliza al momento de comparar en la búsqueda.
--
-- unaccent es una extensión contrib estándar de Postgres, no hace falta
-- instalar nada por fuera del propio motor.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Configuración de text search que encadena unaccent ANTES del stemmer en
-- español — copia la config "spanish" ya usada por el índice GIN de S3-11 y
-- le agrega el paso de sacar acentos. CREATE TEXT SEARCH CONFIGURATION no
-- soporta "IF NOT EXISTS" (a diferencia de EXTENSION/INDEX/TABLE) — se
-- envuelve en un DO block para que la migración sea reproducible.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'spanish_unaccent') THEN
    CREATE TEXT SEARCH CONFIGURATION spanish_unaccent (COPY = spanish);
  END IF;
END $$;

ALTER TEXT SEARCH CONFIGURATION spanish_unaccent
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, spanish_stem;

-- El índice GIN de personas.apellido_nombre (S3-11) usaba to_tsvector('spanish', ...)
-- — hay que recrearlo con la config nueva para que personas.service.ts pueda
-- usarlo (Postgres solo usa el índice si la expresión de la query matchea
-- exactamente la del índice).
DROP INDEX IF EXISTS idx_personas_apellido_nombre_fts;
CREATE INDEX idx_personas_apellido_nombre_fts
  ON personas
  USING GIN (to_tsvector('spanish_unaccent', apellido_nombre));
