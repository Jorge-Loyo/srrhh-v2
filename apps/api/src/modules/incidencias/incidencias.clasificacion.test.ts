import { describe, it, expect } from 'vitest'
import {
  clasificarCargo,
  contarGrupos,
  resolverDeteccion,
  describirDeteccion,
  calcularDiasSinCubrir,
  idSialRolCoincide,
  normalizarBusqueda,
  coincideBusqueda,
  GRUPOS_CARGO,
  normalizarSituacionRevista,
  clasificarCayoDelPadron,
  clasificarCambioSituacionRevista,
  esElegibleReemplazante,
  clasificarCambiosDelPuesto,
  detalleCambioPuesto,
  clasificarNuevaBaja,
  clasificarCambioPersona,
  clasificarReaparecio,
  type CargoFacts,
  type DeteccionInput,
  type HechosIncidencia,
} from './incidencias.clasificacion.js'

const hechos = (over: Partial<HechosIncidencia> = {}): HechosIncidencia => ({
  estado: 'vigente',
  tieneOcupanteVigente: true,
  ausenteUltimoPadron: false,
  enBajaSial: false,
  enBajaSialNueva: false,
  presentePeriodoAnterior: false,
  situacionRevistaAnt: null,
  situacionRevistaNue: null,
  cambioPuestoDiff: false,
  literalPuestoAnt: null,
  literalPuestoNue: null,
  especialidadAnt: null,
  especialidadNue: null,
  cuilAnt: null,
  cuilNue: null,
  tipoOrigen: null,
  cargoRetenidoId: null,
  esReaparicion: false,
  ...over,
})

const facts = (over: Partial<CargoFacts> = {}): CargoFacts => ({
  estado: 'vigente',
  tieneOcupanteVigente: false,
  concursoActivo: false,
  altaPendiente: false,
  enBajaSial: false,
  ausenteUltimoPadron: false,
  ...over,
})

describe('clasificarCargo', () => {
  it('no_vigente siempre es no_vigente, con o sin evidencia', () => {
    expect(clasificarCargo(facts({ estado: 'no_vigente' }))).toBe('no_vigente')
    expect(
      clasificarCargo(
        facts({
          estado: 'no_vigente',
          enBajaSial: true,
          ausenteUltimoPadron: true,
          concursoActivo: true,
        }),
      ),
    ).toBe('no_vigente')
  })

  it('vigente con ocupante es ocupado (sin depender de sub_estado)', () => {
    expect(clasificarCargo(facts({ tieneOcupanteVigente: true }))).toBe('ocupado')
  })

  it('vigente con ocupante y concurso activo es ocupado', () => {
    expect(clasificarCargo(facts({ tieneOcupanteVigente: true, concursoActivo: true }))).toBe(
      'ocupado',
    )
  })

  it('vigente con ocupante y en baja SIAL es ocupado', () => {
    expect(clasificarCargo(facts({ tieneOcupanteVigente: true, enBajaSial: true }))).toBe('ocupado')
  })

  it('con concurso activo es en_concurso (vigente vacante y validacion_vacante)', () => {
    expect(clasificarCargo(facts({ concursoActivo: true }))).toBe('en_concurso')
    expect(clasificarCargo(facts({ estado: 'validacion_vacante', concursoActivo: true }))).toBe(
      'en_concurso',
    )
  })

  it('el concurso gana sobre la baja SIAL', () => {
    expect(clasificarCargo(facts({ concursoActivo: true, enBajaSial: true }))).toBe('en_concurso')
  })

  it('validacion_vacante sin concurso ni evidencia es baja_sin_concurso', () => {
    expect(clasificarCargo(facts({ estado: 'validacion_vacante' }))).toBe('baja_sin_concurso')
  })

  it('vigente sin ocupante ausente del padrón y sin concurso es baja_sin_concurso', () => {
    expect(clasificarCargo(facts({ ausenteUltimoPadron: true }))).toBe('baja_sin_concurso')
  })

  it('vigente sin ocupante en baja SIAL es baja_sin_concurso', () => {
    expect(clasificarCargo(facts({ enBajaSial: true }))).toBe('baja_sin_concurso')
  })

  it('ambos (baja SIAL + ausente del padrón) es baja_sin_concurso', () => {
    expect(clasificarCargo(facts({ enBajaSial: true, ausenteUltimoPadron: true }))).toBe(
      'baja_sin_concurso',
    )
  })

  it('ninguno (vigente vacante sin evidencia) es sin_clasificar', () => {
    expect(clasificarCargo(facts())).toBe('sin_clasificar')
  })

  it('altaPendiente es alta_pendiente y nunca baja_sin_concurso', () => {
    expect(
      clasificarCargo(facts({ altaPendiente: true, enBajaSial: true, ausenteUltimoPadron: true })),
    ).toBe('alta_pendiente')
  })

  it('validacion_vacante con ocupante vigente (inconsistente) y sin concurso es sin_clasificar', () => {
    expect(
      clasificarCargo(facts({ estado: 'validacion_vacante', tieneOcupanteVigente: true })),
    ).toBe('sin_clasificar')
  })

  it('estado desconocido es sin_clasificar', () => {
    expect(clasificarCargo(facts({ estado: 'raro' }))).toBe('sin_clasificar')
  })
})

