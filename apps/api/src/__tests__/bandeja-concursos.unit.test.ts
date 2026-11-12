import { describe, it, expect } from 'vitest'

// =============================================================================
// PASO 1 (flujo concursos) — test de la unificación CPH + CEETPS de la bandeja
// mixta. toBandejaItem es la función PURA que mapea una fila del Concurso base
// (con sus extensiones 1:1) a ConcursoBandejaItem, eligiendo la extensión según
// el discriminador tipoConcurso. Patrón del repo: test de lógica pura sin Prisma
// ni side effects (ver concursos-cph-dedup.unit.test.ts).
// =============================================================================

import { toBandejaItem } from '../modules/concursos/bandeja.service.js'

// Fecha fija para `updatedAt`/`createdAt` — las columnas se exponen como ISO.
const CREATED = new Date('2026-01-01T10:00:00.000Z')
const UPDATED_CPH = new Date('2026-02-01T10:00:00.000Z')
const UPDATED_CEETPS = new Date('2026-03-01T10:00:00.000Z')

// Construye una fila base del Concurso con los campos que lee el mapper.
// Los `...` que Prisma incluye de más no afectan — el mapper solo toca lo suyo.
function filaBase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'concurso-1',
    tipoConcurso: 'cph',
    cargoId: 'cargo-1',
    hospitalId: 'hospital-1',
    motivoConcurso: 'alta_por_baja',
    createdAt: CREATED,
    cargo: { literalPuesto: 'Enfermero/a', especialidadLegacy: 'Terapia' },
    hospital: { sigla: 'HGA' },
    concursoCph: null,
    concursoCeetps: null,
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fila Prisma parcial para test puro
  } as any
}

describe('toBandejaItem — unificación CPH + CEETPS de la bandeja mixta', () => {
  it('fila CPH: toma estado/subEstado de concursoCph y tipo "cph"', () => {
    const row = filaBase({
      tipoConcurso: 'cph',
      concursoCph: {
        estado: 'activo',
        subEstado: 'a-autzn',
        puestoSolicitado: null,
        especialidadSolicitada: 'Clínica',
        updatedAt: UPDATED_CPH,
      },
    })
    const item = toBandejaItem(row)
    expect(item.tipo).toBe('cph')
    expect(item.estado).toBe('activo')
    expect(item.subEstado).toBe('a-autzn')
    expect(item.hospitalSigla).toBe('HGA')
    expect(item.puesto).toBe('Enfermero/a')
    expect(item.especialidad).toBe('Clínica') // prioriza la del concurso CPH
    expect(item.ultimoMovimiento).toBe(UPDATED_CPH.toISOString())
    expect(item.motivoConcurso).toBe('alta_por_baja')
  })

  it('fila CEETPS: toma estado/subEstado de concursoCeetps y tipo "ceetps"', () => {
    const row = filaBase({
      tipoConcurso: 'ceetps',
      cargo: { literalPuesto: null, especialidadLegacy: 'Administrativa' },
      concursoCeetps: {
        estado: 'sin_autorizar',
        subEstado: 'EXP_CARATULADO',
        puestoSolicitado: 'Administrativo nivel 1',
        updatedAt: UPDATED_CEETPS,
      },
    })
    const item = toBandejaItem(row)
    expect(item.tipo).toBe('ceetps')
    expect(item.estado).toBe('sin_autorizar')
    expect(item.subEstado).toBe('EXP_CARATULADO')
    // puesto: fallback al puestoSolicitado de la extensión cuando no hay literalPuesto
    expect(item.puesto).toBe('Administrativo nivel 1')
    expect(item.especialidad).toBe('Administrativa')
    expect(item.ultimoMovimiento).toBe(UPDATED_CEETPS.toISOString())
  })

  it('sin extensión (dato inconsistente): estado/subEstado null y fallback a createdAt', () => {
    const row = filaBase({ tipoConcurso: 'cph', concursoCph: null })
    const item = toBandejaItem(row)
    expect(item.estado).toBeNull()
    expect(item.subEstado).toBeNull()
    expect(item.ultimoMovimiento).toBe(CREATED.toISOString())
  })
})
