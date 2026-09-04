INSERT INTO permisos (modulo, accion, descripcion) VALUES
  ('autorizaciones', 'ver',               'Ver autorizaciones propias del rol'),
  ('autorizaciones', 'resolver_director', 'Aprobar o rechazar una autorizacion (director)'),
  ('autorizaciones', 'resolver_sgrasv',   'Aprobar o rechazar una autorizacion (sgrasv)')
ON CONFLICT (modulo, accion) DO NOTHING;

INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE p.modulo = 'autorizaciones' AND p.accion = 'ver'
  AND r.slug IN ('admin','editor','director','concursales_cph','concursales_ceetps','viewer')
ON CONFLICT DO NOTHING;

INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE p.modulo = 'autorizaciones' AND p.accion = 'resolver_director'
  AND r.slug = 'director'
ON CONFLICT DO NOTHING;

INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE p.modulo = 'autorizaciones' AND p.accion = 'resolver_sgrasv'
  AND r.slug = 'sgrasv'
ON CONFLICT DO NOTHING;
