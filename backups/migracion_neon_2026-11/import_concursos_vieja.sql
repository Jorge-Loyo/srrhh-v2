CREATE TEMP TABLE concursos_vieja_tmp (
  baja_id_viejo    uuid,
  cargo_id_sial    varchar(50),
  hospital_sigla   varchar(20),
  fecha_vacante    date,
  origen           varchar(50),
  motivo           varchar(200),
  expediente       varchar(150),
  tipo_concurso    text,
  motivo_concurso  text,
  created_at       timestamptz,
  autorizado_at    timestamptz
);

\copy concursos_vieja_tmp FROM '/tmp/concursos_vieja.tsv' WITH (FORMAT TEXT, NULL '\N')

INSERT INTO concursos (
  id, cargo_id, hospital_id, baja_id, origen, fecha_vacante, motivo,
  expediente, tipo_concurso, motivo_concurso, created_at, autorizado_at
)
SELECT
  gen_random_uuid(),
  c.id,
  h.id,
  m.baja_id_nuevo,
  t.origen,
  t.fecha_vacante,
  t.motivo,
  t.expediente,
  t.tipo_concurso::"TipoConcurso",
  t.motivo_concurso::"MotivoConcurso",
  t.created_at,
  t.autorizado_at
FROM concursos_vieja_tmp t
JOIN bajas_id_map m ON m.baja_id_viejo = t.baja_id_viejo
JOIN cargos c ON c.id_sial = t.cargo_id_sial
JOIN hospitales h ON h.sigla = t.hospital_sigla
WHERE NOT EXISTS (
  SELECT 1 FROM concursos cn
  JOIN cargos cc ON cc.id = cn.cargo_id
  WHERE cc.id_sial = t.cargo_id_sial AND cn.fecha_vacante = t.fecha_vacante
);

SELECT COUNT(*) AS total_concursos FROM concursos;
