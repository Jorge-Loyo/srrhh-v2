-- Regla de negocio (Jorge): en el alta de cargos, para TODOS los puestos de
-- enfermería (licenciado o enfermero) la especialidad solo puede ser
-- "Enfermeros ATP" o "Enfermeros ATC". Esas dos especialidades no existen en el
-- catálogo: esta migración las crea, una fila por puesto (especialidades_puesto
-- es por puesto: unique (puesto_cargo_id, nombre), sin especialidades
-- compartidas entre puestos).
--
-- Puestos alcanzados (espejo de esPuestoEnfermeria en
-- apps/web/src/modules/cargos/lib/especialidadesAlta.ts y
-- apps/api/src/shared/especialidadesEnfermeria.ts): nombre que contiene
-- "enfermer" (sin acentos, sin importar mayúsculas), salvo los que empiezan con
-- "auxiliar" (auxiliar de enfermería) o "cuidador" (cuidador enfermero de
-- animales). Se incluyen puestos activos e inactivos, para que un puesto
-- reactivado ya las tenga.
--
-- Solo agrega filas. No modifica ni borra especialidades existentes (p. ej.
-- "enfermeria") ni cargos que las referencian.
--
-- Idempotente: INSERT ... WHERE NOT EXISTS por puesto y nombre (comparación
-- sin mayúsculas ni espacios extremos), así re-ejecutarla no duplica y no choca
-- con una variante ya cargada a mano ("enfermeros atp").
--
-- MANUAL: NO ejecutar con `prisma migrate dev/deploy` (el backend local apunta
-- a Neon producción). Jorge corre este .sql a mano en Neon Y la marca resuelta
-- ANTES del push, porque Render corre `prisma migrate deploy` en cada arranque
-- (Doc/Desarrollo/DEPLOY_PRODUCCION.md sección 7, trampa 1):
--   psql "$NEON_DIRECT" -f prisma/migrations/20261114000000_especialidades_enfermeria_atp_atc/migration.sql
--   DATABASE_URL="$NEON_DIRECT" npx prisma migrate resolve --applied 20261114000000_especialidades_enfermeria_atp_atc --schema=./prisma/schema.prisma
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo, pendiente_curar)
SELECT gen_random_uuid(), pc.id, e.nombre, true, false
FROM puestos_cargo pc
CROSS JOIN (VALUES ('Enfermeros ATP'), ('Enfermeros ATC')) AS e(nombre)
WHERE translate(lower(pc.nombre), 'áéíóúü', 'aeiouu') LIKE '%enfermer%'
  AND translate(lower(btrim(pc.nombre)), 'áéíóúü', 'aeiouu') NOT LIKE 'auxiliar%'
  AND translate(lower(btrim(pc.nombre)), 'áéíóúü', 'aeiouu') NOT LIKE 'cuidador%'
  AND NOT EXISTS (
    SELECT 1 FROM especialidades_puesto ep
    WHERE ep.puesto_cargo_id = pc.id
      AND lower(btrim(ep.nombre)) = lower(e.nombre)
  );
