-- recalc_kpis_dotacion_snapshot.sql
-- Recalcula kpis_dotacion_snapshot desde padron_historico.
-- Usa el último snapshot de cada mes (mismo criterio que el backfill original).
-- Limpia todo y recalcula desde cero para garantizar consistencia.

TRUNCATE kpis_dotacion_snapshot;

INSERT INTO kpis_dotacion_snapshot (fecha, codigo_registro, situacion_revista, personas)
SELECT
  ph.fecha_asignada                                   AS fecha,
  c.codigo_repa                                       AS codigo_registro,
  ph.situacion_revista,
  COUNT(DISTINCT ph.persona_id)                       AS personas
FROM padron_historico ph
JOIN cargos c ON c.id = ph.cargo_id
-- Solo el último snapshot de cada mes
JOIN (
  SELECT MAX(fecha_asignada) AS fecha_asignada
  FROM padron_snapshots
  WHERE estado = 'aprobado'
  GROUP BY DATE_TRUNC('month', fecha_asignada)
) ultimos ON ultimos.fecha_asignada = ph.fecha_asignada
WHERE ph.situacion_revista IS NOT NULL
  AND c.codigo_repa IS NOT NULL
GROUP BY ph.fecha_asignada, c.codigo_repa, ph.situacion_revista
ORDER BY ph.fecha_asignada, c.codigo_repa, ph.situacion_revista;

-- Resultado
SELECT fecha, COUNT(*) AS filas, SUM(personas) AS total_personas
FROM kpis_dotacion_snapshot
GROUP BY fecha ORDER BY fecha;
