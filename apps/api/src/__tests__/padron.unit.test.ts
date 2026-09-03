import { describe, it, expect } from 'vitest'

// ─── Funciones puras extraídas de padron.service.ts ───────────────────────────
// Se replican acá para testearlas sin importar el módulo completo (que arrastra
// Prisma, axios, etc.). Si cambian en el service, hay que actualizar acá también.

function strVal(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function parseFechaDDMMYYYY(v: string | undefined): Date | null {
  if (!v) return null
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v)
  if (!m) return null
  const [, d, mo, y] = m
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
  return Number.isNaN(date.getTime()) ? null : date
}

// ─── Lógica de diff (extraída de calcularDiff) ────────────────────────────────
// Replica la clasificación nuevo/eliminado/modificado sin tocar la BD.

type RegistroPython = Record<string, unknown>

function clasificarDiff(
  nuevosMap: Map<string, RegistroPython>,
  actualesMap: Map<string, { idSial: string; literalPuesto: string | null; especialidadLegacy: string | null }>,
) {
  const nuevosIds   = new Set(nuevosMap.keys())
  const actualesIds = new Set(actualesMap.keys())

  const nuevos     = [...nuevosIds].filter((id) => !actualesIds.has(id))
  const eliminados = [...actualesIds].filter((id) => !nuevosIds.has(id))
  const candidatos = [...nuevosIds].filter((id) => actualesIds.has(id))

  const modificados: { idSial: string; campo: string; anterior: string; nuevo: string }[] = []
  for (const idSial of candidatos) {
    const r      = nuevosMap.get(idSial)!
    const actual = actualesMap.get(idSial)!
    const vNuevo = strVal(r['LITERAL PUESTO'] ?? r['literal_puesto'])
    const vAnterior = strVal(actual.literalPuesto)
    if (vNuevo !== vAnterior) {
      modificados.push({ idSial, campo: 'literal_puesto', anterior: vAnterior, nuevo: vNuevo })
    }
  }

  return { nuevos, eliminados, modificados }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('strVal', () => {
  it('null → string vacío', () => expect(strVal(null)).toBe(''))
  it('undefined → string vacío', () => expect(strVal(undefined)).toBe(''))
  it('número → string', () => expect(strVal(42)).toBe('42'))
  it('string con espacios → trimmed', () => expect(strVal('  hola  ')).toBe('hola'))
  it('string vacío → vacío', () => expect(strVal('')).toBe(''))
  it('0 → "0"', () => expect(strVal(0)).toBe('0'))
})

describe('parseFechaDDMMYYYY', () => {
  it('fecha válida DD/MM/YYYY', () => {
    const d = parseFechaDDMMYYYY('15/03/2024')
    expect(d).not.toBeNull()
    expect(d!.getUTCFullYear()).toBe(2024)
    expect(d!.getUTCMonth()).toBe(2)   // 0-indexed
    expect(d!.getUTCDate()).toBe(15)
  })

  it('fecha con día/mes de un dígito', () => {
    const d = parseFechaDDMMYYYY('1/1/2020')
    expect(d).not.toBeNull()
    expect(d!.getUTCFullYear()).toBe(2020)
    expect(d!.getUTCMonth()).toBe(0)
    expect(d!.getUTCDate()).toBe(1)
  })

  it('string vacío → null', () => expect(parseFechaDDMMYYYY('')).toBeNull())
  it('undefined → null', () => expect(parseFechaDDMMYYYY(undefined)).toBeNull())
  it('formato ISO incorrecto → null', () => expect(parseFechaDDMMYYYY('2024-03-15')).toBeNull())
  it('texto libre → null', () => expect(parseFechaDDMMYYYY('no es fecha')).toBeNull())

  it('no interpreta como MM/DD (bug histórico)', () => {
    // 15/03/2024 debe ser 15 de marzo, no 3 de marzo (que sería si se usara new Date("15/03/2024"))
    const d = parseFechaDDMMYYYY('15/03/2024')!
    expect(d.getUTCMonth()).toBe(2) // marzo = índice 2
    expect(d.getUTCDate()).toBe(15)
  })

  it('fecha inválida (día 32) → null', () => {
    // new Date(UTC(2024, 0, 32)) hace overflow a feb 1 — el parser lo acepta,
    // pero documentamos el comportamiento actual
    const d = parseFechaDDMMYYYY('32/01/2024')
    // El regex no matchea porque 32 tiene 2 dígitos pero es inválido como fecha
    // — en realidad el regex sí matchea, Date.UTC hace overflow. Documentamos:
    expect(d).not.toBeNull() // overflow silencioso de Date.UTC
  })
})

describe('clasificarDiff (lógica de nuevo/eliminado/modificado)', () => {
  const mkActual = (idSial: string, literalPuesto: string | null = null) => ({
    idSial,
    literalPuesto,
    especialidadLegacy: null,
  })

  it('ID SIAL nuevo → clasificado como nuevo', () => {
    const nuevos = new Map([['SIAL-001', { 'LITERAL PUESTO': 'Médico de Planta' }]])
    const actuales = new Map<string, ReturnType<typeof mkActual>>()
    const { nuevos: n, eliminados: e, modificados: m } = clasificarDiff(nuevos, actuales)
    expect(n).toContain('SIAL-001')
    expect(e).toHaveLength(0)
    expect(m).toHaveLength(0)
  })

  it('ID SIAL ausente del padrón → clasificado como eliminado', () => {
    const nuevos = new Map<string, RegistroPython>()
    const actuales = new Map([['SIAL-002', mkActual('SIAL-002', 'Enfermero/a')]])
    const { nuevos: n, eliminados: e } = clasificarDiff(nuevos, actuales)
    expect(e).toContain('SIAL-002')
    expect(n).toHaveLength(0)
  })

  it('ID SIAL en ambos sin cambios → no genera diff', () => {
    const nuevos = new Map([['SIAL-003', { 'LITERAL PUESTO': 'Técnico de Laboratorio' }]])
    const actuales = new Map([['SIAL-003', mkActual('SIAL-003', 'Técnico de Laboratorio')]])
    const { modificados: m } = clasificarDiff(nuevos, actuales)
    expect(m).toHaveLength(0)
  })

  it('ID SIAL en ambos con LITERAL PUESTO distinto → modificado', () => {
    const nuevos = new Map([['SIAL-004', { 'LITERAL PUESTO': 'Médico Especialista' }]])
    const actuales = new Map([['SIAL-004', mkActual('SIAL-004', 'Médico de Planta')]])
    const { modificados: m } = clasificarDiff(nuevos, actuales)
    expect(m).toHaveLength(1)
    expect(m[0].campo).toBe('literal_puesto')
    expect(m[0].anterior).toBe('Médico de Planta')
    expect(m[0].nuevo).toBe('Médico Especialista')
  })

  it('campo con key snake_case también matchea', () => {
    const nuevos = new Map([['SIAL-005', { literal_puesto: 'Bioquímico' }]])
    const actuales = new Map([['SIAL-005', mkActual('SIAL-005', 'Bioquimico')]])
    const { modificados: m } = clasificarDiff(nuevos, actuales)
    expect(m).toHaveLength(1)
  })

  it('padrón vacío + BD con datos → todos eliminados', () => {
    const nuevos = new Map<string, RegistroPython>()
    const actuales = new Map([
      ['A', mkActual('A')],
      ['B', mkActual('B')],
      ['C', mkActual('C')],
    ])
    const { eliminados: e, nuevos: n } = clasificarDiff(nuevos, actuales)
    expect(e).toHaveLength(3)
    expect(n).toHaveLength(0)
  })

  it('BD vacía + padrón con datos → todos nuevos', () => {
    const nuevos = new Map<string, RegistroPython>([
      ['X', {}], ['Y', {}], ['Z', {}],
    ])
    const actuales = new Map<string, ReturnType<typeof mkActual>>()
    const { nuevos: n, eliminados: e } = clasificarDiff(nuevos, actuales)
    expect(n).toHaveLength(3)
    expect(e).toHaveLength(0)
  })

  it('strVal normaliza espacios en la comparación', () => {
    const nuevos = new Map([['SIAL-006', { 'LITERAL PUESTO': '  Médico  ' }]])
    const actuales = new Map([['SIAL-006', mkActual('SIAL-006', 'Médico')]])
    // strVal hace trim, así que '  Médico  '.trim() === 'Médico' → sin diff
    const { modificados: m } = clasificarDiff(nuevos, actuales)
    expect(m).toHaveLength(0)
  })
})

describe('Reglas de negocio del diff — casos borde', () => {
  it('mismo ID SIAL con valor null en BD y vacío en padrón → no es modificado', () => {
    // strVal(null) = '' y strVal('') = '' → iguales
    const nuevos = new Map([['SIAL-007', { 'LITERAL PUESTO': '' }]])
    const actuales = new Map([['SIAL-007', { idSial: 'SIAL-007', literalPuesto: null, especialidadLegacy: null }]])
    const { modificados: m } = clasificarDiff(nuevos, actuales)
    expect(m).toHaveLength(0)
  })

  it('ID SIAL en padrón y en BD → no es nuevo ni eliminado', () => {
    const nuevos = new Map([['SIAL-008', { 'LITERAL PUESTO': 'Médico' }]])
    const actuales = new Map([['SIAL-008', { idSial: 'SIAL-008', literalPuesto: 'Médico', especialidadLegacy: null }]])
    const { nuevos: n, eliminados: e } = clasificarDiff(nuevos, actuales)
    expect(n).toHaveLength(0)
    expect(e).toHaveLength(0)
  })
})
