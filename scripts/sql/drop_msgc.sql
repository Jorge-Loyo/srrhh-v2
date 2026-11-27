-- 8.4 — Dropear tablas msgc_* (datos ya migrados a dim_*)
-- Ejecutar: psql $DATABASE_URL -f scripts/sql/drop_msgc.sql

DROP TABLE IF EXISTS msgc_hechos_cargo_persona CASCADE;
DROP TABLE IF EXISTS msgc_cargos CASCADE;
DROP TABLE IF EXISTS msgc_personas CASCADE;
DROP TABLE IF EXISTS msgc_puestos CASCADE;
