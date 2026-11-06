import { describe, it, expect } from 'vitest'

// =============================================================================
// PASO 1b (flujo concursos) — test de la unificación de la bandeja RICA que
// alimenta la tabla COMPLETA mudada a /cargos/concurso ("Gestión de Concursos").
// ceetpsToConcursoCphShape es la función PURA que mapea una fila CEETPS a la
// forma de ConcursoCph (la que sabe pintar la tabla reutilizada), dejando
// null/vacíos los campos CPH-only. Patrón del repo: test de lógica pura sin
// Prisma ni side effects (ver bandeja-concursos.unit.test.ts).
// =============================================================================

import { ceetpsToConcursoCphShape } from '../modules/concursos/bandeja-gestion.service.js'

const CREATED = new Date('2026-01-01T10:00:00.000Z')
const UPDATED = new Date('2026-03-01T10:00:00.000Z')
const AUTZ = new Date('2026-02-10T00:00:00.000Z')

// Fila CEETPS parcial con los campos que lee el mapper. Los `...` que Prisma
// incluye de más no afectan — el mapper solo toca lo suyo.
function filaCeetps(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ceetps-1',
    concursoId: 'concurso-1',
    cargoId: 'cargo-1',
    hospitalId: 'hospital-1',
    estado: 'sin_autorizar',
    subEstado: 'EXP_CARATULADO',
    expedienteConcurso: 'EE-123',
    puestoSolicitado: 'Administrativo nivel 1',
    puestoCargoSolicitadoId: null,
    cantidadCargos: 1,
    fechaAutorizacion: AUTZ,
    fechaIfacs: null,
    fechaInsal: null,
    expedienteDesignacion: null,
    resolucionDesignacion: null,
    codigoSial: null,
    personaDesignadaId: null,
    cambioEspecialidad: false,
    observaciones: null,
    createdAt: CREATED,
    updatedAt: UPDATED,
    concurso: { cargo: { literalPuesto: 'Administrativo', especialidadLegacy: 'Admin' } },
    hospital: { sigla: 'HGA' },
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fila Prisma parcial para test puro
  } as any
}

describe('ceetpsToConcursoCphShape — CEETPS mapeado a la forma ConcursoCph', () => {
  it('conserva id/estado/subEstado reales del CEETPS y el discriminador tipo', () => {
    const item = ceetpsToConcursoCphShape(filaCeetps())
    expect(item.id).toBe('ceetps-1')
    expect(item.estado).toBe('sin_autorizar')
    expect(item.subEstado).toBe('EXP_CARATULADO')
    expect(item.tipoConcurso).toBe('ceetps')
    // eeConcurso toma el expedienteConcurso del CEETPS.
    expect(item.eeConcurso).toBe('EE-123')
    // puestoSolicitado se conserva (la tabla lo muestra con fallback al cargo).
    expect(item.puestoSolicitado).toBe('Administrativo nivel 1')
  })

  it('deja null/vacíos los campos CPH-only (stepper/respaldatoria/etiquetas)', () => {
    const item = ceetpsToConcursoCphShape(filaCeetps())
    // Sin eeBaja → la tabla clasificará la respaldatoria por el cargo/cobertura.
    expect(item.eeBaja).toBeNull()
    // subEstado3 (stepper CPH) vacío; la fila CEETPS queda en etapa 1.
    expect(item.subEstado3).toBeNull()
    expect(item.especialidadSolicitada).toBeNull()
    // Sin etiquetas (CEETPS no las tiene) — la tabla muestra el control vacío.
    expect(item.etiquetas).toEqual([])
    expect(item.suspendido).toBe(false)
    expect(item.validado).toBe(false)
  })

  it('expone las relaciones concurso/hospital que lee la tabla', () => {
    const item = ceetpsToConcursoCphShape(filaCeetps()) as Record<string, any>
    expect(item.hospital?.sigla).toBe('HGA')
    expect(item.concurso?.cargo?.literalPuesto).toBe('Administrativo')
  })

  it('serializa fechas a ISO (createdAt/updatedAt y fechaAutorizacion)', () => {
    const item = ceetpsToConcursoCphShape(filaCeetps())
    expect(item.createdAt).toBe(CREATED.toISOString())
    expect(item.updatedAt).toBe(UPDATED.toISOString())
    expect(item.fechaAutorizacion).toBe(AUTZ.toISOString())
    // Las fechas CPH que CEETPS no tiene quedan null.
    expect(item.fechaIfacs).toBeNull()
    expect(item.fechaInsal).toBeNull()
  })
})
