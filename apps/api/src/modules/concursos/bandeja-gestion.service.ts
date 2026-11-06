import { Prisma, type ConcursoCeetps } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import type { ConcursosCphQuery } from '../concursos-cph/concursos-cph.schema.js'
import { listConcursosCphService } from '../concursos-cph/concursos-cph.service.js'

// ─── PASO 1b (flujo concursos): bandeja RICA mixta CPH + CEETPS ─────────────
// Alimenta la tabla COMPLETA mudada a /cargos/concurso ("Gestión de Concursos").
// A diferencia de la bandeja simplificada original (toBandejaItem, columnas
// comunes), este servicio devuelve filas con la MISMA forma que ConcursoCph —
// la tabla reutilizada (ConcursosListaTab) ya sabe pintarlas tal cual.
//
// OPCIÓN DE ORIGEN DE DATOS ELEGIDA: (i) — el endpoint devuelve los campos
// ricos para AMBOS tipos. Para las filas CPH se delega 1:1 en
// listConcursosCphService (TODOS sus filtros/orden/paginado intactos, máxima
// reutilización, cero ramas nuevas en la ruta CPH). Para las filas CEETPS se
// mapea cada registro a la forma de ConcursoCph dejando null/vacíos los campos
// CPH-only (stepper/etapas, respaldatoria eeBaja, etiquetas, sub-estados de
// jurado/OM, etc.) — Jorge: "que muestren lo que puedan", el ajuste fino de
// CEETPS es un paso posterior.
//
// Paginado del modo MIXTO: se traen ambas fuentes sin paginar y se mezclan en
// memoria. Volumen esperado chico (decenas/pocos cientos de CPH, poquísimos
// CEETPS — mismo criterio "es barato" de useConcursosCphAlertas), así que el
// merge in-memory es aceptable y evita el paginado interleaved entre dos tablas.

// Filtros de la bandeja rica = los mismos de ConcursoCph + discriminador `tipo`.
export type BandejaGestionQuery = ConcursosCphQuery & { tipo?: 'cph' | 'ceetps' }

// Include CEETPS: lo mínimo para poblar las columnas de la tabla reutilizada
// (cargo para puesto/especialidad/repartición, hospital para la sigla).
const includeCeetps = {
  concurso: { include: { cargo: true } },
  hospital: true,
} satisfies Prisma.ConcursoCeetpsInclude

type CeetpsRow = Prisma.ConcursoCeetpsGetPayload<{ include: typeof includeCeetps }>

// Mapeo CEETPS → forma ConcursoCph. PURO (sin Prisma) para testear la
// unificación sin BD. Los campos CPH-only quedan null/false/[] para que la
// tabla los muestre vacíos ("—") en las filas CEETPS sin romper.
export function ceetpsToConcursoCphShape(row: CeetpsRow): Record<string, unknown> {
  const cargo = row.concurso?.cargo
  return {
    // Identidad: se usa el id de la EXTENSIÓN CEETPS (igual que CPH usa el id
    // del ConcursoCph), para que el link "Ver" apunte al registro correcto.
    id: row.id,
    concursoId: row.concursoId,
    cargoId: row.cargoId,
    hospitalId: row.hospitalId,
    // Estado/sub-estado reales del CEETPS (strings propios de su enum) — la
    // tabla los muestra como texto; el stepper (CPH-only) queda en etapa 1.
    estado: row.estado,
    subEstado: row.subEstado,
    subEstado3: null,
    especialidadSolicitada: null,
    puestoSolicitado: row.puestoSolicitado,
    puestoCargoSolicitadoId: row.puestoCargoSolicitadoId,
    especialidadPuestoSolicitadaId: null,
    // Respaldatoria (CPH-only): sin eeBaja → la tabla clasifica por el
    // expediente del cargo (Ampliación) o Cobertura, igual que un CPH sin baja.
    eeBaja: null,
    fechaBaja: null,
    eeConcurso: row.expedienteConcurso,
    fechaEeConcurso: null,
    ifAutorizacion: null,
    fechaAutorizacion: row.fechaAutorizacion ? row.fechaAutorizacion.toISOString() : null,
    sorteoJurado: null,
    tipoGestion: null,
    disposicion: null,
    fechaInscDesde: null,
    fechaInscHasta: null,
    inscripcionCerrada: false,
    fechaCierreInscripcion: null,
    presentadosConfirmados: false,
    ordenMeritoConfirmado: false,
    fechaExamen: null,
    fechaOrdenMerito: null,
    fechaIfacs: row.fechaIfacs ? row.fechaIfacs.toISOString() : null,
    fechaInsal: row.fechaInsal ? row.fechaInsal.toISOString() : null,
    eeDesignacion: row.expedienteDesignacion,
    cargaDocumentacion: null,
    fechaAptoMedico: null,
    fechaIte: null,
    proyectoResolucion: null,
    resoALaFirma: null,
    resolucionDesignacion: row.resolucionDesignacion,
    fechaResolucion: null,
    cargoSial: row.codigoSial,
    dispoDesierta: null,
    fechaDispoDesierta: null,
    cantidadCargos: row.cantidadCargos,
    personaDesignadaId: row.personaDesignadaId,
    designadoRefCuil: null,
    designadoRefNombre: null,
    designadoRefIdSialRol: null,
    suspendido: false,
    ifacs: null,
    insal: null,
    insalAceptado: null,
    insalRechazados: [],
    inscriptoReservadoId: null,
    validado: false,
    validadoAt: null,
    validadoIdSialRol: null,
    cambioEspecialidad: row.cambioEspecialidad,
    motivoCambioEspecialidad: null,
    qInscriptos: null,
    pendienteAutorizacion: false,
    aprobadoDirector: false,
    siglaSolicitada: null,
    codigoRegistroSolicitadoId: null,
    observaciones: row.observaciones,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    // Relaciones expandidas que la tabla lee (concurso.cargo, hospital).
    concurso: row.concurso,
    hospital: row.hospital,
    // CPH-only: sin etiquetas en CEETPS (la tabla muestra el control vacío).
    etiquetas: [],
    // Discriminador para que la UI distinga la fila (link "Ver", badges).
    tipoConcurso: 'ceetps' as const,
  }
}

