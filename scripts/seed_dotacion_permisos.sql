-- Permiso de acceso a las pantallas "Dotación" / "Dotación Total" migradas
-- del legacy (dotacion-rrhh). Mismo patrón que scripts/seed_pou_permisos.sql:
-- solo da de alta la fila en `permisos`; la asignación a roles concretos se
-- hace desde el módulo de administración de roles/permisos ya existente.
INSERT INTO permisos (modulo, accion, descripcion) VALUES
  ('dotacion', 'ver', 'Ver el listado de dotación (tabla + panel de KPIs)')
ON CONFLICT (modulo, accion) DO NOTHING;
