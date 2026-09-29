-- S4 bug fix: race condition en createConcursoService
CREATE UNIQUE INDEX concursos_cph_cargo_abierto_unique
  ON concursos_cph (cargo_id)
  WHERE estado NOT IN ('finalizado', 'desierto');
