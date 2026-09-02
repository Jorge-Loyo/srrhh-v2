-- Seed RBAC: asignar permisos canónicos a cada rol
-- Idempotente (ON CONFLICT DO NOTHING) — se puede re-aplicar sin riesgo

-- admin: todos los permisos
INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p WHERE r.slug = 'admin'
ON CONFLICT DO NOTHING;

-- editor: todo excepto configuracion gestionar_*
INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE r.slug = 'editor'
  AND NOT (p.modulo = 'configuracion' AND p.accion IN ('gestionar_usuarios', 'gestionar_permisos'))
ON CONFLICT DO NOTHING;

-- director: ver todo + autorizar concursos-cph + resolver autorizaciones
INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE r.slug = 'director'
  AND (
    p.accion = 'ver'
    OR (p.modulo = 'concursos-cph'   AND p.accion = 'autorizar')
    OR (p.modulo = 'autorizaciones'  AND p.accion = 'resolver')
  )
ON CONFLICT DO NOTHING;

-- concursales_cph: ver todo + crear/editar concursos-cph + crear bajas + crear autorizaciones
INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE r.slug = 'concursales_cph'
  AND (
    p.accion = 'ver'
    OR (p.modulo = 'concursos-cph'  AND p.accion IN ('crear', 'editar'))
    OR (p.modulo = 'bajas'          AND p.accion = 'crear')
    OR (p.modulo = 'autorizaciones' AND p.accion = 'crear')
  )
ON CONFLICT DO NOTHING;

-- concursales_ceetps: ver todo + crear/editar concursos-ceetps + crear bajas + crear autorizaciones
INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE r.slug = 'concursales_ceetps'
  AND (
    p.accion = 'ver'
    OR (p.modulo = 'concursos-ceetps' AND p.accion IN ('crear', 'editar'))
    OR (p.modulo = 'bajas'            AND p.accion = 'crear')
    OR (p.modulo = 'autorizaciones'   AND p.accion = 'crear')
  )
ON CONFLICT DO NOTHING;

-- viewer: solo ver
INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE r.slug = 'viewer' AND p.accion = 'ver'
ON CONFLICT DO NOTHING;
