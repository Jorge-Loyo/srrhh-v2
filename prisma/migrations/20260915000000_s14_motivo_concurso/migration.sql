-- S14-1: enum MotivoConcurso + campo en concursos + tipo concurso_iniciado en notificaciones

CREATE TYPE "MotivoConcurso" AS ENUM ('nuevo_cargo', 'alta_por_baja');

ALTER TABLE "concursos" ADD COLUMN "motivo_concurso" "MotivoConcurso";

ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'concurso_iniciado';
