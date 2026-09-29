-- Tabla de especialidades por puesto_cargo
-- Un puesto puede tener N especialidades; una especialidad puede aplicar a N puestos
CREATE TABLE "especialidades_puesto" (
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "puesto_cargo_id" UUID         NOT NULL,
  "nombre"          VARCHAR(200) NOT NULL,
  "activo"          BOOLEAN      NOT NULL DEFAULT true,
  CONSTRAINT "especialidades_puesto_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "especialidades_puesto_puesto_cargo_id_fkey"
    FOREIGN KEY ("puesto_cargo_id") REFERENCES "puestos_cargo"("id")
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "especialidades_puesto_puesto_cargo_id_nombre_key"
    UNIQUE ("puesto_cargo_id", "nombre")
);

CREATE INDEX "especialidades_puesto_puesto_cargo_id_idx"
  ON "especialidades_puesto"("puesto_cargo_id");

-- NOTA (Sprint 20, 2026-09-30): el INSERT de seed original de este archivo
-- referenciaba puesto_cargo_id de la migración 20260901_puestos_cargo, cuyo
-- seed de datos fue retirado por irreproducible desde una base vacía (ver
-- nota en 20260901_puestos_cargo/migration.sql). El catálogo de
-- especialidades se puebla ahora en `prisma/seed.ts` (S20-4).
