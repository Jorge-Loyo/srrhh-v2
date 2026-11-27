SET session_replication_role = replica;
TRUNCATE TABLE
  kpis_dotacion_snapshot, padron_historico, padron_incidencias,
  ocupaciones, bajas, concursos, concursos_cph, concursos_ceetps,
  concursos_asignados, concursos_cph_desiertos,
  inscriptos_concurso, orden_merito_integrantes, ordenes_merito,
  sorteos_jurado, jornadas_sorteo, jornada_sorteo_concursos,
  miembros_jurado_sorteados, etiquetas_baja, etiquetas_cargo,
  etiquetas_concurso_cph, etiquetas_concurso_ceetps,
  etiquetas_solicitud_alta, solicitudes_alta, roles_persona,
  pou, pou_cargas, pou_especialidad_mapeo, tareas_pendientes,
  notificaciones, autorizaciones, audit_logs, refresh_tokens,
  organigrama_uploads, organigramas, padron_snapshots,
  cargos, personas, hospitales, escalafones, puestos_cargo,
  especialidades_puesto, codigos_registro, cesacs, regimenes,
  unidades_fijas_apayc, areas_programaticas, etiquetas,
  jcat_cargo_jefatura, permisos, role_permisos, role_jerarquias,
  roles, usuarios, sync_corridas,
  ref_abreviaturas_tecnicas, ref_abreviaturas_titulo,
  ref_conectores_minuscula, ref_correcciones_especialidad,
  ref_correcciones_lit_puesto, ref_especialidad_por_puesto,
  ref_sufijos_ordinales, ref_agrupadores, ref_unificadores_puesto,
  ref_especialidades_cuil
CASCADE;
SET session_replication_role = DEFAULT;
SELECT 'Truncate OK' AS estado;
