-- Fusión: 'Docentes' (inactivo, sin código de registro) → 'Docentes Históricos' (canónico, cod 7)
-- Reescrita sin UUIDs hardcodeados para ser portable entre entornos (local/Neon/producción)

-- 1. Reasignar cargos al escalafón canónico
UPDATE cargos
SET escalafon_id = (SELECT id FROM escalafones WHERE nombre = 'Docentes Históricos' AND activo = true LIMIT 1)
WHERE escalafon_id = (SELECT id FROM escalafones WHERE nombre = 'Docentes' LIMIT 1);

-- 2. Normalizar texto en padron_historico
UPDATE padron_historico
SET escalafon = 'Docentes Históricos'
WHERE escalafon = 'Docentes';

-- 3. Reasignar codigos_registro al canónico
UPDATE codigos_registro
SET escalafon_id = (SELECT id FROM escalafones WHERE nombre = 'Docentes Históricos' AND activo = true LIMIT 1)
WHERE escalafon_id = (SELECT id FROM escalafones WHERE nombre = 'Docentes' LIMIT 1);

-- 4. Reasignar puestos_cargo al canónico
UPDATE puestos_cargo
SET escalafon_id = (SELECT id FROM escalafones WHERE nombre = 'Docentes Históricos' AND activo = true LIMIT 1)
WHERE escalafon_id = (SELECT id FROM escalafones WHERE nombre = 'Docentes' LIMIT 1);

-- 5. Eliminar el escalafón duplicado
DELETE FROM escalafones
WHERE nombre = 'Docentes' AND activo = false
  AND id NOT IN (SELECT DISTINCT escalafon_id FROM cargos)
  AND id NOT IN (SELECT DISTINCT escalafon_id FROM codigos_registro)
  AND id NOT IN (SELECT DISTINCT escalafon_id FROM puestos_cargo);
