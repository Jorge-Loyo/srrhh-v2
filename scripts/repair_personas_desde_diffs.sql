-- R-1: Backfill de datos de personas desde padron_diff.valor_nuevo
-- Toma el diff "nuevo" más reciente por CUIL y rellena los campos faltantes.
-- Idempotente: usa COALESCE para no pisar datos que ya existen.

WITH diffs_por_cuil AS (
  -- Para cada id_sial_rol con formato nuevo (contiene CUIL), tomar el diff más reciente
  SELECT DISTINCT ON (
    CASE
      WHEN id_sial_rol ~ '^[0-9]+-[0-9]+-[0-9]+-[0-9]+$'
        THEN split_part(id_sial_rol, '-', 3)  -- cuil del formato nuevo
      ELSE NULL
    END
  )
    CASE
      WHEN id_sial_rol ~ '^[0-9]+-[0-9]+-[0-9]+-[0-9]+$'
        THEN split_part(id_sial_rol, '-', 3)
      ELSE NULL
    END AS cuil_extraido,
    (valor_nuevo::json->>'ayn') AS ayn,
    (valor_nuevo::json->>'numero_doc') AS numero_doc,
    (valor_nuevo::json->>'tipo_doc') AS tipo_doc,
    (valor_nuevo::json->>'sexo') AS sexo,
    (valor_nuevo::json->>'fecha_nacimiento') AS fecha_nacimiento_str,
    (valor_nuevo::json->>'antiguedad') AS antiguedad_str,
    (valor_nuevo::json->>'telefono') AS telefono,
    (valor_nuevo::json->>'mail_personal') AS mail_personal,
    (valor_nuevo::json->>'mail_laboral') AS mail_laboral,
    (valor_nuevo::json->>'domicilio') AS domicilio,
    (valor_nuevo::json->>'localidad') AS localidad,
    (valor_nuevo::json->>'provincia') AS provincia
  FROM padron_diff
  WHERE tipo = 'nuevo'
    AND valor_nuevo IS NOT NULL
    AND valor_nuevo != ''
    AND id_sial_rol ~ '^[0-9]+-[0-9]+-[0-9]+-[0-9]+$'
  ORDER BY
    CASE
      WHEN id_sial_rol ~ '^[0-9]+-[0-9]+-[0-9]+-[0-9]+$'
        THEN split_part(id_sial_rol, '-', 3)
      ELSE NULL
    END,
    created_at DESC
)
UPDATE personas p
SET
  apellido = COALESCE(
    NULLIF(p.apellido, ''),
    NULLIF(TRIM(SPLIT_PART(d.ayn, ', ', 1)), '')
  ),
  nombre = COALESCE(
    NULLIF(p.nombre, ''),
    NULLIF(TRIM(SPLIT_PART(d.ayn, ', ', 2)), '')
  ),
  numero_doc = COALESCE(
    NULLIF(p.numero_doc, ''),
    NULLIF(d.numero_doc, '')
  ),
  tipo_doc = COALESCE(
    NULLIF(p.tipo_doc, ''),
    NULLIF(d.tipo_doc, '')
  ),
  sexo = COALESCE(
    NULLIF(p.sexo, ''),
    NULLIF(d.sexo, '')
  ),
  fecha_nacimiento = COALESCE(
    p.fecha_nacimiento,
    CASE
      WHEN d.fecha_nacimiento_str ~ '^\d{2}/\d{2}/\d{4}$'
        AND d.fecha_nacimiento_str != '01/01/4000'
        THEN TO_DATE(d.fecha_nacimiento_str, 'DD/MM/YYYY')
      ELSE NULL
    END
  ),
  antiguedad_desde = COALESCE(
    p.antiguedad_desde,
    CASE
      WHEN d.antiguedad_str ~ '^\d{2}/\d{2}/\d{4}$'
        AND d.antiguedad_str != '01/01/4000'
        THEN TO_DATE(d.antiguedad_str, 'DD/MM/YYYY')
      ELSE NULL
    END
  ),
  telefono = COALESCE(NULLIF(p.telefono, ''), NULLIF(d.telefono, '')),
  mail_personal = COALESCE(NULLIF(p.mail_personal, ''), NULLIF(d.mail_personal, '')),
  mail_laboral = COALESCE(NULLIF(p.mail_laboral, ''), NULLIF(d.mail_laboral, '')),
  domicilio = COALESCE(NULLIF(p.domicilio, ''), NULLIF(d.domicilio, '')),
  localidad = COALESCE(NULLIF(p.localidad, ''), NULLIF(d.localidad, '')),
  provincia = COALESCE(NULLIF(p.provincia, ''), NULLIF(d.provincia, '')),
  updated_at = NOW()
FROM diffs_por_cuil d
WHERE p.cuil = d.cuil_extraido
  AND d.cuil_extraido IS NOT NULL
  AND d.ayn IS NOT NULL
  AND d.ayn != '';

-- Reporte post-update
SELECT
  COUNT(*) as total_personas,
  COUNT(CASE WHEN apellido IS NOT NULL AND apellido != '' THEN 1 END) as con_apellido,
  COUNT(CASE WHEN apellido IS NULL OR apellido = '' THEN 1 END) as sin_apellido
FROM personas;
