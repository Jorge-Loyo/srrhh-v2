-- S24-3: marca de los cargos de conducción generados a partir del organigrama
-- (S24-4) para distinguirlos de los que vienen del padrón o del alta manual, y
-- poder re-sincronizarlos sin tocar los reales. Más la señalización de calidad
-- de dato (revisión por RRHH) de los casos detectados en el análisis S24-2
-- (régimen inconsistente con el escalafón del personal, o nodo sin dotación).
--
--   origen:          'padron' (default) | 'organigrama' | 'manual'
--   revision_dato:   true cuando el cargo generado necesita revisión manual
--   revision_motivo: texto del motivo (p.ej. 'sin presencia en dotación')
ALTER TABLE "cargos"
  ADD COLUMN IF NOT EXISTS "origen" VARCHAR(15) NOT NULL DEFAULT 'padron',
  ADD COLUMN IF NOT EXISTS "revision_dato" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "revision_motivo" VARCHAR(200);

-- Índice parcial para listar rápido las vacantes de conducción generadas
-- (origen='organigrama') — es el filtro base de la vista/KPI de vacantes (S24-9).
CREATE INDEX IF NOT EXISTS "cargos_origen_idx" ON "cargos" ("origen") WHERE "origen" <> 'padron';
