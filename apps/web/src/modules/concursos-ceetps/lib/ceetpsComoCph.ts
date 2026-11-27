import type { ConcursoCeetps, ConcursoCph } from '@srrhh/types'

// Adaptador para el wizard CEETPS (réplica del wizard CPH). El wizard trabaja
// sobre la forma ConcursoCph; acá se traduce el concurso CEETPS a esa forma al
// leer, y los campos editados del wizard a los de CEETPS al guardar. Los campos
// que CEETPS no tiene quedan vacíos al leer y se descartan al guardar.

// Campo del wizard (ConcursoCph) → campo de ConcursoCeetps. Solo los que existen
// en los dos con el mismo significado.
export const CAMPOS_CPH_A_CEETPS: Record<string, string> = {
  eeConcurso: 'expedienteConcurso',
  fechaEeConcurso: 'fechaCaratulacion',
  ifAutorizacion: 'ifAutorizacion',
  fechaAutorizacion: 'fechaAutorizacion',
  puestoCargoSolicitadoId: 'puestoCargoSolicitadoId',
  disposicion: 'dispoLlamado',
  tipoGestion: 'tipoGestion',
  fechaIfacs: 'fechaIfacs',
  fechaInsal: 'fechaInsal',
  // Etapa 4: reserva del candidato y su respuesta al INSAL.
  inscriptoReservadoId: 'inscriptoReservadoId',
  insalAceptado: 'insalAceptado',
  insalRechazados: 'insalRechazados',
  eeDesignacion: 'expedienteDesignacion',
  resolucionDesignacion: 'resolucionDesignacion',
  cargoSial: 'codigoSial',
  // Etapa 5: mismo nombre en los dos lados (algunos no existen en CPH).
  cargaDocumentacion: 'cargaDocumentacion',
  tramiteDesignacion: 'tramiteDesignacion',
  fechaAptoMedico: 'fechaAptoMedico',
  numeroAptoMedico: 'numeroAptoMedico',
  estadoApto: 'estadoApto',
  dispoDesignacion: 'dispoDesignacion',
  fechaDispoDesignacion: 'fechaDispoDesignacion',
  resolucionConvalidacion: 'resolucionConvalidacion',
  proyectoResolucion: 'proyectoResolucion',
  resoALaFirma: 'resoALaFirma',
  fechaResolucion: 'fechaResolucion',
  cantidadCargos: 'cantidadCargos',
  cambioEspecialidad: 'cambioEspecialidad',
  observaciones: 'observaciones',
}

// Sub-estado CEETPS → sub-estado CPH equivalente, para que el panel de
// sub-estados y los avisos del wizard marquen el paso correcto. En CPH el
// sub-estado es el ÚLTIMO paso completado (el panel marca en curso el
// siguiente): autorizado = "A — Autorización" completada → en curso el sorteo
// de jurados, que es la etapa 2 de CEETPS.
function subEstadoComoCph(estado: string, subEstado: string | null): string {
  if (estado === 'finalizado') return 'n-designado'
  if (estado === 'desierto') return 'q-desierto'
  switch (subEstado) {
    case 'DISPO_DESIGNACION':
      return 'l-pycto de reso'
    case 'TAD':
      return 'h-tad'
    case 'INSAL':
      return 'g-insal'
    case 'IFACS':
      return 'f-ifacs'
    case 'DISPO_LLAMADO':
      return 'c-dispo de llamado'
  }
  if (estado === 'autorizado') return 'a-autzn'
  return subEstado ? 'a-caratulado' : 'vacante'
}

function estadoComoCph(estado: string): ConcursoCph['estado'] {
  if (estado === 'finalizado' || estado === 'desierto') return 'finalizado' as ConcursoCph['estado']
  if (estado === 'sin_autorizar') return 'no_iniciado' as ConcursoCph['estado']
  return 'activo' as ConcursoCph['estado']
}

export type ConcursoCphDesdeCeetps = ConcursoCph & { tipoConcurso: 'ceetps'; ceetps: ConcursoCeetps }

