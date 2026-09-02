ALTER TABLE concursos_cph ADD COLUMN IF NOT EXISTS pendiente_autorizacion BOOLEAN NOT NULL DEFAULT false;
