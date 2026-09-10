-- Tabla de resumen para la evolución de dotación histórica.
-- Una fila por (fecha_corte_mensual, escalafon) — el último snapshot aprobado
-- de cada mes. Se popula al aprobar cada snapshot (padron.service.ts) y
-- se backfilla aquí para todos los meses históricos ya cargados.
--
-- Fuente de verdad del escalafón: cargo_id → escalafones.nombre (canónico).
-- La reconstrucción usa padron_historico + padron_diff para determinar
-- qué id_sial_rol estaban activos en cada corte mensual.

CREATE TABLE "kpis_dotacion_snapshot" (
  "fecha"     DATE          NOT NULL,
  "escalafon" VARCHAR(100)  NOT NULL,
  "personas"  INTEGER       NOT NULL,
  PRIMARY KEY ("fecha", "escalafon")
);

CREATE INDEX "kpis_dotacion_snapshot_fecha_idx" ON "kpis_dotacion_snapshot"("fecha");

-- Backfill: un punto por mes (último snapshot del mes), reconstruyendo
-- el estado activo de cada id_sial_rol en ese corte.
INSERT INTO "kpis_dotacion_snapshot" ("fecha", "escalafon", "personas")
WITH
cortes AS (
  SELECT DISTINCT
    max(fecha_asignada) OVER (PARTITION BY date_trunc('month', fecha_asignada)) AS corte
  FROM padron_snapshots
  WHERE estado = 'aprobado'
),
fechas AS (SELECT DISTINCT corte FROM cortes),
roles AS (
  SELECT DISTINCT ON (ph.id_sial_rol)
    ph.id_sial_rol, ph.cargo_id, p.cuil
  FROM padron_historico ph
  JOIN personas p ON p.id = ph.persona_id
  WHERE p.cuil IS NOT NULL
  ORDER BY ph.id_sial_rol, ph.fecha_asignada ASC
),
bajas AS (
  SELECT d.id_sial_rol, ps.fecha_asignada AS fecha_baja
  FROM padron_diff d
  JOIN padron_snapshots ps ON ps.id = d.snapshot_id
  WHERE d.tipo = 'eliminado'
),
activos AS (
  SELECT f.corte, r.cargo_id, r.cuil
  FROM fechas f
  JOIN roles r ON true
  WHERE EXISTS (
    SELECT 1 FROM padron_historico ph2
    WHERE ph2.id_sial_rol = r.id_sial_rol AND ph2.fecha_asignada <= f.corte
  )
  AND NOT EXISTS (
    SELECT 1 FROM bajas b
    WHERE b.id_sial_rol = r.id_sial_rol
      AND b.fecha_baja <= f.corte
      AND NOT EXISTS (
        SELECT 1 FROM padron_historico ph3
        WHERE ph3.id_sial_rol = r.id_sial_rol
          AND ph3.fecha_asignada > b.fecha_baja
          AND ph3.fecha_asignada <= f.corte
      )
  )
)
SELECT
  a.corte AS fecha,
  e.nombre AS escalafon,
  count(DISTINCT a.cuil)::integer AS personas
FROM activos a
JOIN cargos c ON c.id = a.cargo_id
JOIN escalafones e ON e.id = c.escalafon_id
GROUP BY a.corte, e.nombre
ON CONFLICT ("fecha", "escalafon") DO UPDATE SET "personas" = EXCLUDED."personas";
