import { randomUUID } from 'node:crypto'
import FormData from 'form-data'
import axios from 'axios'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { env } from '../../config/env.js'
import type { MultipartFile } from '@fastify/multipart'
import type { DiffQuery } from './padron.schema.js'

// Formas mínimas de las filas que necesitamos de cada modelo — ver comentario
// junto a su uso en aprobarSnapshotService() sobre por qué se anotan a mano
// en vez de importar los tipos generados de @prisma/client.
interface HospitalRow { id: string; sigla: string; nombre: string }
interface EscalafonRow { id: string; nombre: string }
interface PersonaRow { id: string; cuil: string }
interface CargoRow { id: string; idSial: string }
interface OcupacionFinalRow {
  personaId: string
  cargoId: string
  idSialRol: string
  estadoPersona: string | null
  situacionRevista: string | null
  cargo: {
    literalPuesto: string | null
    especialidad: string | null
    agrupador: string | null
    hospital: { sigla: string }
    escalafon: { nombre: string }
  }
}

type PrismaTx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

// Hallazgo crítico (revisión Sprint 2, 2026-08-24): prisma.$transaction sin
// { timeout } usa el default de Prisma (5000ms — verificado contra
// @prisma/client/runtime/library.d.ts de la versión instalada). Tanto
// runPipeline() como aprobarSnapshotService() pueden tocar decenas de miles
// de filas en una sola corrida (la primera aprobación contra un Postgres
// recién migrado, en particular: Cargo empieza vacío, así que calcularDiff()
// marca TODO el padrón — hasta ~48k filas, ver Sprint 0 — como "nuevo"). Con
// el default de 5s cualquier transacción así hace rollback total con
// P2028 antes de terminar. TRANSACTION_TIMEOUT_MS da un margen generoso;
// el resto del fix (más abajo) es evitar N queries secuenciales por fila para
// que en la práctica ni haga falta acercarse a ese límite.
const TRANSACTION_OPTS = { timeout: 10 * 60_000, maxWait: 10_000 }

// createMany / "WHERE x IN (...)" con decenas de miles de valores puede
// superar el límite de parámetros de Postgres (65535) en una sola sentencia.
// Prisma no siempre lo trocea por vos de forma transparente, así que se hace
// a mano acá — barato cuando el array es chico (una sola vuelta), necesario
// cuando es grande.
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const python = axios.create({ baseURL: env.PYTHON_SERVICE_URL, timeout: 300_000 })

// ─── helpers ─────────────────────────────────────────────────────────────────

async function pollJob(jobId: string, maxWaitMs = 240_000): Promise<unknown> {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const { data } = await python.get(`/job/${jobId}`)
    if (data.status === 'done') return data.result
    if (data.status === 'error') throw new Error(`Job Python falló: ${data.error}`)
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error('Timeout esperando job Python')
}

async function getSnapshotOrThrow(id: string) {
  const snapshot = await prisma.padronSnapshot.findUnique({ where: { id } })
  if (!snapshot) throw AppError.notFound('Snapshot no encontrado')
  return snapshot
}

// ─── S2-19: diff calculado por Node contra Postgres ─────────────────────────
// Columnas del resultado de Dotaneitor que se comparan campo a campo.
// Clave: nombre en el DataFrame Python (snake_case del COL_MAP). Valor: campo
// en Cargo u Ocupacion para saber dónde vive ese dato en el modelo relacional.
const COLS_WATCH: Record<string, 'cargo' | 'ocupacion'> = {
  literal_puesto:        'cargo',
  especialidad:          'cargo',
  agrupador:             'cargo',
  unificador_de_puestos: 'cargo',
  situacion_de_revista:  'ocupacion',
  estado:                'ocupacion',
}

type RegistroPython = Record<string, unknown>

