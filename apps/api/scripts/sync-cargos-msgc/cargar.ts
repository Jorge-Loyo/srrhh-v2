// ─────────────────────────────────────────────────────────────────────────────
// Fase C (carga) del sync de cargos con el Excel MSGC: aplica el PlanCarga que emite
// cruce.ts. SOLO se usa en modo escritura sobre una base LOCAL (ver sincronizar.ts).
//
// - Set-based: todo va en lotes a través de RepoCarga (la implementación SQL está en repoPrisma.ts).
// - Idempotente: el plan solo trae cambios reales; con el mismo Excel una segunda corrida
//   no crea, actualiza ni mueve nada (`totalCambios === 0`).
// - Sin datos personales: ni CUIL ni nombres ni id_sial_rol salen en logs ni resúmenes.
// ─────────────────────────────────────────────────────────────────────────────
import { randomUUID } from 'node:crypto'
import { normalizarTexto } from '@srrhh/normalizacion'
import { esCrCph, especialidadCanonica, normalizarExpediente, puestoCanonico, siglaCanonica, type EstadoCargoSistema, type ItemCargo, type PlanCarga } from './cruce.js'
import { esSiglaACrear } from './equivalencias.js'

export const ETIQUETA_CEETPS_SI = 'Tipificador SI'
export const TAMANIO_LOTE = 1000

export interface CatalogosCrudos {
  hospitales: { id: string; sigla: string }[]
  codigosRegistro: { id: string; codigo: string; escalafonId: string }[]
  puestos: { id: string; escalafonId: string; nombre: string; modalidad: string }[]
  especialidades: { id: string; puestoId: string; nombre: string }[]
}

export interface NuevoCargo {
  id: string
  codigo: string
  hospitalId: string
  escalafonId: string
  codigoRegistroId: string | null
  puestoCargoId: string
  especialidadPuestoId: string | null
  literalPuesto: string
  estado: EstadoCargoSistema
  expediente: string | null
  revisionMotivo: string | null
  cargoBaseId: string | null
}

/** Campos a actualizar de un cargo existente; `undefined` = no tocar. */
export interface ActualizacionCargo {
  id: string
  hospitalId?: string
  escalafonId?: string
  codigoRegistroId?: string | null
  puestoCargoId?: string
  literalPuesto?: string
  /** `null` = quitar la especialidad. */
  especialidadPuestoId?: string | null
  estado?: EstadoCargoSistema
  expediente?: string
  revisionMotivo?: string
  cargoBaseId?: string
}

export interface NuevoConcurso {
  concursoId: string
  detalleId: string
  tipo: 'cph' | 'ceetps'
  cargoId: string
  hospitalId: string
  escalafonId: string
  motivoConcurso: 'nuevo_cargo' | null
  expediente: string | null
  observaciones: string
}

/** Operaciones de escritura de la carga. Cada una es set-based (un lote por llamada). */
export interface RepoCarga {
  catalogos(): Promise<CatalogosCrudos>
  /** Mayor número por prefijo de código (`CPH-P`, `R-CPH-G`, ...) entre los cargos existentes. */
  maximosCodigo(): Promise<Map<string, number>>
  crearHospital(sigla: string): Promise<string>
  crearCargos(lote: NuevoCargo[]): Promise<void>
  actualizarCargos(lote: ActualizacionCargo[]): Promise<void>
  pasarNoVigente(ids: string[]): Promise<number>
  crearConcursos(lote: NuevoConcurso[]): Promise<void>
  reasignarConcursos(lote: { concursoId: string; cargoId: string }[]): Promise<void>
  asignarEtiqueta(nombre: string, cargoIds: string[]): Promise<void>
}

export interface ResumenCarga {
  hospitales_creados: number
  cargos_creados: number
  cargos_actualizados: number
  cargos_no_vigente: number
  concursos_creados: number
  concursos_reasignados: number
  etiquetas_asignadas: number
  /** Items del plan que no se pudieron resolver contra los catálogos (no se escriben). */
  omitidos_sin_catalogo: Record<string, number>
  total_cambios: number
}

const norm = (s: string | null | undefined) => normalizarTexto(s)
const up = (s: string | null | undefined) => String(s ?? '').trim().toUpperCase()

