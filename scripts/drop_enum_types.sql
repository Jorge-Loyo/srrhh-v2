DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT typname FROM pg_type
    WHERE typtype = 'e' AND typnamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP TYPE IF EXISTS "' || r.typname || '" CASCADE';
  END LOOP;
END $$;
SELECT 'Tipos eliminados' AS estado;
