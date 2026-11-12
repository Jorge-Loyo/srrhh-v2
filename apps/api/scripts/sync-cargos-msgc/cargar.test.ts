import { describe, expect, it } from 'vitest'
import {
  contarCambios, ejecutarCarga, partirCodigo, ResolutorCatalogos, ETIQUETA_CEETPS_SI,
  type CatalogosCrudos, type RepoCarga,
} from './cargar.js'
import { cruzar, type CargoSistema, type ConcursoSistema, type OcupacionViva, type SnapshotSistema } from './cruce.js'
import type { FilaNominal } from './leerNominal.js'
import { planificarRecodificacion } from './recodificar.js'
import { construirAcronimos } from './sincronizar.js'
// Fixtures 100% sintéticos y un "sistema" en memoria: los agentes no tienen base de datos.
const ROL = (n: number) => `90000000${n}-${n}`
const enSistema = (rol: string) => `${rol}-20000000000-${rol.split('-')[1]}`
function fila(p: Partial<FilaNominal> & { codigo_excel: string }): FilaNominal {
  return {
    cr: '37', sigla: 'HTAL', tipo: 'Ejecución', planta_guardia: 'Planta', estado: 'Vigente',
    situacion: 'Ocupado', literal_puesto: 'Medico', expediente: '', id_sial_rol: '',
    situacion_revista: 'Activo', acronimo: 'CPH-P', bloque: 'Dotación', especialidad_cargo: '',
    nivel_conduccion: '', cod_rep: '', detalle: '', linea_pou: '',
    ...p,
  }
}
const VINC0 = { concursos: 0, concursosCph: 0, concursosCeetps: 0, bajas: 0, padronHistorico: 0, padronIncidencias: 0, etiquetas: 0, solicitudesAlta: 0 }
function cargo(p: Partial<CargoSistema> & { id: string; codigo: string | null }): CargoSistema {
  return {
    estado: 'vigente', subEstado: 'ocupado', eliminado: false, origen: 'padron', tipoOrigen: null,
    expediente: null, codigoRepa: null, sigla: 'HTAL', cr: '37', escalafon: 'CPH', puesto: 'Medico',
    especialidad: null, cargoBaseId: null, cargoRetenidoId: null, revisionDato: false, revisionMotivo: null,
    vinculos: { ...VINC0 },
    ...p,
  }
}

const CAT: CatalogosCrudos = {
  hospitales: [{ id: 'h-htal', sigla: 'HTAL' }, { id: 'h-hot', sigla: 'HOT' }],
  codigosRegistro: [
    { id: 'cr-37', codigo: '37', escalafonId: 'e-cph' },
    { id: 'cr-87', codigo: '87', escalafonId: 'e-enf' },
    { id: 'cr-85', codigo: '85', escalafonId: 'e-tec' },
  ],
  puestos: [
    { id: 'p-med', escalafonId: 'e-cph', nombre: 'Medico', modalidad: 'pof' },
    { id: 'p-enf', escalafonId: 'e-enf', nombre: 'Enfermero', modalidad: 'pof' },
    { id: 'p-tec', escalafonId: 'e-tec', nombre: 'Tecnico en esterilizacion', modalidad: 'pof' },
  ],
  especialidades: [],
}
const ESCALAFON_DE_CR: Record<string, string> = { '37': 'CPH', '87': 'ENF', '85': 'TEC' }

