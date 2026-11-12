-- Sub-estado del cargo (SPRINT_estado_subestado_cargo.md, decisión A1-corregido):
-- agrega el enum Postgres `SubEstadoCargo` y la columna PERSISTIDA
-- `cargos.sub_estado` (nullable: null cuando el cargo NO es `vigente`). Los 3
-- valores { ocupado, vacante, concurso } son mutuamente excluyentes — un cargo
-- vigente tiene exactamente uno. NO se agregan valores al enum `EstadoCargo`.
--
-- Nombres de tipo/índice estilo Prisma (`SubEstadoCargo`, `cargos_sub_estado_idx`)
-- para no divergir del schema declarativo. Todo idempotente (IF NOT EXISTS) para
-- poder re-correrlo sin error.
--
-- MANUAL: NO ejecutar con `prisma migrate dev/deploy` (el backend local apunta
-- a Neon producción). El usuario (Jorge) corre este .sql en Neon.
--
-- El BACKFILL de datos (poblar sub_estado en los cargos existentes) va aparte,
-- en apps/api/scripts/backfill_sub_estado_cargo.sql — tampoco se ejecuta acá.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubEstadoCargo') THEN
        CREATE TYPE "SubEstadoCargo" AS ENUM ('ocupado', 'vacante', 'concurso');
    END IF;
END
$$;

ALTER TABLE cargos ADD COLUMN IF NOT EXISTS sub_estado "SubEstadoCargo";

CREATE INDEX IF NOT EXISTS cargos_sub_estado_idx ON cargos (sub_estado);
