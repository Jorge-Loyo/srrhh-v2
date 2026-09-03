-- =============================================================================
-- Fix escalafones + puestos_cargo
-- 1. Reasignar puestos de escalafones inactivos al activo equivalente
-- 2. Borrar escalafones inactivos
-- 3. Insertar puestos faltantes desde literal_puesto real de cargos
-- =============================================================================

BEGIN;

-- ── Reasignaciones ────────────────────────────────────────────────────────────

-- TEC → CEETPS (85)
UPDATE puestos_cargo SET escalafon_id = (SELECT id FROM escalafones WHERE codigo = '85')
WHERE escalafon_id = (SELECT id FROM escalafones WHERE codigo = 'TEC')
  AND NOT EXISTS (
    SELECT 1 FROM puestos_cargo pc2
    WHERE pc2.escalafon_id = (SELECT id FROM escalafones WHERE codigo = '85')
      AND pc2.nombre = puestos_cargo.nombre
  );

-- ENF → Nueva Carrera Enfermería (87)
UPDATE puestos_cargo SET escalafon_id = (SELECT id FROM escalafones WHERE codigo = '87')
WHERE escalafon_id = (SELECT id FROM escalafones WHERE codigo = 'ENF')
  AND NOT EXISTS (
    SELECT 1 FROM puestos_cargo pc2
    WHERE pc2.escalafon_id = (SELECT id FROM escalafones WHERE codigo = '87')
      AND pc2.nombre = puestos_cargo.nombre
  );

-- Escalafón General → Nueva Carrera Administrativa (83)
UPDATE puestos_cargo SET escalafon_id = (SELECT id FROM escalafones WHERE codigo = '83')
WHERE escalafon_id = (SELECT id FROM escalafones WHERE codigo LIKE 'Escalafón Ge%')
  AND NOT EXISTS (
    SELECT 1 FROM puestos_cargo pc2
    WHERE pc2.escalafon_id = (SELECT id FROM escalafones WHERE codigo = '83')
      AND pc2.nombre = puestos_cargo.nombre
  );

-- Planta de Gabinete → Gabinete (17)
UPDATE puestos_cargo SET escalafon_id = (SELECT id FROM escalafones WHERE codigo = '17')
WHERE escalafon_id = (SELECT id FROM escalafones WHERE codigo LIKE 'Planta de Ga%')
  AND NOT EXISTS (
    SELECT 1 FROM puestos_cargo pc2
    WHERE pc2.escalafon_id = (SELECT id FROM escalafones WHERE codigo = '17')
      AND pc2.nombre = puestos_cargo.nombre
  );

-- Cuerpos Transitorios → Cuerpo Especialistas Profesionales (70)
UPDATE puestos_cargo SET escalafon_id = (SELECT id FROM escalafones WHERE codigo = '70')
WHERE escalafon_id = (SELECT id FROM escalafones WHERE codigo LIKE 'Cuerpos Tran%')
  AND NOT EXISTS (
    SELECT 1 FROM puestos_cargo pc2
    WHERE pc2.escalafon_id = (SELECT id FROM escalafones WHERE codigo = '70')
      AND pc2.nombre = puestos_cargo.nombre
  );

-- Planta Transitoria → Plantas Transitorias Acta 06/2014 (65)
UPDATE puestos_cargo SET escalafon_id = (SELECT id FROM escalafones WHERE codigo = '65')
WHERE escalafon_id = (SELECT id FROM escalafones WHERE codigo LIKE 'Planta Trans%')
  AND NOT EXISTS (
    SELECT 1 FROM puestos_cargo pc2
    WHERE pc2.escalafon_id = (SELECT id FROM escalafones WHERE codigo = '65')
      AND pc2.nombre = puestos_cargo.nombre
  );

-- Borrar duplicados que no se pudieron reasignar (mismo nombre ya existe en destino)
DELETE FROM puestos_cargo
WHERE escalafon_id IN (SELECT id FROM escalafones WHERE activo = false);

-- ── Borrar escalafones inactivos ──────────────────────────────────────────────
DELETE FROM escalafones WHERE activo = false;

-- ── Insertar puestos faltantes desde literal_puesto real de cargos ────────────
INSERT INTO puestos_cargo (id, escalafon_id, modalidad, nombre, activo, tipo_puesto)
SELECT
  gen_random_uuid(),
  c.escalafon_id,
  'pof',
  c.literal_puesto,
  true,
  'ejecucion'
FROM (
  SELECT DISTINCT c.escalafon_id, c.literal_puesto
  FROM cargos c
  WHERE c.literal_puesto IS NOT NULL
    AND c.literal_puesto != ''
    AND c.literal_puesto != 'No Aplica'
    AND NOT EXISTS (
      SELECT 1 FROM puestos_cargo pc
      WHERE pc.escalafon_id = c.escalafon_id
        AND pc.nombre = c.literal_puesto
    )
) c;

COMMIT;

-- Verificación final
SELECT e.nombre AS escalafon, COUNT(pc.id) AS total_puestos
FROM escalafones e
JOIN puestos_cargo pc ON pc.escalafon_id = e.id
WHERE e.activo = true
GROUP BY e.nombre
ORDER BY total_puestos DESC;

SELECT COUNT(*) AS total_escalafones_activos FROM escalafones WHERE activo = true;
