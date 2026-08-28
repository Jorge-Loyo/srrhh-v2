-- Backfill de códigos de cargo
-- Ejecutar con:
--   docker exec -i srrhh_postgres psql -U srrhh_user -d srrhh_db < scripts/backfill-codigos-cargo.sql
--
-- Idempotente: solo toca cargos con codigo IS NULL.

-- 1. Función auxiliar que determina el prefijo
CREATE OR REPLACE FUNCTION _prefijo_cargo(esc TEXT, unif TEXT, agr TEXT)
RETURNS TEXT AS $$
DECLARE
  e TEXT := UPPER(COALESCE(esc, ''));
  u TEXT := UPPER(COALESCE(unif, ''));
  a TEXT := UPPER(COALESCE(agr, ''));
BEGIN
  IF e LIKE '%MÉDICO%' OR e LIKE '%MEDICO%' OR e = 'CPH' THEN
    IF a LIKE '%SUB%' AND a LIKE '%DIRECTOR%'           THEN RETURN 'CPH-SD';    END IF;
    IF a LIKE '%DIRECTOR%'                              THEN RETURN 'CPH-D';     END IF;
    IF u LIKE '%JEFATURA%' OR a LIKE '%JEFE%' THEN
      IF u LIKE '%POU%' OR u LIKE '%GUARDIA%'           THEN RETURN 'CPH-J-POU'; END IF;
      RETURN 'CPH-J-POF';
    END IF;
    IF u LIKE '%POU%' OR u LIKE '%GUARDIA%'             THEN RETURN 'CPH-POU';   END IF;
    RETURN 'CPH-POF';
  END IF;
  IF e LIKE '%ENFERMER%' OR e = 'ENF'                   THEN RETURN 'ENF';       END IF;
  IF e LIKE '%CEETPS%' OR e LIKE '%TEC%' THEN
    IF u LIKE '%POU%' OR u LIKE '%GUARDIA%'             THEN RETURN 'TEC-POU';   END IF;
    RETURN 'TEC-POF';
  END IF;
  IF e LIKE '%GENERAL%' OR e = 'EG' THEN
    IF a LIKE '%GERENCIAL%' OR u LIKE '%GERENCIAL%'     THEN RETURN 'EG-G';      END IF;
    IF a LIKE '%DIRECTOR%'  OR u LIKE '%DIRECTOR%'      THEN RETURN 'EG-D';      END IF;
    IF a LIKE '%JEFE%'      OR u LIKE '%JEFE%'          THEN RETURN 'EG-J';      END IF;
    RETURN 'EG';
  END IF;
  IF e LIKE '%AUTORIDAD%' OR e = 'AS' THEN
    IF a LIKE '%MINISTRO%'    OR u LIKE '%MINISTRO%'    THEN RETURN 'AS-MIN';    END IF;
    IF a LIKE '%SUBSECRETAR%' OR u LIKE '%SUBSECRETAR%' THEN RETURN 'AS-SS';     END IF;
    IF a LIKE '%ADJUNTA%'     OR u LIKE '%ADJUNTA%'     THEN RETURN 'AS-DGA';    END IF;
    RETURN 'AS-DG';
  END IF;
  IF e LIKE '%GERENCIAL%' OR e = 'RG'                   THEN RETURN 'RG-CG';    END IF;
  IF e LIKE '%SUPLENTE%'  OR e = 'SG'                   THEN RETURN 'SG';       END IF;
  IF e LIKE '%RESIDENTE%' OR e = 'RES'                  THEN RETURN 'RES';      END IF;
  IF e LIKE '%DOCENTE%'   OR e = 'DOC'                  THEN RETURN 'DOC';      END IF;
  RETURN 'CARGO';
END;
$$ LANGUAGE plpgsql;

-- 2. Asignar códigos secuenciales
DO $$
DECLARE
  rec        RECORD;
  prefijo    TEXT;
  max_seq    INT;
  nuevo_cod  TEXT;
  procesados INT := 0;
BEGIN
  FOR rec IN
    SELECT c.id, e.nombre AS escalafon, c.unificador_puesto, c.agrupador
    FROM cargos c
    JOIN escalafones e ON e.id = c.escalafon_id
    WHERE c.codigo IS NULL
    ORDER BY c.created_at ASC
  LOOP
    prefijo := _prefijo_cargo(rec.escalafon, rec.unificador_puesto, rec.agrupador);

    SELECT COALESCE(MAX(CAST(SUBSTRING(codigo FROM '([0-9]{6})$') AS INTEGER)), 0)
    INTO max_seq
    FROM cargos
    WHERE codigo LIKE prefijo || '-%'
      AND codigo ~ ('^' || REPLACE(prefijo, '-', '\-') || '-[0-9]{6}$');

    nuevo_cod := prefijo || '-' || LPAD((max_seq + 1)::TEXT, 6, '0');
    UPDATE cargos SET codigo = nuevo_cod WHERE id = rec.id;

    procesados := procesados + 1;
    IF procesados % 1000 = 0 THEN
      RAISE NOTICE '% cargos procesados...', procesados;
    END IF;
  END LOOP;

  RAISE NOTICE 'Backfill completado: % cargos con código asignado.', procesados;
END;
$$;

-- 3. Limpiar función auxiliar
DROP FUNCTION _prefijo_cargo(TEXT, TEXT, TEXT);

-- 4. Verificación: distribución por prefijo
SELECT
  REGEXP_REPLACE(codigo, '-[0-9]{6}$', '') AS prefijo,
  COUNT(*) AS cantidad
FROM cargos
WHERE codigo IS NOT NULL
GROUP BY 1
ORDER BY 2 DESC;
