-- Migración faltante (Agustin, 2026-09-02): el flujo de autorizaciones CPH de S11-1..S11-4
-- agregó a `schema.prisma` los campos `aprobadoDirector`, `siglaSolicitada` y
-- `codigoRegistroSolicitadoId` en `ConcursoCph`, y `concursos-cph.service.ts` ya los usa
-- (aprobarAutorizacionCphService, patchConcursoCphService), pero solo `pendiente_autorizacion`
-- llegó a tener migración (20260906000000). Las otras 3 columnas nunca se crearon en la base —
-- cualquier GET /concursos-cph rompía con P2022 ("column does not exist"). Detectado corriendo
-- el flujo real tras el merge, no por review de código.

ALTER TABLE concursos_cph
  ADD COLUMN IF NOT EXISTS aprobado_director BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sigla_solicitada VARCHAR(20),
  ADD COLUMN IF NOT EXISTS codigo_registro_solicitado_id UUID REFERENCES codigos_registro(id);
