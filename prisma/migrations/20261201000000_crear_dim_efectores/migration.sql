-- CreateTable dim_efectores
CREATE TABLE "dim_efectores" (
    "sigla"                VARCHAR(20)  NOT NULL,
    "nombre"               VARCHAR(200),
    "nombre_completo"      VARCHAR(300),
    "nombre_resumido"      VARCHAR(200),
    "tipo"                 VARCHAR(100),
    "universo_totalizador" VARCHAR(100),
    "monovalencia"         VARCHAR(100),
    "comuna"               VARCHAR(50),
    "tamanio"              VARCHAR(30),
    "tipificacion_ssah"    VARCHAR(100),
    "activo"               BOOLEAN      NOT NULL DEFAULT true,
    "en_hospitales"        BOOLEAN      NOT NULL DEFAULT false,
    CONSTRAINT "dim_efectores_pkey" PRIMARY KEY ("sigla")
);

-- AlterTable dim_puestos: ampliar efector a VARCHAR(20)
ALTER TABLE "dim_puestos" ALTER COLUMN "efector" TYPE VARCHAR(20);

-- AddForeignKey dim_puestos.efector -> dim_efectores.sigla
-- NOT VALID: no valida filas existentes al crear la constraint.
-- Ejecutar VALIDATE CONSTRAINT después de poblar dim_efectores con todas las siglas.
ALTER TABLE "dim_puestos"
    ADD CONSTRAINT "dim_puestos_efector_fkey"
    FOREIGN KEY ("efector") REFERENCES "dim_efectores"("sigla")
    ON DELETE SET NULL ON UPDATE CASCADE
    NOT VALID;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "dim_puestos_efector_idx" ON "dim_puestos"("efector");