/** Sistema en memoria que implementa RepoCarga y sabe armar el snapshot que lee el cruce. */
function sistemaEnMemoria(cargos: CargoSistema[], ocupaciones: OcupacionViva[], concursos: ConcursoSistema[] = []) {
  const catalogos: CatalogosCrudos = structuredClone(CAT)
  const siglaDe = (id: string) => catalogos.hospitales.find((h) => h.id === id)?.sigla as string
  const crDe = (id: string) => catalogos.codigosRegistro.find((c) => c.id === id)?.codigo as string
  const puestoDe = (id: string) => catalogos.puestos.find((p) => p.id === id)?.nombre as string
  const porId = (id: string) => cargos.find((c) => c.id === id) as CargoSistema
  const llamadas = { crearCargos: 0, actualizarCargos: 0 }
  const repo: RepoCarga = {
    catalogos: async () => catalogos,
    maximosCodigo: async () => {
      const m = new Map<string, number>()
      for (const c of cargos) {
        const p = c.codigo ? partirCodigo(c.codigo) : null
        if (p) m.set(p.prefijo, Math.max(m.get(p.prefijo) ?? 0, p.numero))
      }
      return m
    },
    crearHospital: async (sigla) => {
      catalogos.hospitales.push({ id: `h-${sigla}`, sigla })
      return `h-${sigla}`
    },
    crearCargos: async (lote) => {
      llamadas.crearCargos++
      for (const x of lote) {
        cargos.push(cargo({
          id: x.id, codigo: x.codigo, estado: x.estado, subEstado: null, origen: 'msgc', expediente: x.expediente,
          sigla: siglaDe(x.hospitalId), cr: crDe(x.codigoRegistroId as string), escalafon: ESCALAFON_DE_CR[crDe(x.codigoRegistroId as string)],
          puesto: puestoDe(x.puestoCargoId), especialidad: null, cargoBaseId: x.cargoBaseId,
          revisionDato: x.revisionMotivo !== null, revisionMotivo: x.revisionMotivo,
        }))
      }
    },
    actualizarCargos: async (lote) => {
      llamadas.actualizarCargos++
      for (const a of lote) {
        const c = porId(a.id)
        if (a.hospitalId) c.sigla = siglaDe(a.hospitalId)
        if (a.codigoRegistroId) {
          c.cr = crDe(a.codigoRegistroId)
          c.escalafon = ESCALAFON_DE_CR[c.cr]
        }
        if (a.puestoCargoId) c.puesto = puestoDe(a.puestoCargoId)
        if (a.estado) c.estado = a.estado
        if (a.expediente) c.expediente = a.expediente
        if (a.revisionMotivo) {
          c.revisionDato = true
          c.revisionMotivo = a.revisionMotivo
        }
        if (a.cargoBaseId) c.cargoBaseId = a.cargoBaseId
      }
    },
    pasarNoVigente: async (ids) => {
      let n = 0
      for (const id of ids) {
        const c = porId(id)
        if (c.estado !== 'no_vigente') {
          c.estado = 'no_vigente'
          n++
        }
      }
      return n
    },
    crearConcursos: async (lote) => {
      for (const x of lote) {
        concursos.push({
          concursoId: x.concursoId, cargoId: x.cargoId, tipo: x.tipo, estado: x.tipo === 'cph' ? 'no_iniciado' : 'sin_autorizar',
          subEstado: null, motivoConcurso: x.motivoConcurso, autorizado: false, expedientes: [x.expediente],
        })
      }
    },
    reasignarConcursos: async (lote) => {
      for (const x of lote) {
        const co = concursos.find((c) => c.concursoId === x.concursoId)
        if (co) co.cargoId = x.cargoId
      }
    },
    asignarEtiqueta: async (_nombre, ids) => {
      for (const id of ids) porId(id).vinculos.etiquetas = 1
    },
  }
  const snapshot = (): SnapshotSistema => ({
    cargos: structuredClone(cargos),
    ocupaciones: [...ocupaciones],
    concursos: structuredClone(concursos),
    siglasHospital: catalogos.hospitales.map((h) => h.sigla),
    siglasOrganigrama: [],
    codigosRegistro: [{ codigo: '37', escalafon: 'CPH' }, { codigo: '87', escalafon: 'ENF' }, { codigo: '85', escalafon: 'TEC' }],
    puestos: [{ escalafon: 'CPH', nombre: 'Medico' }, { escalafon: 'ENF', nombre: 'Enfermero' }, { escalafon: 'TEC', nombre: 'Tecnico en esterilizacion' }],
    especialidades: [],
  })
  return { repo, snapshot, cargos, concursos, llamadas }
}

function escenario() {
  const filas = [
    // b: ocupado cruzado; el sistema lo tiene en otro hospital -> se actualiza la sigla.
    fila({ codigo_excel: 'CPH-P-00001', id_sial_rol: ROL(1) }),
    // c: ocupado sin ocupación en el sistema -> se crea.
    fila({ codigo_excel: 'CPH-P-00002', id_sial_rol: ROL(2) }),
    // c + d: enfermero con jefatura ENF-J -> se crean los dos y la jefatura queda vinculada al base.
    fila({ codigo_excel: 'ENF-00001', id_sial_rol: ROL(3), cr: '87', acronimo: 'ENF', literal_puesto: 'Enfermero' }),
    fila({ codigo_excel: 'ENF-J-00001', id_sial_rol: ROL(3), cr: '87', acronimo: 'ENF-J', literal_puesto: 'Enfermero', tipo: 'Conducción' }),
    // e: vacante en validación que reusa v1; vacante con concurso que se crea.
    fila({ codigo_excel: 'CPH-P-00003', estado: 'En validación', bloque: 'Sin designar' }),
    fila({ codigo_excel: 'CPH-P-00004', bloque: 'Concurso', expediente: 'EX-2026-00000123' }),
    // Ampliación (cargo nuevo, CEETPS) y concurso CEETPS con tipificador "SI".
    fila({ codigo_excel: 'TEC-00001', cr: '85', acronimo: 'TEC', literal_puesto: 'Tecnico en esterilizacion', bloque: 'Concurso', detalle: 'Ampliación' }),
    fila({ codigo_excel: 'TEC-00002', cr: '85', acronimo: 'TEC', literal_puesto: 'Tecnico en esterilizacion', bloque: 'Concurso', expediente: 'EX-2026-00000200', detalle: 'Caratular / SI' }),
  ]
  const cargos = [
    cargo({ id: 'c1', codigo: 'CPH-POF-000001', sigla: 'HOT' }),
    cargo({ id: 'c9', codigo: 'CPH-POF-000009' }), // ocupado fuera del Excel -> no vigente
    cargo({ id: 'v1', codigo: 'CPH-POF-000100', subEstado: 'vacante' }),
    cargo({ id: 'v2', codigo: 'ENF-000200', cr: '87', escalafon: 'ENF', puesto: 'Enfermero', subEstado: 'vacante' }), // sobrante
  ]
  const ocupaciones: OcupacionViva[] = [
    { idSialRol: enSistema(ROL(1)), cargoId: 'c1' },
    { idSialRol: enSistema(ROL(9)), cargoId: 'c9' },
  ]
  return { filas, sis: sistemaEnMemoria(cargos, ocupaciones) }
}
const contador = () => {
  let n = 0
  return () => `u${++n}`
}

