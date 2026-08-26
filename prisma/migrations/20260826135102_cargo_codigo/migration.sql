-- Código interno del cargo (distinto del id_sial, que es del SIAL del
-- gobierno). Nomenclatura heredada del sistema legacy dotacion-rrhh
-- (Doc/REGLAS_NEGOCIO.MD sección 3): {CARRERA}[-{TIPO}][-{MODALIDAD}]-{seq 6 dígitos}.
-- Nullable: no todos los cargos futuros lo van a tener automáticamente
-- (el padrón semanal no lo genera, solo el flujo manual de "Alta de Cargo").
ALTER TABLE "cargos" ADD COLUMN "codigo" VARCHAR(30);
CREATE UNIQUE INDEX "cargos_codigo_key" ON "cargos"("codigo");
