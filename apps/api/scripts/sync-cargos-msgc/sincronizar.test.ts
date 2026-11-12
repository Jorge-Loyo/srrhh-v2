import { describe, expect, it, vi } from 'vitest'
import type { CatalogosCrudos } from './cargar.js'
import type { SnapshotSistema } from './cruce.js'
import type { FilaNominal } from './leerNominal.js'
import type { RepoEscritura } from './repoPrisma.js'
import { construirAcronimos, parseArgs, sincronizar, type BaseAbierta, type DepsSync } from './sincronizar.js'

// Todo simulado: no hay base de datos ni red. Se verifica sobre todo QUÉ se abre y QUÉ se escribe.
const URL_LOCAL = 'postgresql://app:secreto@localhost:5432/srrhh'
const URL_NEON = 'postgresql://app:secreto@ep-algo-123.us-east-2.aws.neon.tech/neondb?sslmode=require'

const FILA: FilaNominal = {
  codigo_excel: 'CPH-P-00001', cr: '37', sigla: 'HTAL', tipo: 'Ejecución', planta_guardia: 'Planta', estado: 'Vigente',
  situacion: 'Vacante', literal_puesto: 'Medico', expediente: '', id_sial_rol: '', situacion_revista: '', acronimo: 'CPH-P',
  bloque: 'Sin designar', especialidad_cargo: '', nivel_conduccion: '', cod_rep: '', detalle: '', linea_pou: '',
}
const SNAPSHOT: SnapshotSistema = {
  cargos: [], ocupaciones: [], concursos: [], siglasHospital: ['HTAL'], siglasOrganigrama: [],
  codigosRegistro: [{ codigo: '37', escalafon: 'CPH' }], puestos: [{ escalafon: 'CPH', nombre: 'Medico' }], especialidades: [],
}
const CATALOGOS: CatalogosCrudos = {
  hospitales: [{ id: 'h1', sigla: 'HTAL' }],
  codigosRegistro: [{ id: 'cr1', codigo: '37', escalafonId: 'e1' }],
  puestos: [{ id: 'p1', escalafonId: 'e1', nombre: 'Medico', modalidad: 'pof' }],
  especialidades: [],
}

function armar() {
  const escrituras: string[] = []
  const repo = {
    catalogos: async () => CATALOGOS,
    maximosCodigo: async () => new Map<string, number>(),
    crearHospital: async () => 'h',
    crearCargos: async () => void escrituras.push('crearCargos'),
    actualizarCargos: async () => void escrituras.push('actualizarCargos'),
    pasarNoVigente: async () => 0,
    crearConcursos: async () => void escrituras.push('crearConcursos'),
    reasignarConcursos: async () => undefined,
    asignarEtiqueta: async () => undefined,
    leerCodigos: async () => [],
    liberarCodigos: async () => undefined,
    asignarCodigos: async () => undefined,
    limpiar: async () => {
      escrituras.push('limpiar')
      return { audit_logs: 0 }
    },
    recalcularSubEstado: async () => {
      escrituras.push('subEstado')
      return 0
    },
    hayCorridaEscritura: async () => false,
    registrarCorrida: async () => void escrituras.push('registrarCorrida'),
    datosVerificacion: async () => ({
      vigentes: 0, validacionVacante: 0, prefijosCodigo: {}, integridad: {}, subEstadoInconsistentes: 0,
    }),
  } as unknown as RepoEscritura
  const base: BaseAbierta = {
    leerSnapshot: async () => SNAPSHOT,
    transaccion: async (fn) => fn(repo),
    cerrar: async () => undefined,
  }
  const abrirBase = vi.fn(async (_url: string) => base)
  const deps: DepsSync = {
    abrirBase,
    leerFilas: () => [FILA],
    leerSnapshotJson: () => SNAPSHOT,
    sha256: () => 'abc',
    log: () => undefined,
  }
  return { deps, abrirBase, escrituras }
}
const ARGS = { input: 'nominal.csv', ejecutar: false, confirmoBaseLocal: false, forzarLimpieza: false }

