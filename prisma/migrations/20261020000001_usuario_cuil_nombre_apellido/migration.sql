-- Feature Perfil/Login-multi: agrega al modelo Usuario las columnas cuil
-- (clave de vinculación "de ahora en más", única), nombre y apellido.
--
-- cuil es NULLABLE a propósito: hay usuarios existentes sin CUIL (se les
-- asignará un CUIL provisorio con scripts/asignar_cuil_provisorio_usuarios.sql,
-- que se corre DESPUÉS de esta migración). El índice UNIQUE de Postgres admite
-- múltiples NULL, así que el estado intermedio no rompe la restricción.
--
-- MANUAL: NO ejecutar con `prisma migrate dev/deploy` (el backend local apunta
-- a Neon producción). El usuario corre este .sql en Neon.
ALTER TABLE usuarios ADD COLUMN cuil VARCHAR(11);
ALTER TABLE usuarios ADD COLUMN nombre VARCHAR(120);
ALTER TABLE usuarios ADD COLUMN apellido VARCHAR(120);

-- Unicidad del CUIL entre usuarios (clave de vinculación). Nombre del índice
-- `usuarios_cuil_key` para replicar la convención `<tabla>_<campo>_key` que
-- genera Prisma para `@unique`, y así evitar drift con el schema declarativo.
CREATE UNIQUE INDEX usuarios_cuil_key ON usuarios (cuil);
