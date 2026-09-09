import { describe, it, expect } from 'vitest'

// =============================================================================
// Lógica pura extraída de bajas.service.ts
// Se replica acá para testear sin Prisma ni side effects.
// Si cambia la lógica en el service, actualizar acá también.
// =============================================================================

type EstadoBaja   = 'resolucion_a_la_firma' | 'pendiente' | 'confirmada' | 'anulada'
type EstadoCargo  = 'vigente' | 'no_vigente' | 'validacion_vacante'
type TipoConcurso = 'cph' | 'ceetps' | 'sin_concurso'

interface BajaInput {
  estado?: EstadoBaja
  generaConcurso?: boolean
  tipoConcurso?: TipoConcurso
}

interface ResultadoProcesoBaja {
  estadoBaja: EstadoBaja
  estadoCargo: EstadoCargo
  creaConcurso: boolean
  error?: string
}

/**
 * Lógica central de procesamiento de una baja.
 * Replica exactamente las condiciones de createBajaService y updateBajaService.
 */
function procesarBaja(
  input: BajaInput,
  concursoAbiertoExistente: boolean = false,
): ResultadoProcesoBaja {
  // Borrador: no toca nada
  if (input.estado === 'resolucion_a_la_firma') {
    return { estadoBaja: 'resolucion_a_la_firma', estadoCargo: 'vigente', creaConcurso: false }
  }

  // Con concurso: requiere tipoConcurso
  if (input.generaConcurso === true) {
    if (!input.tipoConcurso) {
      return { estadoBaja: 'pendiente', estadoCargo: 'vigente', creaConcurso: false, error: 'tipoConcurso requerido' }
    }
    if (input.tipoConcurso === 'cph' && concursoAbiertoExistente) {
      return { estadoBaja: 'pendiente', estadoCargo: 'vigente', creaConcurso: false, error: 'Ya existe un concurso CPH abierto para este cargo' }
    }
    return { estadoBaja: 'confirmada', estadoCargo: 'vigente', creaConcurso: true }
  }

  // Sin concurso (false o undefined): baja definitiva
  return { estadoBaja: 'confirmada', estadoCargo: 'no_vigente', creaConcurso: false }
}

// =============================================================================
// Lógica del schema Zod — validaciones puras
// =============================================================================

interface ValidacionBajaInput {
  estado?: EstadoBaja
  generaConcurso?: boolean
  tipoConcurso?: TipoConcurso
  escalafonId?: string
}

interface ValidacionResult {
  valido: boolean
  errores: string[]
}

function validarBajaInput(input: ValidacionBajaInput): ValidacionResult {
  const errores: string[] = []
  const esBorrador = input.estado === 'resolucion_a_la_firma'

  // tipoConcurso requerido cuando generaConcurso=true y NO es borrador
  if (!esBorrador && input.generaConcurso === true && !input.tipoConcurso) {
    errores.push('tipoConcurso es requerido cuando generaConcurso es true')
  }

  // escalafonId requerido cuando tipoConcurso=ceetps
  if (input.tipoConcurso === 'ceetps' && !input.escalafonId) {
    errores.push('escalafonId es requerido cuando tipoConcurso es ceetps')
  }

  return { valido: errores.length === 0, errores }
}

// =============================================================================
// Lógica del borrador — qué campos se incluyen según el paso del wizard
// =============================================================================

interface WizardState {
  paso: 1 | 2 | 3
  generaConcurso: boolean | null
  tipoConcurso: TipoConcurso | null
}

interface BorradorBody {
  estado: 'resolucion_a_la_firma'
  generaConcurso?: boolean
  tipoConcurso?: TipoConcurso
}

function buildBorradorBody(wizard: WizardState): BorradorBody {
  const body: BorradorBody = { estado: 'resolucion_a_la_firma' }

  // Solo incluir generaConcurso si el usuario ya pasó por el paso 2
  if (wizard.generaConcurso !== null) {
    body.generaConcurso = wizard.generaConcurso
    if (wizard.generaConcurso && wizard.tipoConcurso) {
      body.tipoConcurso = wizard.tipoConcurso
    }
  }

  return body
}