export interface FilaResuelta {
  hospitalId: string
  escalafonId: string
  codigoRegistroId: string
  puestoCargoId: string
  especialidadPuestoId: string | null
  /** Motivo de revisión agregado si la especialidad no está en el catálogo. */
  notaEspecialidad: string | null
}

export class ResolutorCatalogos {
  private readonly hospitales = new Map<string, string>()
  private readonly crs = new Map<string, { id: string; escalafonId: string }>()
  private readonly puestos = new Map<string, { id: string; modalidad: string }[]>()
  private readonly especialidades = new Map<string, string>()

  constructor(c: CatalogosCrudos) {
    for (const h of c.hospitales) this.hospitales.set(norm(h.sigla), h.id)
    for (const x of c.codigosRegistro) this.crs.set(up(x.codigo), { id: x.id, escalafonId: x.escalafonId })
    for (const p of c.puestos) {
      const k = `${p.escalafonId}|${norm(p.nombre)}`
      const l = this.puestos.get(k)
      if (l) l.push({ id: p.id, modalidad: p.modalidad })
      else this.puestos.set(k, [{ id: p.id, modalidad: p.modalidad }])
    }
    for (const e of c.especialidades) this.especialidades.set(`${e.puestoId}|${norm(e.nombre)}`, e.id)
  }

  agregarHospital(sigla: string, id: string): void {
    this.hospitales.set(norm(sigla), id)
  }

  tieneHospital(sigla: string): boolean {
    return this.hospitales.has(norm(siglaCanonica(sigla)))
  }

  /** Resuelve la fila contra los catálogos o devuelve el motivo por el que no se puede. */
  resolver(f: ItemCargo['fila']): FilaResuelta | { falta: string } {
    const hospitalId = this.hospitales.get(norm(siglaCanonica(f.sigla)))
    if (!hospitalId) return { falta: 'sigla sin hospital' }
    const cr = this.crs.get(up(f.cr))
    if (!cr) return { falta: 'CR sin codigos_registro' }
    const candidatos = this.puestos.get(`${cr.escalafonId}|${puestoCanonico(f.cr, f.literal_puesto)}`)
    if (!candidatos?.length) return { falta: 'puesto sin equivalencia en catalogo' }
    const prefiereU = up(f.planta_guardia).includes('POU')
    const orden = prefiereU ? ['pou', 'ambos', 'pof'] : ['pof', 'ambos', 'pou']
    const puesto = [...candidatos].sort((a, b) => orden.indexOf(a.modalidad) - orden.indexOf(b.modalidad))[0]
    let especialidadPuestoId: string | null = null
    let notaEspecialidad: string | null = null
    if (norm(f.especialidad_cargo)) {
      especialidadPuestoId = this.especialidades.get(`${puesto.id}|${especialidadCanonica(f.especialidad_cargo)}`) ?? null
      if (!especialidadPuestoId) notaEspecialidad = 'especialidad sin catalogo'
    }
    return { hospitalId, escalafonId: cr.escalafonId, codigoRegistroId: cr.id, puestoCargoId: puesto.id, especialidadPuestoId, notaEspecialidad }
  }
}

const lotes = <T>(xs: T[], n = TAMANIO_LOTE): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

/** Cantidad de operaciones que implica un plan (0 = nada que hacer). No mira catálogos. */
export function contarCambios(plan: PlanCarga): number {
  let n = plan.noVigenteIds.length + plan.concursosReasignar.length
  for (const it of plan.items) {
    if (it.cargoId === null) n++
    else if (it.cambios.length > 0 || it.completarExpediente || it.revision !== null) n++
    if (it.crearConcurso !== null) n++
    if (it.etiquetar) n++
  }
  return n
}

/** Prefijo y número de un código `PREFIJO-NNNNNN`; null si no tiene ese formato. */
export function partirCodigo(codigo: string): { prefijo: string; numero: number } | null {
  const m = /^(.+)-(\d{6})$/.exec(codigo)
  return m ? { prefijo: m[1], numero: Number(m[2]) } : null
}

const formatoCodigo = (prefijo: string, n: number) => `${prefijo}-${String(n).padStart(6, '0')}`

export interface OpcionesCarga {
  /** Fecha (YYYY-MM-DD) para estado_desde; inyectable para tests. */
  hoy?: string
  /** Generador de ids; inyectable para tests deterministas. */
  nuevoId?: () => string
  log?: (mensaje: string) => void
}

