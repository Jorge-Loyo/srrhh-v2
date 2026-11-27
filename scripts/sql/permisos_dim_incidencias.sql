INSERT INTO permisos (id, modulo, accion, descripcion)
VALUES
  (gen_random_uuid(), 'dim_incidencias', 'ver',      'Ver incidencias y concursos de carga semanal'),
  (gen_random_uuid(), 'dim_incidencias', 'gestionar','Iniciar concurso o descartar incidencias de carga semanal')
ON CONFLICT (modulo, accion) DO NOTHING;

INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
WHERE r.slug = 'administrador'
  AND p.modulo = 'dim_incidencias'
ON CONFLICT DO NOTHING;

SELECT p.modulo, p.accion, r.slug
FROM permisos p
JOIN role_permisos rp ON rp.permiso_id = p.id
JOIN roles r ON r.id = rp.role_id
WHERE p.modulo = 'dim_incidencias';