describe('ejecutarCarga: reusa, crea y pasa a no vigente según el plan', () => {
  it('aplica el plan y deja el sistema como pide el Excel', async () => {
    const { filas, sis } = escenario()
    const r = cruzar(filas, sis.snapshot())
    const res = await ejecutarCarga(sis.repo, r.plan, { nuevoId: contador() })
    expect(res.omitidos_sin_catalogo).toEqual({})
    expect(res.cargos_no_vigente).toBe(2) // c9 (ocupado fuera del Excel) y v2 (sobrante)
    expect(sis.cargos.find((c) => c.id === 'c9')?.estado).toBe('no_vigente')
    expect(sis.cargos.find((c) => c.id === 'v2')?.estado).toBe('no_vigente')
    // b: sigla actualizada. e: la fila con concurso reusa la vacante v1 (queda vigente) y el concurso se crea sobre ella.
    expect(sis.cargos.find((c) => c.id === 'c1')?.sigla).toBe('HTAL')
    expect(sis.cargos.find((c) => c.id === 'v1')?.estado).toBe('vigente')
    expect(sis.concursos.find((c) => c.tipo === 'cph')?.cargoId).toBe('v1')
    // Creados: c, base ENF, jefatura ENF-J, e en validación, ampliación, tipificador SI = 6.
    expect(res.cargos_creados).toBe(6)
    const nuevos = sis.cargos.filter((c) => c.origen === 'msgc')
    expect(nuevos.map((c) => c.codigo).sort()).toEqual([
      'CPH-P-000001', 'CPH-P-000002', 'ENF-000201', 'ENF-J-000001', 'TEC-000001', 'TEC-000002',
    ].sort())
    expect(nuevos.find((c) => c.codigo === 'CPH-P-000002')?.estado).toBe('validacion_vacante')
    // Jefatura vinculada con el cargo base de la misma persona.
    const base = nuevos.find((c) => c.codigo === 'ENF-000201')
    const jef = nuevos.find((c) => c.codigo === 'ENF-J-000001')
    expect(jef?.cargoBaseId).toBe(base?.id)
    // Concursos: normal CPH, ampliación CEETPS (nuevo_cargo) y CEETPS con expediente; etiqueta SI.
    expect(res.concursos_creados).toBe(3)
    expect(sis.concursos.filter((c) => c.motivoConcurso === 'nuevo_cargo')).toHaveLength(1)
    expect(sis.concursos.map((c) => c.tipo).sort()).toEqual(['ceetps', 'ceetps', 'cph'])
    expect(res.etiquetas_asignadas).toBe(1)
    expect(nuevos.find((c) => c.codigo === 'TEC-000002')?.vinculos.etiquetas).toBe(1)
    // Ampliación marcada para revisión.
    expect(nuevos.find((c) => c.codigo === 'TEC-000001')?.revisionDato).toBe(true)
  })

  it('es idempotente: una segunda corrida con el mismo Excel no cambia nada', async () => {
    const { filas, sis } = escenario()
    const id = contador()
    const r1 = cruzar(filas, sis.snapshot())
    const res1 = await ejecutarCarga(sis.repo, r1.plan, { nuevoId: id })
    expect(res1.total_cambios).toBeGreaterThan(0)
    const antes = JSON.stringify([sis.cargos, sis.concursos])
    const r2 = cruzar(filas, sis.snapshot())
    expect(contarCambios(r2.plan)).toBe(0)
    const res2 = await ejecutarCarga(sis.repo, r2.plan, { nuevoId: id })
    expect(res2.total_cambios).toBe(0)
    expect(JSON.stringify([sis.cargos, sis.concursos])).toBe(antes)
    // Y el cierre sigue dando el total del Excel.
    expect(r2.cierre.diferencia_vigente_mas_validacion).toBe(0)
  })

  it('carga + recodificación: quedan solo acrónimos nuevos y una nueva corrida no cambia nada', async () => {
    const { filas, sis } = escenario()
    const r1 = cruzar(filas, sis.snapshot())
    await ejecutarCarga(sis.repo, r1.plan, { nuevoId: contador() })
    const acr = construirAcronimos(r1.plan, sis.snapshot())
    const recod = planificarRecodificacion(sis.cargos.map((c) => ({ id: c.id, codigo: c.codigo as string, acronimo: acr.get(c.id) ?? null })))
    for (const cambio of recod.cambios) (sis.cargos.find((c) => c.id === cambio.id) as CargoSistema).codigo = cambio.hasta
    expect(sis.cargos.some((c) => /^CPH-POF-/.test(c.codigo ?? ''))).toBe(false)
    expect(new Set(sis.cargos.map((c) => c.codigo)).size).toBe(sis.cargos.length) // sin codigos repetidos
    const r2 = cruzar(filas, sis.snapshot())
    expect(contarCambios(r2.plan)).toBe(0)
    expect(planificarRecodificacion(sis.cargos.map((c) => ({ id: c.id, codigo: c.codigo as string, acronimo: construirAcronimos(r2.plan, sis.snapshot()).get(c.id) ?? null }))).cambios).toEqual([])
  })

  it('el cierre vigente + validacion_vacante coincide con el Excel después de la carga', async () => {
    const { filas, sis } = escenario()
    await ejecutarCarga(sis.repo, cruzar(filas, sis.snapshot()).plan, { nuevoId: contador() })
    const vivos = sis.cargos.filter((c) => c.estado === 'vigente' || c.estado === 'validacion_vacante')
    expect(vivos).toHaveLength(filas.length)
  })

  it('crea SSSAME como hospital y omite lo que no resuelve contra los catálogos', async () => {
    const { sis } = escenario()
    const filas = [
      fila({ codigo_excel: 'CPH-P-00010', sigla: 'SSSAME' }),
      fila({ codigo_excel: 'CPH-P-00011', sigla: 'NOEXISTE' }),
    ]
    const res = await ejecutarCarga(sis.repo, cruzar(filas, sis.snapshot()).plan, { nuevoId: contador() })
    expect(res.hospitales_creados).toBe(1)
    expect(res.omitidos_sin_catalogo).toEqual({ 'sigla sin hospital': 1 })
    expect(sis.cargos.filter((c) => c.origen === 'msgc')).toHaveLength(1)
  })

  it('escribe en lotes (una llamada por lote) y sin datos personales en el resumen', async () => {
    const { filas, sis } = escenario()
    const res = await ejecutarCarga(sis.repo, cruzar(filas, sis.snapshot()).plan, { nuevoId: contador() })
    // bases y jefaturas van en lotes separados (cargo_base_id referencia a cargos).
    expect(sis.llamadas.crearCargos).toBe(2)
    expect(sis.llamadas.actualizarCargos).toBeLessThanOrEqual(1)
    expect(JSON.stringify(res)).not.toMatch(/90000000|20000000000/)
  })
})

