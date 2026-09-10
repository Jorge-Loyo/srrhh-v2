-- PS16D-1: Corrección modelo Desierto CPH

-- Paso 1: dropear el índice parcial ANTES de tocar el enum
-- (el índice referencia el tipo enum y bloquea la conversión a text)
DROP INDEX IF EXISTS concursos_cph_cargo_abierto_unique;

-- Paso 2: migrar datos existentes
UPDATE concursos_cph
SET estado = 'activo', suspendido = true
WHERE estado::text = 'desierto';

-- Paso 3: recrear enum sin 'desierto'
ALTER TABLE concursos_cph ALTER COLUMN estado DROP DEFAULT;
ALTER TABLE concursos_cph ALTER COLUMN estado TYPE text;
DROP TYPE "EstadoConcursoCph";
CREATE TYPE "EstadoConcursoCph" AS ENUM ('no_iniciado', 'activo', 'finalizado', 'suspendido');
ALTER TABLE concursos_cph ALTER COLUMN estado TYPE "EstadoConcursoCph" USING estado::"EstadoConcursoCph";
ALTER TABLE concursos_cph ALTER COLUMN estado SET DEFAULT 'no_iniciado'::"EstadoConcursoCph";

-- Paso 4: crear tabla de historial de rondas desiertas
CREATE TABLE IF NOT EXISTS "concursos_cph_desiertos" (
  "id"                     UUID        NOT NULL DEFAULT gen_random_uuid(),
  "concurso_cph_id"        UUID        NOT NULL,
  "nro_ronda"              INTEGER     NOT NULL,
  "dispo_desierta"         VARCHAR(50) NOT NULL,
  "fecha_dispo_desierta"   DATE        NOT NULL,
  "sorteo_jurado"          DATE,
  "disposicion"            VARCHAR(100),
  "fecha_insc_desde"       DATE,
  "fecha_insc_hasta"       DATE,
  "fecha_examen"           DATE,
  "fecha_orden_merito"     DATE,
  "q_inscriptos"           INTEGER,
  "ee_designacion"         VARCHAR(150),
  "carga_documentacion"    BOOLEAN,
  "fecha_apto_medico"      DATE,
  "fecha_ite"              DATE,
  "proyecto_resolucion"    BOOLEAN,
  "reso_a_la_firma"        BOOLEAN,
  "resolucion_designacion" VARCHAR(100),
  "fecha_resolucion"       DATE,
  "cargo_sial"             VARCHAR(50),
  "observaciones"          TEXT,
  "registrado_por_id"      UUID,
  "created_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "concursos_cph_desiertos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "concursos_cph_desiertos_concurso_cph_id_fkey"
    FOREIGN KEY ("concurso_cph_id") REFERENCES "concursos_cph"("id"),
  CONSTRAINT "concursos_cph_desiertos_registrado_por_id_fkey"
    FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id")
);

CREATE INDEX IF NOT EXISTS "concursos_cph_desiertos_concurso_cph_id_idx"
  ON "concursos_cph_desiertos"("concurso_cph_id");