describe('exclusión mutua y exhaustividad', () => {
  const estados = ['vigente', 'validacion_vacante', 'no_vigente', 'otro']
  const todas: CargoFacts[] = []
  for (const estado of estados) {
    for (let mask = 0; mask < 32; mask++) {
      todas.push({
        estado,
        tieneOcupanteVigente: !!(mask & 1),
        concursoActivo: !!(mask & 2),
        altaPendiente: !!(mask & 4),
        enBajaSial: !!(mask & 8),
        ausenteUltimoPadron: !!(mask & 16),
      })
    }
  }

  it('las 128 combinaciones devuelven exactamente un grupo válido', () => {
    expect(todas).toHaveLength(128)
    for (const f of todas) {
      const g = clasificarCargo(f)
      expect(GRUPOS_CARGO).toContain(g)
    }
  })

  it('contarGrupos suma siempre n', () => {
    const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)
    expect(total(contarGrupos(todas))).toBe(128)
    expect(total(contarGrupos([...todas, ...todas, todas[3]]))).toBe(257)
    expect(total(contarGrupos([]))).toBe(0)
  })

  it('monotonía: con concurso activo nunca es baja_sin_concurso', () => {
    for (const f of todas) {
      expect(clasificarCargo({ ...f, concursoActivo: true })).not.toBe('baja_sin_concurso')
    }
  })
})

const det = (over: Partial<DeteccionInput> = {}): DeteccionInput => ({
  estado: 'vigente',
  estadoDesde: null,
  fechaBajaPadronDiff: null,
  ocupacionDesdeUlt: null,
  ocupacionHasta: null,
  enBajaSial: false,
  bsCargoHasta: null,
  bsPrimeraFecha: null,
  bsFechaArchivoUltima: null,
  ausenteUltimoPadron: false,
  ...over,
})

