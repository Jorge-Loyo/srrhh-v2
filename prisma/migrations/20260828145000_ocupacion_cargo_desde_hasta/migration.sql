-- Drift encontrado verificando Sprint 2 contra un padrón real (2026-08-28):
-- Ocupacion.cargoDesdeFecha / cargoHastaFecha ya existían en schema.prisma
-- (agregadas junto con el resto de "cargo_desde/cargo_hasta, filtros URL
-- persistentes, dedup ocupaciones, export Excel fix") pero la migración que
-- las agrega a la base nunca se generó ni se comiteó — `prisma migrate
-- status` decía "up to date" (todas las migraciones comiteadas estaban
-- aplicadas) pese a que el schema.prisma real ya no coincidía con la base.
-- Confirmado con `prisma migrate diff --from-url <db> --to-schema-datamodel`.
-- Sin esto, aprobarSnapshotService fallaba (P2022 "column cargo_desde does
-- not exist") en el primer padrón real que trajera esas columnas pobladas.

ALTER TABLE "ocupaciones" ADD COLUMN "cargo_desde" DATE,
ADD COLUMN "cargo_hasta" DATE;
