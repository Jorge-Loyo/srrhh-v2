-- S15: Agregar baja_cargo al enum TipoAutorizacion
-- Permite que las bajas de cargo pasen por el flujo de autorización del director.
--
-- NOTA (Sprint 20, 2026-09-29): esta migración originalmente hacía
-- `ALTER TYPE "TipoAutorizacion" ADD VALUE ...`, asumiendo que el tipo ya
-- existía — pero el tipo se CREA recién en 20260911000000_s13_autorizaciones,
-- que ordena DESPUÉS por timestamp (a pesar del nombre "s13" vs "s15" del
-- archivo). `prisma migrate reset` desde una base vacía fallaba acá
-- ("type TipoAutorizacion does not exist"). Se resuelve creando el tipo acá
-- directamente (con el valor 'baja_cargo' ya incluido) de forma idempotente;
-- la migración 20260911000000_s13_autorizaciones se ajustó para no fallar si
-- el tipo ya existe.
DO $$ BEGIN
  CREATE TYPE "TipoAutorizacion" AS ENUM ('concurso_cph', 'alta_cargo', 'baja_cargo');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
