-- Config de text search `spanish_unaccent` para búsqueda full-text sin acentos
-- en personas (listPersonasService usa to_tsvector/to_tsquery con esta config).
--
-- Se había perdido al recrear/squashear la base (0_init/0_seed): el código la
-- referencia pero la BD no la tenía, y toda búsqueda por texto en Personas
-- fallaba con `text search configuration "spanish_unaccent" does not exist`
-- (ERROR 42704). Esta migración la (re)crea de forma idempotente.
--
-- La config copia 'spanish' pero encadena el diccionario `unaccent` antes del
-- stemmer, para que "medico" matchee "Médico" y viceversa.

-- Extensión unaccent (contrib estándar; no-op si ya está instalada).
CREATE EXTENSION IF NOT EXISTS unaccent;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'spanish_unaccent') THEN
    CREATE TEXT SEARCH CONFIGURATION spanish_unaccent ( COPY = spanish );
    ALTER TEXT SEARCH CONFIGURATION spanish_unaccent
      ALTER MAPPING FOR hword, hword_part, word
      WITH unaccent, spanish_stem;
  END IF;
END
$$;
