-- Backfill de padron_historico.cuil y padron_historico.unificador_puesto
-- (S6-0, prerequisito de KPIs de dotación histórica — Sprint 6).
--
-- Ejecutar con:
--   docker exec -i srrhh_postgres psql -U srrhh_user -d srrhh_db < scripts/backfill-padron-historico-kpis.sql
--
-- Idempotente: solo toca filas con cuil o unificador_puesto en NULL.

UPDATE "padron_historico" AS ph
SET "cuil" = p."cuil"
FROM "personas" AS p
WHERE ph."persona_id" = p."id"
  AND ph."cuil" IS NULL;

UPDATE "padron_historico" AS ph
SET "unificador_puesto" = c."unificador_puesto"
FROM "cargos" AS c
WHERE ph."cargo_id" = c."id"
  AND ph."unificador_puesto" IS NULL
  AND c."unificador_puesto" IS NOT NULL;

-- Verificación rápida post-backfill:
--   SELECT count(*) FILTER (WHERE cuil IS NULL) AS sin_cuil,
--          count(*) FILTER (WHERE unificador_puesto IS NULL) AS sin_unificador,
--          count(*) AS total
--   FROM padron_historico;
