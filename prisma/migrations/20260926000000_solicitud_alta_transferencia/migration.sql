ALTER TABLE solicitudes_alta ADD COLUMN IF NOT EXISTS es_transferencia BOOLEAN NOT NULL DEFAULT false;
