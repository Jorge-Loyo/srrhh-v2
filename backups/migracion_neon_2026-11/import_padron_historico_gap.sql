-- import_padron_historico_gap.sql
-- Inserta filas de padron_historico de la vieja que no están en la nueva

CREATE TEMP TABLE ph_vieja (
  snapshot_id      uuid,
  fecha_asignada   date,
  id_sial_rol      varchar(50),
  cuil             varchar(11),
  escalafon        varchar(50),
  hospital_sigla   varchar(20),
  literal_puesto   varchar(200),
  especialidad     varchar(200),
  agrupador        varchar(150),
  unificador_puesto varchar(200),
  estado_persona   varchar(50),
  situacion_revista varchar(50),
  id_sial          varchar(50)
);

\copy ph_vieja FROM '/tmp/padron_historico_vieja.tsv' WITH (FORMAT TEXT, NULL '\N')

-- Verificar cuántas faltan realmente en la nueva
SELECT
  COUNT(*) AS total_vieja,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM padron_historico ph
    WHERE ph.id_sial_rol = v.id_sial_rol AND ph.fecha_asignada = v.fecha_asignada
  )) AS ya_en_nueva,
  COUNT(*) FILTER (WHERE NOT EXISTS (
    SELECT 1 FROM padron_historico ph
    WHERE ph.id_sial_rol = v.id_sial_rol AND ph.fecha_asignada = v.fecha_asignada
  )) AS faltantes,
  COUNT(*) FILTER (
    WHERE NOT EXISTS (
      SELECT 1 FROM padron_historico ph
      WHERE ph.id_sial_rol = v.id_sial_rol AND ph.fecha_asignada = v.fecha_asignada
    )
    AND EXISTS (SELECT 1 FROM cargos c WHERE c.id_sial = v.id_sial)
    AND EXISTS (SELECT 1 FROM personas p WHERE p.cuil = v.cuil)
    AND EXISTS (SELECT 1 FROM padron_snapshots ps WHERE ps.id = v.snapshot_id)
  ) AS migrables
FROM ph_vieja v;

-- INSERT
INSERT INTO padron_historico (
  id, snapshot_id, fecha_asignada, persona_id, cargo_id,
  id_sial_rol, cuil, escalafon, hospital_sigla, literal_puesto,
  especialidad, agrupador, unificador_puesto, estado_persona, situacion_revista
)
SELECT
  gen_random_uuid(),
  v.snapshot_id,
  v.fecha_asignada,
  p.id,
  c.id,
  v.id_sial_rol, v.cuil, v.escalafon, v.hospital_sigla, v.literal_puesto,
  v.especialidad, v.agrupador, v.unificador_puesto, v.estado_persona, v.situacion_revista
FROM ph_vieja v
JOIN cargos c ON c.id_sial = v.id_sial
JOIN personas p ON p.cuil = v.cuil
JOIN padron_snapshots ps ON ps.id = v.snapshot_id
WHERE NOT EXISTS (
  SELECT 1 FROM padron_historico ph
  WHERE ph.id_sial_rol = v.id_sial_rol AND ph.fecha_asignada = v.fecha_asignada
);
