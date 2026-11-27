CREATE TABLE IF NOT EXISTS "etiquetas_concurso_ceetps" (
  "etiqueta_id" UUID NOT NULL,
  "concurso_ceetps_id" UUID NOT NULL,
  CONSTRAINT "etiquetas_concurso_ceetps_pkey" PRIMARY KEY ("etiqueta_id", "concurso_ceetps_id")
);

CREATE TABLE IF NOT EXISTS "pou_cargas" (
  "id" UUID NOT NULL,
  "archivo" VARCHAR(500) NOT NULL,
  "filas" INTEGER NOT NULL,
  "usuario_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pou_cargas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pou_especialidad_mapeo" (
  "especialidad_pou" VARCHAR(100) NOT NULL,
  "especialidad_cargo" VARCHAR(200) NOT NULL,
  CONSTRAINT "pou_especialidad_mapeo_pkey" PRIMARY KEY ("especialidad_pou", "especialidad_cargo")
);
