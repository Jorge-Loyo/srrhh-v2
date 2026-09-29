-- Crear enum y tabla puestos_cargo
CREATE TYPE "ModalidadPuesto" AS ENUM ('pof', 'pou', 'ambos');

CREATE TABLE "puestos_cargo" (
  "id"           UUID             NOT NULL DEFAULT gen_random_uuid(),
  "escalafon_id" UUID             NOT NULL,
  "modalidad"    "ModalidadPuesto" NOT NULL,
  "nombre"       VARCHAR(200)     NOT NULL,
  "activo"       BOOLEAN          NOT NULL DEFAULT true,
  CONSTRAINT "puestos_cargo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "puestos_cargo_escalafon_id_fkey"
    FOREIGN KEY ("escalafon_id") REFERENCES "escalafones"("id")
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "puestos_cargo_escalafon_id_modalidad_nombre_key"
    UNIQUE ("escalafon_id", "modalidad", "nombre")
);

CREATE INDEX "puestos_cargo_escalafon_id_modalidad_idx"
  ON "puestos_cargo"("escalafon_id", "modalidad");

-- NOTA (Sprint 20, 2026-09-30): esta migración originalmente sembraba ~140
-- puestos con INSERT que referenciaban ids de escalafón hardcodeados
-- (creados a mano en la base de desarrollo de esa sesión, nunca via
-- migración) — irreproducible desde una base vacía (`prisma migrate reset`
-- fallaba acá por violación de FK). El catálogo real de puesto/especialidad
-- pasa a poblarse en `prisma/seed.ts` a partir de
-- `prisma/catalogo-puestos-curado.json` (extraído y curado de los cargos
-- reales de producción/desarrollo, keyed por `escalafon.codigo` estable en
-- vez de un id hardcodeado) — ver S20-4 en
-- Doc/Planificacion/Sprints/SPRINT_20_consolidacion_puesto_escalafon_especialidad.md.
