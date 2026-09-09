import { createRequire } from 'node:module'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { SECCION_UNIVERSOS, type OrganigramaQuery } from './organigrama.schema.js'

// xlsx es CJS — mismo patrón que bajas-sial.service.ts (createRequire porque
// este proyecto es ESM).
const require = createRequire(import.meta.url)
const XLSX = require('xlsx') as {
  read: (data: Buffer, opts: Record<string, unknown>) => { SheetNames: string[]; Sheets: Record<string, unknown> }
  utils: { sheet_to_json: (ws: unknown, opts: Record<string, unknown>) => Record<string, unknown>[] }
}

// ─────────────────────────────────────────────────────────────────────────────
// Migración legacy (dotacion-rrhh -> v2). Puerto de `organigramaRoutes.js` de
// la app vieja, con dos diferencias deliberadas (decisión tomada antes de
// escribir esto — ver Doc/Planificacion/Sprints/POST_SPRINT_14_migracion_legacy_organigrama.md):
//
// 1. Sin selector de período: siempre muestra quién ocupa cada puesto HOY
//    (Ocupacion.hasta = null), no un snapshot histórico — v2 no tiene guardado
//    el equivalente de la tabla `roles` por período con estos campos.
// 2. El cruce "código de repartición -> cargo" se hace solo por
//    `Cargo.codigoRepa`, sin re-filtrar además por sigla/hospital: en la app
//    vieja el join agregaba `AND o.sigla = s.sigla` pero `codigo_reparticion`
//    ya es único en toda la tabla `organigramas` (verificado al importar los
//    4.310 nodos, cero duplicados) — filtrar además por sigla sería
//    redundante, y además muchos nodos (Ministerio, Direcciones Generales)
//    no corresponden a ningún `Hospital` real en v2.
// ─────────────────────────────────────────────────────────────────────────────

interface PersonaNodo {
  nombre: string
  cargo: string | null
  cuil: string
  fechaNacimiento: string | null
  antiguedadDesde: string | null
  cargoDesde: string | null
  cargoHasta: string | null
}

interface OrganigramaNodo {
  id: string
  nombre: string | null
  tipo: string
  nivel: number
  padre: string | null
  regimenEmpleo: string
  persona: PersonaNodo | null
  hijos: OrganigramaNodo[]
}

// ── Reglas de negocio de "puesto de conducción válido" ──────────────────────
// Puerto literal de CONDICION_CARGOS (organigramaRoutes.js) — los mismos 4
// criterios sobre codigoRegistro + unificadorPuesto (+ codigoJefaturas para
// jefaturas). Filtrado en memoria en vez de en el WHERE de Prisma: son pocas
// decenas de cargos por árbol (los que matchean codigoRepa de esta jerarquía
// puntual), no vale la pena un where anidado con 4 ramas de OR distintas.
const UNIFICADOR_60 = new Set(['Gerente', 'Subgerente'])
const UNIFICADOR_37 = new Set([
  'CPH de Planta', 'CPH de Guardia', 'Director/a Medico/a', 'Subdirector/a Medico/a',
  'Jefe/a de DEPARTAMENTO', 'Jefe/a de DIVISION', 'Jefe/a de UNIDAD', 'Jefe/a de SECCION',
])
const UNIFICADOR_JEFATURAS_OPERATIVAS = new Set([
  'Administrativo/a', 'Enfermero/a', 'Servicios Generales', 'Tecnico/a de la salud',
])
const CODIGOS_JEFATURAS_OPERATIVAS = new Set(['83', '85', '87'])

function esCargoDeConduccion(
  codigoRegistro: string | undefined,
  unificadorPuesto: string | null,
  codigoJefaturas: string | null
): boolean {
  if (!codigoRegistro || !unificadorPuesto) return false
  const tieneCategoriaJefatura = !!codigoJefaturas && codigoJefaturas !== '0'

  if (codigoRegistro === '25') return unificadorPuesto === 'Autoridades Superiores'
  if (codigoRegistro === '60') return UNIFICADOR_60.has(unificadorPuesto)
  if (codigoRegistro === '37') return UNIFICADOR_37.has(unificadorPuesto) && tieneCategoriaJefatura
  if (CODIGOS_JEFATURAS_OPERATIVAS.has(codigoRegistro)) {
    return UNIFICADOR_JEFATURAS_OPERATIVAS.has(unificadorPuesto) && tieneCategoriaJefatura
  }
  return false
}

