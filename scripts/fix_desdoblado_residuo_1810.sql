-- ============================================================================
-- Corrige el residuo del padron 18-10: 2 roles NUEVOS de 24/07 que el fix del
-- pipeline metio en un cargo desdoblado existente (por desajuste de id_sial del
-- cargo) en vez de crearles un cargo 1:1 propio. Los mueve a su propio cargo.
--
-- Casos (verificados en Neon tras aprobar el 18-10):
--   DOC-000265 (id_sial 001515787-15): titular Villa (001016250-10...) OK;
--     intruso Pose (001716626-10-20327926676-10) -> mover a cargo nuevo.
--   RES-003836 (id_sial 001822608-1): titular Azuaje (001807951-1...) OK;
--     intruso Guirao Saez (001823712-1-20429140146-1) -> mover a cargo nuevo.
--
-- Por cada intruso: clona el cargo del titular (mismo puesto/hospital/escalafon/
-- registro/regimen/repa), codigo correlativo RES-/DOC-, id_sial NULL, especialidad
-- resuelta del ultimo padron del PROPIO rol (norm_esp, estricto, NULL si no matchea
-- — regla de oro). Reapunta la ocupacion. Registra mapeo. Transaccional.
-- ============================================================================

CREATE OR REPLACE FUNCTION norm_esp(txt text) RETURNS text AS $$
  SELECT trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    lower(unaccent(coalesce(txt, ''))),
    '\([^)]*\)', ' ', 'g'), '•', ' ', 'g'), '-', ' ', 'g'), '\s+', ' ', 'g'));
$$ LANGUAGE sql IMMUTABLE;

-- ── A — DRY-RUN: ver los 2 intrusos y la especialidad que se les asignaria ──
WITH intrusos(id_sial_rol, prefijo) AS (
  VALUES ('001716626-10-20327926676-10','DOC-'), ('001823712-1-20429140146-1','RES-')
),
ult AS (
  SELECT DISTINCT ON (ph.id_sial_rol) ph.id_sial_rol, ph.especialidad AS esp_padron
  FROM padron_historico ph
  WHERE ph.especialidad IS NOT NULL AND trim(ph.especialidad) <> ''
  ORDER BY ph.id_sial_rol, ph.fecha_asignada DESC
)
SELECT i.id_sial_rol, c.codigo AS cargo_actual, p.apellido_nombre,
       u.esp_padron,
       (SELECT ep.nombre FROM especialidades_puesto ep
         WHERE ep.puesto_cargo_id = c.puesto_cargo_id
           AND norm_esp(ep.nombre) = norm_esp(u.esp_padron) LIMIT 1) AS esp_que_se_asigna
FROM intrusos i
JOIN ocupaciones o ON o.id_sial_rol = i.id_sial_rol AND o.hasta IS NULL
JOIN cargos c ON c.id = o.cargo_id
JOIN personas p ON p.id = o.persona_id
LEFT JOIN ult u ON u.id_sial_rol = i.id_sial_rol;

-- ── B — APLICAR ──
BEGIN;
DO $$
DECLARE
  r RECORD;
  v_prefijo text;
  v_next int;
  v_codigo text;
  v_new_cargo uuid;
  v_esp uuid;
