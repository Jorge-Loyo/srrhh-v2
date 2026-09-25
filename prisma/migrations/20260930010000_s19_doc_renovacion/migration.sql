-- Sprint 19 — documento de respaldo de la renovación de período de conducción.
-- Guarda el acto administrativo que respalda la última renovación de un cargo TTR.
ALTER TABLE "cargos" ADD COLUMN IF NOT EXISTS "doc_renovacion" TEXT;
