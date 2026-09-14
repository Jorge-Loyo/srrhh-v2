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

-- NOTA (2026-09-11): se sacaron los UPDATE de normalización de
-- unificador_puesto que estaban acá — pisaban a mayúscula solo 5 valores
-- puntuales, dejando el resto de la dotación (backfileada completa el mismo
-- día desde ref_unificadores_puesto, formato "Cph de Guardia"/"Jefe/a de
-- UNIDAD"/etc.) en un formato distinto e inconsistente dentro de la misma
-- columna. La vista de abajo ahora compara con UPPER() de los dos lados en
-- vez de exigir mayúscula exacta, así funciona con el formato real de la
-- tabla sin tener que reescribir 46.885 filas.

-- Vista de triangulación POU vs concursos.
-- Cruza concursos activos con filas POU usando similitud de texto + mapeo explícito.
-- Solo incluye hospitales que tienen datos en la tabla pou.
-- estado_pou:
--   CON POU        → cargo en concurso con fila POU correspondiente
--   SIN POU        → cargo en concurso sin fila POU (médicos de planta, especialidades no cubiertas)
--   SUPLENTE       → cargo suplente de guardia (universo separado, sin POU propio)
--   SIN CLASIFICAR → cargo sin unificador_puesto (datos incompletos)

CREATE OR REPLACE VIEW v_pou_triangulacion AS
SELECT
  h.sigla,
  c.codigo,
  c.unificador_puesto,
  c.agrupador,
  c.especialidad_legacy,
  con.tipo_concurso,
  con.fecha_vacante,
  p.perfil          AS pou_perfil,
  p.especialidad    AS pou_especialidad,
  p.dotacion_total,
  p.activos         AS pou_activos,
  p.vacantes        AS pou_vacantes,
  CASE
    WHEN UPPER(c.unificador_puesto) = 'SUPLENTE DE GUARDIA' THEN 'SUPLENTE'
    WHEN c.unificador_puesto IS NULL OR c.unificador_puesto = '' THEN 'SIN CLASIFICAR'
    WHEN p.id IS NOT NULL THEN 'CON POU'
    ELSE 'SIN POU'
  END AS estado_pou
FROM concursos con
JOIN cargos c     ON c.id = con.cargo_id
JOIN hospitales h ON h.id = con.hospital_id
JOIN (SELECT DISTINCT sigla FROM pou) hp ON hp.sigla = h.sigla
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
    (p.perfil = 'ESPECIALISTA EN LA GUARDIA MEDICO'  AND UPPER(c.unificador_puesto) = 'CPH DE GUARDIA'       AND UPPER(c.agrupador) = 'MEDICO')
    OR (p.perfil = 'PROFESIONAL DE LA GUARDIA MEDICO' AND UPPER(c.unificador_puesto) = 'CPH DE GUARDIA'      AND UPPER(c.agrupador) = 'NO MEDICO')
    OR (p.perfil = 'PROFESIONAL DE LA SALUD'          AND UPPER(c.unificador_puesto) = 'CPH DE PLANTA'       AND UPPER(c.agrupador) = 'NO MEDICO')
    OR (p.perfil = 'TECNICO/A DE LA SALUD'            AND UPPER(c.unificador_puesto) = 'TECNICO/A DE LA SALUD')
    OR (p.perfil = 'Jefe de SECCIÓN'                  AND UPPER(c.unificador_puesto) = 'JEFE/A DE SECCION'   AND UPPER(c.agrupador) = 'JEFES CPH')
    OR (p.perfil = 'Jefe de UNIDAD'                   AND UPPER(c.unificador_puesto) = 'JEFE/A DE UNIDAD'    AND UPPER(c.agrupador) = 'JEFES CPH')
  );