describe('sincronizar: salvaguardas del modo escritura', () => {
  it('se niega con DATABASE_URL de neon.tech aunque se pasen --ejecutar --confirmo-base-local', async () => {
    const { deps, abrirBase, escrituras } = armar()
    await expect(
      sincronizar({ ...ARGS, ejecutar: true, confirmoBaseLocal: true }, { DATABASE_URL: URL_NEON }, deps),
    ).rejects.toThrow(/neon\.tech/)
    expect(abrirBase).not.toHaveBeenCalled() // ni siquiera se abre la conexión
    expect(escrituras).toEqual([])
  })

  it('se niega con un host no local y con DATABASE_URL vacía', async () => {
    const { deps, abrirBase } = armar()
    await expect(sincronizar({ ...ARGS, ejecutar: true, confirmoBaseLocal: true }, { DATABASE_URL: 'postgresql://u:p@db.ejemplo.com/x' }, deps)).rejects.toThrow(/no es local/)
    await expect(sincronizar({ ...ARGS, ejecutar: true, confirmoBaseLocal: true }, {}, deps)).rejects.toThrow(/vacia/)
    expect(abrirBase).not.toHaveBeenCalled()
  })

  it('se niega con --ejecutar sin --confirmo-base-local, incluso con base local', async () => {
    const { deps, abrirBase, escrituras } = armar()
    await expect(sincronizar({ ...ARGS, ejecutar: true }, { DATABASE_URL: URL_LOCAL }, deps)).rejects.toThrow(/confirmo-base-local/)
    expect(abrirBase).not.toHaveBeenCalled()
    expect(escrituras).toEqual([])
  })

  it('sin flags es una simulación: lee pero no abre ninguna transacción de escritura', async () => {
    const { deps, abrirBase, escrituras } = armar()
    const r = await sincronizar(ARGS, { DATABASE_URL: URL_LOCAL }, deps)
    expect(r.modo).toBe('simulacion')
    expect(r.cambiosPlanificados).toBeGreaterThan(0)
    expect(abrirBase).toHaveBeenCalledTimes(1)
    expect(escrituras).toEqual([])
  })

  it('la simulación con fixture no abre ninguna conexión', async () => {
    const { deps, abrirBase } = armar()
    const r = await sincronizar({ ...ARGS, sistemaJson: 'fx.json' }, {}, deps)
    expect(r.modo).toBe('simulacion')
    expect(abrirBase).not.toHaveBeenCalled()
  })

  it('con --ejecutar --confirmo-base-local y base local: limpieza, carga, recodificación y sub_estado; si la verificación falla no registra la corrida', async () => {
    const { deps, abrirBase, escrituras } = armar()
    const r = await sincronizar({ ...ARGS, ejecutar: true, confirmoBaseLocal: true }, { DATABASE_URL: URL_LOCAL }, deps)
    expect(abrirBase).toHaveBeenCalledWith(URL_LOCAL)
    expect(r.modo).toBe('escritura')
    expect(r.limpiezaEjecutada).toBe(true)
    expect(escrituras[0]).toBe('limpiar')
    expect(escrituras.indexOf('limpiar')).toBeLessThan(escrituras.indexOf('crearCargos'))
    expect(escrituras.indexOf('crearCargos')).toBeLessThan(escrituras.indexOf('subEstado'))
    // El mock no cierra el total del Excel: la verificacion falla y la corrida NO se registra como exitosa.
    expect(r.verificacion?.ok).toBe(false)
    expect(escrituras).not.toContain('registrarCorrida')
    expect(escrituras[escrituras.length - 1]).toBe('subEstado')
    expect(r.carga?.cargos_creados).toBe(1)
  })
})

describe('parseArgs y construirAcronimos', () => {
  it('por defecto no ejecuta ni confirma', () => {
    expect(parseArgs(['--input', 'a.csv'])).toMatchObject({ input: 'a.csv', ejecutar: false, confirmoBaseLocal: false, forzarLimpieza: false })
    expect(parseArgs(['--input', 'a.csv', '--ejecutar', '--confirmo-base-local', '--forzar-limpieza'])).toMatchObject({
      ejecutar: true, confirmoBaseLocal: true, forzarLimpieza: true,
    })
    expect(() => parseArgs([])).toThrow(/Uso/)
  })
  it('el acrónimo de la fila del Excel manda sobre el estimado', () => {
    const cargo = {
      id: 'c1', codigo: 'CPH-POF-000001', estado: 'vigente', subEstado: null, eliminado: false, origen: 'padron', tipoOrigen: null,
      expediente: null, codigoRepa: null, sigla: 'HTAL', cr: '37', escalafon: 'CPH', puesto: 'Medico', especialidad: null,
      cargoBaseId: null, cargoRetenidoId: null,
      vinculos: { concursos: 0, concursosCph: 0, concursosCeetps: 0, bajas: 0, padronHistorico: 0, padronIncidencias: 0, etiquetas: 0, solicitudesAlta: 0 },
    } as const
    const m = construirAcronimos(
      { items: [{ cargoId: 'c1', categoria: 'b', fila: { ...FILA, acronimo: 'CPH-G' }, estado: 'vigente', cambios: [], completarExpediente: false, revision: null, etiquetar: false, ampliacion: false, esJefatura: false, claveRol: '', baseCargoId: null, crearConcurso: null }], noVigenteIds: [], concursosConservar: [], concursosEliminar: [], concursosReasignar: [] },
      { ...SNAPSHOT, cargos: [{ ...cargo }] },
    )
    expect(m.get('c1')).toBe('CPH-G')
  })
})
