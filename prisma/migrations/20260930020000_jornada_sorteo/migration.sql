-- Jornada de sorteos CPH: agenda de un día para sortear jurados de varios
-- concursos juntos. v1: fecha + concursos asociados (deben estar en B-SORTEO JUR).

CREATE TABLE "jornadas_sorteo" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "fecha"         DATE NOT NULL,
  "titulo"        VARCHAR(200),
  "estado"        VARCHAR(20) NOT NULL DEFAULT 'planificada',
  "observaciones" TEXT,
  "created_by_id" UUID,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ NOT NULL,
  CONSTRAINT "jornadas_sorteo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "jornadas_sorteo_fecha_idx" ON "jornadas_sorteo"("fecha");

ALTER TABLE "jornadas_sorteo"
  ADD CONSTRAINT "jornadas_sorteo_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "jornada_sorteo_concursos" (
  "jornada_id"      UUID NOT NULL,
  "concurso_cph_id" UUID NOT NULL,
  CONSTRAINT "jornada_sorteo_concursos_pkey" PRIMARY KEY ("jornada_id", "concurso_cph_id")
);

CREATE INDEX "jornada_sorteo_concursos_concurso_cph_id_idx" ON "jornada_sorteo_concursos"("concurso_cph_id");

ALTER TABLE "jornada_sorteo_concursos"
  ADD CONSTRAINT "jornada_sorteo_concursos_jornada_id_fkey"
  FOREIGN KEY ("jornada_id") REFERENCES "jornadas_sorteo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "jornada_sorteo_concursos"
  ADD CONSTRAINT "jornada_sorteo_concursos_concurso_cph_id_fkey"
  FOREIGN KEY ("concurso_cph_id") REFERENCES "concursos_cph"("id") ON DELETE CASCADE ON UPDATE CASCADE;
