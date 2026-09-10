-- Permisos de la pantalla "Auditoría" (migración del módulo Seguridad
-- legacy). Ver y purgar son capacidades separadas a propósito — mismo
-- patrón que scripts/seed_pou_permisos.sql / seed_organigrama_permisos.sql:
-- solo da de alta las filas en `permisos`, la asignación a roles se hace
-- desde el módulo de administración de roles/permisos ya existente.
INSERT INTO permisos (modulo, accion, descripcion) VALUES
  ('configuracion', 'ver_auditoria', 'Ver el log de auditoría'),
  ('configuracion', 'purgar_auditoria', 'Purgar (borrar) el log de auditoría más viejo que N días')
ON CONFLICT (modulo, accion) DO NOTHING;
