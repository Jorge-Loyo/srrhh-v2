-- AlterEnum
ALTER TYPE "TipoCargaSemanal" ADD VALUE 'pou_decreto';

-- CreateTable: mapeo fijo nombre POU → sigla dim_efectores
CREATE TABLE "pou_decreto_mapeo_hospital" (
    "nombre_pou" VARCHAR(300) NOT NULL,
    "sigla"      VARCHAR(20)  NOT NULL,

    CONSTRAINT "pou_decreto_mapeo_hospital_pkey" PRIMARY KEY ("nombre_pou")
);

CREATE INDEX "pou_decreto_mapeo_hospital_sigla_idx" ON "pou_decreto_mapeo_hospital"("sigla");

ALTER TABLE "pou_decreto_mapeo_hospital"
    ADD CONSTRAINT "pou_decreto_mapeo_hospital_sigla_fkey"
    FOREIGN KEY ("sigla") REFERENCES "dim_efectores"("sigla")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: dotación normativa del decreto
CREATE TABLE "pou_decreto" (
    "id"             SERIAL       NOT NULL,
    "sigla"          VARCHAR(20)  NOT NULL,
    "perfil"         VARCHAR(100) NOT NULL,
    "especialidad"   VARCHAR(200) NOT NULL,
    "dotacion_diaria" INTEGER,
    "dotacion_sem"   INTEGER,
    "resolucion"     VARCHAR(100),
    "vigente_desde"  DATE,

    CONSTRAINT "pou_decreto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pou_decreto_sigla_perfil_especialidad_key"
    ON "pou_decreto"("sigla", "perfil", "especialidad");

CREATE INDEX "pou_decreto_sigla_idx" ON "pou_decreto"("sigla");

ALTER TABLE "pou_decreto"
    ADD CONSTRAINT "pou_decreto_sigla_fkey"
    FOREIGN KEY ("sigla") REFERENCES "dim_efectores"("sigla")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: registro de cargas del decreto
CREATE TABLE "pou_decreto_cargas" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "sesion_id"  UUID         NOT NULL,
    "archivo"    VARCHAR(500) NOT NULL,
    "filas"      INTEGER      NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pou_decreto_cargas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pou_decreto_cargas_created_at_idx" ON "pou_decreto_cargas"("created_at");

ALTER TABLE "pou_decreto_cargas"
    ADD CONSTRAINT "pou_decreto_cargas_sesion_id_fkey"
    FOREIGN KEY ("sesion_id") REFERENCES "dim_carga_sesiones"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
