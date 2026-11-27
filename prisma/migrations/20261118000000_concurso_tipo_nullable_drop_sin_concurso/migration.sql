-- Migración: tipoConcurso nullable + eliminar valor sin_concurso del enum
--
-- Contexto: el tipo de concurso (CPH vs CEETPS) no se conoce al registrar la
-- vacante — se define en la Etapa 1 cuando el operador elige la carrera.
-- Por eso tipoConcurso pasa a ser nullable (null = pendiente de definir).
-- sin_concurso se elimina del enum: si no hay concurso, no se crea registro.

-- 0. Dropear la vista v_pou_triangulacion que depende de tipo_concurso.
--    La vista usa agrupador y unificador_puesto que ya fueron dropeados de cargos;
--    está muerta y no se recrea.
DROP VIEW IF EXISTS v_pou_triangulacion;

-- 1. Limpiar filas con sin_concurso (si las hubiera — en dev no debería haber)
UPDATE "concursos" SET "tipo_concurso" = NULL WHERE "tipo_concurso" = 'sin_concurso';

-- 2. Hacer la columna nullable
ALTER TABLE "concursos" ALTER COLUMN "tipo_concurso" DROP NOT NULL;

-- 3. Eliminar el valor sin_concurso del enum
--    En Postgres no existe DROP VALUE; hay que recrear el enum.
--    Pasos: renombrar el viejo, crear el nuevo, migrar columnas, borrar el viejo.
ALTER TYPE "TipoConcurso" RENAME TO "TipoConcurso_old";

CREATE TYPE "TipoConcurso" AS ENUM ('cph', 'ceetps');

ALTER TABLE "concursos"
  ALTER COLUMN "tipo_concurso" TYPE "TipoConcurso"
  USING "tipo_concurso"::text::"TipoConcurso";

DROP TYPE "TipoConcurso_old";