describe('ResolutorCatalogos', () => {
  it('prefiere el puesto POU cuando la planta/guardia lo dice y usa equivalencias', () => {
    const cat: CatalogosCrudos = {
      ...CAT,
      puestos: [
        { id: 'p-pof', escalafonId: 'e-cph', nombre: 'Medico', modalidad: 'pof' },
        { id: 'p-pou', escalafonId: 'e-cph', nombre: 'Medico', modalidad: 'pou' },
      ],
    }
    const r = new ResolutorCatalogos(cat)
    const pof = r.resolver(fila({ codigo_excel: 'x', planta_guardia: 'Planta' }))
    const pou = r.resolver(fila({ codigo_excel: 'x', planta_guardia: 'POU SAME' }))
    expect('puestoCargoId' in pof && pof.puestoCargoId).toBe('p-pof')
    expect('puestoCargoId' in pou && pou.puestoCargoId).toBe('p-pou')
  })
  it('informa el motivo cuando el CR o el puesto no existen', () => {
    const r = new ResolutorCatalogos(CAT)
    expect(r.resolver(fila({ codigo_excel: 'x', cr: '99' }))).toEqual({ falta: 'CR sin codigos_registro' })
    expect(r.resolver(fila({ codigo_excel: 'x', literal_puesto: 'Inexistente' }))).toEqual({ falta: 'puesto sin equivalencia en catalogo' })
  })
  it('la etiqueta del tipificador tiene un nombre fijo', () => {
    expect(ETIQUETA_CEETPS_SI).toBe('Tipificador SI')
  })
})
