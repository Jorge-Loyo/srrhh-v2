-- Agrega cantidad_cargos a concursos_cph.
-- Default 1: el caso estándar es siempre un cargo; >1 aplica a ampliaciones
-- con múltiples expedientes (ej. Ampliación de 3 cargos en un solo concurso).
ALTER TABLE concursos_cph ADD COLUMN cantidad_cargos INTEGER NOT NULL DEFAULT 1;
ALTER TABLE concursos_ceetps ADD COLUMN cantidad_cargos INTEGER NOT NULL DEFAULT 1;
