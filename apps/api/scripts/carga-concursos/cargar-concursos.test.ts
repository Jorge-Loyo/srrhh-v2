import { describe, it, expect } from 'vitest'
import {
  resolverDesignadoActivo,
  crearCargo,
  cphCalcInput,
  armarObservaciones,
  type Caches,
  type CrInfo,
  type Fila,
} from './cargar-concursos.js'
import { calcConcursoCph } from '../../src/modules/concursos-cph/concursosCph.calc.js'
import type { Warnings } from './helpers.js'

// ─────────────────────────────────────────────────────────────────────────────
// Test de la lógica de resolución del script con un Prisma TX mockeado (NO hay
// Postgres efímero en MINGW, así que se corre la lógica pura con mocks, como
// prevé el PLAN ítem 9). Cubre: designado-activo→reusa cargo (Paso G),
// designado-externo→crea cargo, vacante→crea cargo, prefijo/escalafón por CR,
// escalafonId === CR.escalafon_id, y el mapeo del ConcursoCphCalcInput
// (disposicion=null, inscripcionCerrada=false) + observaciones [ETL].
// ─────────────────────────────────────────────────────────────────────────────

const CR_CPH: CrInfo = {
  id: 'cr-22',
  escalafonId: 'esc-cph',
  escalafonNombre: 'Nueva Carrera Prof. Hosp',
}
const CR_ENF: CrInfo = { id: 'cr-87', escalafonId: 'esc-enf', escalafonNombre: 'Nueva Carrera Enfermería' }
const CR_TEC: CrInfo = { id: 'cr-85', escalafonId: 'esc-tec', escalafonNombre: 'CEETPS' }
const CR_ADM: CrInfo = { id: 'cr-83', escalafonId: 'esc-adm', escalafonNombre: 'Nueva Carrera Administrativa' }

// Catálogo mínimo: cualquier resolución de puesto auto-crea un puesto nuevo.
function nuevoCaches(): Caches {
  return {
    catalogo: {
      puestos: new Map(),
      especialidades: new Map(),
      especialidadesPorPuesto: new Map(),
      especialidadPuestoCargId: new Map(),
    },
    hospitalesPorSigla: new Map([['HGAZ', 'hosp-1']]),
    crCph: CR_CPH,
    crPorSubCarrera: { ENFERMERIA: CR_ENF, TECNICOS: CR_TEC, ANEXO2: CR_ADM },
  }
}

// TX mock: registra los cargos creados y permite inyectar persona/ocupación.
interface MockOpts {
  persona?: { id: string } | null
  ocupacion?: { cargoId: string } | null
}
function mockTx(opts: MockOpts = {}) {
  const cargosCreados: Array<Record<string, unknown>> = []
  const puestosCreados: Array<Record<string, unknown>> = []
  let seq = 0
  const tx = {
    persona: {
      findUnique: async () => opts.persona ?? null,
    },
    ocupacion: {
      findFirst: async () => opts.ocupacion ?? null,
    },
    puestoCargo: {
      findMany: async () => [],
      create: async (args: { data: Record<string, unknown> }) => {
        const p = { id: `puesto-${++seq}`, ...args.data }
        puestosCreados.push(p)
        return p
      },
    },
    especialidadPuesto: {
      findMany: async () => [],
      create: async () => ({ id: `esp-${++seq}` }),
    },
    cargo: {
      create: async (args: { data: Record<string, unknown>; select?: unknown }) => {
        const c = { id: `cargo-${++seq}`, ...args.data }
        cargosCreados.push(c)
        return c
      },
    },
    // siguienteCodigoCargo usa $queryRaw(SELECT MAX…) — devolver sin máximo.
    $queryRaw: async () => [{ max_seq: null }],
  }
  return { tx, cargosCreados, puestosCreados }
}

describe('resolverDesignadoActivo — Paso G', () => {
  it('designado con ocupación vigente → reusa el cargo existente', async () => {
    const { tx } = mockTx({ persona: { id: 'per-1' }, ocupacion: { cargoId: 'cargo-exist' } })
    const w: Warnings = []
    const r = await resolverDesignadoActivo(
      tx as never,
      { cuil_designado: '27207485263', nombre_designado: 'TODORO GLADYS' },
      w,
    )
    expect(r.yaActivo).toBe(true)
    expect(r.cargoIdExistente).toBe('cargo-exist')
    expect(r.personaDesignadaId).toBe('per-1')
  })

  it('designado externo (CUIL válido sin persona) → no reusa, marca externo', async () => {
    const { tx } = mockTx({ persona: null })
    const w: Warnings = []
    const r = await resolverDesignadoActivo(
      tx as never,
      { cuil_designado: '27207485263', nombre_designado: 'EXTERNO X' },
      w,
    )
    expect(r.externo).toBe(true)
    expect(r.cargoIdExistente).toBeNull()
    expect(w.some((m) => m.includes('externo'))).toBe(true)
  })

  it('VACANTE A CUBRIR → sin designar, sin tocar persona', async () => {
    const { tx } = mockTx()
    const w: Warnings = []
    const r = await resolverDesignadoActivo(
      tx as never,
      { cuil_designado: '', nombre_designado: 'VACANTE A CUBRIR' },
      w,
    )
    expect(r.yaActivo).toBe(false)
    expect(r.personaDesignadaId).toBeNull()
  })
})