export function ceetpsComoCph(c: ConcursoCeetps): ConcursoCphDesdeCeetps {
  const base: Record<string, unknown> = {
    id: c.id,
    concursoId: c.concursoId,
    cargoId: c.cargoId,
    hospitalId: c.hospitalId,
    estado: estadoComoCph(c.estado),
    subEstado: subEstadoComoCph(c.estado, c.subEstado),
    subEstado3: null,
    especialidadSolicitada: null,
    puestoSolicitado: c.puestoSolicitado,
    puestoCargoSolicitadoId: c.puestoCargoSolicitadoId,
    eeBaja: null,
    fechaBaja: null,
    eeConcurso: c.expedienteConcurso,
    fechaEeConcurso: c.fechaCaratulacion,
    ifAutorizacion: c.ifAutorizacion,
    fechaAutorizacion: c.fechaAutorizacion,
    sorteoJurado: null,
    tipoGestion: c.tipoGestion ?? null,
    disposicion: c.dispoLlamado,
    // Etapa 3: las fechas salen del cronograma CEETPS.
    fechaInscDesde: c.cronograma?.inscripcion_desde ?? null,
    fechaInscHasta: c.cronograma?.inscripcion_hasta ?? null,
    inscripcionCerrada: false,
    presentadosConfirmados: false,
    ordenMeritoConfirmado: false,
    fechaExamen: c.cronograma?.examen ?? null,
    fechaOrdenMerito: c.cronograma?.comunicacion_orden_merito ?? null,
    ifacs: null,
    fechaIfacs: c.fechaIfacs,
    insal: null,
    fechaInsal: c.fechaInsal,
    insalAceptado: c.insalAceptado ?? null,
    insalRechazados: c.insalRechazados ?? [],
    inscriptoReservadoId: c.inscriptoReservadoId ?? null,
    eeDesignacion: c.expedienteDesignacion,
    cargaDocumentacion: c.cargaDocumentacion ?? null,
    fechaAptoMedico: c.fechaAptoMedico ?? null,
    numeroAptoMedico: c.numeroAptoMedico ?? null,
    estadoApto: c.estadoApto ?? null,
    fechaIte: null, // CEETPS no tiene ITE
    proyectoResolucion: c.proyectoResolucion ?? null,
    resoALaFirma: c.resoALaFirma ?? null,
    resolucionDesignacion: c.resolucionDesignacion,
    fechaResolucion: c.fechaResolucion ?? null,
    // Etapa 5 — sin equivalente en ConcursoCph (el wizard los lee por clave).
    dispoDesignacion: c.dispoDesignacion ?? null,
    fechaDispoDesignacion: c.fechaDispoDesignacion ?? null,
    resolucionConvalidacion: c.resolucionConvalidacion ?? null,
    tramiteDesignacion: c.tramiteDesignacion ?? null,
    cargoSial: c.codigoSial,
    dispoDesierta: null,
    cantidadCargos: c.cantidadCargos,
    personaDesignadaId: c.personaDesignadaId,
    designadoRefCuil: c.designadoRefCuil ?? null,
    designadoRefNombre: c.designadoRefNombre ?? null,
    designadoRefIdSialRol: c.designadoRefIdSialRol ?? null,
    suspendido: false,
    validado: false,
    cambioEspecialidad: c.cambioEspecialidad,
    pendienteAutorizacion: !!c.autorizacionPendiente,
    aprobadoDirector: false,
    autorizacionPendiente: c.autorizacionPendiente ?? null,
    observaciones: c.observaciones,
    etiquetas: [],
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    // El wizard lee el hospital desde concurso.hospital.
    concurso: c.concurso ? { ...c.concurso, hospital: c.hospital } : c.concurso,
    hospital: c.hospital,
    tipoConcurso: 'ceetps',
    ceetps: c,
  }
  return base as unknown as ConcursoCphDesdeCeetps
}

// Traduce el body de un guardado del wizard al PATCH de CEETPS (que es .strict()
// y rechaza campos desconocidos). '' se manda como null.
export function cphPatchACeetps(body: Record<string, unknown>): {
  body: Record<string, unknown>
  descartados: string[]
} {
  const out: Record<string, unknown> = {}
  const descartados: string[] = []
  for (const [k, v] of Object.entries(body)) {
    const destino = CAMPOS_CPH_A_CEETPS[k]
    if (!destino) {
      descartados.push(k)
      continue
    }
    out[destino] = v === '' ? null : v
  }
  return { body: out, descartados }
}