// ── Orden jerárquico por tipo de unidad — puerto literal de `ordenTipos` ────
const ORDEN_TIPOS: Record<string, number> = {
  Ministerio: 0, AREA: 1, 'SSEC/DIREJE': 2, GO: 3, SGO: 4, DG: 5, 'F/N DG': 6,
  DHOS: 7, SDHOS: 8, 'UAI DG': 8.5, 'F/N DEJE': 8.6, 'UAI MSTR': 8.7,
  'PLTA TRANS. DOCENTE': 8.8, 'F/N MSTR - GO': 8.9, REGIMEN: 9,
  DEPT: 10, 'DEPT CA': 10.5, DIV: 11, 'DIV CA': 11.5, UNID: 12,
  SECCION: 13, SECC: 13, 'SECCION CA': 13.5,
}

function ordenarHijos(nodo: OrganigramaNodo) {
  if (!nodo.hijos.length) return
  nodo.hijos.sort((a, b) => {
    const oa = ORDEN_TIPOS[a.tipo] ?? 999
    const ob = ORDEN_TIPOS[b.tipo] ?? 999
    if (oa !== ob) return oa - ob
    return a.id.localeCompare(b.id)
  })
  nodo.hijos.forEach(ordenarHijos)
}

export async function getOrganigramaService(query: OrganigramaQuery): Promise<{
  data: OrganigramaNodo
  sigla?: string
  seccion?: string
}> {
  const { sigla, seccion } = query

  // === 1. Estructura del árbol ===
  const rows = await prisma.organigrama.findMany({
    where: sigla ? { sigla } : { universoTotalizador: SECCION_UNIVERSOS[seccion!] },
    orderBy: [{ lvl: 'asc' }, { codigoReparticion: 'asc' }],
  })

  if (rows.length === 0) {
    throw AppError.notFound(
      sigla ? `No se encontró organigrama para la sigla: ${sigla}` : `No se encontró organigrama para la sección: ${seccion}`
    )
  }

  // === 2. Personas asignadas HOY a los nodos de este árbol ===
  const codigosReparticion = rows.map((r) => r.codigoReparticion)
  const cargosCandidatos = await prisma.cargo.findMany({
    where: {
      codigoRepa: { in: codigosReparticion },
      codigoRegistro: { codigo: { in: ['25', '60', '37', '83', '85', '87'] } },
      ocupaciones: { some: { hasta: null, situacionRevista: 'Activo' } },
    },
    select: {
      codigoRepa: true,
      literalPuesto: true,
      unificadorPuesto: true,
      codigoRegistro: { select: { codigo: true } },
      ocupaciones: {
        where: { hasta: null },
        take: 1,
        select: {
          codigoJefaturas: true,
          cargoDesdeFecha: true,
          cargoHastaFecha: true,
          persona: { select: { apellidoNombre: true, cuil: true, fechaNacimiento: true, antiguedadDesde: true } },
        },
      },
    },
    // Mismo orden que la app vieja (codigo_reparticion, codigo_registro, unificador_puesto)
    // para que, si dos cargos matchean el mismo nodo, gane siempre el mismo.
    orderBy: [{ codigoRepa: 'asc' }, { unificadorPuesto: 'asc' }],
  })

  const personasMap = new Map<string, PersonaNodo>()
  for (const cargo of cargosCandidatos) {
    if (!cargo.codigoRepa || personasMap.has(cargo.codigoRepa)) continue
    const ocup = cargo.ocupaciones[0]
    if (!ocup) continue
    if (!esCargoDeConduccion(cargo.codigoRegistro?.codigo, cargo.unificadorPuesto, ocup.codigoJefaturas)) continue

    personasMap.set(cargo.codigoRepa, {
      nombre: ocup.persona.apellidoNombre,
      cargo: cargo.literalPuesto,
      cuil: ocup.persona.cuil,
      fechaNacimiento: ocup.persona.fechaNacimiento?.toISOString() ?? null,
      antiguedadDesde: ocup.persona.antiguedadDesde?.toISOString() ?? null,
      cargoDesde: ocup.cargoDesdeFecha?.toISOString() ?? null,
      cargoHasta: ocup.cargoHastaFecha?.toISOString() ?? null,
    })
  }

  // === 3. Mapa de nodos ===
  const mapa = new Map<string, OrganigramaNodo>()
  for (const r of rows) {
    mapa.set(r.codigoReparticion, {
      id: r.codigoReparticion,
      nombre: r.descRep,
      tipo: r.tipo,
      nivel: r.lvl,
      padre: r.padre,
      regimenEmpleo: r.regimenEmpleo || 'Sin Régimen',
      persona: personasMap.get(r.codigoReparticion) ?? null,
      hijos: [],
    })
  }

  // === 4. Identificar SDHOS (agrupación por régimen, solo en vistas de hospital) ===
  let sdhosCod: string | null = null
  if (sigla) {
    for (const r of rows) {
      if (r.tipo === 'SDHOS' && r.descRep?.includes('Subdirección Médica')) sdhosCod = r.codigoReparticion
    }
  }

  // === 5. Relaciones padre-hijo ===
  const raices: OrganigramaNodo[] = []
  for (const r of rows) {
    const nodo = mapa.get(r.codigoReparticion)!
    const padreNodo = r.padre ? mapa.get(r.padre) : undefined
    if (padreNodo) padreNodo.hijos.push(nodo)
    else raices.push(nodo)
  }

  let raiz: OrganigramaNodo | null = null
  if (raices.length === 1) {
    raiz = raices[0]!
  } else if (raices.length > 1) {
    // Huérfanos que comparten un mismo padre fuera de este recorte (ej. la SS
    // de Atención Primaria vive bajo un nodo de Nivel Central) -> se busca ese
    // nodo ancla en la base para usarlo de raíz visual.
    const padres = new Set(raices.map((n) => n.padre).filter((p): p is string => !!p && p !== 'ROOT'))
    if (padres.size === 1) {
      const anchorCod = [...padres][0]!
      const anchor = await prisma.organigrama.findUnique({ where: { codigoReparticion: anchorCod } })
      if (anchor) {
        raiz = {
          id: anchor.codigoReparticion,
          nombre: anchor.descRep,
          tipo: anchor.tipo,
          nivel: anchor.lvl,
          padre: anchor.padre,
          regimenEmpleo: anchor.regimenEmpleo || '',
          persona: personasMap.get(anchor.codigoReparticion) ?? null,
          hijos: raices,
        }
      }
    }
    if (!raiz) {
      raiz = raices.reduce((best, n) => (!best || n.nivel < best.nivel ? n : best), null as OrganigramaNodo | null)
    }
  }

  if (!raiz) {
    throw AppError.notFound(`No se encontró nodo raíz para ${sigla ? `el hospital ${sigla}` : `la sección ${seccion}`}`)
  }

  // === 6. Agrupar hijos de SDHOS por régimen de empleo ===
  if (sdhosCod) {
    const sdhos = mapa.get(sdhosCod)
    if (sdhos && sdhos.hijos.length > 0) {
      const grupos = new Map<string, OrganigramaNodo[]>()
      for (const hijo of sdhos.hijos) {
        const reg = hijo.regimenEmpleo || 'Sin Régimen'
        if (!grupos.has(reg)) grupos.set(reg, [])
        grupos.get(reg)!.push(hijo)
      }
      sdhos.hijos = [...grupos.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([nombreRegimen, hijos]) => ({
          id: `REGIMEN_${nombreRegimen.replace(/\s+/g, '_')}`,
          nombre: nombreRegimen,
          tipo: 'REGIMEN',
          nivel: sdhos.nivel + 1,
          padre: sdhosCod,
          regimenEmpleo: nombreRegimen,
          persona: null,
          hijos,
        }))
    }
  }

  // === 7. Orden jerárquico ===
  ordenarHijos(raiz)

  return { data: raiz, ...(sigla ? { sigla } : { seccion }) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Carga de estructura (módulo "Árbol", solo admin) — reemplaza toda la tabla
// `organigramas` desde un Excel subido por UI. Header flexible: no importa
// mayúsculas ni espacios extra, y además tolera el formato de exportación
// legacy real (ej. "Arbol Salud Nuevo.xlsx": `COD_REP` en vez de
// `codigo_reparticion`, `UNIVERSO TOTALIZADOR` con espacio en vez de `_`) vía
// ALIASES_HEADER — se adapta el parser al Excel que manda la fuente, no al
// revés, para no obligar a editar el archivo a mano antes de cada carga.
// Alternativa "self-service" a apps/api/scripts/import-organigrama.ts (que
// lee directo el dump legacy) — ese script sigue siendo el que se usó para la
// carga inicial; esto es para poder actualizar la estructura sin un dev.
// ─────────────────────────────────────────────────────────────────────────────

const LOTE_UPLOAD = 500

// Sinónimos de headers legacy -> nombre de columna que espera el resto del
// parser (snake_case, igual al modelo Prisma). Se aplica después de normalizar
// espacios a "_", así que solo hace falta mapear los que cambian de palabra
// (no los que solo difieren en mayúsculas o separador de espacio/guión bajo).
const ALIASES_HEADER: Record<string, string> = {
  cod_rep: 'codigo_reparticion',
}

function normalizarHeader(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, '_')
}

function celda(norm: Record<string, unknown>, key: string): string | null {
  const v = norm[key]
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function normalizarFilaExcel(row: Record<string, unknown>, numeroFila: number): Prisma.OrganigramaCreateManyInput {
  const norm: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    const header = normalizarHeader(k)
    norm[ALIASES_HEADER[header] ?? header] = v
  }

  const lvlRaw = celda(norm, 'lvl')
  const tipo = celda(norm, 'tipo')
  const codigoReparticion = celda(norm, 'codigo_reparticion')
  const sigla = celda(norm, 'sigla')
  const path = celda(norm, 'path')
  const pathNombres = celda(norm, 'path_nombres')

  const faltantes = [
    ['lvl', lvlRaw], ['tipo', tipo], ['codigo_reparticion', codigoReparticion],
    ['sigla', sigla], ['path', path], ['path_nombres', pathNombres],
  ].filter(([, v]) => v === null).map(([k]) => k)
  if (faltantes.length) {
    throw AppError.badRequest(`Fila ${numeroFila}: faltan columnas obligatorias (${faltantes.join(', ')})`)
  }
  const lvl = Number(lvlRaw)
  if (!Number.isFinite(lvl)) throw AppError.badRequest(`Fila ${numeroFila}: "lvl" no es un número (${lvlRaw})`)

  return {
    lvl,
    tipo: tipo!,
    codigoReparticion: codigoReparticion!,
    universoTotalizador: celda(norm, 'universo_totalizador'),
    regimenEmpleo: celda(norm, 'regimen_empleo'),
    descRep: celda(norm, 'desc_rep'),
    sigla: sigla!,
    padre: celda(norm, 'padre'),
    path: path!,
    pathNombres: pathNombres!,
  }
}

export async function reemplazarOrganigramaService(buffer: Buffer, usuarioId?: string, filename?: string): Promise<{ filas: number }> {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  if (!wb.SheetNames.length) throw AppError.badRequest('El archivo no tiene ninguna hoja')
  const hoja = wb.Sheets[wb.SheetNames[0]]
  const filasCrudas = XLSX.utils.sheet_to_json(hoja, { defval: '' })
  if (filasCrudas.length === 0) throw AppError.badRequest('El archivo no tiene filas de datos')

  // La fila 1 del Excel es el header; sheet_to_json devuelve solo las de datos.
  const filas = filasCrudas.map((row, i) => normalizarFilaExcel(row, i + 2))

  const vistos = new Set<string>()
  for (const f of filas) {
    if (vistos.has(f.codigoReparticion)) {
      throw AppError.badRequest(`codigo_reparticion duplicado en el archivo: ${f.codigoReparticion}`)
    }
    vistos.add(f.codigoReparticion)
  }

  // Sin $transaction envolvente a propósito: son miles de filas y el timeout
  // default de una transacción interactiva de Prisma es 5s — mismo criterio
  // que import-organigrama.ts (delete + createMany secuenciales, sin atomicidad
  // entre ambos). Aceptable acá: operación admin-only, infrecuente, sobre una
  // sola tabla sin relaciones entrantes.
  await prisma.organigrama.deleteMany()
  for (let i = 0; i < filas.length; i += LOTE_UPLOAD) {
    await prisma.organigrama.createMany({ data: filas.slice(i, i + LOTE_UPLOAD) })
  }

  await prisma.organigramaUpload.create({
    data: {
      filename: filename ?? 'desconocido',
      filas: filas.length,
      subidoPorId: usuarioId ?? null,
    },
  })

  return { filas: filas.length }
}

export async function listOrganigramaUploadsService() {
  return prisma.organigramaUpload.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      filename: true,
      filas: true,
      createdAt: true,
      subidoPor: { select: { username: true } },
    },
  })
}
