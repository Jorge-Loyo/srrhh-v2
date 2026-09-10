-- Permiso para el módulo de carga de POU (POST /api/v1/pou/upload) — reemplaza
-- toda la tabla `pou` desde un Excel. A propósito NO se asigna a ningún
-- role_permisos: es una operación destructiva, solo "admin" entra (ver
-- requirePermiso, que deja pasar a admin siempre sin necesitar filas acá).
-- Los GET de lectura de POU no tienen permiso — son abiertos a todos los
-- roles autenticados, igual que en la app vieja (POUDetalle/POUComparativa).
INSERT INTO permisos (modulo, accion, descripcion) VALUES
  ('configuracion', 'gestionar_pou', 'Reemplazar la tabla de dotación POU desde un Excel')
ON CONFLICT (modulo, accion) DO NOTHING;