describe('crearCargo — regla de oro escalafonId = CR.escalafon_id', () => {
  it('CPH: usa CR 22, escalafón del CR, prefijo CPH-*', async () => {
    const { tx, cargosCreados } = mockTx()
    const caches = nuevoCaches()
    const fila: Fila = { puesto_solicitado: 'medico de planta', especialidad_solicitada: 'clinica medica' }
    const id = await crearCargo(tx as never, caches, {
      tipo: 'cph',
      fila,
      hospitalId: 'hosp-1',
      usuarioCarga: 'user-1',
    })
    expect(id).toMatch(/^cargo-/)
    const c = cargosCreados[0]!
    expect(c.codigoRegistroId).toBe('cr-22')
    expect(c.escalafonId).toBe('esc-cph')
    expect(String(c.codigo)).toMatch(/^CPH-/)
    expect(c.estado).toBe('validacion_vacante')
    expect(c.origen).toBe('manual')
    expect(c.createdById).toBe('user-1')
    expect(String(c.idSial)).toMatch(/^MANUAL-CPH-/)
  })

  it('CEETPS enfermería → CR 87, escalafón del CR, prefijo ENF', async () => {
    const { tx, cargosCreados } = mockTx()
    const caches = nuevoCaches()
    const fila: Fila = { sub_carrera: 'ENFERMERIA', puesto_solicitado: 'enfermero' }
    await crearCargo(tx as never, caches, { tipo: 'ceetps', fila, hospitalId: 'hosp-1', usuarioCarga: 'u' })
    const c = cargosCreados[0]!
    expect(c.codigoRegistroId).toBe('cr-87')
    expect(c.escalafonId).toBe('esc-enf')
    expect(String(c.codigo)).toMatch(/^ENF-/)
  })

  it('CEETPS técnico de guardia → prefijo TEC-POU; planta → TEC-POF', async () => {
    const caches = nuevoCaches()
    {
      const { tx, cargosCreados } = mockTx()
      await crearCargo(tx as never, caches, {
        tipo: 'ceetps',
        fila: { sub_carrera: 'TECNICOS', puesto_solicitado: 'tecnico de GUARDIA' },
        hospitalId: 'hosp-1',
        usuarioCarga: 'u',
      })
      expect(String(cargosCreados[0]!.codigo)).toMatch(/^TEC-POU-/)
    }
    {
      const { tx, cargosCreados } = mockTx()
      await crearCargo(tx as never, caches, {
        tipo: 'ceetps',
        fila: { sub_carrera: 'TECNICOS', puesto_solicitado: 'tecnico radiologo' },
        hospitalId: 'hosp-1',
        usuarioCarga: 'u',
      })
      expect(String(cargosCreados[0]!.codigo)).toMatch(/^TEC-POF-/)
    }
  })

  it('CEETPS ANEXO2 → CR 83, escalafón administrativa, prefijo EG', async () => {
    const { tx, cargosCreados } = mockTx()
    const caches = nuevoCaches()
    await crearCargo(tx as never, caches, {
      tipo: 'ceetps',
      fila: { sub_carrera: 'ANEXO2', puesto_solicitado: 'camillero' },
      hospitalId: 'hosp-1',
      usuarioCarga: 'u',
    })
    const c = cargosCreados[0]!
    expect(c.codigoRegistroId).toBe('cr-83')
    expect(c.escalafonId).toBe('esc-adm')
    expect(String(c.codigo)).toMatch(/^EG-/)
  })
})

describe('cphCalcInput — campos sin columna fijados y estado derivado', () => {
  it('disposicion=null, inscripcionCerrada=false, ordenMeritoConfirmado=false', () => {
    const w: Warnings = []
    const input = cphCalcInput(
      {
        suspendido: '',
        ee_concurso: 'EX-2026-1',
        fecha_ee_concurso: '2026-01-10',
        fecha_autorizacion: '2026-02-01',
        sorteo_jurado: '2026-02-15',
      },
      w,
    )
    expect(input.disposicion).toBeNull()
    expect(input.inscripcionCerrada).toBe(false)
    expect(input.ordenMeritoConfirmado).toBe(false)
    const calc = calcConcursoCph(input)
    expect(calc.estado).toBe('activo')
    expect(calc.subEstado).toBe('b-sorteo jur')
  })

  it('fila C-DISPO sin fechas de inscripción recalcula un nivel por debajo (discrepancia esperada)', () => {
    const w: Warnings = []
    const input = cphCalcInput(
      { ee_concurso: 'EX-1', fecha_ee_concurso: '2026-01-10', fecha_autorizacion: '2026-02-01', sorteo_jurado: '2026-02-15' },
      w,
    )
    const calc = calcConcursoCph(input)
    // etapa="c-dispo de llamado" pero sin disposicion (sin columna) → b-sorteo jur
    expect(calc.subEstado).toBe('b-sorteo jur')
    expect(calc.subEstado).not.toBe('c-dispo de llamado')
  })
})

describe('armarObservaciones — trazabilidad [ETL]', () => {
  it('CPH: vuelca Respuesta + id_cargo_legacy + warnings con prefijo [ETL]', () => {
    const obs = armarObservaciones(
      {
        observaciones: 'PARA PROYECTO DE RESO',
        Respuesta: 'edita y coloca 2026',
        id_cargo_legacy: 'CPH-15971',
        cargos_2_0: 'CPH-G-005742',
        _warnings: 'año corregido',
      },
      'cph',
      ['loader warn x'],
    )
    expect(obs).toContain('PARA PROYECTO DE RESO')
    expect(obs).toContain('[ETL]')
    expect(obs).toContain('CPH-15971')
    expect(obs).toContain('Respuesta=edita y coloca 2026')
    expect(obs).toContain('loader_warnings=loader warn x')
  })

  it('sin datos extra → null', () => {
    expect(armarObservaciones({}, 'ceetps', [])).toBeNull()
  })
})
