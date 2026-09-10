-- Permisos faltantes para módulos de agustín (dotación, POU, referencias, auditoría)
-- Idempotente — ON CONFLICT DO NOTHING

INSERT INTO permisos (id, modulo, accion, descripcion)
VALUES
  (gen_random_uuid(), 'dotacion',      'ver',                   'Ver dotación real'),
  (gen_random_uuid(), 'configuracion', 'gestionar_pou',         'Cargar Excel POU'),
  (gen_random_uuid(), 'configuracion', 'gestionar_referencias', 'Gestionar referencias Dotaneitor'),
  (gen_random_uuid(), 'configuracion', 'ver_auditoria',         'Ver log de auditoría')
ON CONFLICT (modulo, accion) DO NOTHING;

-- El rol admin ya tiene un CROSS JOIN en la migración 20260902000004 que
-- asigna todos los permisos — pero esa migración ya corrió. Re-aplicamos
-- solo para admin para que los nuevos permisos queden asignados.
INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permisos p
WHERE r.slug = 'admin'
  AND p.modulo IN ('dotacion', 'configuracion')
  AND p.accion IN ('ver', 'gestionar_pou', 'gestionar_referencias', 'ver_auditoria')
ON CONFLICT DO NOTHING;

-- editor: también puede ver dotación y auditoría
INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
WHERE r.slug = 'editor'
  AND (
    (p.modulo = 'dotacion'      AND p.accion = 'ver')
    OR (p.modulo = 'configuracion' AND p.accion = 'ver_auditoria')
  )
ON CONFLICT DO NOTHING;

-- viewer, director, concursales_*: pueden ver dotación
INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
WHERE r.slug IN ('viewer', 'director', 'concursales_cph', 'concursales_ceetps', 'sgrasv')
  AND p.modulo = 'dotacion' AND p.accion = 'ver'
ON CONFLICT DO NOTHING;
