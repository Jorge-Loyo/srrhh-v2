-- Backfill normalización: minúsculas + sin acentos en tablas dim_* y pou
-- Requiere extensión unaccent (ya instalada por migración 20261003000003)

-- pou: perfil, especialidad
UPDATE pou
SET
  perfil       = lower(unaccent(perfil)),
  especialidad = lower(unaccent(especialidad))
WHERE
  perfil       IS DISTINCT FROM lower(unaccent(perfil))
  OR especialidad IS DISTINCT FROM lower(unaccent(especialidad));

-- dim_puestos: literal_puesto, especialidad, situacion_revista, motivo_baja
UPDATE dim_puestos
SET
  literal_puesto    = lower(unaccent(literal_puesto)),
  especialidad      = lower(unaccent(especialidad)),
  situacion_revista = lower(unaccent(situacion_revista)),
  motivo_baja       = lower(unaccent(motivo_baja))
WHERE
  literal_puesto    IS DISTINCT FROM lower(unaccent(literal_puesto))
  OR especialidad      IS DISTINCT FROM lower(unaccent(especialidad))
  OR situacion_revista IS DISTINCT FROM lower(unaccent(situacion_revista))
  OR motivo_baja       IS DISTINCT FROM lower(unaccent(motivo_baja));
