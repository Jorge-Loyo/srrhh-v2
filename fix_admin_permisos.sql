-- Asignar todos los permisos al rol admin (slug = 'admin')
INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.slug = 'admin'
ON CONFLICT DO NOTHING;

-- Agregar permiso bajas-sial ver si no existe aun
INSERT INTO permisos (modulo, accion)
VALUES ('bajas-sial', 'ver')
ON CONFLICT DO NOTHING;

-- Asignarlo al admin
INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
WHERE r.slug = 'admin' AND p.modulo = 'bajas-sial' AND p.accion = 'ver'
ON CONFLICT DO NOTHING;

-- Verificar resultado
SELECT p.modulo, p.accion
FROM role_permisos rp
JOIN roles r ON r.id = rp.role_id
JOIN permisos p ON p.id = rp.permiso_id
WHERE r.slug = 'admin'
ORDER BY p.modulo, p.accion;
