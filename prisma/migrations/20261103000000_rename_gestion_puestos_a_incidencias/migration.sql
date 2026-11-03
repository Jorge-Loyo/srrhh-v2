-- Rename del módulo "gestion-puestos" -> "incidencias".
-- El módulo es nuevo y se renombra en todas sus dimensiones (texto, ruta,
-- nombres internos y PERMISO). Acá se renombra el permiso EXISTENTE conservando
-- su id y, por lo tanto, todas sus asignaciones a roles (roles_permisos apunta
-- por id, no por modulo/accion, así que no se toca).
--
-- Un solo UPDATE por modulo cubre las dos acciones ('ver' y 'gestionar').
-- NO se borra+inserta: eso perdería el id y las asignaciones a roles.
UPDATE "permisos" SET "modulo" = 'incidencias' WHERE "modulo" = 'gestion-puestos';
