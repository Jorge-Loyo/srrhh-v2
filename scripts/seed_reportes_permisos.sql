-- Permiso de acceso al módulo "Reportes" (constructor de reportes/conteos
-- sobre Dotación). Mismo patrón que scripts/seed_dotacion_permisos.sql:
-- solo da de alta la fila en `permisos`; la asignación a roles concretos se
-- hace desde el módulo de administración de roles/permisos ya existente.
-- id explícito (gen_random_uuid()) porque en esta base la columna permisos.id
-- no tiene el DEFAULT que sí declara la migración 20260901120000_rbac_dinamico
-- (se perdió en algún momento, ver historial de migraciones) — no lo toco acá,
-- es un tema de esquema aparte; esto solo evita que el INSERT falle por NOT NULL.
INSERT INTO permisos (id, modulo, accion, descripcion) VALUES
  (gen_random_uuid(), 'reportes', 'ver', 'Ver y exportar reportes de dotación')
ON CONFLICT (modulo, accion) DO NOTHING;