describe('resolverDeteccion', () => {
  it('solo baja SIAL: origen baja_sial, fecha de primera carga y cargo_hasta', () => {
    const d = resolverDeteccion(
      det({
        enBajaSial: true,
        bsCargoHasta: '2026-10-30',
        bsPrimeraFecha: '2026-11-01',
        bsFechaArchivoUltima: '2026-11-08',
      }),
    )
    expect(d.origen).toBe('baja_sial')
    expect(d.fechaDeteccion).toBe('2026-11-01')
    expect(d.fechaBaja).toBe('2026-10-30')
    expect(d.ausentePadron).toBe(false)
    expect(d.fechaPadron).toBeNull()
  })

  it('baja SIAL sin fecha de primera aparición usa la fecha de archivo', () => {
    const d = resolverDeteccion(det({ enBajaSial: true, bsFechaArchivoUltima: '2026-11-08' }))
    expect(d.fechaDeteccion).toBe('2026-11-08')
  })

  it('solo padrón (vigente): fuente padron_diff', () => {
    const d = resolverDeteccion(
      det({
        ausenteUltimoPadron: true,
        fechaBajaPadronDiff: '2026-11-01',
        ocupacionDesdeUlt: '2025-01-01',
        ocupacionHasta: '2026-10-31',
      }),
    )
    expect(d.origen).toBe('padron')
    expect(d.fechaPadron).toBe('2026-11-01')
    expect(d.fuenteFechaPadron).toBe('padron_diff')
    expect(d.fechaDeteccion).toBe('2026-11-01')
  })

  it('validacion_vacante usa estado_desde aunque exista un diff más viejo', () => {
    const d = resolverDeteccion(
      det({
        estado: 'validacion_vacante',
        estadoDesde: '2026-11-01',
        fechaBajaPadronDiff: '2026-08-01',
        ausenteUltimoPadron: true,
      }),
    )
    expect(d.fechaPadron).toBe('2026-11-01')
    expect(d.fuenteFechaPadron).toBe('estado_desde')
  })

  it('validacion_vacante sin estado_desde y diff >= ultima_desde usa padron_diff', () => {
    const d = resolverDeteccion(
      det({
        estado: 'validacion_vacante',
        fechaBajaPadronDiff: '2026-11-01',
        ocupacionDesdeUlt: '2026-01-01',
      }),
    )
    expect(d.fuenteFechaPadron).toBe('padron_diff')
    expect(d.fechaPadron).toBe('2026-11-01')
  })

  it('vigente con diff anterior a la última ocupación descarta el diff y usa ocupacion_hasta', () => {
    const d = resolverDeteccion(
      det({
        ausenteUltimoPadron: true,
        fechaBajaPadronDiff: '2026-03-01',
        ocupacionDesdeUlt: '2026-05-01',
        ocupacionHasta: '2026-10-31',
      }),
    )
    expect(d.fuenteFechaPadron).toBe('ocupacion_hasta')
    expect(d.fechaPadron).toBe('2026-10-31')
  })

  it('vigente sin ocupaciones ni diff, con estado_desde: fuente estado_desde', () => {
    const d = resolverDeteccion(det({ ausenteUltimoPadron: true, estadoDesde: '2026-09-01' }))
    expect(d.fuenteFechaPadron).toBe('estado_desde')
    expect(d.fechaPadron).toBe('2026-09-01')
  })

  it('sin ninguna fecha: desconocida', () => {
    const d = resolverDeteccion(det({ ausenteUltimoPadron: true }))
    expect(d.fuenteFechaPadron).toBe('desconocida')
    expect(d.fechaPadron).toBeNull()
  })

  it('ambos: origen baja_sial y fechaPadron presente', () => {
    const d = resolverDeteccion(
      det({
        enBajaSial: true,
        ausenteUltimoPadron: true,
        bsPrimeraFecha: '2026-11-08',
        fechaBajaPadronDiff: '2026-11-01',
      }),
    )
    expect(d.origen).toBe('baja_sial')
    expect(d.ausentePadron).toBe(true)
    expect(d.fechaPadron).toBe('2026-11-01')
  })
})

describe('describirDeteccion', () => {
  it('textos de baja SIAL', () => {
    const base = {
      origen: 'baja_sial' as const,
      fechaPadron: null,
      fuenteFechaPadron: 'desconocida' as const,
      enBajaSial: true,
      ausentePadron: false,
    }
    expect(
      describirDeteccion({ ...base, fechaDeteccion: '2026-11-01', fechaBaja: '2026-10-30' }),
    ).toBe('Baja SIAL cargada el 01/11/2026 (baja al 30/10/2026)')
    expect(describirDeteccion({ ...base, fechaDeteccion: '2026-11-01', fechaBaja: null })).toBe(
      'Baja SIAL cargada el 01/11/2026',
    )
    expect(describirDeteccion({ ...base, fechaDeteccion: null, fechaBaja: null })).toBe(
      'Figura en la baja SIAL',
    )
  })

  it('textos de padrón', () => {
    const base = {
      origen: 'padron' as const,
      fechaDeteccion: null,
      fechaBaja: null,
      enBajaSial: false,
      ausentePadron: true,
    }
    expect(
      describirDeteccion({ ...base, fechaPadron: '2026-11-01', fuenteFechaPadron: 'padron_diff' }),
    ).toBe('Ausente del padrón desde el 01/11/2026')
    expect(
      describirDeteccion({ ...base, fechaPadron: null, fuenteFechaPadron: 'desconocida' }),
    ).toBe('Ausente del padrón (fecha desconocida)')
  })
})

