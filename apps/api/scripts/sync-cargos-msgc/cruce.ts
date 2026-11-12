// ─────────────────────────────────────────────────────────────────────────────
// Motor de cruce Excel MSGC <-> sistema (FASE 1, SOLO LECTURA).
// Función PURA: no toca ninguna base ni el disco. Recibe las filas del Excel, un
// snapshot del sistema ya cargado y devuelve las categorías a–j + el cierre
// aritmético contra el total del Excel.
//
// Particionan las filas del Excel: a, b, c, d, e y las filas de i (rol repetido sin
// explicación / rol en cargo no vigente). Las categorías f, g, h son sobre cargos del
// sistema; j (no resoluble contra catálogos) y el resto de i (colisiones, -TTR-,
// cargo con más de una ocupación viva) son diagnósticos NO excluyentes.
// El `id_sial_rol` se usa como clave de cruce y NUNCA sale en las entradas.
// ─────────────────────────────────────────────────────────────────────────────
import { normalizarTexto } from '@srrhh/normalizacion'
import type { FilaNominal } from './leerNominal.js'
import { acronimoMsgc, recodificarCodigo } from './acronimoMsgc.js'
import {
  equivalenciaEspecialidad,
  equivalenciaPuesto,
  equivalenciaSigla,
  esSiglaACrear,
  puestoSinDestino,
} from './equivalencias.js'

// ── Snapshot del sistema ─────────────────────────────────────────────────────
export interface VinculosCargo {
  concursos: number
  concursosCph: number
  concursosCeetps: number
  bajas: number
  padronHistorico: number
  padronIncidencias: number
  etiquetas: number
  solicitudesAlta: number
}

export type EstadoCargoSistema = 'vigente' | 'no_vigente' | 'validacion_vacante'

export interface CargoSistema {
  id: string
  codigo: string | null
  estado: EstadoCargoSistema
  subEstado: string | null
  /** deleted_at no nulo (soft delete). */
  eliminado: boolean
  origen: string
  tipoOrigen: string | null
  expediente: string | null
  codigoRepa: string | null
  sigla: string
  /** Código de registro (carrera) del cargo, si lo tiene. */
  cr: string | null
  escalafon: string
  puesto: string
  especialidad: string | null
  cargoBaseId: string | null
  cargoRetenidoId: string | null
  vinculos: VinculosCargo
}

export interface OcupacionViva {
  /** Clave de cruce. NUNCA se escribe en las salidas. */
  idSialRol: string
  cargoId: string
}

export interface SnapshotSistema {
  cargos: CargoSistema[]
  ocupaciones: OcupacionViva[]
  siglasHospital: string[]
  siglasOrganigrama: string[]
  codigosRegistro: { codigo: string; escalafon: string }[]
  puestos: { escalafon: string; nombre: string }[]
  especialidades: string[]
}

export const SNAPSHOT_VACIO: SnapshotSistema = {
  cargos: [],
  ocupaciones: [],
  siglasHospital: [],
  siglasOrganigrama: [],
  codigosRegistro: [],
  puestos: [],
  especialidades: [],
}

// ── Resultado ────────────────────────────────────────────────────────────────
export const CATEGORIAS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] as const
export type Categoria = (typeof CATEGORIAS)[number]

export interface Entrada {
  codigo_excel: string
  categoria: Categoria
  accion: string
  cargo_codigo_sistema: string
  codigo_propuesto: string
  acronimo: string
  cr: string
  sigla: string
  puesto: string
  motivo: string
}

export interface Cierre {
  vigentes_hoy: number
  validacion_vacante_hoy: number
  a_crear: number
  a_crear_como_validacion: number
  f_reemplazados: number
  g_a_no_vigente: number
  proyectado_solo_vigente: number
  proyectado_vigente_mas_validacion: number
  total_excel: number
  diferencia_solo_vigente: number
  diferencia_vigente_mas_validacion: number
}

export interface Cupos {
  excel: number
  sistema: number
  faltan: number
  sobran: number
  claves: number
  excel_por_bloque: Record<string, number>
}

