-- Fase 4.3: dim_tipos_cargos + dim_especialidades
-- dim_tipos_cargos: catálogo deduplicado de (codigo_registro, nombre_cargo) con clasificación tipo_cargo
-- dim_especialidades: especialidades por tipo de cargo
-- dim_cargos gana FK tipo_cargo_id

CREATE TABLE dim_tipos_cargos (
  id               SERIAL PRIMARY KEY,
  codigo_registro  VARCHAR(10)  NOT NULL REFERENCES dim_carreras(codigo_registro),
  nombre           VARCHAR(200) NOT NULL,
  tipo_cargo       VARCHAR(20)  NOT NULL DEFAULT 'ejecucion',
  activo           BOOLEAN      NOT NULL DEFAULT true,
  UNIQUE (codigo_registro, nombre)
);

CREATE INDEX idx_dim_tipos_cargos_cr     ON dim_tipos_cargos(codigo_registro);
CREATE INDEX idx_dim_tipos_cargos_tipo   ON dim_tipos_cargos(tipo_cargo);

CREATE TABLE dim_especialidades (
  id             SERIAL PRIMARY KEY,
  tipo_cargo_id  INT          NOT NULL REFERENCES dim_tipos_cargos(id),
  nombre         VARCHAR(200) NOT NULL,
  activo         BOOLEAN      NOT NULL DEFAULT true,
  UNIQUE (tipo_cargo_id, nombre)
);

CREATE INDEX idx_dim_especialidades_tipo_cargo ON dim_especialidades(tipo_cargo_id);

ALTER TABLE dim_cargos ADD COLUMN tipo_cargo_id INT;
ALTER TABLE dim_cargos ADD CONSTRAINT dim_cargos_tipo_cargo_id_fkey
  FOREIGN KEY (tipo_cargo_id) REFERENCES dim_tipos_cargos(id) NOT VALID;