// =============================================================================
// TESTS
// =============================================================================

describe('procesarBaja — lógica central', () => {

  describe('Borrador (resolucion_a_la_firma)', () => {
    it('no toca el cargo ni crea concurso', () => {
      const r = procesarBaja({ estado: 'resolucion_a_la_firma', generaConcurso: true, tipoConcurso: 'cph' })
      expect(r.estadoBaja).toBe('resolucion_a_la_firma')
      expect(r.estadoCargo).toBe('vigente')
      expect(r.creaConcurso).toBe(false)
      expect(r.error).toBeUndefined()
    })

    it('borrador sin generaConcurso definido tampoco toca nada', () => {
      const r = procesarBaja({ estado: 'resolucion_a_la_firma' })
      expect(r.estadoBaja).toBe('resolucion_a_la_firma')
      expect(r.creaConcurso).toBe(false)
    })
  })

  describe('Con concurso (generaConcurso=true)', () => {
    it('cargo pasa a vigente y baja a confirmada', () => {
      const r = procesarBaja({ generaConcurso: true, tipoConcurso: 'cph' })
      expect(r.estadoCargo).toBe('vigente')
      expect(r.estadoBaja).toBe('confirmada')
      expect(r.creaConcurso).toBe(true)
      expect(r.error).toBeUndefined()
    })

    it('tipo CEETPS también pasa a vigente y confirmada', () => {
      const r = procesarBaja({ generaConcurso: true, tipoConcurso: 'ceetps' })
      expect(r.estadoCargo).toBe('vigente')
      expect(r.estadoBaja).toBe('confirmada')
      expect(r.creaConcurso).toBe(true)
    })

    it('sin tipoConcurso → error, no confirma', () => {
      const r = procesarBaja({ generaConcurso: true })
      expect(r.error).toBeDefined()
      expect(r.estadoBaja).not.toBe('confirmada')
      expect(r.creaConcurso).toBe(false)
    })

    it('CPH con concurso abierto existente → error de conflicto', () => {
      const r = procesarBaja({ generaConcurso: true, tipoConcurso: 'cph' }, true)
      expect(r.error).toMatch(/concurso CPH abierto/)
      expect(r.creaConcurso).toBe(false)
    })

    it('CEETPS con concurso abierto existente → no bloquea (solo CPH tiene unicidad)', () => {
      const r = procesarBaja({ generaConcurso: true, tipoConcurso: 'ceetps' }, true)
      expect(r.error).toBeUndefined()
      expect(r.creaConcurso).toBe(true)
    })
  })

  describe('Sin concurso (generaConcurso=false)', () => {
    it('cargo pasa a no_vigente y baja a confirmada', () => {
      const r = procesarBaja({ generaConcurso: false })
      expect(r.estadoCargo).toBe('no_vigente')
      expect(r.estadoBaja).toBe('confirmada')
      expect(r.creaConcurso).toBe(false)
    })

    it('generaConcurso undefined se trata igual que false', () => {
      const r = procesarBaja({})
      expect(r.estadoCargo).toBe('no_vigente')
      expect(r.estadoBaja).toBe('confirmada')
      expect(r.creaConcurso).toBe(false)
    })
  })

  describe('Invariantes del sistema', () => {
    it('baja confirmada nunca queda en pendiente', () => {
      const casos: BajaInput[] = [
        { generaConcurso: true, tipoConcurso: 'cph' },
        { generaConcurso: false },
        {},
      ]
      for (const c of casos) {
        const r = procesarBaja(c)
        expect(r.estadoBaja).not.toBe('pendiente')
      }
    })

    it('cargo vigente solo cuando hay concurso activo', () => {
      const conConcurso = procesarBaja({ generaConcurso: true, tipoConcurso: 'cph' })
      const sinConcurso = procesarBaja({ generaConcurso: false })
      expect(conConcurso.estadoCargo).toBe('vigente')
      expect(sinConcurso.estadoCargo).toBe('no_vigente')
    })

    it('nunca crea concurso sin confirmación de baja', () => {
      // Si hay error, no debe crear concurso
      const r = procesarBaja({ generaConcurso: true }) // sin tipoConcurso
      expect(r.creaConcurso).toBe(false)
    })
  })
})