export interface ResultadoCruce {
  entradas: Record<Categoria, Entrada[]>
  /** Cantidad de entradas por categoría. */
  conteos: Record<Categoria, number>
  /** Filas del Excel que cayen en a+b+c+d+e+(i de fila): debe sumar total_excel. */
  particion: { a: number; b: number; c: number; d: number; e: number; i_filas: number; suma: number }
  cierre: Cierre
  cupos: Cupos
  f_desglose: { sin_vinculos: number; con_vinculos: number; por_vinculo: Record<keyof VinculosCargo, number> }
  h_desglose: { no_vigente: number; validacion_vacante: number; eliminado: number }
  colisiones: number
  j_por_motivo: Record<string, number>
}

// ── Utilidades ───────────────────────────────────────────────────────────────
const norm = (s: string | null | undefined) => normalizarTexto(s)
const upper = (s: string | null | undefined) => String(s ?? '').trim().toUpperCase()

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

const esJefaturaAcronimo = (a: string) => a === 'ENF-J' || a === 'TEC-J' || a === 'EG-J'

function estadoDeExcel(estado: string): EstadoCargoSistema | null {
  const e = norm(estado)
  if (e === 'vigente') return 'vigente'
  if (e === 'en validacion') return 'validacion_vacante'
  return null
}

function siglaCanonica(raw: string): string {
  return equivalenciaSigla(raw) ?? raw.trim()
}

function puestoCanonico(cr: string, literal: string): string {
  return equivalenciaPuesto(cr, literal) ?? norm(literal)
}

function especialidadCanonica(raw: string): string {
  const eq = equivalenciaEspecialidad(raw)
  return norm(eq ?? raw)
}

const sumaVinculos = (v: VinculosCargo) =>
  v.concursos + v.concursosCph + v.concursosCeetps + v.bajas + v.padronHistorico + v.padronIncidencias + v.etiquetas + v.solicitudesAlta

function entradaDeFila(
  f: FilaNominal,
  categoria: Categoria,
  accion: string,
  motivo: string,
  extra: Partial<Pick<Entrada, 'cargo_codigo_sistema' | 'codigo_propuesto'>> = {},
): Entrada {
  return {
    codigo_excel: f.codigo_excel,
    categoria,
    accion,
    cargo_codigo_sistema: extra.cargo_codigo_sistema ?? '',
    codigo_propuesto: extra.codigo_propuesto ?? '',
    acronimo: f.acronimo,
    cr: f.cr,
    sigla: f.sigla,
    puesto: f.literal_puesto,
    motivo,
  }
}

function entradaDeCargo(c: CargoSistema, categoria: Categoria, accion: string, motivo: string, propuesto = ''): Entrada {
  return {
    codigo_excel: '',
    categoria,
    accion,
    cargo_codigo_sistema: c.codigo ?? '',
    codigo_propuesto: propuesto,
    acronimo: '',
    cr: c.cr ?? '',
    sigla: c.sigla,
    puesto: c.puesto,
    motivo,
  }
}

