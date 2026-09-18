-- Etapa 3 CPH: inscriptos al concurso (carga manual + import; cantidad autocalculada)
CREATE TABLE IF NOT EXISTS "inscriptos_concurso" (
  "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
  "concurso_cph_id"  UUID         NOT NULL,
  "apellido"         VARCHAR(120) NOT NULL,
  "nombre"           VARCHAR(120) NOT NULL,
  "dni"              VARCHAR(20),
  "cuil"             VARCHAR(20),
  "sexo"             VARCHAR(4),
  "fecha_nacimiento" DATE,
  "nacionalidad"     VARCHAR(80),
  "telefono"         VARCHAR(40),
  "email"            VARCHAR(200),
  "titulo"           VARCHAR(200),
  "matricula"        VARCHAR(80),
  "especialidad"     VARCHAR(200),
  "observaciones"    TEXT,
  "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "inscriptos_concurso_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inscriptos_concurso_concurso_cph_id_fkey"
    FOREIGN KEY ("concurso_cph_id") REFERENCES "concursos_cph"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "inscriptos_concurso_concurso_cph_id_idx"
  ON "inscriptos_concurso"("concurso_cph_id");
