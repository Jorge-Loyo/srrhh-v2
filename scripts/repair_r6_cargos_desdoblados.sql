-- R-6: Reparación de ocupaciones para cargos desdoblados (id_sial = NULL)
-- Estrategia: matching por (hospital.sigla + literal_puesto + cod_registro)
-- Solo se insertan los casos con match UNICO (1 solo cargo candidato).
-- Los casos ambiguos (>1 candidato) se loggean pero no se tocan.

-- Paso 1: tabla temporal con diffs sin cargo y sus candidatos
CREATE TEMP TABLE r6_candidatos AS
SELECT
  dsc.id_sial_rol,
  dsc.cuil_persona,
  dsc.ayn,
  dsc.sit_revista,
  dsc.cargo_desde_str,
  dsc.snapshot_id,
  c.id AS cargo_id,
  COUNT(c.id) OVER (PARTITION BY dsc.id_sial_rol) AS n_candidatos
FROM (
  SELECT DISTINCT ON (d.id_sial_rol)
    d.id_sial_rol,
    CASE
      WHEN d.id_sial_rol ~ '^[0-9]+-[0-9]+-[0-9]+-[0-9]+$'
        THEN split_part(d.id_sial_rol, '-', 3)
      ELSE NULL
    END AS cuil_persona,
    d.valor_nuevo::json->>'siglas'                  AS sigla,
    d.valor_nuevo::json->>'literal_puesto'          AS puesto,
    d.valor_nuevo::json->>'codigo_de_registro'      AS cod_registro,
    d.valor_nuevo::json->>'situacion_de_revista'    AS sit_revista,
    d.valor_nuevo::json->>'cargo_desde'             AS cargo_desde_str,
    d.valor_nuevo::json->>'ayn'                     AS ayn,
    d.snapshot_id
  FROM padron_diff d
  WHERE d.tipo = 'nuevo'
    AND d.valor_nuevo IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.id_sial_rol = d.id_sial_rol)
    AND NOT EXISTS (
      SELECT 1 FROM cargos c2
      WHERE c2.id_sial = (
        CASE
          WHEN d.id_sial_rol ~ '^[0-9]+-[0-9]+-[0-9]+-[0-9]+$'
            THEN split_part(d.id_sial_rol, '-', 1) || '-' || split_part(d.id_sial_rol, '-', 2)
          ELSE d.id_sial_rol
        END
      )
    )
  ORDER BY d.id_sial_rol, d.created_at DESC
) dsc
JOIN hospitales h ON h.sigla = dsc.sigla
JOIN cargos c ON c.hospital_id = h.id
  AND c.id_sial IS NULL
  AND LOWER(c.literal_puesto) = LOWER(dsc.puesto)
  AND NOT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL)
JOIN codigos_registro cr ON c.codigo_registro_id = cr.id
  AND cr.codigo = dsc.cod_registro
WHERE dsc.cuil_persona IS NOT NULL;

-- Reporte de candidatos
SELECT
  COUNT(*) as filas_totales,
  COUNT(CASE WHEN n_candidatos = 1 THEN 1 END) as match_unico,
  COUNT(CASE WHEN n_candidatos > 1 THEN 1 END) as match_multiple,
  COUNT(DISTINCT CASE WHEN n_candidatos = 1 THEN id_sial_rol END) as diffs_match_unico,
  COUNT(DISTINCT CASE WHEN n_candidatos > 1 THEN id_sial_rol END) as diffs_match_multiple
FROM r6_candidatos;

-- Paso 2: insertar solo los match únicos
INSERT INTO ocupaciones (
  id,
  persona_id,
  cargo_id,
  id_sial_rol,
  cuil,
  situacion_revista,
  desde,
  hasta,
  cargo_desde,
  cargo_hasta,
  snapshot_id,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  p.id,
  rc.cargo_id,
  rc.id_sial_rol,
  rc.cuil_persona,
  CASE
    WHEN LOWER(rc.sit_revista) = 'activo'             THEN 'activo'
    WHEN LOWER(rc.sit_revista) = 'retencion de cargo' THEN 'retencion_de_cargo'
    WHEN LOWER(rc.sit_revista) = 'comision'           THEN 'comision'
    ELSE COALESCE(NULLIF(rc.sit_revista, ''), 'activo')
  END,
  NULL,   -- desde
  NULL,   -- hasta (activa)
  CASE
    WHEN rc.cargo_desde_str ~ '^\d{2}/\d{2}/\d{4}$'
      AND rc.cargo_desde_str != '01/01/4000'
      THEN TO_DATE(rc.cargo_desde_str, 'DD/MM/YYYY')
    ELSE NULL
  END,
  NULL,   -- cargo_hasta
  rc.snapshot_id,
  NOW(),
  NOW()
FROM r6_candidatos rc
JOIN personas p ON p.cuil = rc.cuil_persona
WHERE rc.n_candidatos = 1
ON CONFLICT (id_sial_rol) DO NOTHING;

-- Reporte final
SELECT
  (SELECT COUNT(*) FROM ocupaciones) as total_ocupaciones,
  (SELECT COUNT(*) FROM r6_candidatos WHERE n_candidatos = 1) as insertados,
  (SELECT COUNT(DISTINCT id_sial_rol) FROM r6_candidatos WHERE n_candidatos > 1) as ambiguos_no_tocados;

DROP TABLE r6_candidatos;