// ── Cruce ────────────────────────────────────────────────────────────────────
export function cruzar(filas: FilaNominal[], sistema: SnapshotSistema): ResultadoCruce {
  const entradas = Object.fromEntries(CATEGORIAS.map((c) => [c, [] as Entrada[]])) as Record<Categoria, Entrada[]>

  const cargoPorId = new Map(sistema.cargos.map((c) => [c.id, c]))
  const ocupPorRol = new Map(sistema.ocupaciones.map((o) => [o.idSialRol, o.cargoId]))
  const ocupPorCargo = new Map<string, number>()
  for (const o of sistema.ocupaciones) ocupPorCargo.set(o.cargoId, (ocupPorCargo.get(o.cargoId) ?? 0) + 1)

  const escalafonDeCr = new Map(sistema.codigosRegistro.map((c) => [upper(c.codigo), c.escalafon]))
  const puestosCat = new Set(sistema.puestos.map((p) => `${p.escalafon}|${norm(p.nombre)}`))
  const especialidadesCat = new Set(sistema.especialidades.map((e) => norm(e)))
  const siglasHospital = new Set(sistema.siglasHospital.map((s) => norm(s)))
  const siglasOrganigrama = new Set(sistema.siglasOrganigrama.map((s) => norm(s)))

  // Roles del Excel y grupos por rol (para detectar jefaturas y repetidos).
  const grupos = new Map<string, FilaNominal[]>()
  for (const f of filas) {
    if (!f.id_sial_rol) continue
    const g = grupos.get(f.id_sial_rol)
    if (g) g.push(f)
    else grupos.set(f.id_sial_rol, [f])
  }
  const rolesExcel = new Set(grupos.keys())

  // Qué fila del grupo es jefatura (segunda fila del par) y cuáles son ambiguas.
  const filasJefatura = new Set<FilaNominal>()
  const filasRolAmbiguo = new Set<FilaNominal>()
  for (const g of grupos.values()) {
    if (g.length === 1) continue
    const js = g.filter((f) => esJefaturaAcronimo(f.acronimo))
    if (g.length === 2 && js.length === 1) filasJefatura.add(js[0])
    else for (const f of g) filasRolAmbiguo.add(f)
  }

  // Recodificación final de cada cargo (para colisiones): código actual o el propuesto.
  const propuestoPorCargo = new Map<string, string>()
  const cargosCubiertos = new Set<string>()
  const filaDeCargo = new Map<string, FilaNominal>()

  const part = { a: 0, b: 0, c: 0, d: 0, e: 0, i_filas: 0 }
  let aCrearComoValidacion = 0
  const cuposExcel = new Map<string, number>()
  const cuposSistema = new Map<string, number>()
  const excelPorBloque: Record<string, number> = {}

  for (const f of filas) {
    const estadoExcel = estadoDeExcel(f.estado)

    // j: no resoluble contra catálogos (no excluyente).
    const motivosJ = motivosNoResolubles(f)
    if (motivosJ.length) {
      entradas.j.push(entradaDeFila(f, 'j', 'sin accion', motivosJ.join('; ')))
    }

    // e: sin ocupante.
    if (!f.id_sial_rol) {
      part.e++
      const bloque = f.bloque || 'sin bloque'
      excelPorBloque[bloque] = (excelPorBloque[bloque] ?? 0) + 1
      if (estadoExcel === 'validacion_vacante') aCrearComoValidacion++
      const k = claveCupo(f.sigla, f.acronimo, f.cr, f.literal_puesto, f.especialidad_cargo, true)
      cuposExcel.set(k, (cuposExcel.get(k) ?? 0) + 1)
      entradas.e.push(entradaDeFila(f, 'e', 'crear cupo', `bloque ${bloque}; estado ${f.estado}`))
      continue
    }

    // i: rol repetido sin explicación de jefatura.
    if (filasRolAmbiguo.has(f)) {
      part.i_filas++
      entradas.i.push(entradaDeFila(f, 'i', 'sin accion', 'ID SIAL Rol repetido sin explicacion de jefatura'))
      continue
    }

    // d: jefatura = segunda fila del par.
    if (filasJefatura.has(f)) {
      part.d++
      if (estadoExcel === 'validacion_vacante') aCrearComoValidacion++
      const base = (grupos.get(f.id_sial_rol) ?? []).find((x) => x !== f)
      const cargoBaseId = ocupPorRol.get(f.id_sial_rol)
      const cargoBase = cargoBaseId ? cargoPorId.get(cargoBaseId) : undefined
      const motivo = cargoBase
        ? `cargo base existe en el sistema (${cargoBase.codigo ?? 'sin codigo'}); base Excel ${base?.codigo_excel ?? '?'}`
        : `cargo base NO existe en el sistema; base Excel ${base?.codigo_excel ?? '?'} (se crea como c)`
      entradas.d.push(entradaDeFila(f, 'd', 'crear jefatura vinculada al cargo base', motivo))
      continue
    }

    // c / i / a / b: cruce por ID SIAL Rol.
    const cargoId = ocupPorRol.get(f.id_sial_rol)
    if (!cargoId) {
      part.c++
      if (estadoExcel === 'validacion_vacante') aCrearComoValidacion++
      entradas.c.push(entradaDeFila(f, 'c', 'crear cargo', 'ID SIAL Rol sin ocupacion viva en el sistema'))
      continue
    }
    const cargo = cargoPorId.get(cargoId)
    if (!cargo || cargo.estado !== 'vigente' || cargo.eliminado) {
      part.i_filas++
      entradas.i.push(
        entradaDeFila(f, 'i', 'sin accion', `rol apunta a cargo no vigente (${cargo?.estado ?? 'inexistente'}${cargo?.eliminado ? ', eliminado' : ''})`, {
          cargo_codigo_sistema: cargo?.codigo ?? '',
        }),
      )
      continue
    }

    cargosCubiertos.add(cargo.id)
    filaDeCargo.set(cargo.id, f)
    const propuesto = cargo.codigo ? recodificarCodigo(cargo.codigo, f.acronimo) : null
    if (propuesto) propuestoPorCargo.set(cargo.id, propuesto)
    const difs = diferencias(f, cargo, propuesto, estadoExcel, escalafonDeCr)
    if (difs.length === 0) {
      part.a++
      entradas.a.push(entradaDeFila(f, 'a', 'ninguna', 'sin diferencias', { cargo_codigo_sistema: cargo.codigo ?? '' }))
    } else {
      part.b++
      entradas.b.push(
        entradaDeFila(f, 'b', 'actualizar atributos', `difiere: ${difs.join(', ')}`, {
          cargo_codigo_sistema: cargo.codigo ?? '',
          codigo_propuesto: propuesto && propuesto !== cargo.codigo ? propuesto : '',
        }),
      )
    }
  }

  // Cargos del sistema: f, g, h, i (cargo).
  const fPorVinculo = { concursos: 0, concursosCph: 0, concursosCeetps: 0, bajas: 0, padronHistorico: 0, padronIncidencias: 0, etiquetas: 0, solicitudesAlta: 0 }
  let fSin = 0
  let fCon = 0
  let g = 0
  let vigentesHoy = 0
  let validacionHoy = 0
  const h = { no_vigente: 0, validacion_vacante: 0, eliminado: 0 }
  const rolesPorCargo = new Map<string, string[]>()
  for (const o of sistema.ocupaciones) {
    const l = rolesPorCargo.get(o.cargoId)
    if (l) l.push(o.idSialRol)
    else rolesPorCargo.set(o.cargoId, [o.idSialRol])
  }

  for (const c of sistema.cargos) {
    // -TTR-: sin regla de recodificación (no se inventa).
    if (c.tipoOrigen === 'TTR' || (c.codigo ?? '').includes('-TTR-')) {
      entradas.i.push(entradaDeCargo(c, 'i', 'sin accion', 'cargo -TTR-: sin regla de recodificacion'))
    }
    if (c.eliminado || c.estado !== 'vigente') {
      if (c.eliminado) h.eliminado++
      else if (c.estado === 'no_vigente') h.no_vigente++
      else if (c.estado === 'validacion_vacante') h.validacion_vacante++
      if (c.eliminado) {
        entradas.h.push(entradaDeCargo(c, 'h', 'informativo', `eliminado (deleted_at); estado ${c.estado}`))
      } else {
        entradas.h.push(entradaDeCargo(c, 'h', 'informativo', c.estado === 'validacion_vacante' ? 'validacion_vacante (se cuenta aparte)' : 'ya no vigente'))
        if (c.estado === 'validacion_vacante') validacionHoy++
      }
      continue
    }
    vigentesHoy++
    const nOcup = ocupPorCargo.get(c.id) ?? 0
    if (nOcup > 1) {
      entradas.i.push(entradaDeCargo(c, 'i', 'sin accion', `cargo con ${nOcup} ocupaciones vivas`))
    }
    if (nOcup === 0) {
      const v = sumaVinculos(c.vinculos)
      if (v === 0) fSin++
      else fCon++
      for (const k of Object.keys(fPorVinculo) as (keyof VinculosCargo)[]) if (c.vinculos[k] > 0) fPorVinculo[k]++
      const kSis = claveCupo(c.sigla, sistemaAcronimo(c), c.cr ?? '', c.puesto, c.especialidad ?? '', false)
      cuposSistema.set(kSis, (cuposSistema.get(kSis) ?? 0) + 1)
      entradas.f.push(
        entradaDeCargo(c, 'f', 'candidato a reemplazo', v === 0 ? 'sin vinculos' : `con vinculos (${descVinculos(c.vinculos)})`),
      )
      continue
    }
    const roles = rolesPorCargo.get(c.id) ?? []
    if (!roles.some((r) => rolesExcel.has(r))) {
      g++
      entradas.g.push(entradaDeCargo(c, 'g', 'pasar a no_vigente', 'ocupante vivo cuyo ID SIAL Rol no esta en el Excel'))
    }
  }

  // Colisiones de recodificación sobre cargos.codigo (@unique, incluye eliminados).
  const colisiones = detectarColisiones(sistema.cargos, propuestoPorCargo, filaDeCargo)
  for (const e of colisiones) entradas.i.push(e)

  // Cupos.
  let faltan = 0
  let sobran = 0
  const claves = new Set([...cuposExcel.keys(), ...cuposSistema.keys()])
  for (const k of claves) {
    const dx = (cuposExcel.get(k) ?? 0) - (cuposSistema.get(k) ?? 0)
    if (dx > 0) faltan += dx
    else sobran -= dx
  }
  const cupos: Cupos = {
    excel: part.e,
    sistema: fSin + fCon,
    faltan,
    sobran,
    claves: claves.size,
    excel_por_bloque: Object.fromEntries(Object.entries(excelPorBloque).sort(([x], [y]) => cmp(x, y))),
  }

  // Orden estable.
  for (const cat of CATEGORIAS) {
    entradas[cat].sort(
      (x, y) =>
        cmp(x.codigo_excel, y.codigo_excel) ||
        cmp(x.cargo_codigo_sistema, y.cargo_codigo_sistema) ||
        cmp(x.motivo, y.motivo),
    )
  }

  const aCrear = part.c + part.d + part.e
  const totalExcel = filas.length
  const proyectadoSolo = vigentesHoy + (aCrear - aCrearComoValidacion) - (fSin + fCon) - g
  const proyectadoMas = vigentesHoy + validacionHoy + aCrear - (fSin + fCon) - g
  const cierre: Cierre = {
    vigentes_hoy: vigentesHoy,
    validacion_vacante_hoy: validacionHoy,
    a_crear: aCrear,
    a_crear_como_validacion: aCrearComoValidacion,
    f_reemplazados: fSin + fCon,
    g_a_no_vigente: g,
    proyectado_solo_vigente: proyectadoSolo,
    proyectado_vigente_mas_validacion: proyectadoMas,
    total_excel: totalExcel,
    diferencia_solo_vigente: proyectadoSolo - totalExcel,
    diferencia_vigente_mas_validacion: proyectadoMas - totalExcel,
  }

  const jPorMotivo: Record<string, number> = {}
  for (const e of entradas.j) {
    for (const m of e.motivo.split('; ')) {
      const clave = m.replace(/\s*\(.*\)$/, '')
      jPorMotivo[clave] = (jPorMotivo[clave] ?? 0) + 1
    }
  }

  const conteos = Object.fromEntries(CATEGORIAS.map((c) => [c, entradas[c].length])) as Record<Categoria, number>
  return {
    entradas,
    conteos,
    particion: { ...part, suma: part.a + part.b + part.c + part.d + part.e + part.i_filas },
    cierre,
    cupos,
    f_desglose: { sin_vinculos: fSin, con_vinculos: fCon, por_vinculo: fPorVinculo },
    h_desglose: h,
    colisiones: colisiones.length,
    j_por_motivo: Object.fromEntries(Object.entries(jPorMotivo).sort(([x], [y]) => cmp(x, y))),
  }

  // ── Helpers con acceso al catálogo ──
  function motivosNoResolubles(f: FilaNominal): string[] {
    const m: string[] = []
    const sigla = siglaCanonica(f.sigla)
    if (!siglasHospital.has(norm(sigla))) {
      const org = siglasOrganigrama.has(norm(sigla)) ? 'esta en organigramas.sigla' : 'no esta en organigramas.sigla'
      m.push(`sigla fuera de hospitales${esSiglaACrear(f.sigla) ? ' (a crear)' : ''} (${org})`)
    }
    const escalafon = escalafonDeCr.get(upper(f.cr))
    if (!escalafon) m.push('CR sin codigos_registro')
    if (puestoSinDestino(f.cr, f.literal_puesto)) m.push('puesto sin destino definido')
    else if (!norm(f.literal_puesto)) m.push('puesto vacio')
    else if (escalafon && !puestosCat.has(`${escalafon}|${puestoCanonico(f.cr, f.literal_puesto)}`)) {
      m.push('puesto sin equivalencia en catalogo')
    }
    if (norm(f.especialidad_cargo) && !especialidadesCat.has(especialidadCanonica(f.especialidad_cargo))) {
      m.push('especialidad sin catalogo')
    }
    return m
  }
}

