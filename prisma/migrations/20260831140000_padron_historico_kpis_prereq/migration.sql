-- S6-0: prerequisito de PLAN_SCRUM_2026.md (decisión 2026-08-26) para los
-- KPIs de dotación histórica de Sprint 6.
--
-- Sin "cuil" no se pueden contar personas únicas por período sin join a
-- personas; sin "unificador_puesto" no se puede analizar dotación por tipo
-- de puesto a lo largo del tiempo; sin índice por cargo_id, el historial de
-- un cargo hacía seq scan sobre toda la tabla.
--
-- Ambas columnas nullable: las filas históricas existentes no las tienen
-- hasta que corra scripts/backfill-padron-historico-kpis.sql (mismo patrón
-- que "codigo" en cargos, ver 20260826135102_cargo_codigo). Toda fila nueva
-- (aprobarSnapshotService, padron.service.ts) ya las completa siempre.

ALTER TABLE "padron_historico" ADD COLUMN "cuil" VARCHAR(11);
ALTER TABLE "padron_historico" ADD COLUMN "unificador_puesto" VARCHAR(200);

CREATE INDEX "padron_historico_cargo_id_idx" ON "padron_historico"("cargo_id");
CREATE INDEX "padron_historico_cuil_idx" ON "padron_historico"("cuil");
