-- S16-7: campo baja_origen_id en solicitudes_alta
-- Vincula una solicitud de alta con la baja que originó la vacante que viene a cubrir.

ALTER TABLE "solicitudes_alta"
  ADD COLUMN "baja_origen_id" UUID REFERENCES "bajas"("id") ON DELETE SET NULL;
