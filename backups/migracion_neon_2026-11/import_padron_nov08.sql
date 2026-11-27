CREATE TEMP TABLE ph_nov08_tmp (
  snapshot_id       uuid,
  fecha_asignada    date,
  persona_id        uuid,
  cargo_id          uuid,
  id_sial_rol       varchar(50),
  cuil              varchar(11),
  escalafon         varchar(50),
  hospital_sigla    varchar(20),
  literal_puesto    varchar(200),
  especialidad      varchar(200),
  agrupador         varchar(150),
  unificador_puesto varchar(200),
  estado_persona    varchar(50),
  situacion_revista varchar(50)
);

\copy ph_nov08_tmp FROM '/tmp/padron_nov08.tsv' WITH (FORMAT TEXT, NULL '\N')

INSERT INTO padron_historico (
  id, snapshot_id, fecha_asignada, persona_id, cargo_id,
  id_sial_rol, cuil, escalafon, hospital_sigla, literal_puesto,
  especialidad, agrupador, unificador_puesto, estado_persona, situacion_revista
)
SELECT
  gen_random_uuid(),
  t.snapshot_id, t.fecha_asignada, t.persona_id, t.cargo_id,
  t.id_sial_rol, t.cuil, t.escalafon, t.hospital_sigla, t.literal_puesto,
  t.especialidad, t.agrupador, t.unificador_puesto, t.estado_persona, t.situacion_revista
FROM ph_nov08_tmp t
WHERE NOT EXISTS (
  SELECT 1 FROM padron_historico ph
  WHERE ph.id_sial_rol = t.id_sial_rol AND ph.fecha_asignada = t.fecha_asignada
);

SELECT COUNT(*) AS total_nov08 FROM padron_historico WHERE fecha_asignada = '2026-11-08';
SELECT COUNT(*) AS total_padron_historico FROM padron_historico;
