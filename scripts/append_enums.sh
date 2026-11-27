#!/bin/bash
cat >> /mnt/c/Desarrollo/SRH/SRRHH-Legacy/prisma/schema.prisma << 'ENUMS'

enum EstadoCargo {
  vigente
  no_vigente
  validacion_vacante
}

enum SubEstadoCargo {
  ocupado
  vacante
  concurso
}

enum EstadoSnapshot {
  procesando
  pendiente
  aprobado
  rechazado
  error
}

enum TipoDiff {
  nuevo
  modificado
  eliminado
}

enum TipoConcurso {
  cph
  ceetps
}

enum MotivoConcurso {
  nuevo_cargo
  alta_por_baja
  retencion_de_cargo
  cobertura_dotacion
}

enum EstadoConcursoCph {
  no_iniciado
  activo
  finalizado
  suspendido
}

enum EstadoConcursoCeetps {
  sin_autorizar
  autorizado
  en_proceso
  finalizado
  desierto
}

enum NivelCesac {
  unidad
  unidad_con_seccion
}

enum TipoUnidadFija {
  cemar
  centro_odontologico_infantil
  red_odontologia
}

enum NivelOrganicoUnidadFija {
  division
  division_con_seccion
  unidad
  fuera_de_nivel
}

enum EstadoBaja {
  resolucion_a_la_firma
  pendiente
  confirmada
  anulada
}

enum TipoAutorizacion {
  concurso_cph
  alta_cargo
  baja_cargo
  concurso_ceetps
}

enum EstadoAutorizacion {
  pendiente
  aprobada
  rechazada
}

enum SolicitudAltaEstado {
  pendiente
  aprobada
  rechazada
}

enum EstadoOrdenMerito {
  vigente
  prorrogada
  vencida
}

enum ModalidadPuesto {
  pof
  pou
  ambos
}

enum TipoPuesto {
  ejecucion
  conduccion
}

enum TipoNotificacion {
  concurso_estancado
  concurso_iniciado
  baja_pendiente
  autorizacion_pendiente
  autorizacion_resuelta
  vencimiento_conduccion
}

enum TipoCargaSemanal {
  cargos_salud
  bajas_salud
  arbol
  ocupacion_pou
  pou_decreto
}

enum EstadoCargaSemanal {
  procesando
  completado
  error
  pendiente_confirmacion
}
ENUMS
