-- Sprint 20 — Consolidación de catálogo Puesto/Escalafón/Especialidad.
--
-- ADVERTENCIA: esta migración agrega FKs NOT NULL a `cargos.puesto_cargo_id`
-- y `solicitudes_alta.puesto_cargo_id` asumiendo que esas tablas están
-- VACÍAS al momento de aplicarla — solo es segura como parte de un
-- `prisma migrate reset` completo (S20-5), nunca contra una base con datos
-- reales ya cargados. Ver Doc/Planificacion/Sprints/
-- SPRINT_20_consolidacion_puesto_escalafon_especialidad.md.

-- ── PuestoCargo: flag de auto-creación pendiente de revisión (S20-6) ────────
ALTER TABLE "puestos_cargo" ADD COLUMN "pendiente_curar" BOOLEAN NOT NULL DEFAULT false;

-- ── Cargo: FK real al catálogo (S20-2) ──────────────────────────────────────
ALTER TABLE "cargos" ADD COLUMN "puesto_cargo_id" UUID NOT NULL;
ALTER TABLE "cargos" ADD COLUMN "especialidad_puesto_id" UUID;

ALTER TABLE "cargos" ADD CONSTRAINT "cargos_puesto_cargo_id_fkey"
  FOREIGN KEY ("puesto_cargo_id") REFERENCES "puestos_cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_especialidad_puesto_id_fkey"
  FOREIGN KEY ("especialidad_puesto_id") REFERENCES "especialidades_puesto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "cargos_puesto_cargo_id_idx" ON "cargos"("puesto_cargo_id");
CREATE INDEX "cargos_especialidad_puesto_id_idx" ON "cargos"("especialidad_puesto_id");

-- ── SolicitudAlta: mismo patrón (S20-3) ─────────────────────────────────────
ALTER TABLE "solicitudes_alta" ADD COLUMN "puesto_cargo_id" UUID NOT NULL;
ALTER TABLE "solicitudes_alta" ADD COLUMN "especialidad_puesto_id" UUID;

ALTER TABLE "solicitudes_alta" ADD CONSTRAINT "solicitudes_alta_puesto_cargo_id_fkey"
  FOREIGN KEY ("puesto_cargo_id") REFERENCES "puestos_cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "solicitudes_alta" ADD CONSTRAINT "solicitudes_alta_especialidad_puesto_id_fkey"
  FOREIGN KEY ("especialidad_puesto_id") REFERENCES "especialidades_puesto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "solicitudes_alta_puesto_cargo_id_idx" ON "solicitudes_alta"("puesto_cargo_id");

-- ── ConcursoCph: puesto/especialidad solicitados — nullable (S20-3) ────────
ALTER TABLE "concursos_cph" ADD COLUMN "puesto_cargo_solicitado_id" UUID;
ALTER TABLE "concursos_cph" ADD COLUMN "especialidad_puesto_solicitada_id" UUID;

ALTER TABLE "concursos_cph" ADD CONSTRAINT "concursos_cph_puesto_cargo_solicitado_id_fkey"
  FOREIGN KEY ("puesto_cargo_solicitado_id") REFERENCES "puestos_cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "concursos_cph" ADD CONSTRAINT "concursos_cph_especialidad_puesto_solicitada_id_fkey"
  FOREIGN KEY ("especialidad_puesto_solicitada_id") REFERENCES "especialidades_puesto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── ConcursoCeetps: puesto solicitado — nullable (S20-3) ────────────────────
ALTER TABLE "concursos_ceetps" ADD COLUMN "puesto_cargo_solicitado_id" UUID;

ALTER TABLE "concursos_ceetps" ADD CONSTRAINT "concursos_ceetps_puesto_cargo_solicitado_id_fkey"
  FOREIGN KEY ("puesto_cargo_solicitado_id") REFERENCES "puestos_cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
