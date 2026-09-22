-- S18: permisos del nuevo módulo "retenciones"
-- Idempotente (ON CONFLICT DO NOTHING) — se puede re-aplicar sin riesgo

INSERT INTO permisos (id, modulo, accion, descripcion)
VALUES
  (gen_random_uuid(), 'retenciones', 'crear', 'Registrar retención y generar cargo R/TTR'),
  (gen_random_uuid(), 'retenciones', 'ver',   'Ver cadena de retención de un cargo')
ON CONFLICT (modulo, accion) DO NOTHING;

-- admin: la migración 20260902000004 solo corrió una vez, hay que re-insertar
-- explícitamente para que el CROSS JOIN original alcance a los permisos nuevos
INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE r.slug = 'admin' AND p.modulo = 'retenciones'
ON CONFLICT DO NOTHING;

-- editor: ve la cadena (mismo criterio que el resto de módulos "ver")
INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE r.slug = 'editor' AND p.modulo = 'retenciones' AND p.accion = 'ver'
ON CONFLICT DO NOTHING;

-- sgrasv: registra retenciones y además necesita ver la cadena para decidir
INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE r.slug = 'sgrasv' AND p.modulo = 'retenciones' AND p.accion IN ('crear', 'ver')
ON CONFLICT DO NOTHING;