describe('calcularDiasSinCubrir', () => {
  const hoy = new Date('2026-11-10T15:00:00Z')
  it('misma fecha = 0, futura = 0, null = null, pasada = días', () => {
    expect(calcularDiasSinCubrir('2026-11-10', hoy)).toBe(0)
    expect(calcularDiasSinCubrir('2026-12-01', hoy)).toBe(0)
    expect(calcularDiasSinCubrir(null, hoy)).toBeNull()
    expect(calcularDiasSinCubrir('2026-11-01', hoy)).toBe(9)
  })
})

describe('idSialRolCoincide', () => {
  it('igualdad exacta, sufijo -CUIL-rol y prefijo sin guion', () => {
    expect(idSialRolCoincide('001788157-2', '001788157-2')).toBe(true)
    expect(idSialRolCoincide('001788157-2-20084429091-2', '001788157-2')).toBe(true)
    expect(idSialRolCoincide('001788157-23', '001788157-2')).toBe(false)
  })
})

describe('búsqueda', () => {
  it('normaliza acentos y mayúsculas', () => {
    expect(normalizarBusqueda('  PÉREZ ')).toBe('perez')
  })
  it('coincide por nombre, CUIL con/sin guiones, id_sial y código; mínimo 2 caracteres', () => {
    const item = {
      nombre: 'Pérez, Juan',
      cuil: '20-11111111-3',
      idSial: '001788157-2',
      codigo: 'POF-000123',
    }
    expect(coincideBusqueda(item, normalizarBusqueda('perez'))).toBe(true)
    expect(coincideBusqueda(item, normalizarBusqueda('20-11111111'))).toBe(true)
    expect(coincideBusqueda(item, normalizarBusqueda('111111113'))).toBe(true)
    expect(coincideBusqueda(item, normalizarBusqueda('001788157'))).toBe(true)
    expect(coincideBusqueda(item, normalizarBusqueda('pof-000'))).toBe(true)
    expect(coincideBusqueda(item, normalizarBusqueda('zzz'))).toBe(false)
    expect(coincideBusqueda(item, 'z')).toBe(true) // < 2 caracteres: no filtra
  })
})

// ─── FASE 3: clasificadores de incidencias (tipos 3/4/5/6a/6b/6c) ───────────

describe('normalizarSituacionRevista', () => {
  it('mapea los valores reales del padrón y el residual', () => {
    expect(normalizarSituacionRevista('activo')).toBe('activo')
    expect(normalizarSituacionRevista('retencion de cargo')).toBe('retencion')
    expect(normalizarSituacionRevista('Retención de Cargo')).toBe('retencion')
    expect(normalizarSituacionRevista('comision')).toBe('comision')
    expect(normalizarSituacionRevista('Comisión')).toBe('comision')
    expect(normalizarSituacionRevista('algo raro')).toBe('otro')
    expect(normalizarSituacionRevista(null)).toBe('otro')
  })
})

describe('clasificarCayoDelPadron (tipo 3)', () => {
  it('dispara: presente antes + ausente del padrón + sin baja SIAL', () => {
    expect(
      clasificarCayoDelPadron(hechos({ presentePeriodoAnterior: true, ausenteUltimoPadron: true })),
    ).toBe('cayo-del-padron')
  })
  it('dispara también por estado validacion_vacante', () => {
    expect(
      clasificarCayoDelPadron(
        hechos({ presentePeriodoAnterior: true, estado: 'validacion_vacante' }),
      ),
    ).toBe('cayo-del-padron')
  })
  it('no dispara si no estaba presente el período anterior', () => {
    expect(
      clasificarCayoDelPadron(
        hechos({ presentePeriodoAnterior: false, ausenteUltimoPadron: true }),
      ),
    ).toBeNull()
  })
  it('no dispara si sigue presente (no ausente y no validacion_vacante)', () => {
    expect(clasificarCayoDelPadron(hechos({ presentePeriodoAnterior: true }))).toBeNull()
  })
  it('no dispara si lo explica la baja SIAL (vieja o nueva)', () => {
    expect(
      clasificarCayoDelPadron(
        hechos({ presentePeriodoAnterior: true, ausenteUltimoPadron: true, enBajaSial: true }),
      ),
    ).toBeNull()
    expect(
      clasificarCayoDelPadron(
        hechos({ presentePeriodoAnterior: true, ausenteUltimoPadron: true, enBajaSialNueva: true }),
      ),
    ).toBeNull()
  })
})

