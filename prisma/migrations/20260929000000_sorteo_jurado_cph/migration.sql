-- Etapa 2 CPH: sorteo de jurado (acta + miembros titulares/suplentes)

-- Acta del sorteo de jurado
CREATE TABLE IF NOT EXISTS "sorteos_jurado" (
  "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
  "concurso_cph_id"   UUID        NOT NULL,
  "fecha_sorteo"      DATE        NOT NULL,
  "semilla"           VARCHAR(64) NOT NULL,
  "criterios"         JSONB       NOT NULL,
  "ambito"            VARCHAR(20) NOT NULL,
  "observaciones"     TEXT,
  "generado_por_id"   UUID,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "sorteos_jurado_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sorteos_jurado_concurso_cph_id_fkey"
    FOREIGN KEY ("concurso_cph_id") REFERENCES "concursos_cph"("id"),
  CONSTRAINT "sorteos_jurado_generado_por_id_fkey"
    FOREIGN KEY ("generado_por_id") REFERENCES "usuarios"("id")
);

CREATE INDEX IF NOT EXISTS "sorteos_jurado_concurso_cph_id_idx"
  ON "sorteos_jurado"("concurso_cph_id");

-- Miembros del jurado sorteado (titulares/suplentes)
CREATE TABLE IF NOT EXISTS "miembros_jurado_sorteados" (
  "id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
  "sorteo_jurado_id"    UUID         NOT NULL,
  "persona_id"          UUID         NOT NULL,
  "rol"                 VARCHAR(10)  NOT NULL,
  "orden"               INTEGER      NOT NULL,
  "apellido_nombre"     VARCHAR(200) NOT NULL,
  "cuil"                VARCHAR(11)  NOT NULL,
  "hospital_id"         UUID,
  "hospital_nombre"     VARCHAR(200),
  "puesto"              VARCHAR(200),
  "especialidad"        VARCHAR(200),
  "ambito"              VARCHAR(20)  NOT NULL,
  "cumple_especialidad" BOOLEAN      NOT NULL DEFAULT false,
  "es_conduccion"       BOOLEAN      NOT NULL DEFAULT false,
  "antiguedad_anios"    INTEGER,
  "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "miembros_jurado_sorteados_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "miembros_jurado_sorteados_sorteo_jurado_id_fkey"
    FOREIGN KEY ("sorteo_jurado_id") REFERENCES "sorteos_jurado"("id") ON DELETE CASCADE,
  CONSTRAINT "miembros_jurado_sorteados_persona_id_fkey"
    FOREIGN KEY ("persona_id") REFERENCES "personas"("id")
);

CREATE INDEX IF NOT EXISTS "miembros_jurado_sorteados_sorteo_jurado_id_idx"
  ON "miembros_jurado_sorteados"("sorteo_jurado_id");