BEGIN
  FOR r IN
    SELECT i.id_sial_rol, i.prefijo, o.id AS ocup_id, c.id AS cargo_titular_id,
           c.puesto_cargo_id, cr.codigo AS reg
    FROM (VALUES ('001716626-10-20327926676-10','DOC-'), ('001823712-1-20429140146-1','RES-'))
         AS i(id_sial_rol, prefijo)
    JOIN ocupaciones o ON o.id_sial_rol = i.id_sial_rol AND o.hasta IS NULL
    JOIN cargos c ON c.id = o.cargo_id
    JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
  LOOP
    -- especialidad del propio rol (estricta)
    SELECT ep.id INTO v_esp
    FROM (SELECT DISTINCT ON (ph.id_sial_rol) ph.especialidad AS e
          FROM padron_historico ph
          WHERE ph.id_sial_rol = r.id_sial_rol AND ph.especialidad IS NOT NULL AND trim(ph.especialidad) <> ''
          ORDER BY ph.id_sial_rol, ph.fecha_asignada DESC) x
    JOIN especialidades_puesto ep ON ep.puesto_cargo_id = r.puesto_cargo_id
      AND norm_esp(ep.nombre) = norm_esp(x.e)
    LIMIT 1;

    -- siguiente codigo correlativo libre del prefijo
    SELECT coalesce(max((substring(codigo from 5))::int),0)+1 INTO v_next
    FROM cargos WHERE codigo LIKE r.prefijo||'%' AND substring(codigo from 5) ~ '^[0-9]{6}$';
    v_codigo := r.prefijo || lpad(v_next::text, 6, '0');
    WHILE EXISTS (SELECT 1 FROM cargos WHERE codigo = v_codigo) LOOP
      v_next := v_next+1; v_codigo := r.prefijo || lpad(v_next::text, 6, '0');
    END LOOP;

    -- clonar el cargo del titular, con id nuevo, codigo nuevo, id_sial NULL, esp propia
    INSERT INTO cargos (
      id, id_sial, codigo, hospital_id, escalafon_id, codigo_registro_id,
      puesto_cargo_id, especialidad_puesto_id, literal_puesto, especialidad_legacy,
      agrupador, unificador_puesto, regimen, codigo_repa, descripcion_repa,
      cod_agrupamiento, agrupamiento, puesto_codigo_sial, estado, estado_desde,
      expediente, fecha_desde, created_by_id, created_at, updated_at, deleted_at,
      tipo_origen, cargo_retenido_id, cargo_base_id, periodo_desde, periodo_hasta,
      periodo_renovado, fecha_renovacion, doc_renovacion, cesac_id, unidad_fija_id,
      origen, revision_dato, revision_motivo
    )
    SELECT gen_random_uuid(), NULL, v_codigo, hospital_id, escalafon_id, codigo_registro_id,
      puesto_cargo_id, v_esp, literal_puesto, especialidad_legacy,
      agrupador, unificador_puesto, regimen, codigo_repa, descripcion_repa,
      cod_agrupamiento, agrupamiento, puesto_codigo_sial, estado, estado_desde,
      expediente, fecha_desde, created_by_id, now(), now(), deleted_at,
      tipo_origen, cargo_retenido_id, cargo_base_id, periodo_desde, periodo_hasta,
      periodo_renovado, fecha_renovacion, doc_renovacion, cesac_id, unidad_fija_id,
      origen, revision_dato, revision_motivo
    FROM cargos WHERE id = r.cargo_titular_id
    RETURNING id INTO v_new_cargo;

    -- reapuntar la ocupacion del intruso al cargo nuevo
    UPDATE ocupaciones SET cargo_id = v_new_cargo, updated_at = now() WHERE id = r.ocup_id;

    -- registrar mapeo
    INSERT INTO desdoblado_mapeo_cargos (id_sial_rol, codigo_cargo, codigo_registro)
    VALUES (r.id_sial_rol, v_codigo, r.reg) ON CONFLICT (id_sial_rol) DO NOTHING;

    RAISE NOTICE 'Rol % -> cargo nuevo % (esp %)', r.id_sial_rol, v_codigo, v_esp;
  END LOOP;
END $$;
COMMIT;

-- ── C — VERIFICACION: C.1 debe dar 0 ──
SELECT cr.codigo, count(*)
FROM (SELECT o.cargo_id, c.codigo_registro_id, count(*) n
      FROM ocupaciones o JOIN cargos c ON c.id=o.cargo_id
      WHERE o.hasta IS NULL AND lower(unaccent(o.situacion_revista))='activo'
      GROUP BY 1,2 HAVING count(*)>1) t
JOIN codigos_registro cr ON cr.id=t.codigo_registro_id AND cr.codigo IN ('24','07')
GROUP BY 1;
