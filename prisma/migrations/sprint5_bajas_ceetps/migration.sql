-- Sprint 5: modelo Baja (S5-4) + bajaId nullable en Concurso (S5-5)

CREATE TYPE "EstadoBaja" AS ENUM ('pendiente', 'confirmada', 'anulada');

CREATE TABLE "bajas" (
    "id"                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    "cargo_id"            UUID        NOT NULL,
    "hospital_id"         UUID        NOT NULL,
    "persona_id"          UUID,
    "fecha_baja"          DATE        NOT NULL,
    "tipo_baja"           VARCHAR(100),
    "motivo"              VARCHAR(500),
    "tipificador_origen"  VARCHAR(200),
    "genera_concurso"     BOOLEAN     NOT NULL DEFAULT true,
    "estado"              "EstadoBaja" NOT NULL DEFAULT 'pendiente',
    "observaciones"       TEXT,
    "registrado_por"      UUID,
    "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "bajas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bajas_cargo_id_fkey"    FOREIGN KEY ("cargo_id")    REFERENCES "cargos"("id"),
    CONSTRAINT "bajas_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitales"("id"),
    CONSTRAINT "bajas_persona_id_fkey"  FOREIGN KEY ("persona_id")  REFERENCES "personas"("id"),
    CONSTRAINT "bajas_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "usuarios"("id")
);

CREATE INDEX "bajas_cargo_id_idx"    ON "bajas"("cargo_id");
CREATE INDEX "bajas_hospital_id_idx" ON "bajas"("hospital_id");
CREATE INDEX "bajas_estado_idx"      ON "bajas"("estado");

-- bajaId nullable en concursos: hay concursos por ampliación sin baja previa
ALTER TABLE "concursos" ADD COLUMN "baja_id" UUID;
ALTER TABLE "concursos" ADD CONSTRAINT "concursos_baja_id_fkey"
    FOREIGN KEY ("baja_id") REFERENCES "bajas"("id");
