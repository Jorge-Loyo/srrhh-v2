CREATE TABLE organigrama_uploads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename      VARCHAR(255) NOT NULL,
  filas         INTEGER NOT NULL,
  subido_por_id UUID REFERENCES usuarios(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
