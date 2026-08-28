-- Reasignar cargos con prefijo CARGO al prefijo correcto.
-- Ejecutar con:
--   docker exec -i srrhh_postgres psql -U srrhh_user -d srrhh_db < scripts/fix-codigos-cargo-fallback.sql

DO $$
DECLARE
  rec        RECORD;
  prefijo    TEXT;
  max_seq    INT;
  nuevo_cod  TEXT;
  procesados INT := 0;
BEGIN
  FOR rec IN
    SELECT c.id, e.nombre AS escalafon
    FROM cargos c
    JOIN escalafones e ON e.id = c.escalafon_id
    WHERE c.codigo LIKE 'CARGO-%'
    ORDER BY c.created_at ASC
  LOOP
    -- Determinar prefijo correcto
    IF UPPER(rec.escalafon) LIKE '%TRANSITORIA%' AND UPPER(rec.escalafon) LIKE '%PLANTA%' THEN
      prefijo := 'PT';
    ELSIF UPPER(rec.escalafon) LIKE '%TRANSITORIO%' OR UPPER(rec.escalafon) LIKE '%CUERPO%' THEN
      prefijo := 'CT';
    ELSIF UPPER(rec.escalafon) LIKE '%GABINETE%' THEN
      prefijo := 'PG';
    ELSE
      prefijo := 'CARGO'; -- sigue sin match, no tocar
    END IF;

    CONTINUE WHEN prefijo = 'CARGO';

    -- Liberar el código viejo (CARGO-XXXXXX) y asignar el nuevo
    UPDATE cargos SET codigo = NULL WHERE id = rec.id;

    SELECT COALESCE(MAX(CAST(SUBSTRING(codigo FROM '([0-9]{6})$') AS INTEGER)), 0)
    INTO max_seq
    FROM cargos
    WHERE codigo LIKE prefijo || '-%'
      AND codigo ~ ('^' || REPLACE(prefijo, '-', '\-') || '-[0-9]{6}$');

    nuevo_cod := prefijo || '-' || LPAD((max_seq + 1)::TEXT, 6, '0');
    UPDATE cargos SET codigo = nuevo_cod WHERE id = rec.id;

    procesados := procesados + 1;
  END LOOP;

  RAISE NOTICE 'Reasignados: % cargos.', procesados;
END;
$$;

-- Verificación final
SELECT
  REGEXP_REPLACE(codigo, '-[0-9]{6}$', '') AS prefijo,
  COUNT(*) AS cantidad
FROM cargos
WHERE codigo IS NOT NULL
GROUP BY 1
ORDER BY 2 DESC;
