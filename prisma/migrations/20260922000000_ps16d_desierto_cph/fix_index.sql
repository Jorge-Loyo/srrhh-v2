-- PS16D-1 fix: actualizar índice parcial único de concursos_cph
-- Ejecutar DESPUÉS de migration.sql (requiere que el enum ya esté recreado)
DROP INDEX IF EXISTS concursos_cph_cargo_abierto_unique;
CREATE UNIQUE INDEX concursos_cph_cargo_abierto_unique
  ON concursos_cph (cargo_id)
  WHERE estado <> 'finalizado'::"EstadoConcursoCph";