function diferencias(
  f: FilaNominal,
  c: CargoSistema,
  propuesto: string | null,
  estadoExcel: EstadoCargoSistema | null,
  escalafonDeCr: Map<string, string>,
): string[] {
  const d: string[] = []
  if (!propuesto) d.push('acronimo/prefijo (sin regla de recodificacion)')
  else if (propuesto !== c.codigo) d.push('acronimo/prefijo')
  const escExcel = escalafonDeCr.get(upper(f.cr))
  const mismoCr = upper(f.cr) === upper(c.cr) || (escExcel !== undefined && escExcel === c.escalafon)
  if (!mismoCr) d.push('cr')
  if (norm(siglaCanonica(f.sigla)) !== norm(c.sigla)) d.push('sigla')
  if (puestoCanonico(f.cr, f.literal_puesto) !== norm(c.puesto)) d.push('puesto')
  if (especialidadCanonica(f.especialidad_cargo) !== norm(c.especialidad)) d.push('especialidad')
  if (estadoExcel && estadoExcel !== c.estado) d.push('estado')
  return d
}

function claveCupo(sigla: string, acronimo: string, cr: string, puesto: string, especialidad: string, deExcel: boolean): string {
  const p = deExcel ? puestoCanonico(cr, puesto) : norm(puesto)
  const e = deExcel ? especialidadCanonica(especialidad) : norm(especialidad)
  return [norm(siglaCanonica(sigla)), acronimo, p, e].join('|')
}

