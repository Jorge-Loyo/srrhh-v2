-- Garantiza que no existan dos filas abiertas (fecha_hasta IS NULL)
-- para el mismo id_sial_rol en dim_actividad_hechos.
-- Índice parcial: solo aplica cuando fecha_hasta es NULL.
CREATE UNIQUE INDEX IF NOT EXISTS "dim_actividad_hechos_id_sial_rol_abierta_key"
  ON "dim_actividad_hechos" ("id_sial_rol")
  WHERE "fecha_hasta" IS NULL;
