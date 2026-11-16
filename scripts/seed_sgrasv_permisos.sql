-- Sprint 25: permisos para kanban SGRASV y kanban supervisor.
-- La jerarquía supervision_de_concursos_4ff21d6 → sgrasv_5ac494e
-- ya existe (fix_roles_jerarquia_desde_neon.sql). Solo se agregan permisos.
-- Idempotente (ON CONFLICT DO NOTHING).

INSERT INTO permisos (id, modulo, accion, descripcion) VALUES
  (gen_random_uuid(), 'tareas', 'ver_kanban_sgrasv',     'Ver kanban de gestión de concursos (SGRASV)'),
  (gen_random_uuid(), 'tareas', 'ver_kanban_supervisor', 'Ver kanban propio de concursos por estado'),
  (gen_random_uuid(), 'tareas', 'asignar_concurso',      'Asignar o reasignar un concurso a un supervisor')
ON CONFLICT (modulo, accion) DO NOTHING;

-- SGRASV: los 3 permisos
INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
WHERE p.modulo = 'tareas'
  AND p.accion IN ('ver_kanban_sgrasv', 'ver_kanban_supervisor', 'asignar_concurso')
  AND r.slug = 'sgrasv_5ac494e'
ON CONFLICT DO NOTHING;

-- Supervisor de concursos: solo ver_kanban_supervisor
INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
WHERE p.modulo = 'tareas'
  AND p.accion = 'ver_kanban_supervisor'
  AND r.slug = 'supervision_de_concursos_4ff21d6'
ON CONFLICT DO NOTHING;

-- Verificación
SELECT r.slug, p.modulo, p.accion
FROM role_permisos rp
JOIN roles r    ON r.id = rp.role_id
JOIN permisos p ON p.id = rp.permiso_id
WHERE p.modulo = 'tareas'
ORDER BY r.slug, p.accion;