describe('clasificarCambioSituacionRevista (tipo 4)', () => {
  it('dispara cuando la situación normalizada cambia', () => {
    expect(
      clasificarCambioSituacionRevista(
        hechos({ situacionRevistaAnt: 'activo', situacionRevistaNue: 'retencion de cargo' }),
      ),
    ).toBe('cambio-situacion-revista')
  })
  it('no dispara si normalizan igual pese a texto distinto', () => {
    expect(
      clasificarCambioSituacionRevista(
        hechos({ situacionRevistaAnt: 'activo', situacionRevistaNue: 'ACTIVO' }),
      ),
    ).toBeNull()
    expect(
      clasificarCambioSituacionRevista(
        hechos({ situacionRevistaAnt: 'retencion de cargo', situacionRevistaNue: 'Retención' }),
      ),
    ).toBeNull()
  })
  it('no dispara si falta ant o nue', () => {
    expect(
      clasificarCambioSituacionRevista(
        hechos({ situacionRevistaAnt: null, situacionRevistaNue: 'activo' }),
      ),
    ).toBeNull()
    expect(
      clasificarCambioSituacionRevista(
        hechos({ situacionRevistaAnt: 'activo', situacionRevistaNue: null }),
      ),
    ).toBeNull()
  })
  it('esElegibleReemplazante: activo→retención con cadena armada', () => {
    expect(
      esElegibleReemplazante(
        hechos({
          situacionRevistaAnt: 'activo',
          situacionRevistaNue: 'retencion de cargo',
          tipoOrigen: 'R',
          cargoRetenidoId: 'c1',
        }),
      ),
    ).toBe(true)
    // misma transición pero sin cadena → no elegible
    expect(
      esElegibleReemplazante(
        hechos({
          situacionRevistaAnt: 'activo',
          situacionRevistaNue: 'retencion de cargo',
          tipoOrigen: null,
          cargoRetenidoId: null,
        }),
      ),
    ).toBe(false)
    // retención→activo (sentido inverso) → no elegible
    expect(
      esElegibleReemplazante(
        hechos({
          situacionRevistaAnt: 'retencion de cargo',
          situacionRevistaNue: 'activo',
          tipoOrigen: 'TTR',
          cargoRetenidoId: 'c1',
        }),
      ),
    ).toBe(false)
  })
})

describe('clasificarCambiosDelPuesto (tipo 5)', () => {
  it('dispara por señal del diff', () => {
    expect(clasificarCambiosDelPuesto(hechos({ cambioPuestoDiff: true }))).toBe(
      'cambios-del-puesto',
    )
  })
  it('dispara por cambio de literal_puesto (texto) que el diff NO ve (respaldo histórico)', () => {
    expect(
      clasificarCambiosDelPuesto(
        hechos({
          cambioPuestoDiff: false,
          literalPuestoAnt: 'Enfermero',
          literalPuestoNue: 'Enfermero Jefe',
        }),
      ),
    ).toBe('cambios-del-puesto')
  })
  it('dispara por cambio de especialidad (texto) por respaldo histórico', () => {
    expect(
      clasificarCambiosDelPuesto(
        hechos({ especialidadAnt: 'Clinica', especialidadNue: 'Pediatria' }),
      ),
    ).toBe('cambios-del-puesto')
  })
  it('el respaldo histórico normaliza (tildes/mayúsculas) antes de comparar', () => {
    expect(
      clasificarCambiosDelPuesto(
        hechos({ literalPuestoAnt: 'Médico', literalPuestoNue: 'MEDICO' }),
      ),
    ).toBeNull()
  })
  it('no dispara si el ant es null (solo cubre texto→texto; el resto lo cubre el diff)', () => {
    expect(
      clasificarCambiosDelPuesto(hechos({ literalPuestoAnt: null, literalPuestoNue: 'Enfermero' })),
    ).toBeNull()
  })
  it('no dispara si el puesto/especialidad no cambió y no hay señal de diff', () => {
    expect(
      clasificarCambiosDelPuesto(
        hechos({
          literalPuestoAnt: 'Enfermero',
          literalPuestoNue: 'Enfermero',
          especialidadAnt: 'Clinica',
          especialidadNue: 'Clinica',
        }),
      ),
    ).toBeNull()
  })
  it('detalleCambioPuesto distingue puesto vs especialidad (puesto manda)', () => {
    expect(
      detalleCambioPuesto(hechos({ literalPuestoAnt: 'Enfermero', literalPuestoNue: 'Médico' })),
    ).toBe('cambio puesto')
    expect(
      detalleCambioPuesto(hechos({ especialidadAnt: 'Clinica', especialidadNue: 'Pediatria' })),
    ).toBe('cambio especialidad')
  })
})

