-- import_bajas_vieja.sql

CREATE TEMP TABLE bajas_tmp (
  fecha_baja             date,
  tipo_baja              varchar(100),
  motivo                 varchar(500),
  tipificador_origen     varchar(200),
  ee_baja                varchar(500),
  partida_presupuestaria varchar(100),
  doc_respaldatoria      varchar(500),
  fecha_pase_paralelo    date,
  carga_horaria          integer,
  genera_concurso        boolean,
  estado                 varchar(50),
  observaciones          text,
  padron_vinculado_at    timestamptz,
  snapshot_vinculado_id  uuid,
  created_at             timestamptz,
  updated_at             timestamptz,
  especialidad           varchar(200),
  cargo_id_sial          varchar(50),
  hospital_sigla         varchar(20),
  persona_cuil           varchar(11),
  baja_id_viejo          uuid
);

\copy bajas_tmp FROM '/tmp/bajas_vieja.tsv' WITH (FORMAT TEXT, NULL '\N')

-- Verificar cuántas ya existen en la nueva (por cargo + fecha_baja)
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM bajas bn
    JOIN cargos cn ON cn.id = bn.cargo_id
    WHERE cn.id_sial = t.cargo_id_sial AND bn.fecha_baja = t.fecha_baja
  )) AS ya_en_nueva,
  COUNT(*) FILTER (WHERE NOT EXISTS (
    SELECT 1 FROM bajas bn
    JOIN cargos cn ON cn.id = bn.cargo_id
    WHERE cn.id_sial = t.cargo_id_sial AND bn.fecha_baja = t.fecha_baja
  )) AS a_insertar
FROM bajas_tmp t;

-- Tabla de mapeo baja_id_viejo -> baja_id_nuevo (para vincular concursos despues)
CREATE TABLE IF NOT EXISTS bajas_id_map (
  baja_id_viejo uuid PRIMARY KEY,
  baja_id_nuevo uuid NOT NULL
);

-- Tabla intermedia con UUID pre-asignado para poder mapear viejo->nuevo
CREATE TEMP TABLE bajas_a_insertar AS
SELECT
  gen_random_uuid()                                                        AS nuevo_id,
  t.baja_id_viejo,
  c.id                                                                     AS cargo_id,
  h.id                                                                     AS hospital_id,
  p.id                                                                     AS persona_id,
  t.fecha_baja, t.tipo_baja, t.motivo, t.tipificador_origen, t.ee_baja,
  t.partida_presupuestaria, t.doc_respaldatoria, t.fecha_pase_paralelo,
  t.carga_horaria, t.genera_concurso, t.estado, t.observaciones,
  t.padron_vinculado_at,
  CASE WHEN EXISTS (SELECT 1 FROM padron_snapshots ps WHERE ps.id = t.snapshot_vinculado_id)
       THEN t.snapshot_vinculado_id ELSE NULL END                          AS snapshot_vinculado_id,
  t.created_at, t.updated_at, t.especialidad
FROM bajas_tmp t
JOIN cargos c ON c.id_sial = t.cargo_id_sial
JOIN hospitales h ON h.sigla = t.hospital_sigla
LEFT JOIN personas p ON p.cuil = t.persona_cuil
WHERE NOT EXISTS (
  SELECT 1 FROM bajas bn
  JOIN cargos cn ON cn.id = bn.cargo_id
  WHERE cn.id_sial = t.cargo_id_sial AND bn.fecha_baja = t.fecha_baja
);

INSERT INTO bajas (
  id, cargo_id, hospital_id, persona_id, fecha_baja, tipo_baja, motivo,
  tipificador_origen, ee_baja, partida_presupuestaria, doc_respaldatoria,
  fecha_pase_paralelo, carga_horaria, genera_concurso, estado, observaciones,
  padron_vinculado_at, snapshot_vinculado_id, created_at, updated_at, especialidad
)
SELECT
  nuevo_id, cargo_id, hospital_id, persona_id, fecha_baja, tipo_baja, motivo,
  tipificador_origen, ee_baja, partida_presupuestaria, doc_respaldatoria,
  fecha_pase_paralelo, carga_horaria, genera_concurso, estado::"EstadoBaja", observaciones,
  padron_vinculado_at, snapshot_vinculado_id, created_at, updated_at, especialidad
FROM bajas_a_insertar;

INSERT INTO bajas_id_map (baja_id_viejo, baja_id_nuevo)
SELECT baja_id_viejo, nuevo_id FROM bajas_a_insertar;

SELECT COUNT(*) AS bajas_insertadas FROM bajas_id_map;
SELECT COUNT(*) AS total_bajas_nueva FROM bajas;
