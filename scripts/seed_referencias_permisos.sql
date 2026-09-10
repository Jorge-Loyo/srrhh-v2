-- Catálogo de permisos para el módulo de administración de tablas de
-- referencia de Dotaneitor (apps/api/src/modules/referencias). A propósito NO
-- se asigna a ningún role_permisos: son tablas técnicas del pipeline de
-- Dotaneitor, no datos de uso diario por las áreas — solo "admin" entra (ver
-- requirePermiso, que deja pasar a admin siempre sin necesitar filas acá).
-- Si en el futuro hace falta abrirlo a otro rol, se asigna desde
-- /configuracion/permisos sin tocar código.
INSERT INTO permisos (modulo, accion, descripcion) VALUES
  ('configuracion', 'gestionar_referencias', 'Administrar tablas de referencia de Dotaneitor (agrupadores, unificadores, especialidades por CUIL, etc.)')
ON CONFLICT (modulo, accion) DO NOTHING;
