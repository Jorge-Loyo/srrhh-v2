-- Auditoría de normalización (solo lectura).
-- Por columna: total (no nulo/no vacío), con_may (tiene alguna mayúscula),
-- con_tilde (tiene vocal acentuada, ñ o ü). Salida: columna|total|con_may|con_tilde
\pset pager off

SELECT 'cargos.literal_puesto' AS columna,
  count(*) FILTER (WHERE literal_puesto IS NOT NULL AND literal_puesto <> '') AS total,
  count(*) FILTER (WHERE literal_puesto ~ '[A-ZÁÉÍÓÚÑÜ]') AS con_may,
  count(*) FILTER (WHERE literal_puesto ~ '[áéíóúñüÁÉÍÓÚÑÜ]') AS con_tilde
FROM cargos
UNION ALL SELECT 'cargos.especialidad_legacy', count(*) FILTER (WHERE especialidad_legacy IS NOT NULL AND especialidad_legacy<>''), count(*) FILTER (WHERE especialidad_legacy ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE especialidad_legacy ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM cargos
UNION ALL SELECT 'cargos.agrupador', count(*) FILTER (WHERE agrupador IS NOT NULL AND agrupador<>''), count(*) FILTER (WHERE agrupador ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE agrupador ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM cargos
UNION ALL SELECT 'cargos.unificador_puesto', count(*) FILTER (WHERE unificador_puesto IS NOT NULL AND unificador_puesto<>''), count(*) FILTER (WHERE unificador_puesto ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE unificador_puesto ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM cargos
UNION ALL SELECT 'cargos.regimen', count(*) FILTER (WHERE regimen IS NOT NULL AND regimen<>''), count(*) FILTER (WHERE regimen ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE regimen ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM cargos
UNION ALL SELECT 'cargos.agrupamiento', count(*) FILTER (WHERE agrupamiento IS NOT NULL AND agrupamiento<>''), count(*) FILTER (WHERE agrupamiento ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE agrupamiento ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM cargos
UNION ALL SELECT 'cargos.descripcion_repa', count(*) FILTER (WHERE descripcion_repa IS NOT NULL AND descripcion_repa<>''), count(*) FILTER (WHERE descripcion_repa ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE descripcion_repa ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM cargos
UNION ALL SELECT 'cargos.lit_familia', count(*) FILTER (WHERE lit_familia IS NOT NULL AND lit_familia<>''), count(*) FILTER (WHERE lit_familia ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE lit_familia ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM cargos
UNION ALL SELECT 'personas.apellido_nombre', count(*) FILTER (WHERE apellido_nombre IS NOT NULL AND apellido_nombre<>''), count(*) FILTER (WHERE apellido_nombre ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE apellido_nombre ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM personas
UNION ALL SELECT 'personas.especialidad_principal', count(*) FILTER (WHERE especialidad_principal IS NOT NULL AND especialidad_principal<>''), count(*) FILTER (WHERE especialidad_principal ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE especialidad_principal ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM personas
UNION ALL SELECT 'personas.especialidad_cph', count(*) FILTER (WHERE especialidad_cph IS NOT NULL AND especialidad_cph<>''), count(*) FILTER (WHERE especialidad_cph ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE especialidad_cph ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM personas
UNION ALL SELECT 'personas.domicilio', count(*) FILTER (WHERE domicilio IS NOT NULL AND domicilio<>''), count(*) FILTER (WHERE domicilio ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE domicilio ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM personas
UNION ALL SELECT 'personas.localidad', count(*) FILTER (WHERE localidad IS NOT NULL AND localidad<>''), count(*) FILTER (WHERE localidad ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE localidad ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM personas
UNION ALL SELECT 'personas.provincia', count(*) FILTER (WHERE provincia IS NOT NULL AND provincia<>''), count(*) FILTER (WHERE provincia ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE provincia ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM personas
UNION ALL SELECT 'personas.sexo', count(*) FILTER (WHERE sexo IS NOT NULL AND sexo<>''), count(*) FILTER (WHERE sexo ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE sexo ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM personas
UNION ALL SELECT 'padron_historico.escalafon', count(*) FILTER (WHERE escalafon IS NOT NULL AND escalafon<>''), count(*) FILTER (WHERE escalafon ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE escalafon ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM padron_historico
UNION ALL SELECT 'padron_historico.literal_puesto', count(*) FILTER (WHERE literal_puesto IS NOT NULL AND literal_puesto<>''), count(*) FILTER (WHERE literal_puesto ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE literal_puesto ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM padron_historico
UNION ALL SELECT 'padron_historico.especialidad', count(*) FILTER (WHERE especialidad IS NOT NULL AND especialidad<>''), count(*) FILTER (WHERE especialidad ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE especialidad ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM padron_historico
UNION ALL SELECT 'padron_historico.agrupador', count(*) FILTER (WHERE agrupador IS NOT NULL AND agrupador<>''), count(*) FILTER (WHERE agrupador ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE agrupador ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM padron_historico
UNION ALL SELECT 'ocupaciones.situacion_revista', count(*) FILTER (WHERE situacion_revista IS NOT NULL AND situacion_revista<>''), count(*) FILTER (WHERE situacion_revista ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE situacion_revista ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM ocupaciones
UNION ALL SELECT 'ocupaciones.estado_persona', count(*) FILTER (WHERE estado_persona IS NOT NULL AND estado_persona<>''), count(*) FILTER (WHERE estado_persona ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE estado_persona ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM ocupaciones
UNION ALL SELECT 'ocupaciones.jefe_escalafon', count(*) FILTER (WHERE jefe_escalafon IS NOT NULL AND jefe_escalafon<>''), count(*) FILTER (WHERE jefe_escalafon ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE jefe_escalafon ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM ocupaciones
UNION ALL SELECT 'ocupaciones.comision', count(*) FILTER (WHERE comision IS NOT NULL AND comision<>''), count(*) FILTER (WHERE comision ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE comision ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM ocupaciones
UNION ALL SELECT 'ocupaciones.repa_comision', count(*) FILTER (WHERE repa_comision IS NOT NULL AND repa_comision<>''), count(*) FILTER (WHERE repa_comision ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE repa_comision ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM ocupaciones
UNION ALL SELECT 'hospitales.nombre', count(*) FILTER (WHERE nombre IS NOT NULL AND nombre<>''), count(*) FILTER (WHERE nombre ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE nombre ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM hospitales
UNION ALL SELECT 'hospitales.tipo', count(*) FILTER (WHERE tipo IS NOT NULL AND tipo<>''), count(*) FILTER (WHERE tipo ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE tipo ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM hospitales
UNION ALL SELECT 'escalafones.nombre', count(*) FILTER (WHERE nombre IS NOT NULL AND nombre<>''), count(*) FILTER (WHERE nombre ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE nombre ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM escalafones
UNION ALL SELECT 'especialidades_puesto.nombre', count(*) FILTER (WHERE nombre IS NOT NULL AND nombre<>''), count(*) FILTER (WHERE nombre ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE nombre ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM especialidades_puesto
UNION ALL SELECT 'puestos_cargo.nombre', count(*) FILTER (WHERE nombre IS NOT NULL AND nombre<>''), count(*) FILTER (WHERE nombre ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE nombre ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM puestos_cargo
UNION ALL SELECT 'baja_sial_registros.ayn', count(*) FILTER (WHERE ayn IS NOT NULL AND ayn<>''), count(*) FILTER (WHERE ayn ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE ayn ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM baja_sial_registros
UNION ALL SELECT 'baja_sial_registros.lit_puesto', count(*) FILTER (WHERE lit_puesto IS NOT NULL AND lit_puesto<>''), count(*) FILTER (WHERE lit_puesto ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE lit_puesto ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM baja_sial_registros
UNION ALL SELECT 'baja_sial_registros.desc_rep', count(*) FILTER (WHERE desc_rep IS NOT NULL AND desc_rep<>''), count(*) FILTER (WHERE desc_rep ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE desc_rep ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM baja_sial_registros
UNION ALL SELECT 'baja_sial_registros.mot_baja', count(*) FILTER (WHERE mot_baja IS NOT NULL AND mot_baja<>''), count(*) FILTER (WHERE mot_baja ~ '[A-ZÁÉÍÓÚÑÜ]'), count(*) FILTER (WHERE mot_baja ~ '[áéíóúñüÁÉÍÓÚÑÜ]') FROM baja_sial_registros
ORDER BY 1;
