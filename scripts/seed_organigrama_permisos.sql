-- Permiso para el módulo "Árbol" (POST /api/v1/organigrama/upload) — reemplaza
-- toda la estructura del organigrama desde un Excel. A propósito NO se asigna
-- a ningún role_permisos: es una operación destructiva (borra y recarga la
-- tabla entera), solo "admin" entra (ver requirePermiso, que deja pasar a
-- admin siempre sin necesitar filas acá). El GET de lectura del organigrama
-- no tiene permiso — es abierto a todos los roles, igual que en la app vieja.
INSERT INTO permisos (modulo, accion, descripcion) VALUES
  ('configuracion', 'gestionar_organigrama', 'Reemplazar la estructura del organigrama (módulo Árbol) desde un Excel')
ON CONFLICT (modulo, accion) DO NOTHING;
