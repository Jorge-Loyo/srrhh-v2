-- Fusión completa: 'Docentes' → 'Docentes Históricos'

-- 1. Reasignar cargos (ya aplicado, idempotente)
UPDATE cargos
SET escalafon_id = '7662767a-43c9-4b6a-b802-8dd36f2e1092'
WHERE escalafon_id = '94be2ed6-6e71-4ce3-bd07-94c62e73a835';

-- 2. Normalizar padron_historico (ya aplicado, idempotente)
UPDATE padron_historico
SET escalafon = 'Docentes Históricos'
WHERE escalafon = 'Docentes';

-- 3. Reasignar codigos_registro al canónico
UPDATE codigos_registro
SET escalafon_id = '7662767a-43c9-4b6a-b802-8dd36f2e1092'
WHERE escalafon_id = '94be2ed6-6e71-4ce3-bd07-94c62e73a835';

-- 4. Reasignar puestos_cargo al canónico
UPDATE puestos_cargo
SET escalafon_id = '7662767a-43c9-4b6a-b802-8dd36f2e1092'
WHERE escalafon_id = '94be2ed6-6e71-4ce3-bd07-94c62e73a835';

-- 5. Eliminar el escalafón duplicado
DELETE FROM escalafones
WHERE id = '94be2ed6-6e71-4ce3-bd07-94c62e73a835';
