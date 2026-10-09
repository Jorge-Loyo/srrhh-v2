-- S24: índice de apoyo para la evolución de dotación por carrera/puesto/especialidad.
-- La serie reconstruye el estado activo acumulado por corte mensual con LEAD()
-- sobre padron_historico particionado por id_sial_rol y ordenado por fecha. Sin
-- este índice la query hacía un sort externo de ~140k filas por corte (minutos);
-- con él baja a ~1s. IF NOT EXISTS: el índice pudo crearse en caliente antes.
CREATE INDEX IF NOT EXISTS "padron_historico_id_sial_rol_fecha_asignada_idx"
  ON "padron_historico" ("id_sial_rol", "fecha_asignada");
