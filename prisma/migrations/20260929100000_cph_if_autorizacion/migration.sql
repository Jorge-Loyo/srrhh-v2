-- ConcursoCph: IF de autorización (nro de documento previo a solicitar la
-- autorización de SGRASV en la apertura).
ALTER TABLE "concursos_cph"
  ADD COLUMN IF NOT EXISTS "if_autorizacion" VARCHAR(150);
