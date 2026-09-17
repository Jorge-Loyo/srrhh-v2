-- Agrega especialidad_cph a personas.
-- Separación explícita entre:
--   especialidad_principal = especialidad del cargo actual (viene del padrón semanal, cambia)
--   especialidad_cph       = especialidad CPH canónica (viene de ref_especialidades_cuil, estable)
--
-- Se popula inmediatamente desde ref_especialidades_cuil tipo=cph usando la
-- especialidad más frecuente por CUIL, excluyendo "Sin Especialidad" salvo que
-- sea la única opción disponible.

ALTER TABLE "personas"
  ADD COLUMN "especialidad_cph" VARCHAR(200);

-- Populate inicial desde ref_especialidades_cuil
WITH esp_canonica AS (
  SELECT DISTINCT ON (cuil)
    cuil,
    especialidad
  FROM (
    SELECT
      cuil,
      especialidad,
      count(*) AS freq,
      CASE WHEN especialidad = 'Sin Especialidad' THEN 1 ELSE 0 END AS es_sin_esp
    FROM ref_especialidades_cuil
    WHERE tipo = 'cph'
    GROUP BY cuil, especialidad
  ) ranked
  ORDER BY cuil, es_sin_esp ASC, freq DESC
)
UPDATE personas p
SET especialidad_cph = ec.especialidad
FROM esp_canonica ec
WHERE p.cuil = ec.cuil;

CREATE INDEX "personas_especialidad_cph_idx" ON "personas"("especialidad_cph");