describe('validarBajaInput — schema Zod', () => {

  describe('Borrador — validaciones relajadas', () => {
    it('borrador sin generaConcurso es válido', () => {
      const r = validarBajaInput({ estado: 'resolucion_a_la_firma' })
      expect(r.valido).toBe(true)
    })

    it('borrador con generaConcurso=true sin tipoConcurso es válido', () => {
      // El usuario todavía no llegó al paso 2
      const r = validarBajaInput({ estado: 'resolucion_a_la_firma', generaConcurso: true })
      expect(r.valido).toBe(true)
    })

    it('borrador con generaConcurso=false es válido', () => {
      const r = validarBajaInput({ estado: 'resolucion_a_la_firma', generaConcurso: false })
      expect(r.valido).toBe(true)
    })
  })

  describe('Confirmación — validaciones estrictas', () => {
    it('generaConcurso=true sin tipoConcurso → inválido', () => {
      const r = validarBajaInput({ generaConcurso: true })
      expect(r.valido).toBe(false)
      expect(r.errores[0]).toMatch(/tipoConcurso/)
    })

    it('generaConcurso=true con tipoConcurso=cph → válido', () => {
      const r = validarBajaInput({ generaConcurso: true, tipoConcurso: 'cph' })
      expect(r.valido).toBe(true)
    })

    it('tipoConcurso=ceetps sin escalafonId → inválido', () => {
      const r = validarBajaInput({ generaConcurso: true, tipoConcurso: 'ceetps' })
      expect(r.valido).toBe(false)
      expect(r.errores.some((e) => e.includes('escalafonId'))).toBe(true)
    })

    it('tipoConcurso=ceetps con escalafonId → válido', () => {
      const r = validarBajaInput({ generaConcurso: true, tipoConcurso: 'ceetps', escalafonId: 'uuid-123' })
      expect(r.valido).toBe(true)
    })

    it('generaConcurso=false sin tipoConcurso → válido', () => {
      const r = validarBajaInput({ generaConcurso: false })
      expect(r.valido).toBe(true)
    })

    it('generaConcurso undefined sin tipoConcurso → válido', () => {
      const r = validarBajaInput({})
      expect(r.valido).toBe(true)
    })
  })
})

describe('buildBorradorBody — wizard frontend', () => {

  it('paso 1: no incluye generaConcurso ni tipoConcurso', () => {
    const body = buildBorradorBody({ paso: 1, generaConcurso: null, tipoConcurso: null })
    expect(body.estado).toBe('resolucion_a_la_firma')
    expect(body.generaConcurso).toBeUndefined()
    expect(body.tipoConcurso).toBeUndefined()
  })

  it('paso 2 con concurso: incluye generaConcurso=true y tipoConcurso', () => {
    const body = buildBorradorBody({ paso: 2, generaConcurso: true, tipoConcurso: 'cph' })
    expect(body.generaConcurso).toBe(true)
    expect(body.tipoConcurso).toBe('cph')
  })

  it('paso 2 sin concurso: incluye generaConcurso=false, sin tipoConcurso', () => {
    const body = buildBorradorBody({ paso: 2, generaConcurso: false, tipoConcurso: null })
    expect(body.generaConcurso).toBe(false)
    expect(body.tipoConcurso).toBeUndefined()
  })

  it('paso 2 con concurso pero sin tipoConcurso aún: no incluye tipoConcurso', () => {
    const body = buildBorradorBody({ paso: 2, generaConcurso: true, tipoConcurso: null })
    expect(body.generaConcurso).toBe(true)
    expect(body.tipoConcurso).toBeUndefined()
  })

  it('el body del borrador siempre tiene estado resolucion_a_la_firma', () => {
    const casos: WizardState[] = [
      { paso: 1, generaConcurso: null, tipoConcurso: null },
      { paso: 2, generaConcurso: true, tipoConcurso: 'cph' },
      { paso: 2, generaConcurso: false, tipoConcurso: null },
      { paso: 3, generaConcurso: true, tipoConcurso: 'ceetps' },
    ]
    for (const c of casos) {
      expect(buildBorradorBody(c).estado).toBe('resolucion_a_la_firma')
    }
  })
})