/** Aplica el plan. Devuelve contadores (sin datos personales). */
export async function ejecutarCarga(repo: RepoCarga, plan: PlanCarga, opciones: OpcionesCarga = {}): Promise<ResumenCarga> {
  const nuevoId = opciones.nuevoId ?? randomUUID
  const log = opciones.log ?? (() => undefined)
  const resumen: ResumenCarga = {
    hospitales_creados: 0, cargos_creados: 0, cargos_actualizados: 0, cargos_no_vigente: 0, concursos_creados: 0,
    concursos_reasignados: 0, etiquetas_asignadas: 0, omitidos_sin_catalogo: {}, total_cambios: 0,
  }
  const catalogos = await repo.catalogos()
  const resolutor = new ResolutorCatalogos(catalogos)

  // Siglas a crear (SSSAME): único caso donde la sincronización crea un hospital.
  const siglasNuevas = new Set<string>()
  for (const it of plan.items) if (esSiglaACrear(it.fila.sigla) && !resolutor.tieneHospital(it.fila.sigla)) siglasNuevas.add(siglaCanonica(it.fila.sigla))
  for (const sigla of [...siglasNuevas].sort()) {
    resolutor.agregarHospital(sigla, await repo.crearHospital(sigla))
    resumen.hospitales_creados++
  }

  const omitir = (motivo: string) => {
    resumen.omitidos_sin_catalogo[motivo] = (resumen.omitidos_sin_catalogo[motivo] ?? 0) + 1
  }
  const resueltos = new Map<ItemCargo, FilaResuelta>()
  for (const it of plan.items) {
    const hace = it.cargoId === null || it.cambios.length > 0 || it.completarExpediente || it.revision !== null || it.crearConcurso !== null || it.etiquetar
    if (!hace) continue
    const r = resolutor.resolver(it.fila)
    if ('falta' in r) omitir(r.falta)
    else resueltos.set(it, r)
  }

  // ── Cargos nuevos: bases primero, jefaturas después (cargo_base_id referencia a cargos). ──
  const maximos = await repo.maximosCodigo()
  const nuevos = plan.items.filter((it) => it.cargoId === null && resueltos.has(it)).sort((x, y) => x.fila.codigo_excel.localeCompare(y.fila.codigo_excel))
  const idDe = new Map<ItemCargo, string>()
  for (const it of plan.items) if (it.cargoId !== null) idDe.set(it, it.cargoId)
  for (const it of nuevos) idDe.set(it, nuevoId())
  const idPorClave = new Map<string, string>()
  for (const it of plan.items) {
    const id = idDe.get(it)
    if (id && it.claveRol && !it.esJefatura) idPorClave.set(it.claveRol, id)
  }
  const baseDe = (it: ItemCargo): string | null => it.baseCargoId ?? (it.esJefatura ? idPorClave.get(it.claveRol) ?? null : null)
  const armar = (it: ItemCargo): NuevoCargo => {
    const r = resueltos.get(it) as FilaResuelta
    const prefijo = it.fila.acronimo
    const n = (maximos.get(prefijo) ?? 0) + 1
    maximos.set(prefijo, n)
    const expediente = normalizarExpediente(it.fila.expediente) ? it.fila.expediente : null
    const motivos = [it.revision, r.notaEspecialidad].filter((x): x is string => Boolean(x))
    return {
      id: idDe.get(it) as string,
      codigo: formatoCodigo(prefijo, n),
      hospitalId: r.hospitalId,
      escalafonId: r.escalafonId,
      codigoRegistroId: r.codigoRegistroId,
      puestoCargoId: r.puestoCargoId,
      especialidadPuestoId: r.especialidadPuestoId,
      literalPuesto: it.fila.literal_puesto,
      estado: it.estado,
      expediente,
      revisionMotivo: motivos.length ? motivos.join('; ').slice(0, 200) : null,
      cargoBaseId: baseDe(it),
    }
  }
  for (const grupo of [nuevos.filter((it) => !it.esJefatura), nuevos.filter((it) => it.esJefatura)]) {
    const filas = grupo.map(armar)
    for (const l of lotes(filas)) await repo.crearCargos(l)
    resumen.cargos_creados += filas.length
  }
  log(`cargos creados: ${resumen.cargos_creados}`)

  // ── Cargos existentes: atributos, expediente, revisión y vínculo con el cargo base. ──
  const actualizaciones: ActualizacionCargo[] = []
  for (const it of plan.items) {
    if (it.cargoId === null) continue
    const r = resueltos.get(it)
    if (!r) continue
    const a: ActualizacionCargo = { id: it.cargoId }
    let toca = false
    if (it.cambios.includes('sigla')) { a.hospitalId = r.hospitalId; toca = true }
    if (it.cambios.includes('cr')) { a.escalafonId = r.escalafonId; a.codigoRegistroId = r.codigoRegistroId; toca = true }
    if (it.cambios.includes('puesto')) { a.puestoCargoId = r.puestoCargoId; a.literalPuesto = it.fila.literal_puesto; toca = true }
    if (it.cambios.includes('puesto') || it.cambios.includes('especialidad')) { a.especialidadPuestoId = r.especialidadPuestoId; toca = true }
    if (it.cambios.includes('estado')) { a.estado = it.estado; toca = true }
    if (it.cambios.includes('base')) {
      const b = baseDe(it)
      if (b) { a.cargoBaseId = b; toca = true }
    }
    if (it.completarExpediente) { a.expediente = it.fila.expediente; toca = true }
    if (it.revision !== null) { a.revisionMotivo = it.revision; toca = true }
    if (toca) actualizaciones.push(a)
  }
  for (const l of lotes(actualizaciones)) await repo.actualizarCargos(l)
  resumen.cargos_actualizados = actualizaciones.length

  // ── Sobrantes y ocupados fuera del Excel pasan a NO VIGENTE. ──
  for (const l of lotes(plan.noVigenteIds)) resumen.cargos_no_vigente += await repo.pasarNoVigente(l)

  // ── Concursos del Excel (estado inicial: sin autorizar / no iniciado) y reasignación por expediente. ──
  const nuevosConcursos: NuevoConcurso[] = []
  for (const it of plan.items) {
    if (it.crearConcurso === null) continue
    const r = resueltos.get(it)
    const cargoId = idDe.get(it)
    if (!r || !cargoId) continue
    const exp = normalizarExpediente(it.fila.expediente)
    nuevosConcursos.push({
      concursoId: nuevoId(),
      detalleId: nuevoId(),
      tipo: esCrCph(it.fila.cr) ? 'cph' : 'ceetps',
      cargoId,
      hospitalId: r.hospitalId,
      escalafonId: r.escalafonId,
      motivoConcurso: it.crearConcurso === 'nuevo_cargo' ? 'nuevo_cargo' : null,
      expediente: exp,
      observaciones: `Sincronizacion MSGC fila ${it.fila.codigo_excel}; bloque ${it.fila.bloque}; detalle: ${it.fila.detalle}`.slice(0, 2000),
    })
  }
  for (const l of lotes(nuevosConcursos)) await repo.crearConcursos(l)
  resumen.concursos_creados = nuevosConcursos.length

  const cargoPorExpediente = new Map<string, string>()
  for (const it of plan.items) {
    const exp = normalizarExpediente(it.fila.expediente)
    const id = idDe.get(it)
    if (exp && id && !it.ampliacion && norm(it.fila.bloque) === 'concurso' && !cargoPorExpediente.has(exp)) cargoPorExpediente.set(exp, id)
  }
  const reasignar = plan.concursosReasignar.flatMap((x) => {
    const cargoId = cargoPorExpediente.get(x.expediente)
    return cargoId ? [{ concursoId: x.concursoId, cargoId }] : []
  })
  for (const l of lotes(reasignar)) await repo.reasignarConcursos(l)
  resumen.concursos_reasignados = reasignar.length

  // ── Etiqueta del tipificador CEETPS "SI". ──
  const aEtiquetar = plan.items.filter((it) => it.etiquetar && idDe.has(it) && (it.cargoId !== null || resueltos.has(it))).map((it) => idDe.get(it) as string)
  for (const l of lotes(aEtiquetar)) await repo.asignarEtiqueta(ETIQUETA_CEETPS_SI, l)
  resumen.etiquetas_asignadas = aEtiquetar.length

  resumen.total_cambios =
    resumen.hospitales_creados + resumen.cargos_creados + resumen.cargos_actualizados + resumen.cargos_no_vigente +
    resumen.concursos_creados + resumen.concursos_reasignados + resumen.etiquetas_asignadas
  return resumen
}
