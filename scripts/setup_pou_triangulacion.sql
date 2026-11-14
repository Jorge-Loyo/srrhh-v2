-- Mapeo explícito de especialidades POU → especialidad_legacy en cargos.
-- Cubre casos donde los nombres difieren entre el documento POU y el sistema.
-- Aplicar manualmente si se recrea la BD: psql -U srrhh_user -d srrhh_db -f scripts/setup_pou_triangulacion.sql

CREATE TABLE IF NOT EXISTS pou_especialidad_mapeo (
  especialidad_pou   VARCHAR(100) NOT NULL,
  especialidad_cargo VARCHAR(200) NOT NULL,
  PRIMARY KEY (especialidad_pou, especialidad_cargo)
);

INSERT INTO pou_especialidad_mapeo VALUES
  ('CIRUGIA PEDIATRICA',                                    'CIRUGIA INFANTIL'),
  ('RECUPERACION CARDIOVASCULAR',                           'RECUPERADOR CARDIOVASCULAR'),
  ('RADIODIAGNOSTICO O DIAGNOSTICO POR IMAGENES',           'RADIOLOGIA (RADIODIAGNOSTICO)'),
  ('RADIODIAGNOSTICO O DIAGNOSTICO POR IMAGENES',           'DIAGNOSTICO POR IMAGENES'),
  ('HEMOTERAPIA E INMUNOHEMATOLOGIA O TEC. EN HEMOTERAPIA', 'HEMOTERAPIA'),
  ('OBSTETRICIA O TOCOGINECOLOGIA',                         'OBSTETRICIA'),
  ('OBSTETRICIA O TOCOGINECOLOGIA',                         'TOCOGINECOLOGIA'),
  ('OBSTETRICIA O TOCOGINECOLOGIA',                         'TOCOGINECOLOGIA Y ECOGRAFIA'),
  ('INFECTOLOGO',                                           'INFECTOLOGIA'),
  ('INFECTOLOGO',                                           'ENFERMEDADES INFECCIOSAS (INFECTOLOGIA)'),
  ('ORTOPEDIA Y TRAUMATOLOGIA',                             'TRAUMATOLOGIA'),
  ('ORTOPEDIA Y TRAUMATOLOGIA INFANTIL',                    'TRAUMATOLOGIA')
ON CONFLICT DO NOTHING;

-- Vista de triangulación POU vs TODOS los cargos del sistema.
-- Parte de la tabla `cargos` (no de `concursos`) para incluir TODOS los cargos
-- de hospitales con datos POU: ocupados, vacantes, en concurso y en validación.
--
-- Columnas clave:
--   estado_cargo   → vigente | no_vigente | validacion_vacante
--   sub_estado     → ocupado | vacante | concurso | null
--   tiene_concurso → true si hay al menos un concurso activo para el cargo
--   estado_pou     → clasificación respecto al documento POU:
--     CON POU        → cargo con fila POU correspondiente (perfil+especialidad matchean)
--     SIN POU        → cargo sin fila POU (médicos de planta, especialidades no cubiertas)
--     SUPLENTE       → cargo suplente de guardia (universo separado, sin POU propio)
--     SIN CLASIFICAR → cargo sin unificador_puesto (datos incompletos)

CREATE OR REPLACE VIEW v_pou_triangulacion AS
SELECT
  h.sigla,
  c.codigo,
  c.estado                                    AS estado_cargo,
  c.sub_estado,
  c.unificador_puesto,
  c.agrupador,
  c.especialidad_legacy,
  -- Fecha de vacante: la del concurso más reciente si existe, sino estado_desde del cargo
  COALESCE(
    (SELECT MIN(con.fecha_vacante)
     FROM concursos con
     WHERE con.cargo_id = c.id),
    c.estado_desde
  )                                           AS fecha_vacante,
  -- ¿Tiene al menos un concurso registrado?
  EXISTS (
    SELECT 1 FROM concursos con WHERE con.cargo_id = c.id
  )                                           AS tiene_concurso,
  -- Tipo de concurso del concurso más reciente (si existe)
  (SELECT con.tipo_concurso::text
   FROM concursos con
   WHERE con.cargo_id = c.id
   ORDER BY con.created_at DESC
   LIMIT 1)                                   AS tipo_concurso,
  p.perfil                                    AS pou_perfil,
  p.especialidad                              AS pou_especialidad,
  p.dotacion_total,
  p.activos                                   AS pou_activos,
  p.vacantes                                  AS pou_vacantes,
  CASE
    WHEN UPPER(c.unificador_puesto) = 'SUPLENTE DE GUARDIA' THEN 'SUPLENTE'
    WHEN c.unificador_puesto IS NULL OR c.unificador_puesto = '' THEN 'SIN CLASIFICAR'
    WHEN p.id IS NOT NULL THEN 'CON POU'
    ELSE 'SIN POU'
  END                                         AS estado_pou
FROM cargos c
JOIN hospitales h ON h.id = c.hospital_id
-- Solo hospitales que tienen datos en la tabla pou
JOIN (SELECT DISTINCT sigla FROM pou) hp ON hp.sigla = h.sigla
-- Intento de match con fila POU (LEFT JOIN: si no matchea, estado_pou = SIN POU)
LEFT JOIN pou p ON p.sigla = h.sigla
  AND (
    similarity(unaccent(lower(p.especialidad)), unaccent(lower(COALESCE(c.especialidad_legacy, '')))) = 1
    OR unaccent(lower(COALESCE(c.especialidad_legacy, ''))) ILIKE '%' || unaccent(lower(p.especialidad)) || '%'
    OR EXISTS (
      SELECT 1 FROM pou_especialidad_mapeo m
      WHERE m.especialidad_pou = p.especialidad
        AND unaccent(lower(m.especialidad_cargo)) = unaccent(lower(COALESCE(c.especialidad_legacy, '')))
    )
  )
  AND (
    (p.perfil = 'ESPECIALISTA EN LA GUARDIA MEDICO'  AND UPPER(c.unificador_puesto) = 'CPH DE GUARDIA'        AND UPPER(c.agrupador) = 'MEDICO')
    OR (p.perfil = 'PROFESIONAL DE LA GUARDIA MEDICO' AND UPPER(c.unificador_puesto) = 'CPH DE GUARDIA'       AND UPPER(c.agrupador) = 'NO MEDICO')
    OR (p.perfil = 'PROFESIONAL DE LA SALUD'          AND UPPER(c.unificador_puesto) = 'CPH DE PLANTA'        AND UPPER(c.agrupador) = 'NO MEDICO')
    OR (p.perfil = 'TECNICO/A DE LA SALUD'            AND UPPER(c.unificador_puesto) = 'TECNICO/A DE LA SALUD')
    OR (p.perfil = 'Jefe de SECCIÓN'                  AND UPPER(c.unificador_puesto) = 'JEFE/A DE SECCION'    AND UPPER(c.agrupador) = 'JEFES CPH')
    OR (p.perfil = 'Jefe de UNIDAD'                   AND UPPER(c.unificador_puesto) = 'JEFE/A DE UNIDAD'     AND UPPER(c.agrupador) = 'JEFES CPH')
  )
-- Sin filtro de estado: incluye vigente, no_vigente y validacion_vacante
ORDER BY h.sigla, estado_pou, c.sub_estado, c.codigo;
