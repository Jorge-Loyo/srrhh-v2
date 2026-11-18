-- import_cargos_historicos.sql
-- Importa ~4080 cargos históricos de la Neon vieja como no_vigente con códigos HIS-

CREATE TEMP TABLE cargos_historicos_tmp (
  id_sial varchar(50), literal_puesto varchar(200), especialidad_legacy varchar(200),
  agrupador varchar(150), unificador_puesto varchar(200), regimen varchar(50),
  codigo_repa varchar(20), descripcion_repa varchar(200), cod_agrupamiento varchar(20),
  agrupamiento varchar(150), puesto_codigo_sial varchar(20), estado_desde date,
  expediente varchar(150), fecha_desde date, tipo_origen varchar(5),
  periodo_desde date, periodo_hasta date, periodo_renovado boolean,
  fecha_renovacion date, doc_renovacion text, origen varchar(15),
  revision_dato boolean, revision_motivo varchar(200), codigo_legacy text,
  created_at timestamptz, updated_at timestamptz,
  hospital_sigla varchar(20), escalafon_codigo varchar(20),
  puesto_nombre varchar(200), puesto_modalidad text, puesto_tipo text
);
\copy cargos_historicos_tmp FROM '/tmp/cargos_historicos.tsv' WITH (FORMAT TEXT, NULL '\N')

-- Normalizar escalafón 22 → 23 (guardias) o 37 (resto)
-- Normalizar Docentes-c32a65d → docentes-b83fa0d
UPDATE cargos_historicos_tmp SET escalafon_codigo =
  CASE
    WHEN escalafon_codigo = '22' AND LOWER(puesto_nombre) LIKE '%guardia%' THEN '23'
    WHEN escalafon_codigo = '22' THEN '37'
    WHEN escalafon_codigo LIKE 'Docentes%' THEN 'docentes-b83fa0d'
    ELSE escalafon_codigo
  END;

-- Verificar cuántos quedan sin match tras normalización
SELECT COUNT(*) AS sin_match_post_normalizacion
FROM cargos_historicos_tmp t
WHERE NOT EXISTS (
  SELECT 1 FROM puestos_cargo pc JOIN escalafones e ON e.id = pc.escalafon_id
  WHERE LOWER(pc.nombre) = LOWER(t.puesto_nombre) AND e.codigo = t.escalafon_codigo
);

-- INSERT principal
INSERT INTO cargos (
  id, id_sial, codigo, hospital_id, escalafon_id, puesto_cargo_id,
  literal_puesto, especialidad_legacy, agrupador, unificador_puesto,
  regimen, codigo_repa, descripcion_repa, cod_agrupamiento, agrupamiento,
  puesto_codigo_sial, estado, estado_desde, expediente, fecha_desde,
  tipo_origen, periodo_desde, periodo_hasta, periodo_renovado, fecha_renovacion,
  doc_renovacion, origen, revision_dato, revision_motivo, codigo_legacy,
  created_at, updated_at
)
SELECT
  gen_random_uuid(),
  t.id_sial,
  'HIS-' || CASE t.escalafon_codigo
    WHEN '23'            THEN 'G'
    WHEN '24'            THEN 'RES'
    WHEN '37'            THEN 'CPH'
    WHEN '83'            THEN 'ADM'
    WHEN '85'            THEN 'CEETPS'
    WHEN '87'            THEN 'ENF'
    WHEN '7'             THEN 'DOC'
    WHEN '60'            THEN 'GER'
    WHEN '70'            THEN 'CEP'
    WHEN '65'            THEN 'PT'
    WHEN '16T'           THEN 'PT'
    WHEN '17'            THEN 'GAB'
    WHEN '17B'           THEN 'GAB'
    ELSE 'GEN'
  END || '-' || t.id_sial,
  h.id, e.id, pc.id,
  t.literal_puesto, t.especialidad_legacy, t.agrupador, t.unificador_puesto,
  t.regimen, t.codigo_repa, t.descripcion_repa, t.cod_agrupamiento, t.agrupamiento,
  t.puesto_codigo_sial, 'no_vigente', t.estado_desde, t.expediente, t.fecha_desde,
  t.tipo_origen, t.periodo_desde, t.periodo_hasta, t.periodo_renovado, t.fecha_renovacion,
  t.doc_renovacion, t.origen, t.revision_dato, t.revision_motivo, t.codigo_legacy,
  t.created_at, t.updated_at
FROM cargos_historicos_tmp t
JOIN hospitales h ON h.sigla = t.hospital_sigla
JOIN escalafones e ON e.codigo = t.escalafon_codigo
JOIN puestos_cargo pc ON LOWER(pc.nombre) = LOWER(t.puesto_nombre) AND pc.escalafon_id = e.id
WHERE NOT EXISTS (SELECT 1 FROM cargos c WHERE c.id_sial = t.id_sial);
