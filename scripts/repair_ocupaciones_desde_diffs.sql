-- R-2: Creación de ocupaciones faltantes desde padron_diff.valor_nuevo
-- Para cada id_sial_rol tipo "nuevo" sin ocupación, crea la ocupación usando
-- el diff más reciente. Idempotente via ON CONFLICT DO NOTHING.

-- Paso 1: tabla temporal con el diff más reciente por id_sial_rol sin ocupacion
CREATE TEMP TABLE diffs_a_reparar AS
SELECT DISTINCT ON (d.id_sial_rol)
  d.id_sial_rol,
  d.snapshot_id,
  d.valor_nuevo::json AS datos,
  -- Extraer id_sial del cargo (primeros 2 segmentos: numero-nro_rol)
  CASE
    WHEN d.id_sial_rol ~ '^[0-9]+-[0-9]+-[0-9]+-[0-9]+$'
      THEN split_part(d.id_sial_rol, '-', 1) || '-' || split_part(d.id_sial_rol, '-', 2)
    ELSE d.id_sial_rol
  END AS id_sial_cargo,
  -- Extraer CUIL
  CASE
    WHEN d.id_sial_rol ~ '^[0-9]+-[0-9]+-[0-9]+-[0-9]+$'
      THEN split_part(d.id_sial_rol, '-', 3)
    ELSE (d.valor_nuevo::json->>'cuil_y_rol')
  END AS cuil_persona
FROM padron_diff d
WHERE d.tipo = 'nuevo'
  AND d.valor_nuevo IS NOT NULL
  AND d.valor_nuevo != ''
  AND NOT EXISTS (
    SELECT 1 FROM ocupaciones o WHERE o.id_sial_rol = d.id_sial_rol
  )
ORDER BY d.id_sial_rol, d.created_at DESC;

-- Verificar cuántos hay
SELECT COUNT(*) as diffs_a_reparar FROM diffs_a_reparar;

-- Paso 2: insertar ocupaciones faltantes
INSERT INTO ocupaciones (
  id,
  persona_id,
  cargo_id,
  id_sial_rol,
  cuil,
  situacion_revista,
  desde,
  hasta,
  codigo_jefaturas,
  jefe_escalafon,
  documentacion_jefatura,
  comentarios_jefaturas,
  escritorio,
  pou_desde,
  documentacion_pou,
  comision,
  repa_comision,
  sr_doc_respaldo,
  sr_comentario,
  cr_comentario,
  fecha_bloqueo,
  bloqueo_comentario,
  bloq_motivo,
  cod_situacion,
  documentacion_del_rol,
  documentacion_baja,
  cargo_desde,
  cargo_hasta,
  snapshot_id,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  p.id,
  c.id,
  dar.id_sial_rol,
  dar.cuil_persona,
  -- Normalizar situacion_revista
  CASE
    WHEN LOWER(dar.datos->>'situacion_de_revista') IN ('activo', 'active') THEN 'activo'
    WHEN LOWER(dar.datos->>'situacion_de_revista') = 'retencion de cargo' THEN 'retencion_de_cargo'
    ELSE COALESCE(NULLIF(dar.datos->>'situacion_de_revista', ''), 'activo')
  END,
  NULL,  -- desde (no viene en el diff)
  NULL,  -- hasta (ocupacion activa)
  NULLIF(dar.datos->>'codigo_jefaturas', ''),
  NULLIF(dar.datos->>'jefe_escalafon', ''),
  NULLIF(dar.datos->>'documentacion_jefatura', ''),
  NULLIF(dar.datos->>'comentarios_jefaturas', ''),
  NULL,  -- escritorio
  NULL,  -- pou_desde
  NULLIF(dar.datos->>'documentacion_pou', ''),
  NULLIF(dar.datos->>'comision', ''),
  NULLIF(dar.datos->>'repa_comision', ''),
  NULL,  -- sr_doc_respaldo
  NULL,  -- sr_comentario
  NULL,  -- cr_comentario
  CASE
    WHEN (dar.datos->>'fecha_bloqueo') ~ '^\d{2}/\d{2}/\d{4}$'
      AND (dar.datos->>'fecha_bloqueo') != '01/01/4000'
      THEN TO_DATE(dar.datos->>'fecha_bloqueo', 'DD/MM/YYYY')
    ELSE NULL
  END,
  NULLIF(dar.datos->>'bloqueo_comentario', ''),
  NULLIF(dar.datos->>'bloq_motivo', ''),
  NULLIF(dar.datos->>'cod_situacion', ''),
  NULLIF(dar.datos->>'documentacion_del_rol', ''),
  NULLIF(dar.datos->>'documentacion_baja', ''),
  -- cargo_desde
  CASE
    WHEN (dar.datos->>'cargo_desde') ~ '^\d{2}/\d{2}/\d{4}$'
      AND (dar.datos->>'cargo_desde') != '01/01/4000'
      THEN TO_DATE(dar.datos->>'cargo_desde', 'DD/MM/YYYY')
    ELSE NULL
  END,
  -- cargo_hasta (null si es 01/01/4000 = sin vencimiento)
  CASE
    WHEN (dar.datos->>'cargo_hasta') ~ '^\d{2}/\d{2}/\d{4}$'
      AND (dar.datos->>'cargo_hasta') != '01/01/4000'
      THEN TO_DATE(dar.datos->>'cargo_hasta', 'DD/MM/YYYY')
    ELSE NULL
  END,
  dar.snapshot_id,
  NOW(),
  NOW()
FROM diffs_a_reparar dar
JOIN personas p ON p.cuil = dar.cuil_persona
JOIN cargos c ON c.id_sial = dar.id_sial_cargo
WHERE dar.cuil_persona IS NOT NULL
  AND dar.cuil_persona != ''
ON CONFLICT (id_sial_rol) DO NOTHING;

-- Reporte de lo insertado
SELECT
  (SELECT COUNT(*) FROM ocupaciones) as total_ocupaciones,
  (SELECT COUNT(*) FROM diffs_a_reparar) as diffs_procesados,
  (SELECT COUNT(*) FROM diffs_a_reparar dar
   WHERE EXISTS (SELECT 1 FROM ocupaciones o WHERE o.id_sial_rol = dar.id_sial_rol)
  ) as diffs_con_ocupacion_ahora;

-- Diffs que NO pudieron repararse (cargo o persona no encontrados)
SELECT
  COUNT(*) as diffs_sin_reparar,
  COUNT(CASE WHEN p.id IS NULL THEN 1 END) as sin_persona,
  COUNT(CASE WHEN c.id IS NULL THEN 1 END) as sin_cargo,
  COUNT(CASE WHEN p.id IS NULL AND c.id IS NULL THEN 1 END) as sin_ambos
FROM diffs_a_reparar dar
LEFT JOIN personas p ON p.cuil = dar.cuil_persona
LEFT JOIN cargos c ON c.id_sial = dar.id_sial_cargo
WHERE NOT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.id_sial_rol = dar.id_sial_rol);

DROP TABLE diffs_a_reparar;
