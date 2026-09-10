-- Migración de funcionalidad legacy (dotacion-rrhh -> v2): módulo POU (resumen
-- de dotación por hospital/perfil/especialidad). Tabla nueva, vacía hasta que
-- un admin suba el Excel mensual desde /pou/carga. Sin período/histórico a
-- propósito (ver comentario del modelo en schema.prisma) — cada carga
-- reemplaza la tabla entera.

-- CreateTable
CREATE TABLE "pou" (
    "id" UUID NOT NULL,
    "sigla" VARCHAR(10) NOT NULL,
    "descripcion_sigla" VARCHAR(100),
    "perfil" VARCHAR(50) NOT NULL,
    "especialidad" VARCHAR(100) NOT NULL,
    "dotacion_diaria" INTEGER,
    "dotacion_sem" INTEGER,
    "dotacion_total" INTEGER,
    "activos" INTEGER,
    "tecnicos" INTEGER,
    "vacantes" INTEGER,

    CONSTRAINT "pou_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pou_sigla_perfil_especialidad_key" ON "pou"("sigla", "perfil", "especialidad");

-- CreateIndex
CREATE INDEX "pou_sigla_idx" ON "pou"("sigla");
