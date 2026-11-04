import { createConcursoTx } from './concursos.service.js'
import type { CreateConcursoBody } from './concursos.schema.js'

// =============================================================================
// Integración (tx mockeado, sin BD): al abrir un concurso sobre un cargo
// vigente SIN ocupante, createConcursoTx recalcula cargos.sub_estado y lo deja
// en 'concurso' dentro de la MISMA transacción. Ver
// .agents/tasks/fix-sub-estado/design.md §b (B7) y §d.
//
// Se usa la rama CEETPS (la más simple: no toca crCph ni calcConcursoCph) para
// ejercitar el recálculo con un mock mínimo, mismo criterio que
// concursos.retencion.test.ts.
// =============================================================================

interface CargoFila {
  id: string
  estado: string
  subEstado: string | null
}

// tx mock: registra los update del cargo y responde los count de ocupante /
// concurso que lee el recálculo. Por defecto: sin ocupante, con el concurso
// recién creado como activo -> esperado 'concurso'.
function hacerTx(opts: { ocupaciones?: number; concursosCeetps?: number; concursosCph?: number } = {}) {
  const cargo: CargoFila = { id: 'cargo-1', estado: 'vigente', subEstado: null }
  const updates: Array<Partial<CargoFila>> = []
  const tx = {
    concurso: { create: async ({ data }: { data: unknown }) => ({ id: 'conc-1', ...(data as object) }) },
    concursoCeetps: {
      create: async ({ data }: { data: unknown }) => ({ id: 'ceetps-1', ...(data as object) }),
      // tras crear el concurso, hay uno activo (a menos que el test lo cambie)
      count: async () => opts.concursosCeetps ?? 1,
    },
    concursoCph: { count: async () => opts.concursosCph ?? 0 },
    ocupacion: { count: async () => opts.ocupaciones ?? 0 },
    cargo: {
      findUnique: async () => ({ estado: cargo.estado }),
      update: async ({ data }: { data: Partial<CargoFila> }) => {
        updates.push(data)
        Object.assign(cargo, data)
        return cargo
      },
    },
  } as never
  return { tx, cargo, updates }
}

const bodyCeetps: CreateConcursoBody = {
  cargoId: 'cargo-1',
  hospitalId: 'hosp-1',
  escalafonId: 'esc-1',
  origen: 'Baja',
  fechaVacante: '2026-11-04',
  tipoConcurso: 'ceetps',
} as never

describe('createConcursoTx — recálculo de sub_estado del cargo', () => {
  it('cargo vigente sin ocupante con concurso recién abierto -> sub_estado "concurso"', async () => {
    const { tx, cargo } = hacerTx({ ocupaciones: 0, concursosCeetps: 1 })
    await createConcursoTx(tx, bodyCeetps, 'user-1')
    expect(cargo.subEstado).toBe('concurso')
  })

  it('si el cargo tuviera ocupante vigente, el recálculo manda "ocupado"', async () => {
    const { tx, cargo } = hacerTx({ ocupaciones: 1, concursosCeetps: 1 })
    await createConcursoTx(tx, bodyCeetps, 'user-1')
    expect(cargo.subEstado).toBe('ocupado')
  })
})
