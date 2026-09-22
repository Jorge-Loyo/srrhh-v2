-- S18-1: índice parcial separado (precedente: PS16D tuvo problemas aplicando
-- CREATE INDEX junto con el resto de la migración por el shadow DB roto)

CREATE INDEX "idx_cargos_periodo_hasta" ON "cargos" ("periodo_hasta")
  WHERE "periodo_hasta" IS NOT NULL AND "estado" = 'vigente';
