import { describe, it, expect } from 'vitest'

// =============================================================================
// Lógica pura extraída de retenciones.service.ts
// Se replica acá para testear sin Prisma ni side effects.
// Si cambia la lógica en el service, actualizar acá también.
// =============================================================================

type TipoOrigen = 'R' | 'TTR'

interface CargoSimple {
  id: string
  conduccion: boolean
}

interface OcupacionSimple {
  cargoId: string
  personaId: string
}

/** Replica la regla R-01 de registrarRetencionService. */
function validarR01(
  cargoRetenido: CargoSimple,
  otrasOcupacionesActivas: (OcupacionSimple & { cargo: CargoSimple })[],
): { ok: true } | { ok: false; error: string } {
  if (cargoRetenido.conduccion) return { ok: true }
  const otraEjecucion = otrasOcupacionesActivas.find((o) => !o.cargo.conduccion)
  if (otraEjecucion) {
    return { ok: false, error: 'La persona ya tiene otro cargo de ejecución activo — no puede retener ejecución con ejecución, corresponde una baja' }
  }
  return { ok: true }
}

/** Replica el branching tipoOrigen de registrarRetencionService. */
function determinarTipoOrigen(cargoRetenido: CargoSimple): TipoOrigen {
  return cargoRetenido.conduccion ? 'TTR' : 'R'
}

/** Replica la validación de período obligatorio para TTR. */
function validarPeriodoTTR(
  tipoOrigen: TipoOrigen,
  periodoDesde?: string,
  periodoHasta?: string,
): { ok: true } | { ok: false; error: string } {
  if (tipoOrigen === 'TTR' && (!periodoDesde || !periodoHasta)) {
    return { ok: false, error: 'periodoDesde y periodoHasta son obligatorios para retener un cargo de conducción' }
  }
  return { ok: true }
}

/** Replica el cálculo de cargoBaseId al crear el remplazante. */
function calcularCargoBaseId(cargoRetenido: { id: string; cargoBaseId: string | null }): string {
  return cargoRetenido.cargoBaseId ?? cargoRetenido.id
}

describe('registrarRetencionService — R-01 (no ejecución con ejecución)', () => {
  it('cargo de conducción → siempre permitido, sin chequear otras ocupaciones', () => {
    const resultado = validarR01({ id: 'c1', conduccion: true }, [
      { cargoId: 'c2', personaId: 'p1', cargo: { id: 'c2', conduccion: false } },
    ])
    expect(resultado.ok).toBe(true)
  })

  it('cargo de ejecución sin otras ocupaciones activas → permitido', () => {
    const resultado = validarR01({ id: 'c1', conduccion: false }, [])
    expect(resultado.ok).toBe(true)
  })

  it('cargo de ejecución + persona ya tiene otro cargo de ejecución activo → error', () => {
    const resultado = validarR01({ id: 'c1', conduccion: false }, [
      { cargoId: 'c2', personaId: 'p1', cargo: { id: 'c2', conduccion: false } },
    ])
    expect(resultado.ok).toBe(false)
  })

  it('cargo de ejecución + persona solo tiene otro cargo de conducción activo → permitido', () => {
    const resultado = validarR01({ id: 'c1', conduccion: false }, [
      { cargoId: 'c2', personaId: 'p1', cargo: { id: 'c2', conduccion: true } },
    ])
    expect(resultado.ok).toBe(true)
  })
})

describe('registrarRetencionService — branching R vs TTR', () => {
  it('cargo de ejecución → tipoOrigen R', () => {
    expect(determinarTipoOrigen({ id: 'c1', conduccion: false })).toBe('R')
  })

  it('cargo de conducción → tipoOrigen TTR', () => {
    expect(determinarTipoOrigen({ id: 'c1', conduccion: true })).toBe('TTR')
  })

  it('TTR sin período → error', () => {
    expect(validarPeriodoTTR('TTR').ok).toBe(false)
    expect(validarPeriodoTTR('TTR', '2026-01-01').ok).toBe(false)
  })

  it('TTR con período completo → ok', () => {
    expect(validarPeriodoTTR('TTR', '2026-01-01', '2030-01-01').ok).toBe(true)
  })

  it('R no requiere período', () => {
    expect(validarPeriodoTTR('R').ok).toBe(true)
  })
})

describe('registrarRetencionService — cargoBaseId desnormalizado', () => {
  it('cargo retenido ES el base (sin cargoBaseId propio) → usa su propio id', () => {
    expect(calcularCargoBaseId({ id: 'c1', cargoBaseId: null })).toBe('c1')
  })

  it('cargo retenido YA tiene cargoBaseId → se propaga el mismo', () => {
    expect(calcularCargoBaseId({ id: 'c2', cargoBaseId: 'c1' })).toBe('c1')
  })
})

// =============================================================================
// titularCesaService — R-07: el ocupante del R hereda el cargo titular
// =============================================================================

interface OcupacionR {
  personaId: string
}

/** Replica la validación de titularCesaService antes de la transacción. */
function validarOcupanteR(
  ocupacionRActiva: OcupacionR | null,
  ocupanteRIdEsperado: string,
): { ok: true } | { ok: false; error: string } {
  if (!ocupacionRActiva || ocupacionRActiva.personaId !== ocupanteRIdEsperado) {
    return { ok: false, error: 'El ocupante indicado no coincide con el ocupante activo del cargo R' }
  }
  return { ok: true }
}

describe('titularCesaService — validación del ocupante R', () => {
  it('sin ocupación activa en el cargo R → error', () => {
    expect(validarOcupanteR(null, 'p1').ok).toBe(false)
  })

  it('ocupante activo distinto del informado → error', () => {
    expect(validarOcupanteR({ personaId: 'p2' }, 'p1').ok).toBe(false)
  })

  it('ocupante activo coincide con el informado → ok', () => {
    expect(validarOcupanteR({ personaId: 'p1' }, 'p1').ok).toBe(true)
  })
})

// =============================================================================
// getCadenaRetencionService — orden de la cadena (base → más reciente)
// =============================================================================

interface NodoSimple {
  id: string
  cargoRetenidoId: string | null
}

/** Replica el recorrido de getCadenaRetencionTx: arranca en el base y camina
 * hacia adelante siguiendo cargoRetenidoId (quién retiene a quién). */
function ordenarCadena(nodos: NodoSimple[], cargoBaseId: string): string[] {
  const orden: string[] = []
  let actual = nodos.find((n) => n.id === cargoBaseId)
  while (actual) {
    orden.push(actual.id)
    actual = nodos.find((n) => n.cargoRetenidoId === actual!.id)
  }
  return orden
}

describe('getCadenaRetencionService — orden de la cadena', () => {
  it('cadena de un solo nodo (sin remplazantes) → [base]', () => {
    const nodos = [{ id: 'base', cargoRetenidoId: null }]
    expect(ordenarCadena(nodos, 'base')).toEqual(['base'])
  })

  it('cadena de 3 niveles → ordenada base → intermedio → último', () => {
    const nodos = [
      { id: 'ttr2', cargoRetenidoId: 'conduccion1' },
      { id: 'base', cargoRetenidoId: null },
      { id: 'conduccion1', cargoRetenidoId: 'base' },
    ]
    expect(ordenarCadena(nodos, 'base')).toEqual(['base', 'conduccion1', 'ttr2'])
  })
})
