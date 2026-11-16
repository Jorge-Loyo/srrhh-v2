-- Sprint 25: SGRASV kanban de concursos y asignación de siglas.
-- Dos tablas nuevas. Idempotente (IF NOT EXISTS).
-- MANUAL: no ejecutar con prisma migrate dev/deploy contra ninguna base real.

-- Siglas asignadas a cada supervisor (configuración estable).
-- PK compuesta (usuario_id, hospital_id): un supervisor puede tener N hospitales.
CREATE TABLE IF NOT EXISTS usuario_siglas (
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES hospitales(id) ON DELETE CASCADE,
  CONSTRAINT usuario_siglas_pkey PRIMARY KEY (usuario_id, hospital_id)
);
CREATE INDEX IF NOT EXISTS usuario_siglas_hospital_id_idx ON usuario_siglas (hospital_id);

-- Asignación directa de un concurso (CPH o CEETPS) a un supervisor (temporal/puntual).
-- PK en (referencia_id, referencia_tipo): un concurso tiene como máximo una asignación activa.
-- usuario_id NULL = sin asignar (devuelto al pool de SGRASV).
-- referencia_tipo: 'concurso_cph' | 'concurso_ceetps'
CREATE TABLE IF NOT EXISTS concursos_asignados (
  referencia_id   UUID        NOT NULL,
  referencia_tipo VARCHAR(20) NOT NULL,
  usuario_id      UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  asignado_por_id UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT concursos_asignados_pkey PRIMARY KEY (referencia_id, referencia_tipo)
);
CREATE INDEX IF NOT EXISTS concursos_asignados_usuario_id_idx ON concursos_asignados (usuario_id);