// Fecha de ordenamiento común a ambos tipos: para CPH se respeta el criterio
// elegido (fecha_ee_concurso / fecha_baja); para CEETPS, que no tiene esas
// fechas, se cae a updatedAt. Mezcla estable con createdAt de desempate.
function fechaOrden(item: Record<string, unknown>, ordenarPor: string): number {
  const campo =
    ordenarPor === 'fecha_baja'
      ? (item.fechaBaja as string | null)
      : (item.fechaEeConcurso as string | null)
  const base = campo ?? (item.updatedAt as string | null) ?? (item.createdAt as string | null)
  return base ? new Date(base).getTime() : 0
}

export async function listBandejaGestionService(query: BandejaGestionQuery) {
  const { tipo, page, limit, ordenarPor = 'fecha_ee_concurso', orden = 'desc' } = query

  // tipo === 'cph': delega 1:1 en el servicio CPH (full fidelity, paginado en
  // SQL). Ninguna rama nueva: devuelve exactamente lo que /concursos-cph.
  if (tipo === 'cph') {
    return listConcursosCphService(query)
  }

  // tipo === 'ceetps': solo CEETPS mapeados a la forma CPH. Se trae todo (chico)
  // y se pagina en memoria para no duplicar la lógica de where/paginado.
  if (tipo === 'ceetps') {
    const ceetps = await fetchCeetpsMapeados(query)
    return paginarEnMemoria(ceetps, page, limit, ordenarPor, orden)
  }

  // Mixto (sin tipo): CPH ricos (sin paginar) + CEETPS mapeados, merge + sort +
  // paginado en memoria. Para CPH se pide un limit alto y page 1 para traer
  // todo el conjunto filtrado (el límite duro del schema es 200; se itera si
  // hiciera falta, pero el volumen real entra holgado en una página grande).
  const [cphTodos, ceetps] = await Promise.all([
    fetchCphTodos(query),
    fetchCeetpsMapeados(query),
  ])
  const combinado = [...cphTodos, ...ceetps]
  return paginarEnMemoria(combinado, page, limit, ordenarPor, orden)
}

// Trae TODOS los CPH que matchean los filtros (sin paginar), reutilizando
// listConcursosCphService con un limit máximo. El servicio CPH topa limit en
// 200; si algún día hay más, se itera por páginas (hoy el volumen entra).
async function fetchCphTodos(query: BandejaGestionQuery): Promise<Record<string, unknown>[]> {
  const acumulado: Record<string, unknown>[] = []
  let page = 1
  const limit = 200
  // Loop de páginas defensivo: normalmente una sola iteración.
  for (;;) {
    const res = await listConcursosCphService({ ...query, page, limit })
    acumulado.push(...(res.data as unknown as Record<string, unknown>[]))
    if (page >= res.meta.pages || res.data.length === 0) break
    page += 1
  }
  return acumulado
}

async function fetchCeetpsMapeados(query: BandejaGestionQuery): Promise<Record<string, unknown>[]> {
  // Subconjunto de filtros que aplican a CEETPS (los CPH-only se ignoran acá):
  // hospital(es), estado (string del enum CEETPS), sub-estado, search.
  const { hospitalId, hospitalIds, estado, subEstado, search } = query
  const where: Prisma.ConcursoCeetpsWhereInput = {
    ...(hospitalIds?.length
      ? { hospitalId: { in: hospitalIds } }
      : hospitalId
        ? { hospitalId }
        : {}),
    ...(estado && { estado: estado as ConcursoCeetps['estado'] }),
    ...(subEstado && { subEstado }),
    ...(search && {
      OR: [
        { expedienteConcurso: { contains: search, mode: 'insensitive' } },
        { puestoSolicitado: { contains: search, mode: 'insensitive' } },
        { concurso: { cargo: { literalPuesto: { contains: search, mode: 'insensitive' } } } },
        { hospital: { sigla: { contains: search, mode: 'insensitive' } } },
      ],
    }),
  }
  const rows = await prisma.concursoCeetps.findMany({ where, include: includeCeetps })
  return rows.map(ceetpsToConcursoCphShape)
}

// Ordena por la fecha elegida (desc/asc) y pagina en memoria. Devuelve el mismo
// contrato PaginatedResponse que los servicios CPH/CEETPS.
function paginarEnMemoria(
  items: Record<string, unknown>[],
  page: number,
  limit: number,
  ordenarPor: string,
  orden: 'asc' | 'desc',
) {
  const factor = orden === 'asc' ? 1 : -1
  const ordenado = [...items].sort((a, b) => {
    const diff = fechaOrden(a, ordenarPor) - fechaOrden(b, ordenarPor)
    if (diff !== 0) return diff * factor
    // Desempate estable por createdAt desc (mismo criterio que el servicio CPH).
    const ca = new Date((a.createdAt as string) ?? 0).getTime()
    const cb = new Date((b.createdAt as string) ?? 0).getTime()
    return cb - ca
  })
  const total = ordenado.length
  const offset = (page - 1) * limit
  return {
    data: ordenado.slice(offset, offset + limit),
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  }
}