/** Acrónimo estimado de un cargo del sistema (solo para comparar cupos; sin regla -> 'sin-regla'). */
function sistemaAcronimo(c: CargoSistema): string {
  return (
    acronimoMsgc({
      cr: c.cr ?? '',
      literalPuesto: c.puesto,
      plantaGuardia: null,
      nivelConduccion: null,
      tieneLineaArbol: c.origen === 'organigrama',
      reemplazante: c.tipoOrigen === 'R',
    }) ?? 'sin-regla'
  )
}

function descVinculos(v: VinculosCargo): string {
  const nombres: [keyof VinculosCargo, string][] = [
    ['concursos', 'concursos'],
    ['concursosCph', 'concursos_cph'],
    ['concursosCeetps', 'concursos_ceetps'],
    ['bajas', 'bajas'],
    ['padronHistorico', 'padron_historico'],
    ['padronIncidencias', 'padron_incidencias'],
    ['etiquetas', 'etiquetas_cargo'],
    ['solicitudesAlta', 'solicitudes_alta'],
  ]
  return nombres.filter(([k]) => v[k] > 0).map(([k, n]) => `${n} ${v[k]}`).join(', ')
}

function detectarColisiones(
  cargos: CargoSistema[],
  propuestoPorCargo: Map<string, string>,
  filaDeCargo: Map<string, FilaNominal>,
): Entrada[] {
  const finales = new Map<string, CargoSistema[]>()
  for (const c of cargos) {
    if (!c.codigo) continue
    const final = propuestoPorCargo.get(c.id) ?? c.codigo
    const l = finales.get(final)
    if (l) l.push(c)
    else finales.set(final, [c])
  }
  const out: Entrada[] = []
  for (const [final, lista] of finales) {
    if (lista.length < 2) continue
    for (const c of lista) {
      const f = filaDeCargo.get(c.id)
      const otros = lista.filter((x) => x !== c).map((x) => x.codigo ?? '').sort(cmp).join(', ')
      out.push({
        codigo_excel: f?.codigo_excel ?? '',
        categoria: 'i',
        accion: 'sin accion',
        cargo_codigo_sistema: c.codigo ?? '',
        codigo_propuesto: final,
        acronimo: f?.acronimo ?? '',
        cr: c.cr ?? '',
        sigla: c.sigla,
        puesto: c.puesto,
        motivo: `colision de recodificacion con ${otros}`,
      })
    }
  }
  return out
}
