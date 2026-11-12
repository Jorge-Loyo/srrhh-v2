-- Reescritura del resumen de evolución de dotación al grano
-- (fecha, codigo_registro, situacion_revista).
--
-- El dato viejo (una fila por fecha+escalafon) NO es convertible al nuevo shape
-- (no guarda situación de revista ni código de registro), por eso se hace
-- DROP + CREATE: la tabla se re-popula íntegramente por el re-backfill
-- (scripts/backfill_kpis_dotacion.sql) que corre el USUARIO después de aplicar
-- esta migración.

DROP TABLE IF EXISTS "kpis_dotacion_snapshot";

CREATE TABLE "kpis_dotacion_snapshot" (
    "fecha" DATE NOT NULL,
    "codigo_registro" VARCHAR(20) NOT NULL,
    "situacion_revista" VARCHAR(50) NOT NULL,
    "personas" INTEGER NOT NULL,

    CONSTRAINT "kpis_dotacion_snapshot_pkey" PRIMARY KEY ("fecha", "codigo_registro", "situacion_revista")
);

CREATE INDEX "kpis_dotacion_snapshot_fecha_idx" ON "kpis_dotacion_snapshot"("fecha");
