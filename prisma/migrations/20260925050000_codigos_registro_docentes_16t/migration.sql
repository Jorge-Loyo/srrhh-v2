-- Hallazgo 2026-09-14 aprobando altas reales de un padrón: `codigos_registro`
-- (tabla que SÍ consulta padron.service.ts vía el modelo Prisma
-- `CodigoRegistro`, ver resolución de escalafón en aprobarDiffNuevoService)
-- le faltaban las filas para los códigos '07' (Docentes Históricos) y '16T'
-- (Plantas Transitorias Modulo Operativo) — por eso la resolución de
-- escalafón caía al fallback por nombre, que filtra por `activo = true` y
-- fallaba (el nombre crudo del archivo, "Docentes", corresponde a un
-- escalafón viejo ya inactivo; el vigente es "Docentes Históricos").
--
-- Alguien ya había diagnosticado esto el 2026-09-02 (migraciones
-- 20260902000002_escalafon_16T y 20260902000003_unificar_docentes) pero
-- escribió el fix en una tabla distinta y sin uso real en el código:
-- `escalafon_codigos_registro` — no tiene modelo en schema.prisma ni la
-- consulta ningún código (Node ni Python). Esta migración aplica el mismo
-- fix a la tabla que el código realmente lee.
INSERT INTO "codigos_registro" (id, codigo, literal, escalafon_id, created_at, updated_at)
SELECT gen_random_uuid(), '07', 'Docentes Históricos', id, NOW(), NOW()
FROM "escalafones" WHERE nombre = 'Docentes Históricos' AND activo = true
ON CONFLICT DO NOTHING;

INSERT INTO "codigos_registro" (id, codigo, literal, escalafon_id, created_at, updated_at)
SELECT gen_random_uuid(), '16T', 'Plantas Transitorias Modulo Operativo', id, NOW(), NOW()
FROM "escalafones" WHERE nombre = 'Plantas Transitorias Modulo Operativo' AND activo = true
ON CONFLICT DO NOTHING;