describe('Flujo completo — integración de las 3 lógicas', () => {

  it('Flujo A: borrador → confirmar con CPH', () => {
    // 1. Guardar borrador en paso 1
    const borrador = buildBorradorBody({ paso: 1, generaConcurso: null, tipoConcurso: null })
    expect(validarBajaInput({ estado: borrador.estado }).valido).toBe(true)
    const r1 = procesarBaja(borrador)
    expect(r1.estadoBaja).toBe('resolucion_a_la_firma')

    // 2. Confirmar con concurso CPH
    const confirmacion = { generaConcurso: true as const, tipoConcurso: 'cph' as TipoConcurso }
    expect(validarBajaInput(confirmacion).valido).toBe(true)
    const r2 = procesarBaja(confirmacion)
    expect(r2.estadoBaja).toBe('confirmada')
    expect(r2.estadoCargo).toBe('vigente')
    expect(r2.creaConcurso).toBe(true)
  })

  it('Flujo B: borrador → confirmar sin concurso', () => {
    const borrador = buildBorradorBody({ paso: 1, generaConcurso: null, tipoConcurso: null })
    const r1 = procesarBaja(borrador)
    expect(r1.estadoBaja).toBe('resolucion_a_la_firma')

    const confirmacion = { generaConcurso: false as const }
    expect(validarBajaInput(confirmacion).valido).toBe(true)
    const r2 = procesarBaja(confirmacion)
    expect(r2.estadoBaja).toBe('confirmada')
    expect(r2.estadoCargo).toBe('no_vigente')
    expect(r2.creaConcurso).toBe(false)
  })

  it('Flujo C: directo sin borrador con CPH', () => {
    const input = { generaConcurso: true as const, tipoConcurso: 'cph' as TipoConcurso }
    expect(validarBajaInput(input).valido).toBe(true)
    const r = procesarBaja(input)
    expect(r.estadoBaja).toBe('confirmada')
    expect(r.estadoCargo).toBe('vigente')
    expect(r.creaConcurso).toBe(true)
  })

  it('Flujo D: directo sin borrador sin concurso', () => {
    const input = { generaConcurso: false as const }
    expect(validarBajaInput(input).valido).toBe(true)
    const r = procesarBaja(input)
    expect(r.estadoBaja).toBe('confirmada')
    expect(r.estadoCargo).toBe('no_vigente')
    expect(r.creaConcurso).toBe(false)
  })

  it('Flujo E: intento de CPH con concurso ya abierto → bloqueado', () => {
    const input = { generaConcurso: true as const, tipoConcurso: 'cph' as TipoConcurso }
    const r = procesarBaja(input, true) // concursoAbiertoExistente=true
    expect(r.error).toBeDefined()
    expect(r.creaConcurso).toBe(false)
    expect(r.estadoBaja).not.toBe('confirmada')
  })

  it('Flujo F: borrador guardado en paso 2 con decisión → restaura correctamente', () => {
    // Simula que el usuario llegó al paso 2 y eligió CPH, luego guardó borrador
    const borrador = buildBorradorBody({ paso: 2, generaConcurso: true, tipoConcurso: 'cph' })
    expect(borrador.generaConcurso).toBe(true)
    expect(borrador.tipoConcurso).toBe('cph')
    // Al recargar, el wizard restaura generaConcurso=true desde bajaExistente.generaConcurso
    // y puede confirmar directamente
    const r = procesarBaja({ generaConcurso: borrador.generaConcurso, tipoConcurso: borrador.tipoConcurso })
    expect(r.estadoBaja).toBe('confirmada')
    expect(r.estadoCargo).toBe('vigente')
  })
})