async function fetchAllPreview(sessionId: string): Promise<RegistroPython[]> {
  const limit = 500
  let page = 1
  const all: RegistroPython[] = []
  while (true) {
    const { data } = await python.get<{ rows: RegistroPython[]; total: number }>(
      '/preview', { params: { session_id: sessionId, page, limit } }
    )
    all.push(...data.rows)
    if (all.length >= data.total) break
    page++
  }
  return all
}

function strVal(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

async function calcularDiff(sessionId: string) {
  const registros = await fetchAllPreview(sessionId)

  // Mapa id_sial -> registro Python
  const nuevosMap = new Map<string, RegistroPython>()
  for (const r of registros) {
    const idSial = strVal(r['ID SIAL'] ?? r['id_sial'])
    if (idSial) nuevosMap.set(idSial, r)
  }

  // Estado actual en Postgres: Cargo + Ocupacion activa (hasta IS NULL)
  const cargosActuales = await prisma.cargo.findMany({
    where: { estado: 'vigente' },
    select: {
      idSial: true,
      literalPuesto: true,
      especialidad: true,
      agrupador: true,
      unificadorPuesto: true,
      ocupaciones: {
        where: { hasta: null },
        select: { idSialRol: true, situacionRevista: true, estadoPersona: true, cuilYRol: true },
        take: 1,
      },
    },
  })

  const actualesMap = new Map<string, typeof cargosActuales[number]>()
  for (const c of cargosActuales) actualesMap.set(c.idSial, c)

  const nuevosIds   = new Set(nuevosMap.keys())
  const actualesIds = new Set(actualesMap.keys())

  type DiffEntry = {
    snapshotId: string
    tipo: 'nuevo' | 'modificado' | 'eliminado'
    idSialRol: string
    campo: string | null
    valorAnterior: string | null
    valorNuevo: string | null
  }

  const diffs: Omit<DiffEntry, 'snapshotId'>[] = []

  // Nuevos
  for (const idSial of nuevosIds) {
    if (actualesIds.has(idSial)) continue
    const r = nuevosMap.get(idSial)!
    const cuilYRol = strVal(r['CUIL Y ROL'] ?? r['cuil_y_rol'])
    const idSialRol = cuilYRol ? `${idSial}-${cuilYRol}` : idSial
    diffs.push({
      tipo: 'nuevo',
      idSialRol,
      campo: null,
      valorAnterior: null,
      valorNuevo: JSON.stringify({
        id_sial:        idSial,
        cuil_y_rol:     cuilYRol,
        ayn:            strVal(r['AYN'] ?? r['ayn']),
        siglas:         strVal(r['SIGLAS'] ?? r['siglas']),
        escalafon:      strVal(r['ESCALAFON'] ?? r['escalafon']),
        literal_puesto: strVal(r['LITERAL PUESTO'] ?? r['literal_puesto']),
        especialidad:   strVal(r['ESPECIALIDAD'] ?? r['especialidad']),
        tipo_hospital_sigla: strVal(r['TIPO DE HOSPITAL / SIGLA'] ?? r['tipo_hospital_sigla']),
        situacion_de_revista: strVal(r['SITUACION DE REVISTA'] ?? r['situacion_de_revista']),
        estado:         strVal(r['ESTADO'] ?? r['estado']),
        agrupador:      strVal(r['AGRUPADOR'] ?? r['agrupador']),
        unificador_de_puestos: strVal(r['UNIFICADOR DE PUESTOS'] ?? r['unificador_de_puestos']),
      }),
    })
  }

  // Eliminados
  for (const idSial of actualesIds) {
    if (nuevosIds.has(idSial)) continue
    const actual = actualesMap.get(idSial)!
    const ocup = actual.ocupaciones[0]
    const idSialRol = ocup?.idSialRol ?? idSial
    diffs.push({
      tipo: 'eliminado',
      idSialRol,
      campo: null,
      valorAnterior: JSON.stringify({
        id_sial:        idSial,
        cuil_y_rol:     ocup?.cuilYRol ?? null,
        literal_puesto: actual.literalPuesto,
        especialidad:   actual.especialidad,
        agrupador:      actual.agrupador,
        situacion_de_revista: ocup?.situacionRevista ?? null,
        estado:         ocup?.estadoPersona ?? null,
      }),
      valorNuevo: null,
    })
  }

  // Modificados
  const CAMPO_CARGO_MAP: Record<string, keyof typeof cargosActuales[number]> = {
    literal_puesto:        'literalPuesto',
    especialidad:          'especialidad',
    agrupador:             'agrupador',
    unificador_de_puestos: 'unificadorPuesto',
  }
  const CAMPO_OCUP_MAP: Record<string, string> = {
    situacion_de_revista: 'situacionRevista',
    estado:               'estadoPersona',
  }

  for (const idSial of nuevosIds) {
    if (!actualesIds.has(idSial)) continue
    const r      = nuevosMap.get(idSial)!
    const actual = actualesMap.get(idSial)!
    const ocup   = actual.ocupaciones[0]
    const cuilYRol = strVal(r['CUIL Y ROL'] ?? r['cuil_y_rol'])
    const idSialRol = ocup?.idSialRol ?? (cuilYRol ? `${idSial}-${cuilYRol}` : idSial)

    for (const [colPython, tabla] of Object.entries(COLS_WATCH)) {
      const vNuevo = strVal(r[colPython.toUpperCase().replace(/_/g, ' ')] ?? r[colPython])
      let vAnterior = ''
      if (tabla === 'cargo') {
        const key = CAMPO_CARGO_MAP[colPython]
        vAnterior = strVal(key ? actual[key] : null)
      } else {
        const key = CAMPO_OCUP_MAP[colPython]
        vAnterior = strVal(key && ocup ? (ocup as Record<string, unknown>)[key] : null)
      }
      if (vNuevo !== vAnterior) {
        diffs.push({
          tipo: 'modificado',
          idSialRol,
          campo: colPython,
          valorAnterior: vAnterior || null,
          valorNuevo:    vNuevo   || null,
        })
      }
    }
  }

  const totalNuevos      = diffs.filter((d) => d.tipo === 'nuevo').length
  const totalEliminados  = diffs.filter((d) => d.tipo === 'eliminado').length
  const totalModificados = new Set(diffs.filter((d) => d.tipo === 'modificado').map((d) => d.idSialRol)).size
  const totalCampos      = diffs.filter((d) => d.tipo === 'modificado').length

  return { diffs, totalNuevos, totalEliminados, totalModificados, totalCampos }
}

async function assertNoPendiente() {
  const bloqueante = await prisma.padronSnapshot.findFirst({
    where: { estado: { in: ['pendiente', 'procesando'] } },
    select: { id: true, fechaAsignada: true },
  })
  if (bloqueante) throw AppError.snapshotPendiente()
}

async function setPaso(snapshotId: string, paso: string) {
  await prisma.padronSnapshot.update({
    where: { id: snapshotId },
    data: { pasoActual: paso },
  })
}

// ─── S2-18: cleanup al arrancar — marcar como error snapshots que quedaron procesando ───

export async function cleanupSnapshotsProcesando() {
  const { count } = await prisma.padronSnapshot.updateMany({
    where: { estado: 'procesando' },
    data: { estado: 'error', errorMsg: 'Proceso interrumpido al reiniciar el servidor', pasoActual: null },
  })
  if (count > 0) console.warn(`[padron] cleanup: ${count} snapshot(s) marcados como error por reinicio`)
}

// ─── S2-18: pipeline en background ───────────────────────────────────────────

async function runPipeline(
  snapshotId: string,
  sessionId: string,
  fechaAsignada: string,
) {
  try {
    await setPaso(snapshotId, 'normalizar')
    const { data: normJob } = await python.post('/normalizar', { session_id: sessionId })
    await pollJob(normJob.job_id)

    await setPaso(snapshotId, 'procesar')
    const { data: procJob } = await python.post('/procesar', {
      session_id: sessionId,
      fecha_asignada: fechaAsignada,
    })
    await pollJob(procJob.job_id)

    await setPaso(snapshotId, 'cruzar')
    const { data: cruzarJob } = await python.post('/cruzar', { session_id: sessionId })
    await pollJob(cruzarJob.job_id)

    await setPaso(snapshotId, 'diff')
    const { diffs, totalNuevos, totalEliminados, totalModificados, totalCampos } =
      await calcularDiff(sessionId)

    await setPaso(snapshotId, 'guardando')
    await prisma.$transaction(async (tx: PrismaTx) => {
      // Troceado (ver comentario de TRANSACTION_OPTS): un padrón nuevo contra
      // un Postgres recién migrado puede generar hasta ~48k diffs "nuevo" en
      // una sola corrida — un único createMany con esa cantidad de filas
      // arriesga pasarse del límite de parámetros de Postgres.
      for (const lote of chunk(diffs, 2000)) {
        await tx.padronDiff.createMany({
          data: lote.map((d) => ({ ...d, snapshotId })),
        })
      }
      await tx.padronSnapshot.update({
        where: { id: snapshotId },
        data: {
          estado: 'pendiente',
          pasoActual: null,
          // totalRegistros NO se toca acá: se fija una sola vez, al crear el
          // snapshot, con la cantidad de filas del Excel subido. Sobreescribirlo
          // acá con el conteo del diff (nuevos+eliminados+modificados) le cambia
          // el significado — deja de responder "cuántos registros tenía el
          // archivo" y pasa a responder "cuántos cambiaron", que es un dato
          // distinto y ya vive aparte en el summary del diff. El frontend
          // (PadronDiffPage) muestra este campo como "X registros procesados",
          // asumiendo que es el conteo del archivo.
        },
      })
    }, TRANSACTION_OPTS)

    console.info(`[padron] pipeline completado snapshotId=${snapshotId} nuevos=${totalNuevos} eliminados=${totalEliminados} modificados=${totalModificados} campos=${totalCampos}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await prisma.padronSnapshot.update({
      where: { id: snapshotId },
      data: { estado: 'error', errorMsg: msg, pasoActual: null },
    }).catch(() => {})
    console.error(`[padron] pipeline error snapshotId=${snapshotId}:`, msg)
  } finally {
    python.post('/session/delete', { session_id: sessionId }).catch(() => {})
  }
}

// ─── S2-2 + S2-3 + S2-4 + S2-18 + S2-19: upload → dispara pipeline async ────

export async function uploadPadronService(
  file: MultipartFile,
  fechaAsignada: string,
  usuarioId: string
) {
  await assertNoPendiente()

  const fechaDate = new Date(fechaAsignada)
  const existe = await prisma.padronSnapshot.findUnique({ where: { fechaAsignada: fechaDate } })
  if (existe) throw AppError.conflict(`Ya existe un snapshot para la fecha ${fechaAsignada}`)

  const fileBuffer = await file.toBuffer()

  const { data: sessionData } = await python.post('/session')
  const sessionId: string = sessionData.session_id

  // Upload sincrónico para obtener totalRegistros antes de responder
  let totalRegistros = 0
  try {
    const form = new FormData()
    form.append('session_id', sessionId)
    form.append('file', fileBuffer, { filename: file.filename, contentType: file.mimetype })
    const { data: uploadData } = await python.post('/upload-cargos', form, {
      headers: form.getHeaders(),
    })
    totalRegistros = uploadData.rows ?? 0
  } catch (err) {
    python.post('/session/delete', { session_id: sessionId }).catch(() => {})
    throw err
  }

  // Crear snapshot en estado procesando
  const snapshot = await prisma.padronSnapshot.create({
    data: {
      fechaAsignada: fechaDate,
      filename: file.filename,
      totalRegistros,
      procesadoPorId: usuarioId,
      estado: 'procesando',
      pasoActual: 'normalizar',
    },
  })

  // Disparar pipeline en background — no await
  void runPipeline(snapshot.id, sessionId, fechaAsignada)

  return { snapshotId: snapshot.id, fechaAsignada, totalRegistros }
}

// ─── S2-18: polling de estado ─────────────────────────────────────────────────

export async function getSnapshotEstadoService(id: string) {
  const snapshot = await prisma.padronSnapshot.findUnique({
    where: { id },
    select: { id: true, estado: true, pasoActual: true, errorMsg: true, totalRegistros: true },
  })
  if (!snapshot) throw AppError.notFound('Snapshot no encontrado')
  return snapshot
}

// ─── S2-5: listar snapshots + diff paginado ───────────────────────────────────

export async function listSnapshotsService() {
  return prisma.padronSnapshot.findMany({
    orderBy: { fechaAsignada: 'desc' },
    select: {
      id: true,
      fechaAsignada: true,
      filename: true,
      totalRegistros: true,
      estado: true,
      pasoActual: true,
      errorMsg: true,
      aprobadoAt: true,
      createdAt: true,
      procesadoPor: { select: { username: true } },
      aprobadoPor: { select: { username: true } },
    },
  })
}

export async function getSnapshotDiffService(id: string, query: DiffQuery) {
  const snapshot = await getSnapshotOrThrow(id)

  const where = {
    snapshotId: id,
    ...(query.tipo ? { tipo: query.tipo } : {}),
  }

  const [total, diffs] = await Promise.all([
    prisma.padronDiff.count({ where }),
    prisma.padronDiff.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: [{ tipo: 'asc' }, { idSialRol: 'asc' }],
    }),
  ])

  const [nuevos, modificados, eliminados, camposModificados] = await Promise.all([
    prisma.padronDiff.count({ where: { snapshotId: id, tipo: 'nuevo' } }),
    prisma.padronDiff.count({ where: { snapshotId: id, tipo: 'modificado' } }),
    prisma.padronDiff.count({ where: { snapshotId: id, tipo: 'eliminado' } }),
    prisma.padronDiff.count({ where: { snapshotId: id, tipo: 'modificado' } }),
  ])

  return {
    snapshot: {
      id: snapshot.id,
      fechaAsignada: snapshot.fechaAsignada,
      filename: snapshot.filename,
      totalRegistros: snapshot.totalRegistros,
      estado: snapshot.estado,
    },
    summary: { nuevos, modificados, eliminados, camposModificados },
    diffs: {
      data: diffs,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        pages: Math.ceil(total / query.limit),
      },
    },
  }
}

// ─── S2-6 + S2-7: aprobar snapshot ───────────────────────────────────────────

const CAMPOS_CARGO: Record<string, string> = {
  literal_puesto: 'literalPuesto',
  especialidad: 'especialidad',
  agrupador: 'agrupador',
  unificador_de_puestos: 'unificadorPuesto',
}
const CAMPOS_OCUPACION: Record<string, string> = {
  situacion_de_revista: 'situacionRevista',
  estado: 'estadoPersona',
}

export async function aprobarSnapshotService(id: string, usuarioId: string) {
  const snapshot = await getSnapshotOrThrow(id)
  if (snapshot.estado !== 'pendiente') throw AppError.conflict(`El snapshot ya está ${snapshot.estado}`)

  const diffs = await prisma.padronDiff.findMany({ where: { snapshotId: id } })

  // Hallazgo crítico (revisión Sprint 2, 2026-08-24): la versión anterior de
  // esta función hacía entre 4 y 6 queries secuenciales POR CADA idSialRol
  // cambiado, todo dentro de un único $transaction — con el default de 5s de
  // Prisma eso hace rollback total (P2028) apenas el diff deja de ser
  // trivial, y la primera aprobación contra un Postgres recién migrado
  // (Cargo vacío ⇒ calcularDiff() marca TODO el padrón como "nuevo", hasta
  // ~48k filas) lo garantiza siempre. Reescrita para precargar en bloque todo
  // lo que antes se buscaba fila por fila, y escribir en bloque (createMany /
  // updateMany con `in`) en vez de un create/update por fila. "modificado"
  // sigue siendo una query por fila para Cargo/Ocupacion porque cada fila
  // cambia campos distintos (no se puede expresar como un solo updateMany) —
  // aceptable porque el caso que escala a decenas de miles de filas es
  // siempre "nuevo" (carga inicial), no "modificado" (cambios semana a
  // semana, volumen mucho menor).
  await prisma.$transaction(async (tx: PrismaTx) => {
    const porSialRol = new Map<string, typeof diffs>()
    for (const d of diffs) {
      const arr = porSialRol.get(d.idSialRol) ?? []
      arr.push(d)
      porSialRol.set(d.idSialRol, arr)
    }

    const nuevos: { idSialRol: string; datos: Record<string, string> }[] = []
    const eliminados: string[] = []
    const modificados: { idSialRol: string; cambios: typeof diffs }[] = []
    for (const [idSialRol, cambios] of porSialRol) {
      if (cambios.length === 0) continue
      const tipo = cambios[0]!.tipo
      if (tipo === 'nuevo') nuevos.push({ idSialRol, datos: JSON.parse(cambios[0]!.valorNuevo ?? '{}') })
      else if (tipo === 'eliminado') eliminados.push(idSialRol)
      else if (tipo === 'modificado') modificados.push({ idSialRol, cambios })
    }

    const todosLosIdSialRol = [...porSialRol.keys()]

    // ── 1. Precarga en bloque de todo lo que ya existe ──────────────────────
    const siglasNecesarias = [...new Set(nuevos.map((n) => n.datos.siglas ?? n.idSialRol))]
    const escalafonesNecesarios = [...new Set(nuevos.map((n) => n.datos.escalafon ?? n.idSialRol))]
    const cuilsNecesarios = [...new Set(nuevos.map((n) => n.datos.cuil).filter((v): v is string => Boolean(v)))]
    const idSialsNecesarios = [...new Set(nuevos.map((n) => n.datos.id_sial).filter((v): v is string => Boolean(v)))]

    // `{ in: [] }` es válido en Prisma (devuelve 0 filas) — no hace falta
    // condicionar la query a que el array no esté vacío.
    // Cast explícito de los resultados: en este entorno pnpm, la copia de
    // '@prisma/client' que TypeScript resuelve para el paquete es el stub sin
    // generar que trae el propio npm package (PrismaClient = any) en vez del
    // cliente generado real que vive en la raíz del monorepo — @prisma/client
    // en tiempo de ejecución sí usa el generado (por eso todo funciona
    // corriendo), pero en tiempo de compilación tx.<modelo> resuelve a `any`,
    // que colapsa a `{}` en este tipo de contexto (Promise.all + destructure)
    // y tira "implicitly any" en los .map() de más abajo. Anotar el resultado
    // a mano con la forma mínima que se usa evita depender de esa resolución
    // rota sin tener que arreglar la instalación de pnpm para esto.
    const [hospitalesExistentes, escalafonesExistentes, personasExistentes, cargosExistentes, ocupacionesExistentes] =
      await Promise.all([
        tx.hospital.findMany({ where: { sigla: { in: siglasNecesarias } } }) as Promise<HospitalRow[]>,
        tx.escalafon.findMany({ where: { nombre: { in: escalafonesNecesarios } } }) as Promise<EscalafonRow[]>,
        tx.persona.findMany({ where: { cuil: { in: cuilsNecesarios } } }) as Promise<PersonaRow[]>,
        tx.cargo.findMany({ where: { idSial: { in: idSialsNecesarios } } }) as Promise<CargoRow[]>,
        tx.ocupacion.findMany({
          where: { idSialRol: { in: todosLosIdSialRol } },
          select: { idSialRol: true, cargoId: true },
        }) as Promise<{ idSialRol: string; cargoId: string }[]>,
      ])

    const hospitalCache = new Map(hospitalesExistentes.map((h) => [h.sigla, h]))
    const escalafonCache = new Map(escalafonesExistentes.map((e) => [e.nombre, e]))
    const personaCache = new Map(personasExistentes.map((p) => [p.cuil, p]))
    const cargoCache = new Map(cargosExistentes.map((c) => [c.idSial, c]))
    const ocupacionExistenteMap = new Map(ocupacionesExistentes.map((o) => [o.idSialRol, o]))

    // ── 2. Crear en bloque hospitales / escalafones faltantes (catálogos —
    //       cardinalidad chica, no escala con la cantidad de filas) ────────
    for (const sigla of siglasNecesarias) {
      if (hospitalCache.has(sigla)) continue
      const datos = nuevos.find((n) => (n.datos.siglas ?? n.idSialRol) === sigla)!.datos
      const h = await tx.hospital.create({
        data: { sigla, nombre: sigla, tipo: datos.tipo_hospital_sigla ?? null },
      })
      hospitalCache.set(sigla, h)
    }
    for (const nombre of escalafonesNecesarios) {
      if (escalafonCache.has(nombre)) continue
      const e = await tx.escalafon.create({ data: { codigo: nombre, nombre } })
      escalafonCache.set(nombre, e)
    }

    // ── 3. Crear en bloque personas / cargos / ocupaciones faltantes ───────
    const personasACrear = new Map<string, { id: string; cuil: string; apellidoNombre: string }>()
    const cargosACrear = new Map<
      string,
      {
        id: string
        idSial: string
        hospitalId: string
        escalafonId: string
        literalPuesto: string | null
        especialidad: string | null
        agrupador: string | null
        unificadorPuesto: string | null
      }
    >()
    for (const { datos } of nuevos) {
      if (datos.cuil && !personaCache.has(datos.cuil) && !personasACrear.has(datos.cuil)) {
        personasACrear.set(datos.cuil, { id: randomUUID(), cuil: datos.cuil, apellidoNombre: datos.ayn ?? '' })
      }
      if (datos.id_sial && !cargoCache.has(datos.id_sial) && !cargosACrear.has(datos.id_sial)) {
        const hospital = hospitalCache.get(datos.siglas ?? '')!
        const escalafon = escalafonCache.get(datos.escalafon ?? '')!
        cargosACrear.set(datos.id_sial, {
          id: randomUUID(),
          idSial: datos.id_sial,
          hospitalId: hospital.id,
          escalafonId: escalafon.id,
          literalPuesto: datos.literal_puesto ?? null,
          especialidad: datos.especialidad ?? null,
          agrupador: datos.agrupador ?? null,
          unificadorPuesto: datos.unificador_de_puestos ?? null,
        })
      }
    }

    for (const lote of chunk([...personasACrear.values()], 2000)) {
      await tx.persona.createMany({ data: lote, skipDuplicates: true })
    }
    for (const p of personasACrear.values()) personaCache.set(p.cuil, p)

    for (const lote of chunk([...cargosACrear.values()], 2000)) {
      await tx.cargo.createMany({ data: lote, skipDuplicates: true })
    }
    for (const c of cargosACrear.values()) cargoCache.set(c.idSial, c)

    const ocupacionesACrear: {
      id: string
      personaId: string
      cargoId: string
      idSialRol: string
      cuilYRol: string | null
      situacionRevista: string | null
      estadoPersona: string | null
      snapshotId: string
    }[] = []
    for (const { idSialRol, datos } of nuevos) {
      if (ocupacionExistenteMap.has(idSialRol)) continue
      const persona = datos.cuil ? personaCache.get(datos.cuil) : null
      const cargo = datos.id_sial ? cargoCache.get(datos.id_sial) : null
      if (!persona || !cargo) continue
      ocupacionesACrear.push({
        id: randomUUID(),
        personaId: persona.id,
        cargoId: cargo.id,
        idSialRol,
        cuilYRol: datos.cuil_y_rol ?? null,
        situacionRevista: datos.situacion_de_revista ?? null,
        estadoPersona: datos.estado ?? null,
        snapshotId: id,
      })
    }
    for (const lote of chunk(ocupacionesACrear, 2000)) {
      await tx.ocupacion.createMany({ data: lote, skipDuplicates: true })
    }
    for (const o of ocupacionesACrear) ocupacionExistenteMap.set(o.idSialRol, { idSialRol: o.idSialRol, cargoId: o.cargoId })

    // ── 4. Eliminados: un solo updateMany con `in` para todos ──────────────
    for (const lote of chunk(eliminados, 2000)) {
      if (!lote.length) continue
      await tx.ocupacion.updateMany({ where: { idSialRol: { in: lote } }, data: { hasta: new Date() } })
    }

    // ── 5. Modificados: sigue siendo por fila (cada una cambia campos
    //       distintos), pero sin el find extra — usa la precarga del paso 1 ─
    for (const { idSialRol, cambios } of modificados) {
      const updateCargo: Record<string, string> = {}
      const updateOcupacion: Record<string, string> = {}
      for (const cambio of cambios) {
        if (!cambio.campo) continue
        const mappedCargo = CAMPOS_CARGO[cambio.campo]
        const mappedOcupacion = CAMPOS_OCUPACION[cambio.campo]
        if (mappedCargo) updateCargo[mappedCargo] = cambio.valorNuevo ?? ''
        if (mappedOcupacion) updateOcupacion[mappedOcupacion] = cambio.valorNuevo ?? ''
      }

      const ocupExistente = ocupacionExistenteMap.get(idSialRol)
      if (ocupExistente && Object.keys(updateCargo).length > 0) {
        await tx.cargo.update({ where: { id: ocupExistente.cargoId }, data: updateCargo })
      }
      if (Object.keys(updateOcupacion).length > 0) {
        await tx.ocupacion.update({ where: { idSialRol }, data: updateOcupacion })
      }
    }

    // ── 6. Histórico: una sola lectura en bloque del estado final de todas
    //       las ocupaciones tocadas, y un createMany en vez de un create por
    //       fila ────────────────────────────────────────────────────────────
    const ocupacionesFinales = (await tx.ocupacion.findMany({
      where: { idSialRol: { in: todosLosIdSialRol } },
      include: { cargo: { include: { hospital: true, escalafon: true } } },
    })) as OcupacionFinalRow[]
    const historicoEntries = ocupacionesFinales.map((ocupacion) => ({
      id: randomUUID(),
      snapshotId: id,
      fechaAsignada: snapshot.fechaAsignada,
      personaId: ocupacion.personaId,
      cargoId: ocupacion.cargoId,
      idSialRol: ocupacion.idSialRol,
      escalafon: ocupacion.cargo.escalafon.nombre,
      hospitalSigla: ocupacion.cargo.hospital.sigla,
      literalPuesto: ocupacion.cargo.literalPuesto,
      especialidad: ocupacion.cargo.especialidad,
      agrupador: ocupacion.cargo.agrupador,
      estadoPersona: ocupacion.estadoPersona,
      situacionRevista: ocupacion.situacionRevista,
    }))
    for (const lote of chunk(historicoEntries, 2000)) {
      await tx.padronHistorico.createMany({ data: lote })
    }

    await tx.padronSnapshot.update({
      where: { id },
      data: { estado: 'aprobado', aprobadoPorId: usuarioId, aprobadoAt: new Date() },
    })
  }, TRANSACTION_OPTS)

  return { ok: true, snapshotId: id }
}

// ─── S2-8: rechazar snapshot ──────────────────────────────────────────────────

export async function rechazarSnapshotService(id: string) {
  const snapshot = await getSnapshotOrThrow(id)
  if (snapshot.estado !== 'pendiente') throw AppError.conflict(`El snapshot ya está ${snapshot.estado}`)

  await prisma.padronSnapshot.update({
    where: { id },
    data: { estado: 'rechazado' },
  })

  return { ok: true, snapshotId: id }
}