describe('clasificarNuevaBaja (tipo 6a)', () => {
  it('dispara: baja SIAL nueva + cargo vigente con ocupante + no ausente', () => {
    expect(
      clasificarNuevaBaja(
        hechos({ enBajaSialNueva: true, estado: 'vigente', tieneOcupanteVigente: true }),
      ),
    ).toBe('otras:nueva-baja')
  })
  it('no dispara si no hay baja SIAL nueva', () => {
    expect(
      clasificarNuevaBaja(
        hechos({ enBajaSialNueva: false, estado: 'vigente', tieneOcupanteVigente: true }),
      ),
    ).toBeNull()
  })
  it('no dispara si el padrón ya lo bajó (ausente)', () => {
    expect(
      clasificarNuevaBaja(
        hechos({
          enBajaSialNueva: true,
          estado: 'vigente',
          tieneOcupanteVigente: true,
          ausenteUltimoPadron: true,
        }),
      ),
    ).toBeNull()
  })
  it('no dispara si el cargo ya no tiene ocupante vigente', () => {
    expect(
      clasificarNuevaBaja(
        hechos({ enBajaSialNueva: true, estado: 'vigente', tieneOcupanteVigente: false }),
      ),
    ).toBeNull()
  })
})

describe('clasificarCambioPersona (tipo 6b)', () => {
  it('dispara: ocupado con CUIL nuevo != CUIL anterior', () => {
    expect(
      clasificarCambioPersona(
        hechos({ tieneOcupanteVigente: true, cuilAnt: '20111111113', cuilNue: '27222222228' }),
      ),
    ).toBe('otras:cambio-persona')
  })
  it('no dispara con CUILs iguales', () => {
    expect(
      clasificarCambioPersona(
        hechos({ tieneOcupanteVigente: true, cuilAnt: '20111111113', cuilNue: '20111111113' }),
      ),
    ).toBeNull()
  })
  it('no dispara si algún CUIL es nulo', () => {
    expect(
      clasificarCambioPersona(
        hechos({ tieneOcupanteVigente: true, cuilAnt: null, cuilNue: '27222222228' }),
      ),
    ).toBeNull()
    expect(
      clasificarCambioPersona(
        hechos({ tieneOcupanteVigente: true, cuilAnt: '20111111113', cuilNue: null }),
      ),
    ).toBeNull()
  })
  it('no dispara si el cargo no tiene ocupante vigente', () => {
    expect(
      clasificarCambioPersona(
        hechos({ tieneOcupanteVigente: false, cuilAnt: '20111111113', cuilNue: '27222222228' }),
      ),
    ).toBeNull()
  })
})

describe('clasificarReaparecio (tipo 6c)', () => {
  it('dispara si el cargo está en aRechazarBaja (esReaparicion)', () => {
    expect(clasificarReaparecio(hechos({ esReaparicion: true }))).toBe('otras:reaparecio')
  })
  it('no dispara si no es reaparición', () => {
    expect(clasificarReaparecio(hechos({ esReaparicion: false }))).toBeNull()
  })
})
