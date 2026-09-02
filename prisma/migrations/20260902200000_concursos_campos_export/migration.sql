-- Campos que faltaban para poder generar los documentos de Validación/Autorización
-- exportables (Word/PDF) igual que el legacy dotacion-rrhh — ver
-- frontend/src/utils/exportReport.js ahí (getCasoCph/getCasoCeetps).

-- CPH: "puesto solicitado" distinto del puesto de la baja (casos Jefaturas/Cobertura POU).
ALTER TABLE "concursos_cph"
  ADD COLUMN "puesto_solicitado" VARCHAR(200);

-- CEETPS: caso "Enfermería — apertura 2x18hs" (1 cargo de 35hs se abre en 2 de 18hs) +
-- carga horaria general (Enfermería/Técnicos).
ALTER TABLE "concursos_ceetps"
  ADD COLUMN "carga_horaria"         SMALLINT,
  ADD COLUMN "apertura_2x18"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "informe_apertura"      VARCHAR(150),
  ADD COLUMN "expediente_concurso_2" VARCHAR(150);
