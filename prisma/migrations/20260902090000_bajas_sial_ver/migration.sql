-- Falta el permiso "ver" de bajas-sial en el catálogo: la migración RBAC solo sembró
-- "subir"/"aprobar" (las únicas acciones que ya estaban restringidas por requireRole en
-- ese momento). Las rutas GET de bajas-sial nunca tuvieron restricción de acceso —
-- este permiso no cambia eso, solo se usa para decidir si el menú lateral muestra
-- "Bajas Consolidadas" (mismo patrón no-enforced que padron.ver/cargos.ver/etc).

INSERT INTO "permisos" ("modulo", "accion", "descripcion") VALUES
  ('bajas-sial', 'ver', 'Ver el padrón de bajas SIAL y sus snapshots')
  ON CONFLICT (modulo, accion) DO NOTHING;

INSERT INTO "role_permisos" ("role_id", "permiso_id")
SELECT r.id, p.id
FROM "roles" r, "permisos" p
WHERE r.slug IN ('admin', 'editor', 'viewer', 'director', 'concursales_cph', 'concursales_ceetps')
  AND p.modulo = 'bajas-sial' AND p.accion = 'ver'
  ON CONFLICT DO NOTHING;
