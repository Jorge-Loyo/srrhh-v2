import { randomUUID } from 'node:crypto'
import { Agent as HttpAgent } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'
import FormData from 'form-data'
import axios from 'axios'
import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { env } from '../../config/env.js'
import {
  prefijoDeCargo,
  maxSecuencialCargo,
  siguienteCodigoCargo,
} from '../../shared/codigoCargo.js'
import {
  cargarCatalogoPuestos,
  resolverPuestoCargoId,
  resolverEspecialidadPuestoId,
  especialidadSialReal,
  normPuestoKey,
  type CatalogoPuestosCache,
} from './resolverPuestoCargo.js'
import { decidirEspecialidad } from './padron.especialidad.helpers.js'
import { particionarValidacionPorIdSial } from '../bajas/bajas.validacion.helpers.js'
import { crearNotificacion } from '../notificaciones/notificaciones.service.js'
import { reconciliarCargoConduccionVacante } from './reconciliarConduccion.js'
import {
  derivarCodigoRegistroId,
  MOTIVO_CR_NO_DERIVABLE,
  type CrCatalogo,
} from './derivarCodigoRegistro.js'
import { derivarRegimenId } from './derivarRegimen.js'
import { estadoActivoAcumuladoSql } from '../kpis/kpis.service.js'
import {
  calcConcursoCph,
  type ConcursoCphCalcInput,
} from '../concursos-cph/concursosCph.calc.js'
import type { DiffQuery } from './padron.schema.js'
import {
  parseFechaDDMMYYYY,
  toISO,
  stripCompletado,
  categoriaBaja,
  CENTINELA_ISO,
  strVal,
  esDesdoblado,
  normEspDesdoblado,
  particionarRegistros,
  resolverEspecialidadDesdobladaId,
  prefijoDesdobladoForzado,
  formatearCodigoDesdoblado,
  tipoDiffDesdoblado,
  clasificacionEliminadoDesdoblado,
  evaluarRatioTamano,
} from './padron.diff.helpers.js'

// Re-exportados para compatibilidad y para que otros módulos usen la única
// fuente de los helpers del diff.
export { parseFechaDDMMYYYY, toISO, stripCompletado, categoriaBaja, CENTINELA_ISO }

// Prefijos que se aprueban automáticamente al subir el padrón:
// Residentes (RES), Docentes (DOC) y Autoridades Superiores (AS-*)
// no pasan por revisión de este departamento.
function esAutoAprobable(datos: Record<string, string>): boolean {
  const prefijo = prefijoDeCargo({
    escalafon: datos.escalafon ?? null,
    unificadorPuesto: datos.unificador_de_puestos ?? null,
    agrupador: datos.agrupador ?? null,
  })
  return prefijo === 'RES' || prefijo === 'DOC' || prefijo.startsWith('AS-')
}

// Buffer ya resuelto por el route handler — ver comentario en padron.routes.ts
// sobre por qué no se recibe el MultipartFile crudo acá (el stream tiene que
// consumirse mientras el part está activo en el iterador de request.parts()).
interface UploadedFile {
  buffer: Buffer
  filename: string
  mimetype: string
}

// Formas mínimas de las filas que necesitamos de cada modelo — ver comentario
// junto a su uso en aprobarSnapshotService() sobre por qué se anotan a mano
// en vez de importar los tipos generados de @prisma/client.
interface HospitalRow {
  id: string
  sigla: string
  nombre: string
}
interface EscalafonRow {
  id: string
  nombre: string
}
interface PersonaRow {
  id: string
  cuil: string
}
interface CargoRow {
  id: string
  idSial: string
  estado: string
}
interface OcupacionFinalRow {
  personaId: string
  cargoId: string
  idSialRol: string
  estadoPersona: string | null
  situacionRevista: string | null
  persona: { cuil: string }
  cargo: {
    literalPuesto: string | null
    especialidadLegacy: string | null
    agrupador: string | null
    unificadorPuesto: string | null
    hospital: { sigla: string }
    escalafon: { nombre: string }
  }
}

type PrismaTx = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

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

// Agentes HTTP con keep-alive controlado. Sin esto, axios reusa el socket TCP
// entre requests; el Dotaneitor (uvicorn 1 worker) cierra el keep-alive durante
// los polls largos de /normalizar-/procesar-/cruzar, y la primera request nueva
// sobre ese socket muerto tira `read ECONNRESET` (era el error al subir padrones
// grandes, justo al empezar /preview del diff). keepAlive + reintento lo cubren.
const httpAgent = new HttpAgent({ keepAlive: true, maxSockets: 4 })
const httpsAgent = new HttpsAgent({ keepAlive: true, maxSockets: 4 })
const python = axios.create({
  baseURL: env.PYTHON_SERVICE_URL,
  // S22/Opción B: el procesamiento del padrón corre como job async en el
  // Dotaneitor; cada request API↔Python es corta (arrancar el job y leer el
  // estado son operaciones de ms). Timeout default 30 s; la descarga del
  // parquet usa un override por-request de 60 s (DESCARGA_TIMEOUT_MS).
  timeout: 30_000,
  httpAgent,
  httpsAgent,
})

// ── Constantes del flujo async del padrón (Opción B) ──────────────────────────
const JOB_POLL_INTERVAL_MS = 3_000 // cada cuánto Node pollea GET /job/{id}
const JOB_POLL_TIMEOUT_MS = 15 * 60_000 // tope total de espera del polling (15 min)
const PAGE_DESCARGA = 5_000 // tamaño de página al descargar el parquet (orden de chunk(diffs,2000))
const DESCARGA_TIMEOUT_MS = 60_000 // timeout por-request SOLO para la descarga (mueve datos)

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
// Primera línea legible de un error (sin el traceback que el Dotaneitor adjunta).
const firstLine = (s: string | null | undefined): string => (s ?? '').split('\n')[0]!.trim()

// Errores de red transitorios del contenedor Python que ameritan reintento.
const ERRORES_RED_TRANSITORIOS = new Set(['ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'EPIPE'])

// Reintenta una llamada al Dotaneitor ante un corte de socket transitorio
// (hasta `intentos` veces, con backoff corto). No reintenta errores HTTP con
// respuesta (4xx/5xx del servicio), solo fallos de conexión.
async function conReintentoRed<T>(fn: () => Promise<T>, intentos = 3): Promise<T> {
  let ultimoError: unknown
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn()
    } catch (err) {
      const code = axios.isAxiosError(err) ? err.code : undefined
      const esTransitorio =
        (code && ERRORES_RED_TRANSITORIOS.has(code)) ||
        (axios.isAxiosError(err) && !err.response && /socket hang up|ECONNRESET/i.test(err.message))
      if (!esTransitorio || i === intentos - 1) throw err
      ultimoError = err
      await new Promise((r) => setTimeout(r, 500 * (i + 1)))
    }
  }
  throw ultimoError
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function getSnapshotOrThrow(id: string) {
  const snapshot = await prisma.padronSnapshot.findUnique({ where: { id } })
  if (!snapshot) throw AppError.notFound('Snapshot no encontrado')
  return snapshot
}

// ─── Guarda contra padrón parcial ────────────────────────────────────────────
// Trae el total del ÚLTIMO snapshot aprobado (el más reciente por fechaAsignada),
// excluyendo opcionalmente un snapshot (el propio al re-chequear en aprobar).
// Devuelve null si no hay aprobado previo (la guarda no aplica — primer padrón).
async function totalUltimoSnapshotAprobado(excluirId?: string): Promise<number | null> {
  const ultimo = await prisma.padronSnapshot.findFirst({
    where: { estado: 'aprobado', ...(excluirId ? { id: { not: excluirId } } : {}) },
    orderBy: { fechaAsignada: 'desc' },
    select: { totalRegistros: true },
  })
  return ultimo?.totalRegistros ?? null
}

// Arma el texto de advertencia de padrón chico: incluye conteos, porcentaje y la
// explicación operativa. Fuente única del mensaje (lo usa runPipeline para
// persistir la advertencia y aprobarSnapshotService para el error del bloqueo).
function mensajeAdvertenciaRatio(totalNuevo: number, totalReferencia: number, ratio: number): string {
  const pct = Math.round(ratio * 1000) / 10 // 1 decimal
  return `Este padrón trae ${totalNuevo} registros vs ${totalReferencia} del último aprobado (${pct}%) — posible exportación parcial del SIAL. Confirmá el override para aprobar igual.`
}

// Evalúa el ratio de tamaño del padrón nuevo contra el último aprobado y arma la
// advertencia si corresponde. `ratio`/`advertencia` son null cuando la guarda no
// aplica (sin aprobado previo) o el ratio es normal. `excluirId` se usa al
// re-chequear en la aprobación para no compararse contra sí mismo.
async function evaluarRatioContraUltimoAprobado(
  totalNuevo: number,
  excluirId?: string,
): Promise<{ ratio: number | null; advertencia: string | null; anomalo: boolean }> {
  const totalRef = await totalUltimoSnapshotAprobado(excluirId)
  const { ratio, anomalo } = evaluarRatioTamano(totalNuevo, totalRef, env.PADRON_RATIO_MINIMO)
  const advertencia =
    anomalo && ratio != null && totalRef != null
      ? mensajeAdvertenciaRatio(totalNuevo, totalRef, ratio)
      : null
  return { ratio, advertencia, anomalo }
}

// ─── S2-19: diff calculado por Node contra Postgres ─────────────────────────
// Columnas del resultado de Dotaneitor que se comparan campo a campo.
// Clave: nombre en el DataFrame Python (snake_case del COL_MAP). Valor: campo
// en Cargo u Ocupacion para saber dónde vive ese dato en el modelo relacional.
// S22-9: el pipeline v2 ya NO produce agrupador / unificador_de_puestos /
// estado (se eliminaron). Se sacan de la comparación para no marcar
// modificaciones falsas (vendrían vacíos y marcarían "se vació" en masa).
const COLS_WATCH: Record<string, 'cargo' | 'ocupacion'> = {
  literal_puesto: 'cargo',
  especialidad: 'cargo',
  codigo_repa: 'cargo',
  descripcion_repa: 'cargo',
  codigo_de_registro: 'cargo',
  agrupamiento: 'cargo',
  situacion_de_revista: 'ocupacion',
  codigo_jefaturas: 'ocupacion',
  jefe_escalafon: 'ocupacion',
  comision: 'ocupacion',
  repa_comision: 'ocupacion',
  cod_situacion: 'ocupacion',
  cargo_desde: 'ocupacion',
  cargo_hasta: 'ocupacion',
}

type RegistroPython = Record<string, unknown>

// strVal se importa de padron.diff.helpers.js (única fuente del helper puro).

// S22-9: comparación normalizada para el diff. El pipeline v2 normaliza todo a
// minúscula/sin tilde, pero los datos ya cargados en la BD (de padrones viejos)
// están en MAYÚSCULA/con tilde. Sin esto, el primer padrón tras el cambio marca
// ~todas las filas como "modificadas" por diferencias que son solo de formato.
// Se compara minúscula + sin tilde + trim para contar solo cambios reales.
function normCmp(v: unknown): string {
  return strVal(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

// Única fuente de verdad columna Python -> campo Prisma de Cargo, usada por
// calcularDiff y por el paso 6 de aprobarSnapshotService. codigo_de_registro
// NO entra acá: se resuelve con una rama dedicada que lee codigoRegistro.codigo.
const CAMPOS_CARGO: Record<string, string> = {
  literal_puesto: 'literalPuesto',
  especialidad: 'especialidadLegacy',
  agrupador: 'agrupador',
  unificador_de_puestos: 'unificadorPuesto',
  codigo_repa: 'codigoRepa',
  descripcion_repa: 'descripcionRepa',
  agrupamiento: 'agrupamiento',
}
// Única fuente de verdad columna Python -> campo Prisma de Ocupacion.
const CAMPOS_OCUPACION: Record<string, string> = {
  situacion_de_revista: 'situacionRevista',
  estado: 'estadoPersona',
  codigo_jefaturas: 'codigoJefaturas',
  jefe_escalafon: 'jefeEscalafon',
  comision: 'comision',
  repa_comision: 'repaComision',
  cod_situacion: 'codSituacion',
  cargo_desde: 'cargoDesdeFecha',
  cargo_hasta: 'cargoHastaFecha',
}

async function calcularDiff(registros: RegistroPython[]) {
  // Partición del padrón: carreras normales por id_sial (nuevosMap) y carreras
  // desdobladas 24/07 por id_sial_rol (nuevosDesdobladosMap). Ver §3.1 del
  // diseño: una fila 24/07 NUNCA entra a nuevosMap (no puede regenerar un
  // cargo compartido por el camino id_sial).
  const { nuevosMap, nuevosDesdobladosMap } = particionarRegistros(registros)

  // Estado actual en Postgres: Cargo + su ocupación más relevante. Se trae la
  // VIGENTE (hasta IS NULL) si existe; si no, la última CERRADA (hasta más
  // reciente). Esto permite detectar el caso "cargo presente en el padrón pero
  // su ocupación quedó cerrada" para reabrirla (ver uso de `ocupCerrada` abajo).
  // El orderBy pone las vigentes primero (hasta NULL) y, entre cerradas, la más
  // reciente; take:1 deja exactamente la ocupación relevante.
  const cargosActuales = await prisma.cargo.findMany({
    // Solo cargos que provienen del SIAL (tienen id_sial). Los cargos de
    // conducción vacantes derivados del organigrama (S24, origen='organigrama')
    // NO tienen id_sial: nadie los ocupa, nunca estuvieron en el padrón. Si se
    // incluyeran acá, el diff los marcaría como "eliminados" con idSialRol null
    // y el createMany de padron_diff (id_sial_rol NOT NULL) fallaría con
    // "Argument `idSialRol` is missing". Se excluyen por id_sial IS NOT NULL.
    where: {
      estado: { in: ['vigente', 'validacion_vacante', 'no_vigente'] },
      idSial: { not: null },
      // Excluir SOLO los cargos 24/07 del circuito por id_sial (se procesan por
      // id_sial_rol más abajo). Se usa NOT { relación: { in } } en vez de
      // { relación: { notIn } } a propósito: el filtro positivo sobre una
      // relación-a-uno OPCIONAL (codigoRegistroId nullable) excluiría las filas
      // con codigo_registro_id NULL (regresión silenciosa); NOT preserva esos
      // NULL. Ver §3.4 del diseño (hallazgo 3).
      NOT: { codigoRegistro: { codigo: { in: ['24', '07'] } } },
    },
    select: {
      idSial: true,
      estado: true, // requerido por el loop de Eliminados y el skip de Nuevos/Modificados
      literalPuesto: true,
      especialidadLegacy: true,
      agrupador: true,
      unificadorPuesto: true,
      codigoRepa: true,
      descripcionRepa: true,
      agrupamiento: true,
      codigoRegistro: { select: { codigo: true } },
      hospital: { select: { sigla: true } },
      escalafon: { select: { nombre: true } },
      ocupaciones: {
        orderBy: [{ hasta: { sort: 'asc', nulls: 'first' } }],
        select: {
          idSialRol: true,
          hasta: true,
          situacionRevista: true,
          estadoPersona: true,
          cuil: true,
          codigoJefaturas: true,
          jefeEscalafon: true,
          comision: true,
          repaComision: true,
          codSituacion: true,
          cargoDesdeFecha: true, // fix bug fechas: el diff nunca las leía
          cargoHastaFecha: true,
          persona: { select: { activo: true } }, // criterio de baja nueva (DECISIÓN 2)
        },
        take: 1,
      },
    },
  })

  const actualesMap = new Map<string, (typeof cargosActuales)[number]>()
  for (const c of cargosActuales) actualesMap.set(c.idSial, c)

  const nuevosIds = new Set(nuevosMap.keys())
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
    // (si el id existe en actualesMap ya se saltó arriba; un id ausente de
    // actualesMap es un nuevo normal, no hay cargo no-vigente que filtrar)
    const r = nuevosMap.get(idSial)!
    const cuilYRol = strVal(r['CUIL Y ROL'] ?? r['cuil_y_rol'])
    const idSialRol = cuilYRol ? `${idSial}-${cuilYRol}` : idSial
    diffs.push({
      tipo: 'nuevo',
      idSialRol,
      campo: null,
      valorAnterior: null,
      valorNuevo: JSON.stringify({
        id_sial: idSial,
        cuil_y_rol: cuilYRol,
        ayn: strVal(r['AYN'] ?? r['ayn']),
        // Reportado (2026-08-25): Documento/Especialidad vacíos en /personas —
        // numero_doc/tipo_doc nunca se capturaban acá pese a existir en el
        // Dotaneitor real (Dotaneitor.py rename_dict: NUM_DOC -> "NUMERO DOC",
        // TIP_DOC -> "TIPO DOC"). Se agregan para que aprobarSnapshotService
        // pueda escribirlos en Persona al crear.
        numero_doc: strVal(r['NUMERO DOC'] ?? r['numero_doc']),
        tipo_doc: strVal(r['TIPO DOC'] ?? r['tipo_doc']),
        // Mismo hallazgo, ronda 2 (2026-08-25): sexo/fecha de nacimiento/
        // antigüedad tampoco se capturaban. SEXO no se renombra en
        // Dotaneitor.py; FEC_NACIM -> "FECHA NACIMIENTO"; SALUD_1ER_CARGO ->
        // "ANTIGÜEDAD" (rename_dict). Vienen como "DD/MM/YYYY" (string) del
        // Excel real — se parsean en aprobarSnapshotService, no acá (acá
        // todo el JSON es string/string, sin tipos).
        sexo: strVal(r['SEXO'] ?? r['sexo']),
        fecha_nacimiento: strVal(r['FECHA NACIMIENTO'] ?? r['fecha_nacimiento']),
        antiguedad: strVal(r['ANTIGÜEDAD'] ?? r['antiguedad']),
        siglas: strVal(r['SIGLAS'] ?? r['siglas']),
        escalafon: strVal(r['ESCALAFON'] ?? r['escalafon']),
        literal_puesto: strVal(r['LITERAL PUESTO'] ?? r['literal_puesto']),
        especialidad: strVal(r['ESPECIALIDAD'] ?? r['especialidad']),
        tipo_hospital_sigla: strVal(r['TIPO DE HOSPITAL / SIGLA'] ?? r['tipo_hospital_sigla']),
        situacion_de_revista: strVal(r['SITUACION DE REVISTA'] ?? r['situacion_de_revista']),
        estado: strVal(r['ESTADO'] ?? r['estado']),
        agrupador: strVal(r['AGRUPADOR'] ?? r['agrupador']),
        unificador_de_puestos: strVal(r['UNIFICADOR DE PUESTOS'] ?? r['unificador_de_puestos']),
        regimen: strVal(r['REGIMEN'] ?? r['regimen']),
        // Campos de Cargo faltantes (2026-08-25)
        codigo_repa: strVal(r['CODIGO REPA'] ?? r['codigo_repa']),
        descripcion_repa: strVal(r['DESCRIPCION REPA'] ?? r['descripcion_repa']),
        codigo_de_registro: strVal(r['CODIGO DE REGISTRO'] ?? r['codigo_de_registro']),
        literal_cr: strVal(r['LITERAL CR'] ?? r['literal_cr']),
        agrupamiento: strVal(r['AGRUPAMIENTO'] ?? r['agrupamiento']),
        // Campos de Ocupacion faltantes (2026-08-25)
        codigo_jefaturas: strVal(r['CODIGO JEFATURAS'] ?? r['codigo_jefaturas']),
        // S22-12 Opción B: FK de jefatura resuelta por el pipeline. Se agrega al
        // allowlist de valorNuevo para que aprobarSnapshotService/aprobarTodosService/
        // transferencia puedan leerla vía datos.cargo_jefatura_puesto_id (sin esto
        // la FK nunca llega a la persistencia aunque viaje en rows). El pipeline la
        // emite solo en snake_case, igual que los otros ids resueltos.
        cargo_jefatura_puesto_id: strVal(r['cargo_jefatura_puesto_id']),
        // Bug A: especialidad_puesto_id resuelto por el Dotaneitor (pipeline 9.7c).
        // Se agrega al allowlist para que aprobarSnapshotService/aprobarDiffNuevoService/
        // transferencia lo consuman vía datos.especialidad_puesto_id en vez de
        // re-resolver la FK desde texto (doble resolución divergente). El pipeline
        // lo emite solo en snake_case, igual que cargo_jefatura_puesto_id.
        especialidad_puesto_id: strVal(r['especialidad_puesto_id']),
        jefe_escalafon: strVal(r['JEFE ESCALAFON'] ?? r['jefe_escalafon']),
        documentacion_jefatura: strVal(r['DOCUMENTACION JEFATURA'] ?? r['documentacion_jefatura']),
        comentarios_jefaturas: strVal(r['COMENTARIOS JEFATURAS'] ?? r['comentarios_jefaturas']),
        documentacion_pou: strVal(r['DOCUEMNTACION POU'] ?? r['documentacion_pou']),
        comision: strVal(r['COMISION'] ?? r['comision']),
        repa_comision: strVal(r['REPA COMISION'] ?? r['repa_comision']),
        cod_situacion: strVal(r['COD SITUACION'] ?? r['cod_situacion']),
        fecha_bloqueo: strVal(r['FECHA BLOQUEO'] ?? r['fecha_bloqueo']),
        bloqueo_comentario: strVal(r['BLOQUEO COMENTARIO'] ?? r['bloqueo_comentario']),
        bloq_motivo: strVal(r['BLOQ MOTIVO'] ?? r['bloq_motivo']),
        documentacion_del_rol: strVal(r['DOCUMENTACION DEL ROL'] ?? r['documentacion_del_rol']),
        documentacion_baja: strVal(r['DOCUMENTACION BAJA'] ?? r['documentacion_baja']),
        cargo_desde: strVal(r['CARGO_DESDE'] ?? r['cargo_desde']),
        cargo_hasta: strVal(r['CARGO_HASTA'] ?? r['cargo_hasta']),
        // Campos de Persona faltantes (2026-08-25)
        telefono: strVal(r['TELEFONO'] ?? r['telefono']),
        mail_personal: strVal(r['MAIL_PERSONAL'] ?? r['mail_personal']),
        mail_laboral: strVal(r['MAIL_LABORAL'] ?? r['mail_laboral']),
        domicilio: strVal(r['DOMICILIO'] ?? r['domicilio']),
        localidad: strVal(r['LOCALIDAD'] ?? r['localidad']),
        provincia: strVal(r['PROVINCIA'] ?? r['provincia']),
      }),
    })
  }

  // Eliminados
  for (const idSial of actualesIds) {
    if (nuevosIds.has(idSial)) continue
    const actual = actualesMap.get(idSial)!
    const ocup = actual.ocupaciones[0]
    const idSialRol = ocup?.idSialRol ?? idSial
    // Baja NUEVA de la semana (campo=null) vs ya estaba en baja (campo='baja_previa').
    // Criterio: cargo vigente + ocupación vigente + persona.activo===true (DECISIÓN 2).
    const campoBaja = categoriaBaja(actual.estado, ocup)
    diffs.push({
      tipo: 'eliminado',
      idSialRol,
      campo: campoBaja,
      valorAnterior: JSON.stringify({
        id_sial: idSial,
        cuil_y_rol: ocup?.cuil ?? null,
        literal_puesto: actual.literalPuesto,
        especialidad: actual.especialidadLegacy,
        agrupador: actual.agrupador,
        situacion_de_revista: ocup?.situacionRevista ?? null,
        estado: ocup?.estadoPersona ?? null,
        siglas: actual.hospital?.sigla ?? null,
        escalafon: actual.escalafon?.nombre ?? null,
      }),
      valorNuevo: null,
    })
  }

  // Modificados — usa las constantes de módulo CAMPOS_CARGO/CAMPOS_OCUPACION
  // (única fuente, compartida con aprobarSnapshotService). codigo_de_registro
  // no entra a CAMPOS_CARGO: se resuelve con la rama dedicada de abajo.
  for (const idSial of nuevosIds) {
    if (!actualesIds.has(idSial)) continue
    const r = nuevosMap.get(idSial)!
    const actual = actualesMap.get(idSial)!
    // No comparar/crear cambios sobre cargos ya dados de baja.
    if (actual.estado !== 'vigente') continue
    const ocup = actual.ocupaciones[0]
    // Solo se comparan campos de ocupación contra una ocupación VIGENTE
    // (hasta IS NULL). Si la única ocupación está cerrada, el marcador
    // __reabrir_ocupacion__ cubre la reapertura; comparar sus campos stale
    // solo genera ruido (Decisión 5).
    const ocupVigente = ocup && ocup.hasta == null ? ocup : null
    const cuilYRol = strVal(r['CUIL Y ROL'] ?? r['cuil_y_rol'])
    const idSialRol = ocup?.idSialRol ?? (cuilYRol ? `${idSial}-${cuilYRol}` : idSial)

    // Reapertura: el cargo está en el padrón nuevo pero su ocupación quedó
    // CERRADA (hasta != null) y no hay vigente. Es el bug que inactivaba
    // personas cuyo rol seguía apareciendo (ver aprobarSnapshotService). Se
    // emite un diff 'modificado' con el campo marcador `__reabrir_ocupacion__`
    // que el aprobar interpreta para reabrir la ocupación y reactivar la
    // persona. Se usa 'modificado' (no un tipo nuevo) para no migrar el enum
    // TipoDiff ni tocar la UI del diff.
    if (ocup && ocup.hasta != null) {
      diffs.push({
        tipo: 'modificado',
        idSialRol,
        campo: '__reabrir_ocupacion__',
        valorAnterior: ocup.hasta.toISOString().slice(0, 10),
        valorNuevo: null,
      })
    }

    // Bug A: marca si en esta fila se emitió algún cambio que RE-RESUELVE la FK
    // de especialidad en el aprobar (especialidad / literal_puesto / cod. registro,
    // en cualquiera de sus variantes 'completado:'). Solo entonces se emite el
    // marcador __especialidad_puesto_id__ (para no generar ruido en filas sin
    // cambios de especialidad). Patrón análogo a __reabrir_ocupacion__.
    let reresuelveFkEspecialidad = false
    const CAMPOS_RERESUELVEN_FK = new Set(['especialidad', 'literal_puesto', 'codigo_de_registro'])

    for (const [colPython, tabla] of Object.entries(COLS_WATCH)) {
      // No comparar campos de ocupación si no hay ocupación vigente.
      if (tabla === 'ocupacion' && !ocupVigente) continue

      const colUpper =
        colPython === 'codigo_de_registro'
          ? 'CODIGO DE REGISTRO'
          : colPython.toUpperCase().replace(/_/g, ' ')
      const vNueStr = strVal(r[colUpper] ?? r[colPython])

      const esFecha = colPython === 'cargo_desde' || colPython === 'cargo_hasta'
      if (esFecha) {
        // Fechas: comparar en ISO (partes UTC), almacenar strings (DECISIÓN 4).
        const mappedOcup = CAMPOS_OCUPACION[colPython]
        const isoAnterior = toISO(
          ocupVigente ? (ocupVigente as Record<string, unknown>)[mappedOcup] : null,
        )
        const iguales = isoAnterior === toISO(vNueStr)
        if (!iguales) {
          const esCompletado = isoAnterior === '' && vNueStr !== ''
          diffs.push({
            tipo: 'modificado',
            idSialRol,
            campo: esCompletado ? `completado:${colPython}` : colPython,
            valorAnterior: isoAnterior || null, // string ISO, NUNCA el Date crudo
            valorNuevo: vNueStr || null,
          })
        }
        continue
      }

      // No-fecha: comparación normalizada (ignora capitalización/tilde).
      let vAnterior = ''
      if (tabla === 'cargo') {
        if (colPython === 'codigo_de_registro') {
          vAnterior = strVal(actual.codigoRegistro?.codigo)
        } else {
          const mappedCargo = CAMPOS_CARGO[colPython]
          vAnterior = strVal(mappedCargo ? (actual as Record<string, unknown>)[mappedCargo] : null)
        }
      } else {
        const mappedOcup = CAMPOS_OCUPACION[colPython]
        vAnterior = strVal(
          mappedOcup && ocupVigente ? (ocupVigente as Record<string, unknown>)[mappedOcup] : null,
        )
      }
      if (normCmp(vNueStr) !== normCmp(vAnterior)) {
        // empty → value es un alta de dato (completado), no una modificación.
        const esCompletado = strVal(vAnterior) === '' && vNueStr !== ''
        diffs.push({
          tipo: 'modificado',
          idSialRol,
          campo: esCompletado ? `completado:${colPython}` : colPython,
          valorAnterior: vAnterior || null,
          valorNuevo: vNueStr || null,
        })
        // Bug A: este cambio dispara re-resolución de la FK en el aprobar.
        if (CAMPOS_RERESUELVEN_FK.has(colPython)) reresuelveFkEspecialidad = true
      }
    }

    // Bug A: marcador que transporta el especialidad_puesto_id ya resuelto por
    // el Dotaneitor hasta el paso 6 del aprobar (los diffs 'modificado' son
    // por-campo y no llevan el registro completo). Solo se emite si hubo un
    // cambio que re-resuelve la FK y el pipeline trajo un id no vacío. El
    // aprobar lo lee aparte (no entra a CAMPOS_CARGO/CAMPOS_OCUPACION) y, si no
    // valida, cae al fallback por texto — comportamiento actual intacto.
    const espPuestoIdDota = strVal(r['especialidad_puesto_id'])
    if (reresuelveFkEspecialidad && espPuestoIdDota) {
      diffs.push({
        tipo: 'modificado',
        idSialRol,
        campo: '__especialidad_puesto_id__',
        valorAnterior: null,
        valorNuevo: espPuestoIdDota || null,
      })
    }
  }

  // ── DESDOBLADO 24/07: matcheo por id_sial_rol (§3.2–§3.4 del diseño) ──────
  // Toda la rama 24/07 empuja al MISMO array `diffs`. El resto de las carreras
  // ya se procesó arriba por id_sial.
  const idSialRolesNuevos24y07 = [...nuevosDesdobladosMap.keys()]

  // Guard de tabla (§6): si llegan filas 24/07, la tabla desdoblado_mapeo_cargos
  // (fuente de verdad del split) DEBE existir. Si no, el padrón 24/07 no se
  // puede procesar con el split aplicado — error claro (el pipeline marca el
  // snapshot en error) en vez de un críptico "relation does not exist".
  if (idSialRolesNuevos24y07.length > 0) {
    const [{ existe }] = await prisma.$queryRaw<{ existe: boolean }[]>(
      Prisma.sql`SELECT to_regclass('public.desdoblado_mapeo_cargos') IS NOT NULL AS existe`,
    )
    if (!existe)
      throw new Error(
        'Falta la tabla desdoblado_mapeo_cargos; correr la curación de desdoblado antes de procesar padrones 24/07',
      )
  }

  // Estado actual 24/07 keyed por id_sial_rol — fuente PRIMARIA: la ocupación
  // (la identidad viva del rol) y su cargo 1:1. La ocupación viva gana sobre el
  // mapeo.
  const ocupacionesDesdobladas = idSialRolesNuevos24y07.length
    ? await prisma.ocupacion.findMany({
        where: { idSialRol: { in: idSialRolesNuevos24y07 } },
        select: {
          idSialRol: true,
          hasta: true,
          situacionRevista: true,
          estadoPersona: true,
          cuil: true,
          codigoJefaturas: true,
          jefeEscalafon: true,
          comision: true,
          repaComision: true,
          codSituacion: true,
          cargoDesdeFecha: true,
          cargoHastaFecha: true,
          persona: { select: { activo: true } },
          cargo: {
            select: {
              id: true,
              idSial: true,
              codigo: true,
              estado: true,
              literalPuesto: true,
              especialidadLegacy: true,
              agrupador: true,
              unificadorPuesto: true,
              codigoRepa: true,
              descripcionRepa: true,
              agrupamiento: true,
              codigoRegistro: { select: { codigo: true } },
              hospital: { select: { sigla: true } },
              escalafon: { select: { nombre: true } },
            },
          },
        },
      })
    : []
  type OcupDesdoblada = (typeof ocupacionesDesdobladas)[number]
  const actualesDesdMap = new Map<string, OcupDesdoblada>(
    ocupacionesDesdobladas.map((o) => [o.idSialRol, o]),
  )

  // Respaldo: para los id_sial_rol que NO tienen ocupación viva, buscar el
  // mapeo persistente y traer el cargo 1:1 por su código con la ocupación más
  // relevante (misma heurística que cargosActuales: vigente primero, luego la
  // cerrada más reciente).
  const faltantesDesd = idSialRolesNuevos24y07.filter((r) => !actualesDesdMap.has(r))
  if (faltantesDesd.length > 0) {
    const mapeados = await prisma.$queryRaw<{ id_sial_rol: string; codigo_cargo: string }[]>(
      Prisma.sql`
        SELECT id_sial_rol, codigo_cargo FROM desdoblado_mapeo_cargos
        WHERE id_sial_rol IN (${Prisma.join(faltantesDesd)})
      `,
    )
    for (const m of mapeados) {
      const cargoMapeado = await prisma.cargo.findUnique({
        where: { codigo: m.codigo_cargo },
        select: {
          id: true,
          idSial: true,
          codigo: true,
          estado: true,
          literalPuesto: true,
          especialidadLegacy: true,
          agrupador: true,
          unificadorPuesto: true,
          codigoRepa: true,
          descripcionRepa: true,
          agrupamiento: true,
          codigoRegistro: { select: { codigo: true } },
          hospital: { select: { sigla: true } },
          escalafon: { select: { nombre: true } },
          ocupaciones: {
            where: { idSialRol: m.id_sial_rol },
            orderBy: [{ hasta: { sort: 'asc', nulls: 'first' } }],
            select: {
              idSialRol: true,
              hasta: true,
              situacionRevista: true,
              estadoPersona: true,
              cuil: true,
              codigoJefaturas: true,
              jefeEscalafon: true,
              comision: true,
              repaComision: true,
              codSituacion: true,
              cargoDesdeFecha: true,
              cargoHastaFecha: true,
              persona: { select: { activo: true } },
            },
            take: 1,
          },
        },
      })
      if (!cargoMapeado) continue
      // Fix 3 — rechazo defensivo de titular: si el cargo mapeado ya tiene una
      // ocupación VIVA de OTRO id_sial_rol, es un cargo compartido preexistente
      // (dato sucio). Entre un dato vacío y uno que no corresponde, el usuario
      // prefiere vacío: NO se reusa el cargo compartido → el rol se degrada a
      // alta 1:1 (no se setea actualesDesdMap, así el loop lo trata como alta).
      // Usa prisma (no tx), consistente con el resto del respaldo (fase de diff).
      const ocupAjena = await prisma.ocupacion.findFirst({
        where: {
          cargoId: cargoMapeado.id,
          hasta: null,
          idSialRol: { not: m.id_sial_rol },
        },
        select: { idSialRol: true },
      })
      if (ocupAjena) {
        console.warn(
          `[padron][desdoblado] cargo ${cargoMapeado.codigo} ya ocupado por ${ocupAjena.idSialRol}; ` +
            `${m.id_sial_rol} va a alta 1:1 (no se reusa el cargo compartido)`,
        )
        continue
      }
      const ocup = cargoMapeado.ocupaciones[0]
      // Adaptar al mismo shape de OcupDesdoblada (ocupación + cargo embebido).
      const { ocupaciones: _oc, ...cargoSinOcup } = cargoMapeado
      actualesDesdMap.set(m.id_sial_rol, {
        idSialRol: m.id_sial_rol,
        hasta: ocup?.hasta ?? null,
        situacionRevista: ocup?.situacionRevista ?? null,
        estadoPersona: ocup?.estadoPersona ?? null,
        cuil: ocup?.cuil ?? null,
        codigoJefaturas: ocup?.codigoJefaturas ?? null,
        jefeEscalafon: ocup?.jefeEscalafon ?? null,
        comision: ocup?.comision ?? null,
        repaComision: ocup?.repaComision ?? null,
        codSituacion: ocup?.codSituacion ?? null,
        cargoDesdeFecha: ocup?.cargoDesdeFecha ?? null,
        cargoHastaFecha: ocup?.cargoHastaFecha ?? null,
        persona: ocup?.persona ?? null,
        cargo: cargoSinOcup,
      } as OcupDesdoblada)
    }
  }

  // Altas / modificados 24/07 (§3.3). Loop sobre nuevosDesdobladosMap (clave
  // id_sial_rol), paralelo a los de id_sial.
  for (const [idSialRol, r] of nuevosDesdobladosMap) {
    const actual = actualesDesdMap.get(idSialRol)
    if (tipoDiffDesdoblado(actual != null) === 'alta') {
      // ── ALTA 1:1 (rol 24/07 nunca visto) ──
      // Marcador __alta_desdoblada__ en `campo` (análogo a __reabrir_ocupacion__);
      // no migra el enum TipoDiff. La allowlist del valorNuevo es la MISMA del
      // alta normal (incluye id_sial del titular como dato informativo para la
      // UI; la creación del cargo 1:1 NO lo usa como clave — ver §4.1/§4.5).
      diffs.push({
        tipo: 'nuevo',
        idSialRol,
        campo: '__alta_desdoblada__',
        valorAnterior: null,
        valorNuevo: JSON.stringify({
          id_sial: strVal(r['ID SIAL'] ?? r['id_sial']),
          cuil_y_rol: strVal(r['CUIL Y ROL'] ?? r['cuil_y_rol']),
          ayn: strVal(r['AYN'] ?? r['ayn']),
          numero_doc: strVal(r['NUMERO DOC'] ?? r['numero_doc']),
          tipo_doc: strVal(r['TIPO DOC'] ?? r['tipo_doc']),
          sexo: strVal(r['SEXO'] ?? r['sexo']),
          fecha_nacimiento: strVal(r['FECHA NACIMIENTO'] ?? r['fecha_nacimiento']),
          antiguedad: strVal(r['ANTIGÜEDAD'] ?? r['antiguedad']),
          siglas: strVal(r['SIGLAS'] ?? r['siglas']),
          escalafon: strVal(r['ESCALAFON'] ?? r['escalafon']),
          literal_puesto: strVal(r['LITERAL PUESTO'] ?? r['literal_puesto']),
          especialidad: strVal(r['ESPECIALIDAD'] ?? r['especialidad']),
          tipo_hospital_sigla: strVal(r['TIPO DE HOSPITAL / SIGLA'] ?? r['tipo_hospital_sigla']),
          situacion_de_revista: strVal(r['SITUACION DE REVISTA'] ?? r['situacion_de_revista']),
          estado: strVal(r['ESTADO'] ?? r['estado']),
          agrupador: strVal(r['AGRUPADOR'] ?? r['agrupador']),
          unificador_de_puestos: strVal(r['UNIFICADOR DE PUESTOS'] ?? r['unificador_de_puestos']),
          regimen: strVal(r['REGIMEN'] ?? r['regimen']),
          codigo_repa: strVal(r['CODIGO REPA'] ?? r['codigo_repa']),
          descripcion_repa: strVal(r['DESCRIPCION REPA'] ?? r['descripcion_repa']),
          codigo_de_registro: strVal(r['CODIGO DE REGISTRO'] ?? r['codigo_de_registro']),
          literal_cr: strVal(r['LITERAL CR'] ?? r['literal_cr']),
          agrupamiento: strVal(r['AGRUPAMIENTO'] ?? r['agrupamiento']),
          codigo_jefaturas: strVal(r['CODIGO JEFATURAS'] ?? r['codigo_jefaturas']),
          cargo_jefatura_puesto_id: strVal(r['cargo_jefatura_puesto_id']),
          jefe_escalafon: strVal(r['JEFE ESCALAFON'] ?? r['jefe_escalafon']),
          documentacion_jefatura: strVal(
            r['DOCUMENTACION JEFATURA'] ?? r['documentacion_jefatura'],
          ),
          comentarios_jefaturas: strVal(r['COMENTARIOS JEFATURAS'] ?? r['comentarios_jefaturas']),
          documentacion_pou: strVal(r['DOCUEMNTACION POU'] ?? r['documentacion_pou']),
          comision: strVal(r['COMISION'] ?? r['comision']),
          repa_comision: strVal(r['REPA COMISION'] ?? r['repa_comision']),
          cod_situacion: strVal(r['COD SITUACION'] ?? r['cod_situacion']),
          fecha_bloqueo: strVal(r['FECHA BLOQUEO'] ?? r['fecha_bloqueo']),
          bloqueo_comentario: strVal(r['BLOQUEO COMENTARIO'] ?? r['bloqueo_comentario']),
          bloq_motivo: strVal(r['BLOQ MOTIVO'] ?? r['bloq_motivo']),
          documentacion_del_rol: strVal(r['DOCUMENTACION DEL ROL'] ?? r['documentacion_del_rol']),
          documentacion_baja: strVal(r['DOCUMENTACION BAJA'] ?? r['documentacion_baja']),
          cargo_desde: strVal(r['CARGO_DESDE'] ?? r['cargo_desde']),
          cargo_hasta: strVal(r['CARGO_HASTA'] ?? r['cargo_hasta']),
          telefono: strVal(r['TELEFONO'] ?? r['telefono']),
          mail_personal: strVal(r['MAIL_PERSONAL'] ?? r['mail_personal']),
          mail_laboral: strVal(r['MAIL_LABORAL'] ?? r['mail_laboral']),
          domicilio: strVal(r['DOMICILIO'] ?? r['domicilio']),
          localidad: strVal(r['LOCALIDAD'] ?? r['localidad']),
          provincia: strVal(r['PROVINCIA'] ?? r['provincia']),
        }),
      })
      continue
    }

    // ── MODIFICADO contra el cargo 1:1 correcto (actual.cargo / actual) ──
    if (!actual) continue // inalcanzable (tipoDiffDesdoblado ya lo cubrió); narrowing TS
    // Solo se compara contra el cargo VIGENTE con ocupación vigente; una
    // ocupación cerrada se reabre con __reabrir_ocupacion__ (igual criterio que
    // el loop por id_sial). Se duplica la lógica mínima de comparación acá
    // (decisión del implementador, documentada en el commit): reusar el loop de
    // id_sial habría requerido refactor de alto riesgo sin ganancia clara, dado
    // que la fuente del "actual" es distinta (cargo embebido en la ocupación).
    const ocupVigente = actual.hasta == null ? actual : null
    if (actual.hasta != null) {
      diffs.push({
        tipo: 'modificado',
        idSialRol,
        campo: '__reabrir_ocupacion__',
        valorAnterior: actual.hasta.toISOString().slice(0, 10),
        valorNuevo: null,
      })
    }
    if (actual.cargo.estado === 'vigente') {
      for (const [colPython, tabla] of Object.entries(COLS_WATCH)) {
        if (tabla === 'ocupacion' && !ocupVigente) continue
        const colUpper =
          colPython === 'codigo_de_registro'
            ? 'CODIGO DE REGISTRO'
            : colPython.toUpperCase().replace(/_/g, ' ')
        const vNueStr = strVal(r[colUpper] ?? r[colPython])
        const esFecha = colPython === 'cargo_desde' || colPython === 'cargo_hasta'
        if (esFecha) {
          const mappedOcup = CAMPOS_OCUPACION[colPython]
          const isoAnterior = toISO(
            ocupVigente ? (ocupVigente as Record<string, unknown>)[mappedOcup] : null,
          )
          if (isoAnterior !== toISO(vNueStr)) {
            const esCompl = isoAnterior === '' && vNueStr !== ''
            diffs.push({
              tipo: 'modificado',
              idSialRol,
              campo: esCompl ? `completado:${colPython}` : colPython,
              valorAnterior: isoAnterior || null,
              valorNuevo: vNueStr || null,
            })
          }
          continue
        }
        let vAnterior = ''
        if (tabla === 'cargo') {
          if (colPython === 'codigo_de_registro') {
            vAnterior = strVal(actual.cargo.codigoRegistro?.codigo)
          } else {
            const mappedCargo = CAMPOS_CARGO[colPython]
            vAnterior = strVal(
              mappedCargo ? (actual.cargo as Record<string, unknown>)[mappedCargo] : null,
            )
          }
        } else {
          const mappedOcup = CAMPOS_OCUPACION[colPython]
          vAnterior = strVal(
            mappedOcup && ocupVigente ? (ocupVigente as Record<string, unknown>)[mappedOcup] : null,
          )
        }
        if (normCmp(vNueStr) !== normCmp(vAnterior)) {
          const esCompl = strVal(vAnterior) === '' && vNueStr !== ''
          diffs.push({
            tipo: 'modificado',
            idSialRol,
            campo: esCompl ? `completado:${colPython}` : colPython,
            valorAnterior: vAnterior || null,
            valorNuevo: vNueStr || null,
          })
        }
      }
    }
  }

  // Bajas 24/07 (§3.4): un rol 24/07 vivo ausente del padrón nuevo es baja. Se
  // detecta por ausencia de su id_sial_rol en nuevosDesdobladosMap, NO por el
  // circuito id_sial (los clones tienen id_sial NULL).
  const vivos24y07 = await prisma.ocupacion.findMany({
    where: {
      hasta: null,
      cargo: {
        codigoRegistro: { codigo: { in: ['24', '07'] } },
        estado: { in: ['vigente', 'validacion_vacante'] },
      },
    },
    select: {
      idSialRol: true,
      situacionRevista: true,
      estadoPersona: true,
      cuil: true,
      hasta: true,
      persona: { select: { activo: true } },
      cargo: {
        select: {
          estado: true,
          idSial: true,
          codigo: true,
          literalPuesto: true,
          especialidadLegacy: true,
          agrupador: true,
          hospital: { select: { sigla: true } },
          escalafon: { select: { nombre: true } },
        },
      },
    },
  })
  const presentesDesd = new Set(nuevosDesdobladosMap.keys())
  for (const o of vivos24y07) {
    if (presentesDesd.has(o.idSialRol)) continue // sigue viniendo → no es baja
    diffs.push({
      tipo: 'eliminado',
      idSialRol: o.idSialRol,
      campo: categoriaBaja(o.cargo.estado, o),
      valorAnterior: JSON.stringify({
        id_sial: o.cargo.idSial, // puede ser NULL (clon desdoblado)
        codigo_cargo: o.cargo.codigo, // el RES-/DOC- del cargo 1:1
        desdoblado: true, // marca para el listado de eliminados (§3.6)
        estado_cargo: o.cargo.estado, // para clasificar sin id_sial
        cuil_y_rol: o.cuil ?? null,
        literal_puesto: o.cargo.literalPuesto,
        especialidad: o.cargo.especialidadLegacy,
        agrupador: o.cargo.agrupador,
        situacion_de_revista: o.situacionRevista ?? null,
        estado: o.estadoPersona ?? null,
        siglas: o.cargo.hospital?.sigla ?? null,
        escalafon: o.cargo.escalafon?.nombre ?? null,
      }),
      valorNuevo: null,
    })
  }

  const totalNuevos = diffs.filter((d) => d.tipo === 'nuevo').length
  const totalEliminados = diffs.filter((d) => d.tipo === 'eliminado').length
  const totalModificados = new Set(
    diffs.filter((d) => d.tipo === 'modificado').map((d) => d.idSialRol),
  ).size
  const totalCampos = diffs.filter((d) => d.tipo === 'modificado').length

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
    data: {
      estado: 'error',
      errorMsg: 'Proceso interrumpido al reiniciar el servidor',
      pasoActual: null,
    },
  })
  if (count > 0)
    console.warn(`[padron] cleanup: ${count} snapshot(s) marcados como error por reinicio`)
}

// ─── S2-18: pipeline en background ───────────────────────────────────────────

// S22-9: pipeline lineal. Una sola llamada a POST /procesar-padron (sin
// /session + /normalizar + /procesar + /cruzar + /preview + polling). El
// Dotaneitor devuelve el dataset completo ya resuelto contra el catálogo
// (escalafon_id/puesto_cargo_id/especialidad_puesto_id, cargo_jefatura, campos
// partidos). Node arma el diff sobre esas filas. Sigue en background: /upload
// responde 202 y la experiencia de revisión/aprobación en /padron no cambia.
async function runPipeline(
  snapshotId: string,
  fileBuffer: Buffer,
  filename: string,
  mimetype: string,
) {
  try {
    await setPaso(snapshotId, 'procesando')
    const form = new FormData()
    form.append('file', fileBuffer, { filename, contentType: mimetype })
    form.append('snapshot_id', snapshotId)

    // Arranque del job: SIN conReintentoRed. El POST lanza un thread en el
    // Dotaneitor; reintentar ante un corte de socket dispararía un SEGUNDO job
    // que reprocesaría 48k filas en paralelo contra el catálogo (duplicados /
    // contención). El arranque es barato (devuelve en segundos).
    const {
      data: { job_id },
    } = await python
      .post<{ job_id: string }>('/procesar-padron', form, { headers: form.getHeaders() })
      .catch((e: unknown) => {
        const m = e instanceof Error ? e.message : String(e)
        throw new Error('No se pudo iniciar el procesamiento: ' + m)
      })

    // Polling corto a /job/{id} hasta done/error o agotar el tope total.
    // GET idempotente → CON conReintentoRed (reintentar no crea trabajo nuevo).
    const result = await (async (): Promise<{ total: number; cols: string[] }> => {
      const deadline = Date.now() + JOB_POLL_TIMEOUT_MS
      while (Date.now() < deadline) {
        let job: {
          status: string
          result: { total: number; cols: string[] } | null
          error: string | null
        }
        try {
          ;({ data: job } = await conReintentoRed(() => python.get<typeof job>(`/job/${job_id}`)))
        } catch (e) {
          if (axios.isAxiosError(e) && e.response?.status === 404)
            throw new Error('El job del Dotaneitor expiró o no existe')
          throw e
        }
        if (job.status === 'done') return job.result!
        if (job.status === 'error') throw new Error('Dotaneitor: ' + firstLine(job.error))
        await sleep(JOB_POLL_INTERVAL_MS)
      }
      throw new Error('El procesamiento del padrón superó el tiempo máximo de espera (15 min)')
    })()

    // Guard de negocio: un job done con total 0 NO es éxito — calcularDiff([])
    // marcaría todos los cargos actuales como eliminados (bajas masivas).
    if (!result.total) throw new Error('El padrón procesado no tiene filas')

    // El total real recién se conoce al terminar (el 202 fue con total 0).
    // Guarda contra padrón parcial: se compara el total nuevo contra el del
    // ÚLTIMO snapshot aprobado (referencia estable, no el último subido que
    // podría ser otro parcial en error). Si el ratio cae bajo el umbral, se
    // persiste la advertencia en el snapshot para que sea visible ANTES de
    // aprobar; el bloqueo blando real se re-chequea en aprobarSnapshotService.
    const evalRatio = await evaluarRatioContraUltimoAprobado(result.total, snapshotId)
    await prisma.padronSnapshot
      .update({
        where: { id: snapshotId },
        data: {
          totalRegistros: result.total,
          ratioTamano: evalRatio.ratio,
          advertenciaTamano: evalRatio.advertencia,
        },
      })
      .catch(() => {})
    if (evalRatio.advertencia) {
      console.warn(`[padron] guarda ratio snapshotId=${snapshotId}: ${evalRatio.advertencia}`)
    }

    // Descarga paginada del parquet (GET idempotente → CON conReintentoRed).
    // Timeout por-request de 60 s, no el default de 30 s: cada página de 5.000
    // filas mueve datos de verdad y necesita más margen.
    const registros: RegistroPython[] = []
    for (let page = 1; (page - 1) * PAGE_DESCARGA < result.total; page++) {
      const { data } = await conReintentoRed(() =>
        python
          .get<{ rows: RegistroPython[] }>(
            `/procesar-padron/${job_id}/resultado?page=${page}&limit=${PAGE_DESCARGA}`,
            { timeout: DESCARGA_TIMEOUT_MS },
          )
          .catch((e: unknown) => {
            const m = e instanceof Error ? e.message : String(e)
            throw new Error('No se pudo recuperar el resultado del padrón: ' + m)
          }),
      )
      registros.push(...(data.rows ?? []))
    }

    // Limpieza-tras-descarga best-effort: borra el job + parquet en el
    // Dotaneitor apenas tenemos todo en memoria. Si falla, el JOB_TTL lo recoge;
    // NUNCA marca el snapshot en error.
    await python
      .delete(`/procesar-padron/${job_id}`)
      .catch((e: unknown) =>
        console.warn(
          `[padron] no se pudo limpiar el job ${job_id}:`,
          e instanceof Error ? e.message : String(e),
        ),
      )

    await setPaso(snapshotId, 'diff')
    const { diffs, totalNuevos, totalEliminados, totalModificados, totalCampos } =
      await calcularDiff(registros)

    await setPaso(snapshotId, 'guardando')
    await prisma.$transaction(async (tx: PrismaTx) => {
      // Troceado (ver comentario de TRANSACTION_OPTS): un padrón nuevo contra
      // un Postgres recién migrado puede generar hasta ~48k diffs "nuevo" en
      // una sola corrida — un único createMany con esa cantidad de filas
      // arriesga pasarse del límite de parámetros de Postgres.
      for (const lote of chunk(diffs, 2000)) {
        await tx.padronDiff.createMany({
          data: lote.map((d) => {
            if (d.tipo !== 'nuevo') return { ...d, snapshotId, aprobado: true }
            // Un alta desdoblada (24/07) se auto-aprueba por CARRERA, no por el
            // texto del escalafón: si el diff llegó a __alta_desdoblada__ es
            // porque esDesdoblado(codReg) dio true (Residencias/Docentes, que no
            // pasan por revisión de este departamento). Así no queda bloqueada
            // por una inconsistencia entre el escalafón y el cod_registro (§3.3).
            const esDesdobladoDiff = d.campo === '__alta_desdoblada__'
            // RES / DOC / AS-* se aprueban automáticamente — no requieren
            // revisión manual de este departamento.
            const datos: Record<string, string> = JSON.parse(d.valorNuevo ?? '{}')
            const autoAprobado = esDesdobladoDiff ? true : esAutoAprobable(datos)
            return { ...d, snapshotId, aprobado: autoAprobado ? true : null }
          }),
        })
      }
      await tx.padronSnapshot.update({
        where: { id: snapshotId },
        data: {
          estado: 'pendiente',
          pasoActual: null,
          archivoResultadoPath: `exports/${snapshotId}/dotacion.xlsx`,
        },
      })
    }, TRANSACTION_OPTS)

    console.info(
      `[padron] pipeline completado snapshotId=${snapshotId} nuevos=${totalNuevos} eliminados=${totalEliminados} modificados=${totalModificados} campos=${totalCampos}`,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await prisma.padronSnapshot
      .update({
        where: { id: snapshotId },
        data: { estado: 'error', errorMsg: msg, pasoActual: null },
      })
      .catch(() => {})
    console.error(`[padron] pipeline error snapshotId=${snapshotId}:`, msg)
  }
  // Sin finally de limpieza de sesión: el pipeline lineal no crea sesión Python
  // (el tmp del run lo borra el propio endpoint /procesar-padron al terminar).
}

// ─── S2-2 + S2-3 + S2-4 + S2-18 + S2-19: upload → dispara pipeline async ────

export async function uploadPadronService(
  file: UploadedFile,
  fechaAsignada: string,
  usuarioId: string,
) {
  await assertNoPendiente()

  const fechaDate = new Date(fechaAsignada)
  const existe = await prisma.padronSnapshot.findUnique({ where: { fechaAsignada: fechaDate } })
  if (existe) throw AppError.conflict(`Ya existe un snapshot para la fecha ${fechaAsignada}`)

  const fileBuffer = file.buffer

  // S22-9 / Opción B: el tramo API↔Python corre como job async en el Dotaneitor
  // (runPipeline arranca el job, pollea /job/{id} y descarga el resultado
  // paginado). Sigue en background: /upload responde 202 y no se puede obtener
  // totalRegistros antes de responder — arranca en 0 y runPipeline lo actualiza
  // al terminar. Ya no se crea sesión Python.
  const snapshot = await prisma.padronSnapshot.create({
    data: {
      fechaAsignada: fechaDate,
      filename: file.filename,
      totalRegistros: 0,
      procesadoPorId: usuarioId,
      estado: 'procesando',
      pasoActual: 'procesando',
    },
  })

  // Disparar pipeline en background — no await
  void runPipeline(snapshot.id, fileBuffer, file.filename, file.mimetype)

  return { snapshotId: snapshot.id, fechaAsignada, totalRegistros: 0 }
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
      ratioTamano: true,
      advertenciaTamano: true,
      aprobadoAt: true,
      createdAt: true,
      procesadoPor: { select: { username: true } },
      aprobadoPor: { select: { username: true } },
    },
  })
}

export async function getSnapshotDiffService(id: string, query: DiffQuery) {
  const snapshot = await getSnapshotOrThrow(id)

  // Para "ya estaban en baja" (campo='baja_previa') con sub-pestaña: pre-calcular
  // los idSialRol de esa clasificación (en_validacion/sin_persona, derivada del
  // estado del cargo) y usarlos como filtro server-side para paginar/contar bien.
  // "Bajas nuevas" (campo IS NULL) no usa clasificacionEliminado.
  let idSialRolesFiltrados: string[] | null = null
  if (query.tipo === 'eliminado' && !query.soloBajasNuevas && query.clasificacionEliminado) {
    const todosElimPre = await prisma.padronDiff.findMany({
      where: { snapshotId: id, tipo: 'eliminado', campo: 'baja_previa' },
      select: { idSialRol: true, valorAnterior: true },
    })
    const idSialsPre = todosElimPre
      .map((d) => {
        try {
          return JSON.parse(d.valorAnterior ?? '{}').id_sial as string
        } catch {
          return null
        }
      })
      .filter((v): v is string => Boolean(v))
    const cargosP = await prisma.cargo.findMany({
      where: { idSial: { in: idSialsPre } },
      select: { idSial: true, estado: true },
    })
    const cargoEstadoMapP = new Map(cargosP.map((c) => [c.idSial, c.estado]))
    idSialRolesFiltrados = todosElimPre
      .filter((d) => {
        const parsed = (() => {
          try {
            return JSON.parse(d.valorAnterior ?? '{}')
          } catch {
            return {}
          }
        })()
        // Desdoblado 24/07: id_sial es NULL en los clones; clasificar por
        // estado_cargo guardado en valorAnterior, no por el lookup por id_sial.
        const estado = parsed.desdoblado
          ? parsed.estado_cargo
          : parsed.id_sial
            ? cargoEstadoMapP.get(parsed.id_sial as string)
            : null
        const clasi = estado === 'validacion_vacante' ? 'en_validacion' : 'sin_persona'
        return clasi === query.clasificacionEliminado
      })
      .map((d) => d.idSialRol)
  }

  // Precedencia de filtros por pestaña (ver diseño "Cambios de API"):
  // - modificado + soloCompletados → campo LIKE 'completado:%'
  // - modificado (resto) → NOT completado:% AND <> __reabrir_ocupacion__ (+ campo sub-tab)
  // - eliminado + soloBajasNuevas → campo IS NULL
  // - eliminado (resto) → campo='baja_previa' (+ clasificacionEliminado)
  // Prisma no admite dos claves `campo` en el mismo objeto: se usa AND:[...].
  let campoWhere: Record<string, unknown> = {}
  if (query.tipo === 'modificado') {
    if (query.soloCompletados) {
      campoWhere = { campo: { startsWith: 'completado:' } }
    } else {
      const and: Record<string, unknown>[] = [
        { campo: { not: { startsWith: 'completado:' } } },
        { campo: { not: '__reabrir_ocupacion__' } },
        { campo: { not: '__especialidad_puesto_id__' } },
      ]
      if (query.campo) and.push({ campo: query.campo })
      campoWhere = { AND: and }
    }
  } else if (query.tipo === 'eliminado') {
    campoWhere = query.soloBajasNuevas ? { campo: null } : { campo: 'baja_previa' }
  } else if (query.campo) {
    campoWhere = { campo: query.campo }
  }

  const where = {
    snapshotId: id,
    ...(query.tipo ? { tipo: query.tipo } : {}),
    ...campoWhere,
    ...(idSialRolesFiltrados ? { idSialRol: { in: idSialRolesFiltrados } } : {}),
    ...(query.q
      ? {
          OR: [
            { idSialRol: { contains: query.q, mode: 'insensitive' as const } },
            { valorNuevo: { contains: query.q, mode: 'insensitive' as const } },
            { valorAnterior: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(query.soloPendientes ? { aprobado: { equals: null } } : {}),
  }

  const [total, diffs] = await Promise.all([
    prisma.padronDiff.count({ where }),
    prisma.padronDiff.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: [{ aprobado: { sort: 'asc', nulls: 'first' } }, { idSialRol: 'asc' }],
    }),
  ])

  // Para diffs modificados: enriquecer con apellidoNombre via join ocupaciones→personas
  let diffsConNombre: ((typeof diffs)[number] & {
    apellidoNombre?: string | null
    clasificacionEliminado?: string | null
  })[] = diffs
  if (query.tipo === 'modificado' && diffs.length > 0) {
    const idSialRoles = [...new Set(diffs.map((d) => d.idSialRol))]
    const ocupaciones = await prisma.ocupacion.findMany({
      where: { idSialRol: { in: idSialRoles } },
      select: { idSialRol: true, persona: { select: { apellidoNombre: true } } },
    })
    const nombreMap = new Map(ocupaciones.map((o) => [o.idSialRol, o.persona.apellidoNombre]))
    diffsConNombre = diffs.map((d) => ({
      ...d,
      apellidoNombre: nombreMap.get(d.idSialRol) ?? null,
    }))
  }

  // Para diffs eliminados: clasificar por estado del cargo y si tiene persona activa
  if (query.tipo === 'eliminado' && diffs.length > 0) {
    const idSials = diffs
      .map((d) => {
        try {
          return JSON.parse(d.valorAnterior ?? '{}').id_sial as string
        } catch {
          return null
        }
      })
      .filter((v): v is string => Boolean(v))
    const idSialRoles = diffs.map((d) => d.idSialRol)

    const [cargos, ocupaciones] = await Promise.all([
      prisma.cargo.findMany({
        where: { idSial: { in: idSials } },
        select: {
          idSial: true,
          estado: true,
          codigo: true,
          hospital: { select: { sigla: true } },
          escalafon: { select: { nombre: true } },
        },
      }),
      prisma.ocupacion.findMany({
        where: { idSialRol: { in: idSialRoles } },
        select: { idSialRol: true, persona: { select: { apellidoNombre: true } } },
      }),
    ])

    const cargoEstadoMap = new Map(cargos.map((c) => [c.idSial, c.estado]))
    const cargoCodigoMap = new Map(cargos.map((c) => [c.idSial, c.codigo ?? null]))
    const cargoSiglaMap = new Map(cargos.map((c) => [c.idSial, c.hospital.sigla ?? null]))
    const cargoEscalfMap = new Map(cargos.map((c) => [c.idSial, c.escalafon.nombre ?? null]))
    const ocupNombreMap = new Map(ocupaciones.map((o) => [o.idSialRol, o.persona.apellidoNombre]))

    diffsConNombre = diffs.map((d) => {
      const parsed = (() => {
        try {
          return JSON.parse(d.valorAnterior ?? '{}')
        } catch {
          return {}
        }
      })()
      const apellidoNombre = ocupNombreMap.get(d.idSialRol) ?? null
      // Baja de un cargo desdoblado 24/07 (§3.6): id_sial es NULL en los clones,
      // así que NO se depende del lookup por id_sial. codigo_cargo/siglas/
      // escalafon vienen en valorAnterior y la clasificación usa estado_cargo.
      if (parsed.desdoblado === true) {
        const clasificacionEliminado =
          d.campo === 'baja_previa' ? clasificacionEliminadoDesdoblado(parsed.estado_cargo) : null
        return {
          ...d,
          apellidoNombre,
          clasificacionEliminado,
          codigoCargo: parsed.codigo_cargo ?? null,
          siglas: parsed.siglas ?? null,
          escalafon: parsed.escalafon ?? null,
        }
      }
      const idSial = parsed.id_sial as string | null
      const estadoCargo = idSial ? cargoEstadoMap.get(idSial) : null
      const codigoCargo = idSial ? (cargoCodigoMap.get(idSial) ?? null) : null
      // Clasificación solo informativa dentro de "ya estaban en baja"
      // (campo='baja_previa'). Las bajas nuevas (campo IS NULL) no se clasifican.
      const clasificacionEliminado =
        d.campo === 'baja_previa'
          ? estadoCargo === 'validacion_vacante'
            ? 'en_validacion'
            : 'sin_persona'
          : null
      // siglas/escalafon: preferir lo guardado en valorAnterior (diffs nuevos),
      // caer al join con cargo para diffs ya existentes sin esos campos
      const siglas = parsed.siglas ?? (idSial ? (cargoSiglaMap.get(idSial) ?? null) : null)
      const escalafon = parsed.escalafon ?? (idSial ? (cargoEscalfMap.get(idSial) ?? null) : null)
      return { ...d, apellidoNombre, clasificacionEliminado, codigoCargo, siglas, escalafon }
    })
  }

  const [
    nuevos,
    modificados,
    completados,
    eliminados,
    bajasNuevas,
    bajasPrevias,
    nuevosPendientes,
    nuevosRechazados,
  ] = await Promise.all([
    prisma.padronDiff.count({ where: { snapshotId: id, tipo: 'nuevo' } }),
    // modificados reales: sin completados ni el marcador __reabrir_ocupacion__
    prisma.padronDiff.count({
      where: {
        snapshotId: id,
        tipo: 'modificado',
        AND: [
          { campo: { not: { startsWith: 'completado:' } } },
          { campo: { not: '__reabrir_ocupacion__' } },
          { campo: { not: '__especialidad_puesto_id__' } },
        ],
      },
    }),
    prisma.padronDiff.count({
      where: { snapshotId: id, tipo: 'modificado', campo: { startsWith: 'completado:' } },
    }),
    prisma.padronDiff.count({ where: { snapshotId: id, tipo: 'eliminado' } }),
    prisma.padronDiff.count({ where: { snapshotId: id, tipo: 'eliminado', campo: null } }),
    prisma.padronDiff.count({ where: { snapshotId: id, tipo: 'eliminado', campo: 'baja_previa' } }),
    prisma.padronDiff.count({ where: { snapshotId: id, tipo: 'nuevo', aprobado: null } }),
    prisma.padronDiff.count({ where: { snapshotId: id, tipo: 'nuevo', aprobado: false } }),
  ])

  // Sub-leyendas de "ya estaban en baja" (campo='baja_previa'), derivadas del
  // estado del cargo. Las bajas nuevas (campo IS NULL) no se clasifican acá.
  let eliminadosEnValidacion = 0,
    eliminadosSinPersona = 0
  const todosElim = await prisma.padronDiff.findMany({
    where: { snapshotId: id, tipo: 'eliminado', campo: 'baja_previa' },
    select: { idSialRol: true, valorAnterior: true },
  })
  if (todosElim.length > 0) {
    const idSials = todosElim
      .map((d) => {
        try {
          return JSON.parse(d.valorAnterior ?? '{}').id_sial
        } catch {
          return null
        }
      })
      .filter(Boolean)
    const cargosE = await prisma.cargo.findMany({
      where: { idSial: { in: idSials } },
      select: { idSial: true, estado: true },
    })
    const estadoMap = new Map(cargosE.map((c) => [c.idSial, c.estado]))
    for (const d of todosElim) {
      const parsed = (() => {
        try {
          return JSON.parse(d.valorAnterior ?? '{}')
        } catch {
          return {}
        }
      })()
      // Desdoblado 24/07: clasificar por estado_cargo (id_sial es NULL).
      const estado = parsed.desdoblado ? parsed.estado_cargo : estadoMap.get(parsed.id_sial)
      if (estado === 'validacion_vacante') eliminadosEnValidacion++
      else eliminadosSinPersona++
    }
  }

  // Para diffs nuevos aprobados: enriquecer con el código real del cargo creado.
  // codigoReutilizado=true solo cuando el cargo proviene de un concurso CPH
  // (el cargo ya existía con código asignado antes de la aprobación del diff).
  const codigoRealMap = new Map<
    string,
    { codigo: string; reutilizado: boolean; concursoCodigo?: string | null }
  >()
  if (query.tipo === 'nuevo') {
    const diffsAprobados = diffs.filter((d) => d.aprobado === true)
    if (diffsAprobados.length > 0) {
      const idSialRoles = diffsAprobados.map((d) => d.idSialRol)
      const ocupaciones = await prisma.ocupacion.findMany({
        where: { idSialRol: { in: idSialRoles } },
        select: {
          idSialRol: true,
          cargo: {
            select: {
              idSial: true,
              codigo: true,
              concursosCph: { select: { id: true, concurso: { select: { id: true } } }, take: 1 },
            },
          },
        },
      })
      const ocupMap = new Map(ocupaciones.map((o) => [o.idSialRol, o.cargo]))
      for (const d of diffsAprobados) {
        const cargo = ocupMap.get(d.idSialRol)
        if (!cargo?.codigo) continue
        const concursoCph = cargo.concursosCph[0]
        codigoRealMap.set(d.id, {
          codigo: cargo.codigo,
          reutilizado: !!concursoCph,
          concursoCodigo: concursoCph ? cargo.codigo : null,
        })
      }
    }
  }

  // Preview de código para diffs nuevos pendientes/rechazados — un MAX por
  // prefijo distinto (~15 prefijos), no uno por diff.
  const codigoPreviewMap = new Map<string, string>()
  if (query.tipo === 'nuevo') {
    const diffsDecidibles = diffs.filter((d) => d.aprobado === null || d.aprobado === false)
    if (diffsDecidibles.length > 0) {
      const prefijosPorDiff = new Map<string, string>()
      for (const d of diffsDecidibles) {
        try {
          const datos: Record<string, string> = JSON.parse(d.valorNuevo ?? '{}')
          prefijosPorDiff.set(
            d.id,
            prefijoDeCargo({
              escalafon: datos.escalafon ?? null,
              unificadorPuesto: datos.unificador_de_puestos ?? null,
              agrupador: datos.agrupador ?? null,
            }),
          )
        } catch {
          /* ignorar */
        }
      }
      const prefijosUnicos = [...new Set(prefijosPorDiff.values())]
      const maxPorPrefijo = new Map<string, number>()
      for (const prefijo of prefijosUnicos) {
        maxPorPrefijo.set(prefijo, await maxSecuencialCargo(prefijo, prisma as never))
      }
      const contadorPorPrefijo = new Map<string, number>()
      for (const d of diffsDecidibles) {
        const prefijo = prefijosPorDiff.get(d.id)
        if (!prefijo) continue
        const base = maxPorPrefijo.get(prefijo) ?? 0
        const usado = contadorPorPrefijo.get(prefijo) ?? 0
        contadorPorPrefijo.set(prefijo, usado + 1)
        codigoPreviewMap.set(d.id, `${prefijo}-${String(base + usado + 1).padStart(6, '0')}`)
      }
    }
  }

  return {
    snapshot: {
      id: snapshot.id,
      fechaAsignada: snapshot.fechaAsignada,
      filename: snapshot.filename,
      totalRegistros: snapshot.totalRegistros,
      estado: snapshot.estado,
      ratioTamano: snapshot.ratioTamano,
      advertenciaTamano: snapshot.advertenciaTamano,
    },
    summary: {
      nuevos,
      modificados,
      completados,
      eliminados,
      bajasNuevas,
      bajasPrevias,
      nuevosPendientes,
      nuevosRechazados,
      eliminadosEnValidacion,
      eliminadosSinPersona,
    },
    diffs: {
      data: diffsConNombre.map((d) => ({
        ...d,
        codigoPreview: codigoPreviewMap.get(d.id) ?? null,
        codigoReal: codigoRealMap.get(d.id)?.codigo ?? null,
        codigoReutilizado: codigoRealMap.get(d.id)?.reutilizado ?? false,
        concursoCodigo: codigoRealMap.get(d.id)?.concursoCodigo ?? null,
      })),
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
// Nota: CAMPOS_CARGO / CAMPOS_OCUPACION se definieron a nivel de módulo arriba
// (junto a toISO/stripCompletado) como única fuente compartida por calcularDiff
// y el paso 6 de aprobarSnapshotService.

// Bug crítico confirmado corriendo contra datos reales (2026-08-25, sin
// excepción — falla silenciosa): `calcularDiff()` solo guarda `cuil_y_rol`
// ("<CUIL 11 dígitos>-<rol>") en el JSON de cada diff "nuevo" — nunca un
// campo `cuil` suelto. Esta función leía `datos.cuil`, que por lo tanto
// siempre era `undefined`, y el guard `if (datos.cuil && ...)` cortaba en
// false en cada fila. Resultado: `personasACrear` y `ocupacionesACrear`
// quedaban siempre vacíos — 0 personas, 0 ocupaciones, 0 histórico creados —
// mientras que `cargosACrear` (que sí usa `datos.id_sial`, un campo que sí
// existe) se poblaba bien. La transacción hacía COMMIT igual (200 OK, sin
// error) porque no hay ningún `throw`: es un bug de datos, no de excepción.
// `Persona.cuil` es VARCHAR(11) — el CUIL puro, sin el sufijo de rol.
function cuilDe(datos: Record<string, string>): string | undefined {
  return datos.cuil_y_rol ? datos.cuil_y_rol.split('-')[0] : undefined
}

// Bug A: decide y devuelve el especialidad_puesto_id a asignar. Usa el id ya
// resuelto por el Dotaneitor cuando viene y valida (existe + cuelga del puesto
// resuelto por el backend); si no, cae al resolvedor por texto actual
// (resolverEspecialidadPuestoId), que a su vez aplica "vacío = conservar"
// devolviendo null cuando no hay especialidad real. NUNCA lanza; peor caso
// devuelve null. `idSialLog` es solo para el warn de diagnóstico.
async function especialidadPuestoIdFinal(
  tx: Parameters<typeof resolverEspecialidadPuestoId>[0],
  cache: CatalogoPuestosCache,
  puestoCargoId: string,
  idDotaneitor: string | null,
  especialidadLegacy: string | null,
  nombrePuesto: string | null,
  idSialLog?: string | null,
): Promise<string | null> {
  const idDota = (idDotaneitor ?? '').trim() || null
  const accion = decidirEspecialidad({
    idDotaneitor: idDota,
    puestoDelId: idDota ? cache.especialidadPuestoCargId.get(idDota) : undefined,
    puestoDelCargo: puestoCargoId,
    textoEspecialidadReal: especialidadSialReal(especialidadLegacy),
  })
  if (accion === 'usar-id' && idDota) return idDota
  if (idDota && accion !== 'usar-id') {
    // Vino un id del Dotaneitor pero no se pudo usar — se cae al fallback por
    // texto. Se loguea a nivel warn (mismo estilo que los warn de auto-alta).
    const motivo = cache.especialidadPuestoCargId.has(idDota)
      ? 'cuelga de otro puesto'
      : 'id inexistente en catálogo'
    console.warn(
      `[padron] especialidad_puesto_id del Dotaneitor no utilizable (${motivo}) — ` +
        `id_sial=${idSialLog ?? '?'} id=${idDota} puestoCargo=${puestoCargoId}; fallback por texto`,
    )
  }
  // 'fallback-texto' y 'conservar' se resuelven igual: el resolvedor por texto
  // devuelve null cuando no hay especialidad real (y el caller conserva la FK).
  return resolverEspecialidadPuestoId(tx, cache, puestoCargoId, especialidadLegacy, nombrePuesto)
}

export async function aprobarSnapshotService(
  id: string,
  usuarioId: string,
  overrideRatioTamano = false,
) {
  const snapshot = await getSnapshotOrThrow(id)
  if (snapshot.estado !== 'pendiente')
    throw AppError.conflict(`El snapshot ya está ${snapshot.estado}`)

  // Bloquear si hay diffs nuevos sin decisión (aprobado IS NULL)
  const pendientes = await prisma.padronDiff.count({
    where: { snapshotId: id, tipo: 'nuevo', aprobado: null },
  })
  if (pendientes > 0)
    throw AppError.conflict(
      `Hay ${pendientes} cargo(s) nuevo(s) sin decisión. Aprobá o rechazá cada uno antes de aprobar la carga.`,
    )

  // Guarda contra padrón parcial — BLOQUEO BLANDO. Se re-evalúa el ratio contra
  // el último aprobado EN ESTE MOMENTO (fuente de verdad al aprobar, no la foto
  // guardada al procesar, que pudo quedar desactualizada si cambió la
  // referencia). Si el padrón es anómalo y el operador NO pasó el override
  // explícito, se bloquea; el override queda auditado vía aprobadoPorId/
  // aprobadoAt que se escriben más abajo al marcar el snapshot como aprobado.
  const evalRatio = await evaluarRatioContraUltimoAprobado(snapshot.totalRegistros, id)
  if (evalRatio.anomalo && evalRatio.advertencia && !overrideRatioTamano) {
    throw AppError.conflict(evalRatio.advertencia)
  }

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
    const rechazados: { idSialRol: string; datos: Record<string, string> }[] = []
    // Alta 1:1 desdoblada (24/07): se materializa por el camino dedicado (§4.2),
    // NO por id_sial. `rechazadosDesdoblados` es defensa en profundidad — un
    // alta 1:1 rechazada no crea cargo ni ocupación; además es inalcanzable en
    // operación (auto-aprobación por carrera + guard de endpoints §4.5).
    const nuevosDesdoblados: { idSialRol: string; datos: Record<string, string> }[] = []
    const rechazadosDesdoblados: { idSialRol: string; datos: Record<string, string> }[] = []
    const eliminados: string[] = []
    const modificados: { idSialRol: string; cambios: typeof diffs }[] = []
    for (const [idSialRol, cambios] of porSialRol) {
      if (cambios.length === 0) continue
      const tipo = cambios[0]!.tipo
      // La condición "¿es desdoblada?" se evalúa PRIMERO para que un desdoblado
      // NUNCA caiga en nuevos/rechazados (los conjuntos que se procesan por
      // id_sial y recrearían el cargo compartido).
      const esDesd = cambios[0]!.campo === '__alta_desdoblada__'
      if (tipo === 'nuevo' && esDesd && cambios[0]!.aprobado === true)
        nuevosDesdoblados.push({ idSialRol, datos: JSON.parse(cambios[0]!.valorNuevo ?? '{}') })
      else if (tipo === 'nuevo' && esDesd && cambios[0]!.aprobado === false)
        rechazadosDesdoblados.push({ idSialRol, datos: JSON.parse(cambios[0]!.valorNuevo ?? '{}') })
      else if (tipo === 'nuevo' && cambios[0]!.aprobado === true)
        nuevos.push({ idSialRol, datos: JSON.parse(cambios[0]!.valorNuevo ?? '{}') })
      else if (tipo === 'nuevo' && cambios[0]!.aprobado === false)
        rechazados.push({ idSialRol, datos: JSON.parse(cambios[0]!.valorNuevo ?? '{}') })
      else if (tipo === 'eliminado') eliminados.push(idSialRol)
      else if (tipo === 'modificado') modificados.push({ idSialRol, cambios })
    }

    const todosLosIdSialRol = [...porSialRol.keys()]

    // ── 1. Precarga en bloque de todo lo que ya existe ──────────────────────
    // todosNuevos EXCLUYE nuevosDesdoblados y rechazadosDesdoblados (se procesan
    // por id_sial_rol, no por id_sial). todosConPersona agrega nuevosDesdoblados
    // SOLO para la precarga/creación de personas/hospitales/escalafones/
    // codigoRegistro (el alta 1:1 necesita esos caches). rechazadosDesdoblados
    // no entra a ninguno (no materializa nada).
    const todosNuevos = [...nuevos, ...rechazados]
    const todosConPersona = [...nuevos, ...rechazados, ...nuevosDesdoblados]
    // Derivadas de todosConPersona (incluye nuevosDesdoblados) para que el alta
    // 1:1 encuentre hospital/escalafón/codigoRegistro/persona en los caches.
    const siglasNecesarias = [...new Set(todosConPersona.map((n) => n.datos.siglas ?? n.idSialRol))]
    const cuilsNecesarios = [
      ...new Set(
        todosConPersona.map((n) => cuilDe(n.datos)).filter((v): v is string => Boolean(v)),
      ),
    ]
    const idSialsNecesarios = [
      ...new Set(todosNuevos.map((n) => n.datos.id_sial).filter((v): v is string => Boolean(v))),
    ]
    const codigosRegNecesarios = [
      ...new Set(
        todosConPersona
          .map((n) => n.datos.codigo_de_registro)
          .filter((v): v is string => Boolean(v)),
      ),
    ]
    const escalafonesNecesarios = [
      ...new Set(todosConPersona.map((n) => n.datos.escalafon ?? '').filter(Boolean)),
    ]

    const [
      hospitalesExistentes,
      codigosRegistroExistentesLookup,
      escalafonesExistentes,
      personasExistentes,
      cargosExistentes,
      ocupacionesExistentes,
    ] = await Promise.all([
      tx.hospital.findMany({ where: { sigla: { in: siglasNecesarias } } }) as Promise<
        HospitalRow[]
      >,
      // Lookup canónico: CODIGO DE REGISTRO → escalafón via codigos_registro (fuente de verdad)
      tx.codigoRegistro.findMany({
        where: { codigo: { in: codigosRegNecesarios } },
        include: { escalafon: true },
      }) as Promise<{ codigo: string; id: string; escalafonId: string; escalafon: EscalafonRow }[]>,
      // Fallback: buscar por nombre para códigos no mapeados
      tx.escalafon.findMany({
        where: { nombre: { in: escalafonesNecesarios }, activo: true },
      }) as Promise<EscalafonRow[]>,
      tx.persona.findMany({ where: { cuil: { in: cuilsNecesarios } } }) as Promise<PersonaRow[]>,
      tx.cargo.findMany({ where: { idSial: { in: idSialsNecesarios } } }) as Promise<CargoRow[]>,
      tx.ocupacion.findMany({
        where: { idSialRol: { in: todosLosIdSialRol } },
        select: { idSialRol: true, cargoId: true },
      }) as Promise<{ idSialRol: string; cargoId: string }[]>,
    ])

    const hospitalCache = new Map(hospitalesExistentes.map((h) => [h.sigla, h]))
    const escalafonCache = new Map<string, EscalafonRow>(
      escalafonesExistentes.map((e) => [e.nombre, e]),
    )
    const escalafonPorCodRegCache = new Map(
      codigosRegistroExistentesLookup.map((cr) => [
        cr.codigo,
        { id: cr.escalafon.id, nombre: cr.escalafon.nombre },
      ]),
    )
    const personaCache = new Map(personasExistentes.map((p) => [p.cuil, p]))
    const cargoCache = new Map(cargosExistentes.map((c) => [c.idSial, c]))
    const ocupacionExistenteMap = new Map(ocupacionesExistentes.map((o) => [o.idSialRol, o]))
    // S20-6: catálogo puesto/especialidad — cargado una vez, cardinalidad chica.
    const catalogoPuestos = await cargarCatalogoPuestos(tx)

    // ── 2. Crear en bloque hospitales / escalafones faltantes (catálogos —
    //       cardinalidad chica, no escala con la cantidad de filas) ────────
    for (const sigla of siglasNecesarias) {
      if (hospitalCache.has(sigla)) continue
      // Buscar en todosConPersona (incluye desdoblados): una sigla puede venir
      // solo de un alta 1:1 24/07 y no de las altas normales.
      const datos = todosConPersona.find((n) => (n.datos.siglas ?? n.idSialRol) === sigla)!.datos
      // upsert: si ya existe (cargado por la migración de enriquecimiento) lo
      // devuelve sin tocar sus campos descriptivos. Si es genuinamente nuevo
      // (sigla desconocida) lo crea con los datos disponibles del padrón.
      const h = await tx.hospital.upsert({
        where: { sigla },
        update: {}, // no sobreescribir nombre/tipo/universo_totalizador/monovalencia ya enriquecidos
        create: {
          sigla,
          nombre: sigla,
          tipo: datos.tipo_hospital_sigla || null,
        },
      })
      hospitalCache.set(sigla, h)
    }
    for (const nombre of escalafonesNecesarios) {
      if (escalafonCache.has(nombre)) continue
      // Si ya está mapeado por código de registro no crear uno nuevo
      const yaMapado = [...escalafonPorCodRegCache.values()].find((e) => e.nombre === nombre)
      if (yaMapado) {
        escalafonCache.set(nombre, yaMapado)
        continue
      }
      const e = await tx.escalafon.create({
        data: { codigo: `${nombre.slice(0, 12)}-${randomUUID().slice(0, 7)}`, nombre },
      })
      escalafonCache.set(nombre, e)
    }

    // ── 2b. Resolver CodigoRegistro: lookup/create por código numérico ─────
    // Fuente de verdad: codigos_registro (ya cargado en codigosRegistroExistentesLookup).
    // Si el código no existe (genuinamente nuevo), se crea con el escalafón
    // resuelto por nombre como fallback.
    const codigosRegistroNecesarios = [
      ...new Set(
        nuevos.map((n) => n.datos.codigo_de_registro).filter((v): v is string => Boolean(v)),
      ),
    ]
    const codigoRegistroCache = new Map(
      codigosRegistroExistentesLookup.map((cr) => [
        cr.codigo,
        cr as { id: string; codigo: string },
      ]),
    )
    for (const codigo of codigosRegistroNecesarios) {
      if (codigoRegistroCache.has(codigo)) continue
      const datosEjemplo = nuevos.find((n) => n.datos.codigo_de_registro === codigo)!.datos
      const escalafon =
        escalafonPorCodRegCache.get(codigo) ?? escalafonCache.get(datosEjemplo.escalafon ?? '')
      if (!escalafon) {
        console.warn(
          `[padron] CODIGO DE REGISTRO "${codigo}" sin escalafón resuelto — fila omitida`,
        )
        continue
      }
      const literal = datosEjemplo.literal_cr || datosEjemplo.escalafon || codigo
      const cr = await tx.codigoRegistro.create({
        data: { codigo, literal, escalafonId: escalafon.id },
      })
      codigoRegistroCache.set(codigo, cr)
      escalafonPorCodRegCache.set(codigo, { id: escalafon.id, nombre: escalafon.nombre })
      console.info(
        `[padron] Nuevo CODIGO DE REGISTRO "${codigo}" → escalafón "${escalafon.nombre}" creado en codigos_registro`,
      )
    }

    // ── 2c. Contexto para la derivación automática del código de registro ──
    // Para decidir "cuántos CRs tiene el escalafón" hace falta el catálogo
    // COMPLETO de CRs (no el filtrado al batch de codigoRegistroCache). La
    // cardinalidad es chica (~16 filas), así que se carga una sola vez y se
    // construyen los mapas que consume derivarCodigoRegistroId. Ver
    // derivarCodigoRegistro.ts.
    const crCatalogoCompleto = (await tx.codigoRegistro.findMany({
      select: {
        id: true,
        codigo: true,
        escalafonId: true,
        escalafon: { select: { codigo: true } },
      },
    })) as { id: string; codigo: string; escalafonId: string; escalafon: { codigo: string } }[]
    const crCtxEscalafonCodigoPorId = new Map<string, string>()
    const crCtxCrsPorEscalafonId = new Map<string, CrCatalogo[]>()
    const crCtxCrPorCodigo = new Map<string, CrCatalogo>()
    // id de CR -> su código string. Lo necesita la derivación de régimen, que
    // recibe el id del CR resuelto y debe traducirlo al código (85/83/22/...)
    // que consume derivarRegimen.
    const crCtxCodigoPorId = new Map<string, string>()
    for (const row of crCatalogoCompleto) {
      const cr: CrCatalogo = { id: row.id, codigo: row.codigo }
      crCtxCrPorCodigo.set(row.codigo, cr)
      crCtxCodigoPorId.set(row.id, row.codigo)
      crCtxEscalafonCodigoPorId.set(row.escalafonId, row.escalafon.codigo)
      const lista = crCtxCrsPorEscalafonId.get(row.escalafonId) ?? []
      lista.push(cr)
      crCtxCrsPorEscalafonId.set(row.escalafonId, lista)
    }
    const derivarCrCtx = {
      escalafonCodigoPorId: crCtxEscalafonCodigoPorId,
      crsPorEscalafonId: crCtxCrsPorEscalafonId,
      crPorCodigo: crCtxCrPorCodigo,
    }
    // Traduce el id del CR resuelto al código string que consume derivarRegimen.
    const crCodigoDe = (id: string | null): string | null =>
      id ? (crCtxCodigoPorId.get(id) ?? null) : null

    // ── 2d. Contexto para la derivación automática del RÉGIMEN ──
    // El régimen se deriva SIEMPRE después de resolver el CR. Se carga el
    // catálogo `regimenes` una sola vez por transacción (cardinalidad chica,
    // ~12 filas) y se arma el mapa nombre→{ id, nombre } que consume
    // derivarRegimenId. Ver derivarRegimen.ts.
    const regimenesCatalogo = await tx.regimen.findMany({
      select: { id: true, nombre: true },
    })
    const regimenCtx = {
      regimenPorNombre: new Map(regimenesCatalogo.map((r) => [r.nombre, r])),
    }

    // ── 3. Crear en bloque personas / cargos / ocupaciones faltantes ───────
    const personasACrear = new Map<
      string,
      {
        id: string
        cuil: string
        apellidoNombre: string
        numeroDoc: string | null
        tipoDoc: string | null
        sexo: string | null
        fechaNacimiento: Date | null
        antiguedadDesde: Date | null
        telefono: string | null
        mailPersonal: string | null
        mailLaboral: string | null
        domicilio: string | null
        localidad: string | null
        provincia: string | null
      }
    >()
    const cargosACrear = new Map<
      string,
      {
        id: string
        idSial: string
        estado: 'vigente'
        hospitalId: string
        escalafonId: string
        puestoCargoId: string
        especialidadPuestoId: string | null
        literalPuesto: string | null
        especialidadLegacy: string | null
        agrupador: string | null
        unificadorPuesto: string | null
        regimen: string | null
        codigoRepa: string | null
        descripcionRepa: string | null
        agrupamiento: string | null
        codigoRegistroId: string | null
        regimenId: string | null
        revisionDato?: boolean
        revisionMotivo?: string | null
      }
    >()
    // Set de idSialRol de altas 1:1 desdobladas: su persona SÍ se precarga/crea
    // acá (están en todosConPersona), pero su CARGO NO se crea por este camino
    // (id_sial = titular) — se materializa en el bloque 3c dedicado.
    const idSialRolDesdoblados = new Set(nuevosDesdoblados.map((n) => n.idSialRol))
    for (const { idSialRol, datos } of todosConPersona) {
      const cuil = cuilDe(datos)
      if (cuil && !personaCache.has(cuil) && !personasACrear.has(cuil)) {
        personasACrear.set(cuil, {
          id: randomUUID(),
          cuil,
          apellidoNombre: datos.ayn ?? '',
          numeroDoc: datos.numero_doc || null,
          tipoDoc: datos.tipo_doc || null,
          sexo: datos.sexo || null,
          fechaNacimiento: parseFechaDDMMYYYY(datos.fecha_nacimiento),
          antiguedadDesde: parseFechaDDMMYYYY(datos.antiguedad),
          telefono: datos.telefono || null,
          mailPersonal: datos.mail_personal || null,
          mailLaboral: datos.mail_laboral || null,
          domicilio: datos.domicilio || null,
          localidad: datos.localidad || null,
          provincia: datos.provincia || null,
        })
      }
      // Un alta 1:1 desdoblada (24/07) NUNCA crea cargo por este camino
      // (datos.id_sial es el id_sial del TITULAR; reusarlo recrearía el cargo
      // compartido). Su cargo se crea en el bloque 3c con id_sial NULL.
      if (
        !idSialRolDesdoblados.has(idSialRol) &&
        datos.id_sial &&
        !cargoCache.has(datos.id_sial) &&
        !cargosACrear.has(datos.id_sial)
      ) {
        const hospital = hospitalCache.get(datos.siglas ?? '')!
        // Resolución canónica: primero por CODIGO DE REGISTRO, luego por nombre.
        // Bug encontrado en vivo (Sprint 20, 2026-09-29): `datos.codigo_de_registro`
        // viene de strVal() y es '' (no undefined) cuando la fila no lo trae —
        // `'' && x` da '' (falsy, no null/undefined), así que `?? fallback` NO
        // se disparaba y el fallback por nombre quedaba muerto para cualquier
        // fila sin CODIGO DE REGISTRO (la mayoría de las filas reales sin ese
        // dato quedaban sin escalafón resuelto y su Cargo nunca se creaba).
        const escalafon =
          (datos.codigo_de_registro
            ? escalafonPorCodRegCache.get(datos.codigo_de_registro)
            : undefined) ?? escalafonCache.get(datos.escalafon ?? '')
        if (!hospital || !escalafon) continue

        // S24-6: reconciliación con los cargos de conducción VACANTES generados
        // desde el organigrama. Si entra una ocupación de JEFATURA en una
        // repartición con un cargo origen='organigrama' sin ocupante, se cubre
        // ese cargo en vez de crear uno nuevo. Helper compartido con los demás
        // flujos del padrón — ver reconciliarConduccion.ts.
        if (datos.id_sial) {
          // Derivación automática del código de registro (cascada 1→4) para el
          // cargo de conducción que se cubre. Si no es derivable, se marca para
          // revisión en vez de dejarlo silenciosamente en NULL.
          const decisionCrConduccion = derivarCodigoRegistroId(
            escalafon.id,
            datos.codigo_de_registro ?? null,
            derivarCrCtx,
          )
          // Régimen derivado SIEMPRE después de resolver el CR.
          const decisionRegC = derivarRegimenId(
            crCodigoDe(decisionCrConduccion.codigoRegistroId),
            datos.literal_puesto ?? null,
            regimenCtx,
          )
          const cargoVinculado = await reconciliarCargoConduccionVacante(tx, {
            codigoRepa: datos.codigo_repa,
            codigoJefaturas: datos.codigo_jefaturas,
            idSial: datos.id_sial,
            escalafonId: escalafon.id,
            literalPuesto: datos.literal_puesto,
            especialidadLegacy: datos.especialidad,
            codigoRegistroId: decisionCrConduccion.codigoRegistroId,
            revisionCr: decisionCrConduccion.revision ?? null,
            regimenId: decisionRegC.regimenId,
            revisionRegimen: decisionRegC.revision ?? null,
          })
          if (cargoVinculado) {
            cargoCache.set(datos.id_sial, {
              id: cargoVinculado,
              idSial: datos.id_sial,
              estado: 'vigente',
            })
            continue
          }
        }

        // B-12: antes de crear un cargo nuevo, buscar por clave estructural
        // (hospital, escalafon, codigo_repa, literal_puesto). Si existe, reusar
        // ese cargo y actualizar su idSial al nuevo — no crear un duplicado.
        // Ver Contrato_logica-cargo.md §6.
        const cargoEstructural = await tx.cargo.findFirst({
          where: {
            hospitalId: hospital.id,
            escalafonId: escalafon.id,
            codigoRepa: datos.codigo_repa || null,
            literalPuesto: datos.literal_puesto || null,
            // Fix 3: un cargo desdoblado 24/07 (1:1, id_sial NULL) NUNCA puede
            // ser recapturado por el reuso estructural de un alta normal —
            // reconstruiría un cargo compartido. No-op para altas 24/07 (ya
            // excluidas aguas arriba por el guard de desdoblados), pero
            // load-bearing para un alta NORMAL cuya clave estructural colisiona
            // con un cargo 24/07 existente: en ese caso se crea intencionalmente
            // un cargo normal nuevo (NO es regresión). Se usa NOT { relación: in }
            // para preservar las filas con codigo_registro_id NULL.
            NOT: { codigoRegistro: { codigo: { in: ['24', '07'] } } },
          },
          select: { id: true, idSial: true, estado: true },
        })
        if (cargoEstructural) {
          // Cargo estructural ya existe — actualizar idSial y reactivar si hace falta
          await tx.cargo.update({
            where: { id: cargoEstructural.id },
            data: {
              idSial: datos.id_sial,
              ...(cargoEstructural.estado !== 'vigente'
                ? { estado: 'vigente', estadoDesde: null }
                : {}),
            },
          })
          cargoCache.set(datos.id_sial, {
            id: cargoEstructural.id,
            idSial: datos.id_sial,
            estado: 'vigente',
          })
          continue
        }
        const puestoResuelto = await resolverPuestoCargoId(tx, catalogoPuestos, {
          escalafonId: escalafon.id,
          literalPuesto: datos.literal_puesto ?? null,
          unificadorPuesto: datos.unificador_de_puestos ?? null,
        })
        // Bug A: alta — preferir el especialidad_puesto_id del Dotaneitor
        // (datos.especialidad_puesto_id del allowlist) si valida; si no, fallback
        // por texto (resolución actual).
        const especialidadResuelta = await especialidadPuestoIdFinal(
          tx,
          catalogoPuestos,
          puestoResuelto.id,
          datos.especialidad_puesto_id ?? null,
          datos.especialidad ?? null,
          puestoResuelto.nombre,
          datos.id_sial,
        )
        const prefijo = prefijoDeCargo({
          escalafon: escalafon.nombre ?? null,
          unificadorPuesto: datos.unificador_de_puestos ?? null,
          agrupador: datos.agrupador ?? null,
          puestoCargo: puestoResuelto,
        })
        // El código se genera después del createMany (necesita el secuencial
        // real de la DB) — se marca con null aquí y se actualiza en el paso
        // de asignación de códigos más abajo.
        // Derivación automática del código de registro (cascada 1→4). Estas
        // filas nacen sin revisión previa, así que marcar revisión es aditivo.
        const decisionCrA = derivarCodigoRegistroId(
          escalafon.id,
          datos.codigo_de_registro ?? null,
          derivarCrCtx,
        )
        // Régimen derivado SIEMPRE después de resolver el CR. La marca de
        // revisión combina las causas de CR y de régimen (aditiva).
        const decisionRegA = derivarRegimenId(
          crCodigoDe(decisionCrA.codigoRegistroId),
          datos.literal_puesto ?? null,
          regimenCtx,
        )
        const motivosA: string[] = []
        if (decisionCrA.revision) motivosA.push(decisionCrA.revision.motivo)
        if (decisionRegA.revision) motivosA.push(decisionRegA.revision.motivo)
        cargosACrear.set(datos.id_sial, {
          id: randomUUID(),
          idSial: datos.id_sial,
          estado: 'vigente' as const,
          hospitalId: hospital.id,
          escalafonId: escalafon.id,
          puestoCargoId: puestoResuelto.id,
          especialidadPuestoId: especialidadResuelta,
          literalPuesto: datos.literal_puesto ?? null,
          especialidadLegacy: datos.especialidad ?? null,
          agrupador: datos.agrupador ?? null,
          unificadorPuesto: datos.unificador_de_puestos ?? null,
          regimen: datos.regimen || null,
          codigoRepa: datos.codigo_repa || null,
          descripcionRepa: datos.descripcion_repa || null,
          agrupamiento: datos.agrupamiento || null,
          codigoRegistroId: decisionCrA.codigoRegistroId,
          regimenId: decisionRegA.regimenId,
          ...(motivosA.length > 0
            ? { revisionDato: true, revisionMotivo: motivosA.join(' | ').slice(0, 200) }
            : {}),
          _prefijo: prefijo,
        } as never)
      }
    }

    for (const lote of chunk([...personasACrear.values()], 2000)) {
      await tx.persona.createMany({ data: lote, skipDuplicates: true })
    }
    for (const p of personasACrear.values()) personaCache.set(p.cuil, p)

    // Separar _prefijo (campo auxiliar) del objeto real antes del createMany
    const cargosParaInsertar = [...cargosACrear.values()].map((c) => {
      const { _prefijo, ...rest } = c as typeof c & { _prefijo?: string }
      return { ...rest, _prefijo }
    })
    for (const lote of chunk(
      cargosParaInsertar.map(({ _prefijo: _, ...rest }) => rest),
      2000,
    )) {
      await tx.cargo.createMany({ data: lote, skipDuplicates: true })
    }
    for (const c of cargosACrear.values()) cargoCache.set(c.idSial, c)

    // ── 3b. Asignar código a los cargos recién creados — en bloque ─────────
    // Antes: un siguienteCodigoCargo() (SELECT MAX contra toda la tabla
    // cargos) + un update() POR CADA CARGO. Con un padrón real de decenas de
    // miles de cargos nuevos eso son decenas de miles de scans completos de
    // la tabla, uno por uno — degradaba de los ~35s documentados (Sprint 2,
    // sección 8) a varios minutos, encontrado verificando Sprint 2 con un
    // Excel real de 47k filas (2026-08-28). Ahora: un solo MAX por prefijo
    // distinto (típicamente ~15, no 47k) vía maxSecuencialCargo(), secuencial
    // asignado en memoria, y un UPDATE multi-fila por lote de 2000 en vez de
    // un update por cargo — mismo patrón de batching que ya usa el resto de
    // esta función (createMany/updateMany troceados).
    const cargosPorPrefijo = new Map<string, typeof cargosParaInsertar>()
    for (const c of cargosParaInsertar) {
      if (!c._prefijo) continue
      const lista = cargosPorPrefijo.get(c._prefijo) ?? []
      lista.push(c)
      cargosPorPrefijo.set(c._prefijo, lista)
    }

    const asignacionesCodigo: { id: string; codigo: string }[] = []
    for (const [prefijo, lista] of cargosPorPrefijo) {
      let siguiente = (await maxSecuencialCargo(prefijo, tx)) + 1
      for (const c of lista) {
        asignacionesCodigo.push({
          id: c.id,
          codigo: `${prefijo}-${String(siguiente).padStart(6, '0')}`,
        })
        siguiente++
      }
    }

    for (const lote of chunk(asignacionesCodigo, 2000)) {
      await tx.$executeRaw`
        UPDATE cargos AS c SET codigo = v.codigo, updated_at = now()
        FROM (VALUES ${Prisma.join(lote.map((a) => Prisma.sql`(${a.id}::uuid, ${a.codigo})`))}) AS v(id, codigo)
        WHERE c.id = v.id
      `
    }

    // ── 3c. Altas 1:1 desdobladas (24/07) — §4.2 del diseño. Corre DESPUÉS del
    //        UPDATE de códigos normales (el MAX por prefijo ya los incluye) y
    //        dentro de la MISMA transacción. Crea por fila: cargo (id_sial NULL,
    //        código correlativo RES-/DOC-, especialidad ESTRICTA por rol),
    //        ocupación y mapeo en desdoblado_mapeo_cargos.
    if (nuevosDesdoblados.length > 0) {
      // Índice norm_esp del catálogo: key `${puestoId}:${normEspDesdoblado(nombre)}`
      // -> especialidadPuestoId. Se arma una vez a partir del cache (sin query
      // extra), igual que norm_esp del script SQL.
      const catalogoNormEsp = new Map<string, string>()
      for (const [puestoId, lista] of catalogoPuestos.especialidadesPorPuesto) {
        for (const e of lista) {
          catalogoNormEsp.set(`${puestoId}:${normEspDesdoblado(e.nombre)}`, e.id)
        }
      }

      // MAX por prefijo (RES/DOC, SIN guion) recomputado tras el batch normal +
      // contador en memoria + blindaje WHILE EXISTS contra huecos/no-contiguos.
      const maxDesdPorPrefijo = new Map<string, number>()
      const proximoCodigoDesdoblado = async (prefijo: string): Promise<string> => {
        if (!maxDesdPorPrefijo.has(prefijo)) {
          maxDesdPorPrefijo.set(prefijo, await maxSecuencialCargo(prefijo, tx))
        }
        let n = (maxDesdPorPrefijo.get(prefijo) ?? 0) + 1
        let codigo = formatearCodigoDesdoblado(prefijo, n)
        while ((await tx.cargo.count({ where: { codigo } })) > 0) {
          n++
          codigo = formatearCodigoDesdoblado(prefijo, n)
        }
        maxDesdPorPrefijo.set(prefijo, n)
        return codigo
      }

      for (const { idSialRol, datos } of nuevosDesdoblados) {
        // Si ya existe una ocupación para este rol (no debería en un alta), se
        // respeta y se saltea (idempotencia defensiva).
        if (ocupacionExistenteMap.has(idSialRol)) continue

        const cuil = cuilDe(datos)
        const persona = cuil ? personaCache.get(cuil) : null
        const hospital = hospitalCache.get(datos.siglas ?? '')
        const escalafon =
          (datos.codigo_de_registro
            ? escalafonPorCodRegCache.get(datos.codigo_de_registro)
            : undefined) ?? escalafonCache.get(datos.escalafon ?? '')
        if (!persona || !hospital || !escalafon) {
          console.warn(
            `[padron][desdoblado] alta 1:1 omitida (id_sial_rol ${idSialRol}): falta ${!persona ? 'persona' : !hospital ? 'hospital' : 'escalafón'}`,
          )
          continue
        }

        // Puesto (igual que el alta normal; nunca null — auto-crea pendienteCurar).
        const puesto = await resolverPuestoCargoId(tx, catalogoPuestos, {
          escalafonId: escalafon.id,
          literalPuesto: datos.literal_puesto ?? null,
          unificadorPuesto: datos.unificador_de_puestos ?? null,
        })
        // Especialidad ESTRICTA (REGLA DE ORO): match exacto o NULL. Nunca deriva
        // ni auto-crea (resolver puro, sin tx).
        const especialidadPuestoId = resolverEspecialidadDesdobladaId(
          catalogoNormEsp,
          puesto.id,
          datos.especialidad ?? null,
        )
        // Prefijo forzado por carrera (RES/DOC, SIN guion).
        const prefijoCalc = prefijoDeCargo({
          escalafon: escalafon.nombre,
          unificadorPuesto: datos.unificador_de_puestos ?? null,
          agrupador: datos.agrupador ?? null,
          puestoCargo: puesto,
        })
        const prefijo = prefijoDesdobladoForzado(datos.codigo_de_registro, prefijoCalc)
        const codigo = await proximoCodigoDesdoblado(prefijo)

        // Derivación automática del código de registro (cascada 1→4). El cargo
        // desdoblado nace sin revisión previa: marcar revisión es aditivo.
        const decisionCrDesd = derivarCodigoRegistroId(
          escalafon.id,
          datos.codigo_de_registro ?? null,
          derivarCrCtx,
        )
        // Régimen derivado SIEMPRE después de resolver el CR. Marca de revisión
        // aditiva (CR + régimen).
        const decisionRegDesd = derivarRegimenId(
          crCodigoDe(decisionCrDesd.codigoRegistroId),
          datos.literal_puesto ?? null,
          regimenCtx,
        )
        const motivosDesd: string[] = []
        if (decisionCrDesd.revision) motivosDesd.push(decisionCrDesd.revision.motivo)
        if (decisionRegDesd.revision) motivosDesd.push(decisionRegDesd.revision.motivo)
        const cargoId = randomUUID()
        await tx.cargo.create({
          data: {
            id: cargoId,
            idSial: null, // clon desdoblado: sin identidad propia en el SIAL
            codigo,
            estado: 'vigente',
            hospitalId: hospital.id,
            escalafonId: escalafon.id,
            puestoCargoId: puesto.id,
            especialidadPuestoId,
            literalPuesto: datos.literal_puesto ?? null,
            especialidadLegacy: datos.especialidad ?? null,
            agrupador: datos.agrupador ?? null,
            unificadorPuesto: datos.unificador_de_puestos ?? null,
            regimen: datos.regimen || null,
            codigoRepa: datos.codigo_repa || null,
            descripcionRepa: datos.descripcion_repa || null,
            agrupamiento: datos.agrupamiento || null,
            codigoRegistroId: decisionCrDesd.codigoRegistroId,
            regimenId: decisionRegDesd.regimenId,
            ...(motivosDesd.length > 0
              ? { revisionDato: true, revisionMotivo: motivosDesd.join(' | ').slice(0, 200) }
              : {}),
          },
        })

        await tx.ocupacion.create({
          data: {
            id: randomUUID(),
            personaId: persona.id,
            cargoId,
            idSialRol,
            cuil: cuil ?? null,
            situacionRevista: datos.situacion_de_revista ?? null,
            estadoPersona: datos.estado ?? null,
            codigoJefaturas: datos.codigo_jefaturas || null,
            cargoJefaturaPuestoId: datos.cargo_jefatura_puesto_id || null,
            jefeEscalafon: datos.jefe_escalafon || null,
            documentacionJefatura: datos.documentacion_jefatura || null,
            comentariosJefaturas: datos.comentarios_jefaturas || null,
            documentacionPou: datos.documentacion_pou || null,
            comision: datos.comision || null,
            repaComision: datos.repa_comision || null,
            codSituacion: datos.cod_situacion || null,
            fechaBloqueo: parseFechaDDMMYYYY(datos.fecha_bloqueo),
            bloqueoComentario: datos.bloqueo_comentario || null,
            bloqMotivo: datos.bloq_motivo || null,
            documentacionDelRol: datos.documentacion_del_rol || null,
            documentacionBaja: datos.documentacion_baja || null,
            cargoDesdeFecha: parseFechaDDMMYYYY(datos.cargo_desde),
            cargoHastaFecha: parseFechaDDMMYYYY(datos.cargo_hasta),
            snapshotId: id,
          },
        })
        ocupacionExistenteMap.set(idSialRol, { idSialRol, cargoId })

        // Registrar el mapeo (idempotente).
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO desdoblado_mapeo_cargos (id_sial_rol, codigo_cargo, codigo_registro)
          VALUES (${idSialRol}, ${codigo}, ${datos.codigo_de_registro ?? null})
          ON CONFLICT (id_sial_rol) DO NOTHING
        `)
      }
    }

    const ocupacionesACrear: {
      id: string
      personaId: string
      cargoId: string
      idSialRol: string
      cuil: string | null
      situacionRevista: string | null
      estadoPersona: string | null
      codigoJefaturas: string | null
      cargoJefaturaPuestoId: string | null
      jefeEscalafon: string | null
      documentacionJefatura: string | null
      comentariosJefaturas: string | null
      documentacionPou: string | null
      comision: string | null
      repaComision: string | null
      codSituacion: string | null
      fechaBloqueo: Date | null
      bloqueoComentario: string | null
      bloqMotivo: string | null
      documentacionDelRol: string | null
      documentacionBaja: string | null
      cargoDesdeFecha: Date | null
      cargoHastaFecha: Date | null
      snapshotId: string
    }[] = []
    for (const { idSialRol, datos } of todosNuevos) {
      if (ocupacionExistenteMap.has(idSialRol)) continue
      const cuil = cuilDe(datos)
      const persona = cuil ? personaCache.get(cuil) : null
      const cargo = datos.id_sial ? cargoCache.get(datos.id_sial) : null
      if (!persona || !cargo) continue
      ocupacionesACrear.push({
        id: randomUUID(),
        personaId: persona.id,
        cargoId: cargo.id,
        idSialRol,
        cuil: cuilDe(datos),
        situacionRevista: datos.situacion_de_revista ?? null,
        estadoPersona: datos.estado ?? null,
        codigoJefaturas: datos.codigo_jefaturas || null,
        cargoJefaturaPuestoId: datos.cargo_jefatura_puesto_id || null,
        jefeEscalafon: datos.jefe_escalafon || null,
        documentacionJefatura: datos.documentacion_jefatura || null,
        comentariosJefaturas: datos.comentarios_jefaturas || null,
        documentacionPou: datos.documentacion_pou || null,
        comision: datos.comision || null,
        repaComision: datos.repa_comision || null,
        codSituacion: datos.cod_situacion || null,
        fechaBloqueo: parseFechaDDMMYYYY(datos.fecha_bloqueo),
        bloqueoComentario: datos.bloqueo_comentario || null,
        bloqMotivo: datos.bloq_motivo || null,
        documentacionDelRol: datos.documentacion_del_rol || null,
        documentacionBaja: datos.documentacion_baja || null,
        cargoDesdeFecha: parseFechaDDMMYYYY(datos.cargo_desde),
        cargoHastaFecha: parseFechaDDMMYYYY(datos.cargo_hasta),
        snapshotId: id,
      })
    }
    for (const lote of chunk(ocupacionesACrear, 2000)) {
      await tx.ocupacion.createMany({ data: lote, skipDuplicates: true })
    }
    for (const o of ocupacionesACrear)
      ocupacionExistenteMap.set(o.idSialRol, { idSialRol: o.idSialRol, cargoId: o.cargoId })

    // ── 4. Resolver automáticamente cargos en validacion_vacante:
    //   - Si el cargo aparece en el nuevo padrón (está en nuevosIds por idSial) → rechazar baja (vuelve a vigente)
    //   - Si el cargo NO aparece → confirmar baja (pasa a no_vigente)
    const idSialsNuevos = new Set(
      todosNuevos.map((n) => n.datos.id_sial).filter((v): v is string => Boolean(v)),
    )
    // Fix 2 — Bug B: este paso resuelve por id_sial, así que debe aplicar el
    // MISMO criterio COMPLETO que cargosActuales en calcularDiff: idSial no-NULL
    // Y NOT 24/07 (preservando codigo_registro_id NULL con NOT { relación: in }).
    // Los cargos 24/07 (clones con id_sial NULL y preexistentes con id_sial
    // no-NULL) se resuelven íntegramente por id_sial_rol: reapertura vía
    // modificado + __reabrir_ocupacion__, cierre a validacion_vacante en el
    // paso 5. Si no se excluyen acá, un cargo 24/07 en validacion_vacante caería
    // siempre en aConfirmarBaja → no_vigente (el bug que Fix 2 elimina).
    const cargosEnValidacion = (await tx.cargo.findMany({
      where: {
        estado: { in: ['validacion_vacante', 'no_vigente'] },
        idSial: { not: null },
        NOT: { codigoRegistro: { codigo: { in: ['24', '07'] } } },
      },
      select: { id: true, idSial: true, codigoRegistro: { select: { codigo: true } } },
    })) as { id: string; idSial: string | null; codigoRegistro: { codigo: string } | null }[]

    // El where ya excluye los 24/07; es24y07Set queda como guard explícito y
    // testeable (ver particionarValidacionPorIdSial).
    const es24y07Set = new Set(
      cargosEnValidacion
        .filter((c) => c.codigoRegistro?.codigo === '24' || c.codigoRegistro?.codigo === '07')
        .map((c) => c.id),
    )
    const { aRechazar: aRechazarBaja, aConfirmar: aConfirmarBaja } = particionarValidacionPorIdSial(
      cargosEnValidacion.map((c) => ({
        id: c.id,
        idSial: c.idSial,
        es24y07: es24y07Set.has(c.id),
      })),
      idSialsNuevos,
      es24y07Set,
    )

    for (const lote of chunk(aRechazarBaja, 2000)) {
      await tx.cargo.updateMany({
        where: { id: { in: lote } },
        data: { estado: 'vigente', estadoDesde: null },
      })
    }
    for (const lote of chunk(aConfirmarBaja, 2000)) {
      await tx.cargo.updateMany({ where: { id: { in: lote } }, data: { estado: 'no_vigente' } })
    }

    // ── 5. Eliminados: cerrar ocupaciones, marcar persona inactiva y cargo validacion_vacante
    // S8A-2: el padrón NUNCA marca no_vigente directamente — pasa a
    // validacion_vacante para que el operador confirme o rechace la baja.
    const fechaPadron = snapshot.fechaAsignada
    for (const lote of chunk(eliminados, 2000)) {
      if (!lote.length) continue
      await tx.ocupacion.updateMany({
        where: { idSialRol: { in: lote } },
        data: { hasta: fechaPadron },
      })
    }
    if (eliminados.length > 0) {
      const ocupsEliminadas = (await tx.ocupacion.findMany({
        where: { idSialRol: { in: eliminados } },
        select: { personaId: true, cargoId: true },
      })) as { personaId: string; cargoId: string }[]

      // Personas sin ocupación vigente restante → inactivas
      const personaIdsEliminadas = [...new Set(ocupsEliminadas.map((o) => o.personaId))]
      const conOcupVigente = (await tx.ocupacion.findMany({
        where: { personaId: { in: personaIdsEliminadas }, hasta: null },
        select: { personaId: true },
      })) as { personaId: string }[]
      const conVigenteSet = new Set(conOcupVigente.map((o) => o.personaId))
      const aInactivar = personaIdsEliminadas.filter((pid) => !conVigenteSet.has(pid))
      for (const lote of chunk(aInactivar, 2000)) {
        await tx.persona.updateMany({ where: { id: { in: lote } }, data: { activo: false } })
      }

      // Cargos sin ocupación vigente restante → validacion_vacante + estadoDesde
      const cargoIdsEliminados = [...new Set(ocupsEliminadas.map((o) => o.cargoId))]
      const cargosConVigente = (await tx.ocupacion.findMany({
        where: { cargoId: { in: cargoIdsEliminados }, hasta: null },
        select: { cargoId: true },
      })) as { cargoId: string }[]
      const cargosConVigenteSet = new Set(cargosConVigente.map((o) => o.cargoId))
      const cargosAValidacion = cargoIdsEliminados.filter((cid) => !cargosConVigenteSet.has(cid))
      // S17-3: cargos sin ocupación vigente — antes de poner validacion_vacante,
      // buscar bajas confirmadas para esos cargos. Si existe una, vincularla
      // automáticamente y saltear validacion_vacante (el cargo ya está definido).
      const bajasConfirmadas = (await tx.baja.findMany({
        where: {
          cargoId: { in: cargosAValidacion },
          estado: 'confirmada',
          snapshotVinculadoId: null,
        },
        select: { id: true, cargoId: true },
      })) as { id: string; cargoId: string }[]
      const cargosBajaConfirmadaSet = new Set(bajasConfirmadas.map((b) => b.cargoId))

      // Vincular bajas existentes al snapshot actual
      if (bajasConfirmadas.length > 0) {
        await tx.baja.updateMany({
          where: { id: { in: bajasConfirmadas.map((b) => b.id) } },
          data: { padronVinculadoAt: new Date(), snapshotVinculadoId: snapshot.id },
        })
      }

      // Solo van a validacion_vacante los cargos SIN baja confirmada previa
      const cargosRealmenteAValidacion = cargosAValidacion.filter(
        (cid) => !cargosBajaConfirmadaSet.has(cid),
      )
      for (const lote of chunk(cargosRealmenteAValidacion, 2000)) {
        await tx.cargo.updateMany({
          where: { id: { in: lote } },
          data: { estado: 'validacion_vacante', estadoDesde: fechaPadron },
        })
      }
    }

    // ── 6. Modificados: sigue siendo por fila (cada una cambia campos
    //       distintos), pero sin el find extra — usa la precarga del paso 1 ─
    for (const { idSialRol, cambios } of modificados) {
      const updateCargo: Record<string, string | null> = {}
      const updateOcupacion: Record<string, string | Date | null> = {}
      for (const cambio of cambios) {
        if (!cambio.campo) continue
        if (cambio.campo === 'baja_previa') continue // marcador de lectura; no escribe
        // Un 'completado:<col>' es una escritura real (completa un campo vacío):
        // se normaliza al campo real para que fluya igual que un modificado.
        const campoReal = stripCompletado(cambio.campo)
        const mappedCargo = CAMPOS_CARGO[campoReal]
        const mappedOcupacion = CAMPOS_OCUPACION[campoReal]
        if (mappedCargo) updateCargo[mappedCargo] = cambio.valorNuevo ?? ''
        if (mappedOcupacion) {
          const esFecha = campoReal === 'cargo_desde' || campoReal === 'cargo_hasta'
          updateOcupacion[mappedOcupacion] = esFecha
            ? (parseFechaDDMMYYYY(cambio.valorNuevo ?? '') ?? null)
            : (cambio.valorNuevo ?? '')
        }
      }

      const ocupExistente = ocupacionExistenteMap.get(idSialRol)
      // Bug A: id de especialidad ya resuelto por el Dotaneitor para esta fila
      // (marcador __especialidad_puesto_id__). null si la fila no lo trae
      // (sin cambio de especialidad/puesto/carrera, o snapshot viejo) -> el
      // helper cae al fallback por texto (comportamiento actual).
      const idDotaEsp =
        cambios.find((c) => c.campo === '__especialidad_puesto_id__')?.valorNuevo ?? null
      if (ocupExistente && Object.keys(updateCargo).length > 0) {
        // Si cambió el código de registro, resolver el id de la relación
        // (normaliza el prefijo 'completado:' igual que el resto, DECISIÓN 1)
        const crCambio = cambios.find(
          (c) => c.campo && stripCompletado(c.campo) === 'codigo_de_registro',
        )
        if (crCambio?.valorNuevo) {
          let cr = codigoRegistroCache.get(crCambio.valorNuevo)
          if (!cr) {
            // Buscar en BD (puede existir de una carga anterior)
            const found = (await tx.codigoRegistro.findUnique({
              where: { codigo: crCambio.valorNuevo },
            })) as { id: string; codigo: string } | null
            if (found) {
              codigoRegistroCache.set(found.codigo, found)
              cr = found
            }
          }
          if (cr) updateCargo['codigoRegistroId'] = cr.id
          delete updateCargo['codigo_de_registro']

          // Régimen (FEAT-003): al cambiar el CR, el régimen se re-deriva
          // SIEMPRE. crCambio.valorNuevo es ya el CÓDIGO string del CR nuevo.
          // Se lee el literal del cargo de forma INCONDICIONAL (puede hacer
          // falta aunque no haya reclasificación de carrera), y se prefiere el
          // literal entrante del update si vino en este snapshot.
          const crCodigoNuevo = crCambio.valorNuevo
          const cargoLitU = (await tx.cargo.findUnique({
            where: { id: ocupExistente.cargoId },
            select: { literalPuesto: true },
          })) as { literalPuesto: string | null } | null
          const litEfectivo =
            (updateCargo['literalPuesto'] as string | null) ?? cargoLitU?.literalPuesto ?? null
          const decisionRegU = derivarRegimenId(crCodigoNuevo, litEfectivo, regimenCtx)
          updateCargo['regimenId'] = decisionRegU.regimenId
          if (decisionRegU.regimenId === null && decisionRegU.revision) {
            // Marca de revisión ADITIVA: no pisa un motivo de CR ya seteado ni
            // limpia una revisión preexistente; concatena con ' | ', truncado.
            // revisionDato es boolean en el modelo; el Record es string|null,
            // así que se escribe vía cast (Prisma acepta el boolean en runtime).
            ;(updateCargo as Record<string, unknown>)['revisionDato'] = true
            const motivoPrevio = (updateCargo['revisionMotivo'] as string | null) ?? null
            updateCargo['revisionMotivo'] = (
              motivoPrevio
                ? `${motivoPrevio} | ${decisionRegU.revision.motivo}`
                : decisionRegU.revision.motivo
            ).slice(0, 200)
          }

          // RECLASIFICACIÓN DE CARRERA: el código de registro MANDA sobre la
          // carrera (escalafón). Si el nuevo cod. registro pertenece a un
          // escalafón distinto del que tiene el cargo, el cargo cambió de
          // carrera (ej. suplente de guardia que pasa a CPH — caso Giordano,
          // oct-2026). Hay que re-resolver escalafón + puesto + especialidad en
          // la carrera nueva y regenerar el código con el prefijo correcto; si
          // no, el cargo queda clasificado en la carrera vieja y no aparece en
          // los filtros/listados de su carrera real.
          const escDestino = escalafonPorCodRegCache.get(crCambio.valorNuevo)
          if (escDestino) {
            const cargoActual = (await tx.cargo.findUnique({
              where: { id: ocupExistente.cargoId },
              select: {
                escalafonId: true,
                literalPuesto: true,
                unificadorPuesto: true,
                especialidadLegacy: true,
              },
            })) as {
              escalafonId: string
              literalPuesto: string | null
              unificadorPuesto: string | null
              especialidadLegacy: string | null
            } | null
            if (cargoActual && cargoActual.escalafonId !== escDestino.id) {
              const litNuevo = (updateCargo['literalPuesto'] ?? cargoActual.literalPuesto) || null
              const unifNuevo =
                (updateCargo['unificadorPuesto'] ?? cargoActual.unificadorPuesto) || null
              const espNuevo =
                (updateCargo['especialidadLegacy'] ?? cargoActual.especialidadLegacy) || null
              const puesto = await resolverPuestoCargoId(tx, catalogoPuestos, {
                escalafonId: escDestino.id,
                literalPuesto: litNuevo,
                unificadorPuesto: unifNuevo,
              })
              // Bug A: preferir el id del Dotaneitor si cuelga del puesto DESTINO;
              // si no valida, cae al fallback por texto (resolución actual).
              const espId = await especialidadPuestoIdFinal(
                tx,
                catalogoPuestos,
                puesto.id,
                idDotaEsp,
                espNuevo,
                puesto.nombre,
                idSialRol,
              )
              const prefijoNuevo = prefijoDeCargo({
                escalafon: escDestino.nombre,
                unificadorPuesto: unifNuevo,
                agrupador: null,
                puestoCargo: puesto,
              })
              const codigoNuevo = await siguienteCodigoCargo(prefijoNuevo, tx)
              updateCargo['escalafonId'] = escDestino.id
              updateCargo['puestoCargoId'] = puesto.id
              updateCargo['especialidadPuestoId'] = espId
              updateCargo['codigo'] = codigoNuevo
            }
          }
        }
        // Si el padrón cambió la especialidad (especialidad_legacy), re-resolver
        // también la FK estructurada especialidad_puesto_id contra el catálogo
        // del puesto. Regla de negocio: la ÚLTIMA especialidad del SIAL manda, y
        // la vista/filtros usan la FK, no el texto legacy. Sin esto, el legacy
        // cambiaba pero la FK quedaba congelada en la especialidad vieja (bug
        // detectado en oct-2026, caso Psicopedagogo/Vilariño). La resolución
        // aplica las equivalencias de fusión (ver resolverEspecialidadPuestoId),
        // así no reintroduce variantes ya fusionadas (Pediatria/Psicologia).
        // Nota: si hubo reclasificación de carrera arriba, ya se resolvió
        // especialidadPuestoId en la carrera nueva — no re-resolver acá (lo
        // haría con el puesto viejo). Solo corre cuando NO se reclasificó.
        if (
          Object.prototype.hasOwnProperty.call(updateCargo, 'especialidadLegacy') &&
          !Object.prototype.hasOwnProperty.call(updateCargo, 'escalafonId')
        ) {
          // "vacío = conservar". El placeholder "SIN ESPECIALIDAD" del SIAL se
          // trata igual que vacío (especialidadSialReal -> null), así no dispara
          // el re-resolve ni pisa la especialidad vigente con basura.
          const espLegacyNueva = especialidadSialReal(
            (updateCargo['especialidadLegacy'] ?? '').trim(),
          )
          // Regla de negocio (Jorge, oct-2026): "vacío = conservar". Si el
          // padrón trae la especialidad VACÍA para un cargo que ya tenía una, NO
          // se re-resuelve (se conserva la anterior). Así CPH no pierde su
          // especialidad cuando una carga del SIAL viene sin ese dato (típico en
          // jefaturas y en cargas parciales) — el objetivo es cada vez MENOS
          // especialidades vacías. Solo se re-resuelve cuando el SIAL trae una
          // especialidad no vacía (esa manda).
          if (espLegacyNueva) {
            const cargoActual = (await tx.cargo.findUnique({
              where: { id: ocupExistente.cargoId },
              select: { puestoCargoId: true },
            })) as { puestoCargoId: string | null } | null
            if (cargoActual?.puestoCargoId) {
              const puestoInfo = [...catalogoPuestos.puestos.values()].find(
                (p) => p.id === cargoActual.puestoCargoId,
              )
              // Bug A: dentro de la guardia `if (espLegacyNueva)` (vacío = conservar
              // intacto), preferir el id del Dotaneitor validado; si no, fallback
              // por texto. Corrige el caso Sargenti (el id de cirugía plástica se
              // usa en vez de re-resolver el texto a bioquímica) sin romper Vilariño.
              const espResuelta = await especialidadPuestoIdFinal(
                tx,
                catalogoPuestos,
                cargoActual.puestoCargoId,
                idDotaEsp,
                espLegacyNueva,
                puestoInfo?.nombre ?? null,
                idSialRol,
              )
              // Si resolvió a algo, actualizar la FK; si por lo que sea no
              // resolvió (null), NO pisar la especialidad vigente con null.
              if (espResuelta) updateCargo['especialidadPuestoId'] = espResuelta
            }
          }
          // Nota: aunque especialidad_legacy se actualice a vacío (snapshot del
          // SIAL tal cual llegó), la FK especialidad_puesto_id NO se toca cuando
          // viene vacía — se conserva.
        }

        // Re-resolver el PUESTO cuando el literal del SIAL cambió DENTRO de la
        // misma carrera (sin reclasificación de escalafón). Regla de negocio
        // (Jorge, oct-2026): si el literal_puesto cambia (ej. "Psicologo de
        // Planta" -> "Bioquimico de Planta", caso Lombardo), la FK
        // puesto_cargo_id quedaba congelada en el puesto viejo mientras el texto
        // sí se actualizaba — los filtros/vista usan la FK, así que el cargo
        // aparecía en el puesto equivocado. Acá se re-apunta la FK al puesto que
        // corresponde al nuevo literal, y se re-resuelve la especialidad bajo
        // ese puesto. Si hubo reclasificación de carrera arriba, NO corre (ya se
        // resolvió puestoCargoId con el escalafón destino).
        if (
          Object.prototype.hasOwnProperty.call(updateCargo, 'literalPuesto') &&
          !Object.prototype.hasOwnProperty.call(updateCargo, 'escalafonId') &&
          !Object.prototype.hasOwnProperty.call(updateCargo, 'puestoCargoId')
        ) {
          const litNuevo = ((updateCargo['literalPuesto'] as string | null) ?? '').trim()
          if (litNuevo) {
            const cargoActualP = (await tx.cargo.findUnique({
              where: { id: ocupExistente.cargoId },
              select: {
                escalafonId: true,
                puestoCargoId: true,
                unificadorPuesto: true,
                codigoRegistro: { select: { codigo: true } },
              },
            })) as {
              escalafonId: string
              puestoCargoId: string | null
              unificadorPuesto: string | null
              codigoRegistro: { codigo: string } | null
            } | null
            if (cargoActualP) {
              // Régimen (FEAT-003): el régimen puede cambiar por el nuevo literal
              // aunque el CR no cambie (ej. CR 85 que pasa de 'auxiliar de
              // enfermeria' a otro literal). Se re-deriva y se setea FUERA de la
              // guarda de reasignación de puesto. Marca de revisión aditiva.
              const decisionRegU = derivarRegimenId(
                cargoActualP.codigoRegistro?.codigo ?? null,
                litNuevo,
                regimenCtx,
              )
              updateCargo['regimenId'] = decisionRegU.regimenId
              if (decisionRegU.regimenId === null && decisionRegU.revision) {
                ;(updateCargo as Record<string, unknown>)['revisionDato'] = true
                const motivoPrevio = (updateCargo['revisionMotivo'] as string | null) ?? null
                updateCargo['revisionMotivo'] = (
                  motivoPrevio
                    ? `${motivoPrevio} | ${decisionRegU.revision.motivo}`
                    : decisionRegU.revision.motivo
                ).slice(0, 200)
              }
              const unif =
                ((updateCargo['unificadorPuesto'] as string | null) ??
                  cargoActualP.unificadorPuesto) ||
                null
              const puestoReResuelto = await resolverPuestoCargoId(tx, catalogoPuestos, {
                escalafonId: cargoActualP.escalafonId,
                literalPuesto: litNuevo,
                unificadorPuesto: unif,
              })
              // Solo si el puesto REALMENTE cambió (evita reasignar entre
              // duplicados homónimos y escribir de más).
              if (puestoReResuelto.id !== cargoActualP.puestoCargoId) {
                updateCargo['puestoCargoId'] = puestoReResuelto.id
                // Re-resolver la especialidad bajo el nuevo puesto, con la misma
                // cascada: SIAL si trae valor real, si no se conserva/deriva.
                const espSial = especialidadSialReal(
                  (updateCargo['especialidadLegacy'] as string | null) ?? null,
                )
                // Bug A: preferir el id del Dotaneitor si cuelga del puesto NUEVO;
                // si no valida, fallback por texto (resolución actual).
                const espReResuelta = await especialidadPuestoIdFinal(
                  tx,
                  catalogoPuestos,
                  puestoReResuelto.id,
                  idDotaEsp,
                  espSial,
                  puestoReResuelto.nombre,
                  idSialRol,
                )
                // Si no resolvió (null), queda sin especialidad en el nuevo
                // puesto — es correcto (no hay dónde reubicar la anterior).
                updateCargo['especialidadPuestoId'] = espReResuelta
              }
            }
          }
        }

        await tx.cargo.update({ where: { id: ocupExistente.cargoId }, data: updateCargo })
      }
      if (Object.keys(updateOcupacion).length > 0) {
        await tx.ocupacion.updateMany({ where: { idSialRol }, data: updateOcupacion })
      }

      // Reapertura (fix del bug de inactivación errónea): el cargo aparece en el
      // padrón pero su ocupación estaba cerrada. Se reabre (hasta=NULL), se
      // reactiva a la persona y el cargo vuelve a 'vigente'. Sin esto, un rol
      // que reaparece quedaba cerrado para siempre y su persona inactiva.
      const reabrir = cambios.some((c) => c.campo === '__reabrir_ocupacion__')
      if (reabrir && ocupExistente) {
        await tx.ocupacion.updateMany({
          where: { idSialRol, hasta: { not: null } },
          data: { hasta: null },
        })
        await tx.cargo.update({
          where: { id: ocupExistente.cargoId },
          data: { estado: 'vigente', estadoDesde: null },
        })
        const ocupPersona = (await tx.ocupacion.findFirst({
          where: { idSialRol },
          select: { personaId: true },
        })) as { personaId: string } | null
        if (ocupPersona) {
          await tx.persona.update({
            where: { id: ocupPersona.personaId },
            data: { activo: true },
          })
        }
      }
    }

    // ── 6b. Actualizar especialidad_cph para personas nuevas y existentes
    //        que aparecen en este padrón — desde ref_especialidades_cuil ────
    const cuilsEnEstePadron = [
      ...new Set(
        [...nuevos, ...rechazados]
          .map((n) => cuilDe(n.datos))
          .filter((v): v is string => Boolean(v)),
      ),
    ]
    if (cuilsEnEstePadron.length > 0) {
      for (const lote of chunk(cuilsEnEstePadron, 1000)) {
        await tx.$executeRaw`
          UPDATE personas p
          SET especialidad_cph = ec.especialidad, updated_at = now()
          FROM (
            SELECT DISTINCT ON (cuil) cuil, especialidad
            FROM (
              SELECT cuil, especialidad, count(*) AS freq,
                CASE WHEN especialidad = 'Sin Especialidad' THEN 1 ELSE 0 END AS es_sin_esp
              FROM ref_especialidades_cuil
              WHERE tipo = 'cph' AND cuil = ANY(${lote})
              GROUP BY cuil, especialidad
            ) ranked
            ORDER BY cuil, es_sin_esp ASC, freq DESC
          ) ec
          WHERE p.cuil = ec.cuil
            AND p.especialidad_cph IS DISTINCT FROM ec.especialidad
            AND NOT (ec.especialidad = 'Sin Especialidad' AND p.especialidad_cph IS NOT NULL)
        `
      }
    }

    // ── 6c. A21-18: match diferido CUIL→persona (Orden de Mérito + inscriptos).
    //       Los integrantes de OM e inscriptos a concurso son datos externos que
    //       pueden cargarse por CUIL antes de que la persona exista en el padrón
    //       (ver Doc/Referencias/DOTANEITOR_DECISIONES.md §9.12). Cuando ese CUIL
    //       entra al padrón (aparece acá), se vincula personaId automáticamente.
    //       Idempotente: solo toca filas con persona_id NULL. El CUIL de OM/
    //       inscripto puede venir con o sin guiones — se normaliza a 11 dígitos
    //       en el join (regexp_replace) contra personas.cuil (ya son 11 dígitos).
    if (cuilsEnEstePadron.length > 0) {
      for (const lote of chunk(cuilsEnEstePadron, 1000)) {
        // Orden de Mérito
        await tx.$executeRaw`
          UPDATE orden_merito_integrantes omi
          SET persona_id = p.id
          FROM personas p
          WHERE omi.persona_id IS NULL
            AND p.cuil = ANY(${lote})
            AND regexp_replace(omi.cuil, '\D', '', 'g') = p.cuil
        `
        // Inscriptos a concurso
        await tx.$executeRaw`
          UPDATE inscriptos_concurso ic
          SET persona_id = p.id
          FROM personas p
          WHERE ic.persona_id IS NULL
            AND ic.cuil IS NOT NULL
            AND p.cuil = ANY(${lote})
            AND regexp_replace(ic.cuil, '\D', '', 'g') = p.cuil
        `
      }
    }

    // ── 6d. Normalización de cargos FANTASMA de jefatura ───────────────────
    // El SIAL crea un cargo fantasma de jefatura: mismo ocupante, mismo puesto
    // de CONDUCCIÓN (literal_puesto), que llega ACTIVO pero SIN código de
    // jefatura (J Cat vacío), duplicando al cargo REAL (que sí tiene J Cat).
    // El import normal lo crea/reabre como vigente (no mira J Cat), así que sin
    // esta pasada el fantasma reaparecería vigente en cada import (caso
    // Charabora/Hernandez/Merino, oct-2026). Se corre AL FINAL del aprobar,
    // dentro de la misma transacción e idempotente: cualquier cargo de
    // conducción vigente con J Cat vacío cuyo ocupante tiene un cargo hermano
    // vigente del mismo literal CON J Cat se marca no_vigente y se cierra su
    // ocupación. Así el histórico (paso 7) y el KPI (paso 8) ya no lo cuentan.
    // La exclusión en las vistas (dotacion/kpis EXCLUIR_ESPEJO_JEFATURA) es la
    // segunda línea de defensa; esto limpia el dato en origen.
    await tx.$executeRaw`
      WITH fantasmas AS (
        SELECT c.id AS cargo_id, o.id AS ocupacion_id
        FROM cargos c
        JOIN ocupaciones o ON o.cargo_id = c.id AND o.hasta IS NULL
        JOIN puestos_cargo pc ON pc.id = c.puesto_cargo_id
        WHERE c.estado = 'vigente'
          AND pc.tipo_puesto = 'conduccion'
          AND (o.codigo_jefaturas IS NULL OR TRIM(o.codigo_jefaturas) IN ('', '0'))
          AND EXISTS (
            SELECT 1
            FROM ocupaciones oj
            JOIN cargos cj ON cj.id = oj.cargo_id
            WHERE oj.persona_id = o.persona_id
              AND oj.hasta IS NULL
              AND cj.estado = 'vigente'
              AND cj.id <> c.id
              AND coalesce(cj.literal_puesto,'') = coalesce(c.literal_puesto,'')
              AND oj.codigo_jefaturas IS NOT NULL
              AND TRIM(oj.codigo_jefaturas) NOT IN ('', '0')
          )
      ),
      cerrar_ocup AS (
        UPDATE ocupaciones o
        SET hasta = ${snapshot.fechaAsignada}, updated_at = now()
        FROM fantasmas f
        WHERE o.id = f.ocupacion_id
        RETURNING o.cargo_id
      )
      UPDATE cargos c
      SET estado = 'no_vigente', estado_desde = ${snapshot.fechaAsignada}, updated_at = now()
      FROM fantasmas f
      WHERE c.id = f.cargo_id
    `

    // ── 7. Histórico: una sola lectura en bloque del estado final de todas
    //       las ocupaciones tocadas, y un createMany en vez de un create por
    //       fila ────────────────────────────────────────────────────────────
    const ocupacionesFinales = (await tx.ocupacion.findMany({
      where: { idSialRol: { in: todosLosIdSialRol } },
      include: { persona: true, cargo: { include: { hospital: true, escalafon: true } } },
    })) as OcupacionFinalRow[]
    const historicoEntries = ocupacionesFinales.map((ocupacion) => ({
      id: randomUUID(),
      snapshotId: id,
      fechaAsignada: snapshot.fechaAsignada,
      personaId: ocupacion.personaId,
      cargoId: ocupacion.cargoId,
      idSialRol: ocupacion.idSialRol,
      cuil: ocupacion.persona.cuil,
      escalafon: ocupacion.cargo.escalafon.nombre,
      hospitalSigla: ocupacion.cargo.hospital.sigla,
      literalPuesto: ocupacion.cargo.literalPuesto,
      especialidad: ocupacion.cargo.especialidadLegacy ?? null,
      agrupador: ocupacion.cargo.agrupador,
      unificadorPuesto: ocupacion.cargo.unificadorPuesto,
      estadoPersona: ocupacion.estadoPersona,
      situacionRevista: ocupacion.situacionRevista,
    }))
    for (const lote of chunk(historicoEntries, 2000)) {
      await tx.padronHistorico.createMany({ data: lote })
    }

    // ── 8. Resumen KPI: motor unificado (por código de registro × situación) ─
    // Antes esto era un round-trip json_to_recordset sobre ocupaciones vivas
    // agrupado por escalafón. Ahora es un INSERT ... SELECT puro desde
    // padron_historico al corte de este snapshot, reusando el MISMO generador
    // estadoActivoAcumuladoSql que la consulta individual (kpis.service), para
    // que tarjetas, consulta individual y backfill reconcilien por construcción.
    //
    // Se marca el snapshot como aprobado ANTES del populate: estadoActivoAcumuladoSql
    // filtra padron_snapshots.estado='aprobado' al calcular el corte del mes, así
    // que este snapshot debe contar como aprobado para que su propia foto entre.
    // Está dentro del mismo $transaction: si el populate falla, hace rollback de
    // la aprobación completa.
    await tx.padronSnapshot.update({
      where: { id },
      data: { estado: 'aprobado', aprobadoPorId: usuarioId, aprobadoAt: new Date() },
    })

    const mesSnapshot = snapshot.fechaAsignada.toISOString().slice(0, 7) // YYYY-MM

    // Borra TODAS las filas del mes (incluida la fila '(total)') antes de
    // reinsertar, para que "el último padrón del mes pise al anterior" y la PK
    // (fecha, codigo_registro, situacion_revista) no choque.
    await tx.$executeRaw(
      Prisma.sql`
        DELETE FROM kpis_dotacion_snapshot
        WHERE date_trunc('month', fecha) = date_trunc('month', ${snapshot.fechaAsignada}::date)
      `,
    )

    // Filas por (codigo, estado) — series NO disjuntas, count(DISTINCT cuil) —
    // + la fila reservada '(total)' por carrera (count(DISTINCT cuil) de la
    // carrera en cualquier estado, NO la suma de los estados). El estado sale de
    // estadoActivoAcumuladoSql(mes, mes), misma fuente que la consulta individual.
    await tx.$executeRaw(
      Prisma.sql`
        INSERT INTO kpis_dotacion_snapshot (fecha, codigo_registro, situacion_revista, personas)
        WITH estado AS (${estadoActivoAcumuladoSql(mesSnapshot, mesSnapshot)}),
        norm AS (
          SELECT
            p.cuil,
            coalesce(cr.codigo, '(sin codigo)') AS codigo,
            coalesce(lower(unaccent(trim(estado.situacion_revista))), '(sin dato)') AS sit
          FROM estado
          JOIN cargos c ON c.id = estado.cargo_id
          LEFT JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
          JOIN personas p ON p.id = estado.persona_id
          WHERE p.cuil IS NOT NULL
        )
        SELECT ${snapshot.fechaAsignada}::date, codigo, sit, count(DISTINCT cuil)::int
          FROM norm GROUP BY codigo, sit
        UNION ALL
        SELECT ${snapshot.fechaAsignada}::date, codigo, '(total)', count(DISTINCT cuil)::int
          FROM norm GROUP BY codigo
      `,
    )

    // ── 9. Sincronizar universo_totalizador en organigramas desde hospitales ─
    // Cada aprobación de padrón puede traer hospitales nuevos o actualizados
    // (tipo/universo). Se actualiza organigramas cruzando por sigla para que
    // el organigrama de Nivel Central / APS / Hospitales siempre refleje la
    // info vigente sin intervención manual.
    await tx.$executeRaw`
      UPDATE organigramas o
      SET universo_totalizador = h.universo_totalizador
      FROM hospitales h
      WHERE h.sigla = o.sigla
        AND h.universo_totalizador IS NOT NULL
        AND (o.universo_totalizador IS DISTINCT FROM h.universo_totalizador)
    `

    // ── 10. Reactivar personas con ocupación vigente ───────────────────────
    // Invariante de negocio: una persona con al menos una ocupación vigente
    // (hasta IS NULL) NO puede estar inactiva. El paso 5 solo inactiva (nunca
    // reactiva) y las altas del paso 3 usan skipDuplicates (no tocan el flag
    // de una persona ya existente), así que un REINGRESO (persona dada de baja
    // que vuelve a aparecer con un cargo nuevo) quedaba inactiva con cargo
    // activo. Este paso cierra ese hueco de forma idempotente: al final de cada
    // aprobación, cualquier persona inactiva que tenga una ocupación vigente
    // vuelve a activo=true. Corre después de crear altas y de procesar bajas.
    await tx.$executeRaw`
      UPDATE personas p
      SET activo = true
      WHERE p.activo = false
        AND EXISTS (
          SELECT 1 FROM ocupaciones o
          WHERE o.persona_id = p.id AND o.hasta IS NULL
        )
    `

    // Nota: el snapshot se marcó como 'aprobado' en el paso 8 (el populate de
    // KPIs lo requiere para que su propia foto entre en estadoActivoAcumuladoSql).
  }, TRANSACTION_OPTS)

  return { ok: true, snapshotId: id }
}

// ─── Conteos de campos modificados para sub-tabs ────────────────────────────
export async function getCamposModificadosService(snapshotId: string) {
  await getSnapshotOrThrow(snapshotId)
  const rows = await prisma.padronDiff.groupBy({
    by: ['campo'],
    where: {
      snapshotId,
      tipo: 'modificado',
      // Excluir completados y los marcadores __reabrir_ocupacion__ /
      // __especialidad_puesto_id__ de las sub-tabs de Modificados (Prisma rechaza
      // dos claves `campo` en el mismo objeto).
      AND: [
        { campo: { not: null } },
        { campo: { not: { startsWith: 'completado:' } } },
        { campo: { not: '__reabrir_ocupacion__' } },
        { campo: { not: '__especialidad_puesto_id__' } },
      ],
    },
    _count: { campo: true },
    orderBy: { _count: { campo: 'desc' } },
  })
  return rows.map((r) => ({ campo: r.campo as string, cantidad: r._count.campo }))
}

// ─── Diagnóstico: analizar diffs nuevos pendientes vs cargos existentes ─────
export async function diagnosticarDiffsNuevosService(snapshotId: string) {
  await getSnapshotOrThrow(snapshotId)

  const diffs = await prisma.padronDiff.findMany({
    where: { snapshotId, tipo: 'nuevo' },
    select: { id: true, idSialRol: true, valorNuevo: true },
  })

  const parsed = diffs.map((d) => {
    const datos = JSON.parse(d.valorNuevo ?? '{}')
    const cuil = cuilDe(datos)
    return {
      diffId: d.id,
      idSialRol: d.idSialRol,
      idSial: datos.id_sial as string | undefined,
      cuil,
      ayn: datos.ayn as string | undefined,
      siglas: datos.siglas as string | undefined,
      escalafon: datos.escalafon as string | undefined,
      literalPuesto: datos.literal_puesto as string | undefined,
      codigoDeRegistro: datos.codigo_de_registro as string | undefined,
    }
  })

  const idSials = parsed.map((p) => p.idSial).filter((v): v is string => Boolean(v))
  const cuils = parsed.map((p) => p.cuil).filter((v): v is string => Boolean(v))
  const siglas = [...new Set(parsed.map((p) => p.siglas).filter((v): v is string => Boolean(v)))]
  const codRegs = [
    ...new Set(parsed.map((p) => p.codigoDeRegistro).filter((v): v is string => Boolean(v))),
  ]
  const escNames = [
    ...new Set(parsed.map((p) => p.escalafon).filter((v): v is string => Boolean(v))),
  ]

  const [cargosExistentes, personasExistentes, hospitalesLookup, codRegsLookup, escalafonesLookup] =
    await Promise.all([
      prisma.cargo.findMany({
        where: { idSial: { in: idSials } },
        select: { idSial: true, estado: true, codigo: true },
      }),
      prisma.persona.findMany({ where: { cuil: { in: cuils } }, select: { cuil: true } }),
      prisma.hospital.findMany({
        where: { sigla: { in: siglas } },
        select: { id: true, sigla: true },
      }),
      prisma.codigoRegistro.findMany({
        where: { codigo: { in: codRegs } },
        select: { codigo: true, escalafonId: true },
      }),
      prisma.escalafon.findMany({
        where: { nombre: { in: escNames }, activo: true },
        select: { id: true, nombre: true },
      }),
    ])

  const cargoMap = new Map(cargosExistentes.map((c) => [c.idSial, c]))
  const personaSet = new Set(personasExistentes.map((p) => p.cuil))
  const hospitalMap = new Map(hospitalesLookup.map((h) => [h.sigla, h.id]))
  const codRegEscMap = new Map(codRegsLookup.map((cr) => [cr.codigo, cr.escalafonId]))
  const escNombreMap = new Map(escalafonesLookup.map((e) => [e.nombre, e.id]))
  // S20-9: catálogo puesto/especialidad — usado para resolver puestoCargoId
  // por escalafón+literal_puesto, solo lectura (diagnóstico, no auto-crea).
  const catalogoPuestosDiag = await cargarCatalogoPuestos(prisma)

  function puestoCargoIdDe(
    escalafonId: string | undefined,
    literalPuesto: string | undefined,
  ): string | undefined {
    if (!escalafonId || !literalPuesto) return undefined
    return catalogoPuestosDiag.puestos.get(`${escalafonId}:${normPuestoKey(literalPuesto)}`)?.id
  }

  // Buscar concursos CPH abiertos por clave estructural (hospital + escalafon + puesto)
  // para cada diff nuevo — un query por lote en vez de uno por fila.
  // Clave: hospitalId:escalafonId:puestoCargoId (FK real, S20-9)
  const clavesConcurso: { hospitalId: string; escalafonId: string; puestoCargoId: string }[] = []
  for (const p of parsed) {
    const hospitalId = p.siglas ? hospitalMap.get(p.siglas) : undefined
    // Ver nota de S20-6 sobre el bug '' && x — mismo fix acá.
    const escalafonId =
      (p.codigoDeRegistro ? codRegEscMap.get(p.codigoDeRegistro) : undefined) ??
      (p.escalafon ? escNombreMap.get(p.escalafon) : undefined)
    const puestoCargoId = puestoCargoIdDe(escalafonId, p.literalPuesto)
    if (hospitalId && escalafonId && puestoCargoId) {
      clavesConcurso.push({ hospitalId, escalafonId, puestoCargoId })
    }
  }

  // Traer todos los cargos vigentes con concurso abierto que matcheen alguna clave
  const concursosCandidatos =
    clavesConcurso.length > 0
      ? await prisma.concursoCph.findMany({
          where: {
            estado: { not: 'finalizado' },
            suspendido: false,
            cargo: {
              estado: 'vigente',
              hospitalId: { in: [...new Set(clavesConcurso.map((c) => c.hospitalId))] },
              escalafonId: { in: [...new Set(clavesConcurso.map((c) => c.escalafonId))] },
            },
          },
          select: {
            id: true,
            estado: true,
            cargo: {
              select: {
                id: true,
                hospitalId: true,
                escalafonId: true,
                puestoCargoId: true,
                codigo: true,
              },
            },
            concurso: { select: { id: true } },
          },
        })
      : []

  // Índice: hospitalId:escalafonId:puestoCargoId → concursoCph
  type ConcursoInfo = {
    concursoCphId: string
    concursoCodigo: string | null
    estadoConcurso: string
  }
  const concursoMap = new Map<string, ConcursoInfo>()
  for (const cc of concursosCandidatos) {
    const key = `${cc.cargo.hospitalId}:${cc.cargo.escalafonId}:${cc.cargo.puestoCargoId}`
    if (!concursoMap.has(key)) {
      concursoMap.set(key, {
        concursoCphId: cc.id,
        concursoCodigo: cc.cargo.codigo,
        estadoConcurso: cc.estado,
      })
    }
  }

  const resultado = parsed.map((p) => {
    const cargo = p.idSial ? cargoMap.get(p.idSial) : undefined
    const personaExiste = p.cuil ? personaSet.has(p.cuil) : false
    const clasificacion = cargo ? 'falso_nuevo' : personaExiste ? 'nuevo_rol' : 'nuevo_de_0'

    // Buscar concurso abierto por clave estructural
    const hospitalId = p.siglas ? hospitalMap.get(p.siglas) : undefined
    const escalafonId =
      (p.codigoDeRegistro ? codRegEscMap.get(p.codigoDeRegistro) : undefined) ??
      (p.escalafon ? escNombreMap.get(p.escalafon) : undefined)
    const puestoCargoId = puestoCargoIdDe(escalafonId, p.literalPuesto)
    const concursoKey =
      hospitalId && escalafonId && puestoCargoId
        ? `${hospitalId}:${escalafonId}:${puestoCargoId}`
        : null
    const concursoAbierto = concursoKey ? concursoMap.get(concursoKey) : undefined

    return {
      idSialRol: p.idSialRol,
      idSial: p.idSial,
      cuil: p.cuil,
      ayn: p.ayn,
      clasificacion,
      estadoCargo: cargo?.estado ?? null,
      codigoCargo: cargo?.codigo ?? null,
      // Concurso CPH abierto que matchea estructuralmente con este diff
      concursoCphId: concursoAbierto?.concursoCphId ?? null,
      concursoCodigo: concursoAbierto?.concursoCodigo ?? null,
      estadoConcurso: concursoAbierto?.estadoConcurso ?? null,
    }
  })

  const resumen = {
    total: resultado.length,
    falsosNuevos: resultado.filter((r) => r.clasificacion === 'falso_nuevo').length,
    nuevosRol: resultado.filter((r) => r.clasificacion === 'nuevo_rol').length,
    nuevosDe0: resultado.filter((r) => r.clasificacion === 'nuevo_de_0').length,
    conConcursoAbierto: resultado.filter((r) => r.concursoCphId !== null).length,
    porEstadoCargo: Object.entries(
      resultado
        .filter((r) => r.estadoCargo)
        .reduce(
          (acc, r) => {
            acc[r.estadoCargo!] = (acc[r.estadoCargo!] ?? 0) + 1
            return acc
          },
          {} as Record<string, number>,
        ),
    ).map(([estado, cantidad]) => ({ estado, cantidad })),
  }

  return { resumen, detalle: resultado }
}

// ─── Preview de validaciones: qué concursos quedarían validados ─────────────
// Al subir un padrón, muestra los diffs "nuevo" pendientes cuyo cargo triangula
// con un concurso CPH que tiene persona del orden de mérito reservada/designada,
// cruzando CUIL (persona del concurso vs persona del diff), escalafón (carrera)
// y especialidad. Es la base del flujo semi-automático: el operador ve la
// sugerencia y valida al aprobar+vincular el diff. No muta nada.
const normalizarEsp = (s: string | null | undefined): string =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const soloDigitos = (s: string | null | undefined): string => (s ?? '').replace(/\D/g, '')

// Fila de concurso usada para cruzar contra el padrón por CUIL del designado.
// Incluye lo necesario para calcular `validable` (carrera + especialidad) y
// para ocupar/vincular el cargo del concurso.
const CONCURSO_INDEX_SELECT = {
  id: true,
  validado: true,
  especialidadSolicitada: true,
  designadoRefCuil: true,
  designadoRefIdSialRol: true,
  concurso: {
    select: {
      cargo: {
        select: { id: true, codigo: true, idSial: true, escalafonId: true },
      },
    },
  },
  personaDesignada: { select: { cuil: true, apellidoNombre: true } },
  inscriptoReservado: { select: { cuil: true, apellido: true, nombre: true } },
} satisfies Prisma.ConcursoCphSelect

export type ConcursoIndexRow = Prisma.ConcursoCphGetPayload<{ select: typeof CONCURSO_INDEX_SELECT }>

// Construye el índice de concursos por CUIL (normalizado a dígitos) del
// designado. Prioridad al insertar en el Map: persona designada > inscripto
// reservado > referencia manual (designadoRefCuil) — cada fuente sólo se
// escribe si no hay ya una entrada para ese CUIL (la de mayor prioridad gana).
//
// `where` lo decide el caller porque difiere entre usos:
//  - Preview (getValidacionesPreviewService): mantiene su filtro histórico
//    (estado != 'finalizado', suspendido=false, con persona del OM).
//  - Enganche automático del Paso 2 (loop masivo): NO filtra por estado — un
//    designado queda `finalizado` (regla n-designado ⇒ finalizado), así que
//    ese filtro excluiría justo a los designados. Filtra validado=false e
//    incluye designadoRefCuil en el OR para enganchar cargas manuales.
async function resolverConcursoDesignadoPorCuil(
  where: Prisma.ConcursoCphWhereInput,
): Promise<Map<string, ConcursoIndexRow>> {
  const concursos = await prisma.concursoCph.findMany({
    where,
    select: CONCURSO_INDEX_SELECT,
  })

  const concursoPorCuil = new Map<string, ConcursoIndexRow>()
  for (const cc of concursos) {
    const cuilDesig = soloDigitos(cc.personaDesignada?.cuil)
    if (cuilDesig && !concursoPorCuil.has(cuilDesig)) concursoPorCuil.set(cuilDesig, cc)
  }
  for (const cc of concursos) {
    const cuilInscr = soloDigitos(cc.inscriptoReservado?.cuil)
    if (cuilInscr && !concursoPorCuil.has(cuilInscr)) concursoPorCuil.set(cuilInscr, cc)
  }
  for (const cc of concursos) {
    const cuilRef = soloDigitos(cc.designadoRefCuil)
    if (cuilRef && !concursoPorCuil.has(cuilRef)) concursoPorCuil.set(cuilRef, cc)
  }
  return concursoPorCuil
}

// Decide si un diff del padrón es "validable" contra un concurso designado:
// coincide la carrera (escalafón) Y la especialidad. Pura y testeable — se usa
// tanto en el preview como en el enganche automático del Paso 2.
export function esValidableContraConcurso(args: {
  escalafonDiffId: string | null
  especialidadDiff: string | null | undefined
  escalafonConcursoId: string | null | undefined
  especialidadConcurso: string | null | undefined
}): { carreraCoincide: boolean; especialidadCoincide: boolean; validable: boolean } {
  const carreraCoincide =
    !!args.escalafonDiffId && args.escalafonDiffId === (args.escalafonConcursoId ?? null)
  const especialidadCoincide =
    !!args.especialidadDiff &&
    !!args.especialidadConcurso &&
    normalizarEsp(args.especialidadDiff) === normalizarEsp(args.especialidadConcurso)
  return { carreraCoincide, especialidadCoincide, validable: carreraCoincide && especialidadCoincide }
}

// Extrae los campos de calcConcursoCph() de una fila completa de ConcursoCph —
// espejo de toCalcInput() de concursos-cph.service, replicado acá para no
// acoplar el módulo padrón al service de concursos (el calc en sí es puro).
function toCalcInputPadron(
  row: Prisma.ConcursoCphGetPayload<Record<string, never>>,
): ConcursoCphCalcInput {
  return {
    suspendido: row.suspendido,
    eeBaja: row.eeBaja,
    fechaBaja: row.fechaBaja,
    eeConcurso: row.eeConcurso,
    fechaEeConcurso: row.fechaEeConcurso,
    fechaAutorizacion: row.fechaAutorizacion,
    sorteoJurado: row.sorteoJurado,
    disposicion: row.disposicion,
    fechaInscDesde: row.fechaInscDesde,
    fechaInscHasta: row.fechaInscHasta,
    inscripcionCerrada: row.inscripcionCerrada,
    ordenMeritoConfirmado: row.ordenMeritoConfirmado,
    fechaExamen: row.fechaExamen,
    fechaOrdenMerito: row.fechaOrdenMerito,
    fechaIfacs: row.fechaIfacs,
    fechaInsal: row.fechaInsal,
    eeDesignacion: row.eeDesignacion,
    cargaDocumentacion: row.cargaDocumentacion,
    fechaAptoMedico: row.fechaAptoMedico,
    fechaIte: row.fechaIte,
    proyectoResolucion: row.proyectoResolucion,
    resoALaFirma: row.resoALaFirma,
    resolucionDesignacion: row.resolucionDesignacion,
    fechaResolucion: row.fechaResolucion,
    cargoSial: row.cargoSial,
    dispoDesierta: row.dispoDesierta,
    fechaDispoDesierta: row.fechaDispoDesierta,
    validado: row.validado,
    validadoIdSialRol: row.validadoIdSialRol,
  }
}

export async function getValidacionesPreviewService(snapshotId: string) {
  await getSnapshotOrThrow(snapshotId)

  // Solo diffs nuevos pendientes (aprobado=null) — los ya aprobados/rechazados
  // no aplican al preview de "lo que pasará al aprobar".
  const diffs = await prisma.padronDiff.findMany({
    where: { snapshotId, tipo: 'nuevo', aprobado: null },
    select: { id: true, idSialRol: true, valorNuevo: true },
  })

  const parsed = diffs.map((d) => {
    const datos = JSON.parse(d.valorNuevo ?? '{}')
    return {
      diffId: d.id,
      idSialRol: d.idSialRol,
      idSial: datos.id_sial as string | undefined,
      cuil: cuilDe(datos), // 11 dígitos
      ayn: datos.ayn as string | undefined,
      siglas: datos.siglas as string | undefined,
      escalafon: datos.escalafon as string | undefined,
      especialidad: datos.especialidad as string | undefined,
      codigoDeRegistro: datos.codigo_de_registro as string | undefined,
    }
  })

  const cuils = [...new Set(parsed.map((p) => p.cuil).filter((v): v is string => Boolean(v)))]
  const codRegs = [
    ...new Set(parsed.map((p) => p.codigoDeRegistro).filter((v): v is string => Boolean(v))),
  ]
  const escNames = [
    ...new Set(parsed.map((p) => p.escalafon).filter((v): v is string => Boolean(v))),
  ]

  if (cuils.length === 0) return { resumen: { total: 0, validables: 0 }, detalle: [] }

  const [codRegsLookup, escalafonesLookup] = await Promise.all([
    prisma.codigoRegistro.findMany({
      where: { codigo: { in: codRegs } },
      select: { codigo: true, escalafonId: true },
    }),
    prisma.escalafon.findMany({
      where: { nombre: { in: escNames }, activo: true },
      select: { id: true, nombre: true },
    }),
  ])
  const codRegEscMap = new Map(codRegsLookup.map((cr) => [cr.codigo, cr.escalafonId]))
  const escNombreMap = new Map(escalafonesLookup.map((e) => [e.nombre, e.id]))

  // Concursos abiertos con persona del orden de mérito (reservada o designada).
  // Índice de concursos por CUIL (normalizado a dígitos). WHERE histórico del
  // preview (distinto del que usa el enganche automático del Paso 2).
  const concursoPorCuil = await resolverConcursoDesignadoPorCuil({
    estado: { not: 'finalizado' },
    suspendido: false,
    OR: [{ inscriptoReservadoId: { not: null } }, { personaDesignadaId: { not: null } }],
  })

  const detalle = parsed
    .map((p) => {
      if (!p.cuil) return null
      const cc = concursoPorCuil.get(p.cuil)
      if (!cc) return null

      const escalafonDiff =
        (p.codigoDeRegistro ? codRegEscMap.get(p.codigoDeRegistro) : undefined) ??
        (p.escalafon ? escNombreMap.get(p.escalafon) : undefined) ??
        null
      const { carreraCoincide, especialidadCoincide } = esValidableContraConcurso({
        escalafonDiffId: escalafonDiff,
        especialidadDiff: p.especialidad,
        escalafonConcursoId: cc.concurso?.cargo?.escalafonId ?? null,
        especialidadConcurso: cc.especialidadSolicitada,
      })

      const nombre =
        cc.personaDesignada?.apellidoNombre ??
        (cc.inscriptoReservado
          ? `${cc.inscriptoReservado.apellido}, ${cc.inscriptoReservado.nombre}`
          : '')

      return {
        diffId: p.diffId,
        idSialRol: p.idSialRol,
        idSial: p.idSial ?? null,
        cuil: p.cuil,
        concursoCphId: cc.id,
        concursoCodigo: cc.concurso?.cargo?.codigo ?? null,
        personaNombre: nombre,
        especialidadDiff: p.especialidad ?? null,
        especialidadConcurso: cc.especialidadSolicitada ?? null,
        carreraCoincide,
        especialidadCoincide,
        // "Validable": el cruce por CUIL ya matcheó; para el flujo semi-automático
        // se sugiere validar cuando además coincide carrera Y especialidad.
        validable: carreraCoincide && especialidadCoincide,
        yaValidado: cc.validado,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  return {
    resumen: {
      total: detalle.length,
      validables: detalle.filter((d) => d.validable && !d.yaValidado).length,
    },
    detalle,
  }
}

// ─── Aprobar todos los diffs nuevos pendientes en bloque ───────────────────

// S21: progreso de "Aprobar todos" en memoria, por snapshot. El loop de
// aprobación puede tardar minutos (miles de diffs, una transacción por diff),
// así que corre en BACKGROUND y la UI hace polling de este estado en vez de
// esperar una request síncrona gigante (que se cortaba por duración). Se pierde
// si el proceso reinicia — aceptable: lo ya aprobado queda en la BD (cada diff
// en su propia tx) y "Aprobar todos" es reejecutable (idempotente sobre los que
// quedan pendientes).
export interface AprobacionProgreso {
  estado: 'procesando' | 'completado' | 'error'
  total: number
  procesados: number
  aprobados: number
  fallidos: Array<{ diffId: string; cargo: string; motivo: string }>
  iniciadoAt: number
  finalizadoAt: number | null
}

const aprobacionEnCurso = new Map<string, AprobacionProgreso>()

export function getAprobacionProgreso(snapshotId: string): AprobacionProgreso | null {
  return aprobacionEnCurso.get(snapshotId) ?? null
}

// Lanza la aprobación de todos los diffs "nuevo" pendientes EN BACKGROUND.
// Devuelve enseguida el total a procesar; el avance se consulta con
// getAprobacionProgreso (endpoint /aprobacion-progreso). Si ya hay una
// aprobación en curso para ese snapshot, no arranca otra.
export async function aprobarTodosDiffsPendientesService(snapshotId: string, usuarioId: string) {
  const snapshot = await getSnapshotOrThrow(snapshotId)
  if (snapshot.estado !== 'pendiente')
    throw AppError.conflict(`El snapshot ya está ${snapshot.estado}`)

  const enCurso = aprobacionEnCurso.get(snapshotId)
  if (enCurso && enCurso.estado === 'procesando') {
    return { ok: true, yaEnCurso: true, total: enCurso.total, procesados: enCurso.procesados }
  }

  const pendientes = await prisma.padronDiff.findMany({
    where: { snapshotId, tipo: 'nuevo', aprobado: null },
    select: { id: true, idSialRol: true, campo: true, valorNuevo: true },
  })
  if (pendientes.length === 0) return { ok: true, total: 0, procesados: 0 }

  // ── Paso 2: enganche automático padrón → concurso designado ───────────────
  // Antes del loop (una sola vez, no por diff) armamos el índice de concursos
  // designados por CUIL y los lookups de escalafón para decidir `validable`.
  // Para cada diff se resuelve `vincularConcursoId` SOLO si el match es validable
  // (CUIL + carrera + especialidad). Un match no validable (o sin concurso) deja
  // `vincularConcursoId` undefined → camino normal (comportamiento actual intacto).
  const parsedPendientes = pendientes.map((d) => {
    const datos: Record<string, string> = JSON.parse(d.valorNuevo ?? '{}')
    return {
      diffId: d.id,
      campo: d.campo,
      idSialRol: d.idSialRol,
      cuil: cuilDe(datos),
      escalafon: datos.escalafon as string | undefined,
      especialidad: datos.especialidad as string | undefined,
      codigoDeRegistro: datos.codigo_de_registro as string | undefined,
    }
  })

  const concursoPorCuil = await resolverConcursoDesignadoPorCuil({
    suspendido: false,
    validado: false,
    OR: [
      { personaDesignadaId: { not: null } },
      { inscriptoReservadoId: { not: null } },
      { designadoRefCuil: { not: null } },
    ],
  })

  // Índice por id_sial_rol tipeado manualmente (match directo, prioridad superior).
  const concursoPorIdSialRol = new Map<string, ConcursoIndexRow>()
  for (const cc of concursoPorCuil.values()) {
    if (cc.designadoRefIdSialRol && !concursoPorIdSialRol.has(cc.designadoRefIdSialRol)) {
      concursoPorIdSialRol.set(cc.designadoRefIdSialRol, cc)
    }
  }

  const codRegs = [
    ...new Set(parsedPendientes.map((p) => p.codigoDeRegistro).filter((v): v is string => !!v)),
  ]
  const escNames = [
    ...new Set(parsedPendientes.map((p) => p.escalafon).filter((v): v is string => !!v)),
  ]
  const [codRegsLookup, escalafonesLookup] = await Promise.all([
    prisma.codigoRegistro.findMany({
      where: { codigo: { in: codRegs } },
      select: { codigo: true, escalafonId: true },
    }),
    prisma.escalafon.findMany({
      where: { nombre: { in: escNames }, activo: true },
      select: { id: true, nombre: true },
    }),
  ])
  const codRegEscMap = new Map(codRegsLookup.map((cr) => [cr.codigo, cr.escalafonId]))
  const escNombreMap = new Map(escalafonesLookup.map((e) => [e.nombre, e.id]))

  // Resuelve el concurso a vincular para un diff, o undefined si no engancha.
  const resolverVinculo = (p: (typeof parsedPendientes)[number]): string | undefined => {
    // Los desdoblados 24/07 se materializan por el camino dedicado del snapshot;
    // no se enganchan acá (aprobarDiffNuevoService los rechaza igual).
    if (p.campo === '__alta_desdoblada__') return undefined
    // 1) Match directo por id_sial_rol tipeado manualmente (prioridad superior).
    const porId = concursoPorIdSialRol.get(p.idSialRol)
    // 2) Match por CUIL del designado.
    const porCuil = p.cuil ? concursoPorCuil.get(soloDigitos(p.cuil)) : undefined
    const cc = porId ?? porCuil
    if (!cc) return undefined
    const escalafonDiffId =
      (p.codigoDeRegistro ? codRegEscMap.get(p.codigoDeRegistro) : undefined) ??
      (p.escalafon ? escNombreMap.get(p.escalafon) : undefined) ??
      null
    const { validable } = esValidableContraConcurso({
      escalafonDiffId,
      especialidadDiff: p.especialidad,
      escalafonConcursoId: cc.concurso?.cargo?.escalafonId ?? null,
      especialidadConcurso: cc.especialidadSolicitada,
    })
    // Guarda: sólo enganchar si el match es confiable (CUIL + carrera +
    // especialidad). Los no-validables quedan para la decisión manual existente.
    return validable ? cc.id : undefined
  }
  const vinculoPorDiff = new Map<string, string | undefined>()
  for (const p of parsedPendientes) vinculoPorDiff.set(p.diffId, resolverVinculo(p))

  const progreso: AprobacionProgreso = {
    estado: 'procesando',
    total: pendientes.length,
    procesados: 0,
    aprobados: 0,
    fallidos: [],
    iniciadoAt: Date.now(),
    finalizadoAt: null,
  }
  aprobacionEnCurso.set(snapshotId, progreso)

  // Background — no await. Procesa cada diff en su propia transacción
  // (aprobarDiffNuevoService) de forma INDEPENDIENTE: un cargo problemático se
  // registra en `fallidos` y el loop sigue con el resto (hallazgo 2026-09-14).
  void (async () => {
    for (const diff of pendientes) {
      try {
        await aprobarDiffNuevoService(snapshotId, diff.id, usuarioId, vinculoPorDiff.get(diff.id))
        progreso.aprobados++
      } catch (err) {
        progreso.fallidos.push({
          diffId: diff.id,
          cargo: diff.idSialRol,
          motivo:
            err instanceof AppError
              ? err.message
              : err instanceof Error
                ? err.message
                : String(err),
        })
      }
      progreso.procesados++
    }
    progreso.estado = 'completado'
    progreso.finalizadoAt = Date.now()
  })().catch((err) => {
    progreso.estado = 'error'
    progreso.finalizadoAt = Date.now()
    console.error(`[padron] aprobar-todos error snapshot=${snapshotId}:`, err)
  })

  // 202: aceptado, procesando en background.
  return { ok: true, total: pendientes.length, procesados: 0 }
}

// ─── Aprobar un diff nuevo individual ───────────────────────────────────────

export async function aprobarDiffNuevoService(
  snapshotId: string,
  diffId: string,
  usuarioId: string,
  vincularConcursoId?: string,
) {
  const diff = await prisma.padronDiff.findUnique({ where: { id: diffId } })
  if (!diff || diff.snapshotId !== snapshotId) throw AppError.notFound('Diff no encontrado')
  if (diff.tipo !== 'nuevo') throw AppError.badRequest('Solo se pueden aprobar diffs de tipo nuevo')
  // Guard desdoblado (§4.5): un alta 24/07 se auto-aprueba por carrera y se
  // materializa SOLO al aprobar el snapshot completo (aprobarSnapshotService),
  // que crea el cargo 1:1 (id_sial NULL, correlativo, especialidad estricta).
  // Resolver este diff de a uno por datos.id_sial (el del titular) recrearía el
  // cargo compartido. Por eso se bloquea. marcarTransferenciaService y
  // aprobar-todos lo heredan al delegar en esta función.
  if (diff.campo === '__alta_desdoblada__')
    throw AppError.badRequest(
      'Un alta desdoblada (Residencias 24 / Docentes 07) no se aprueba, rechaza ni transfiere individualmente; se materializa al aprobar el snapshot completo',
    )
  if (diff.aprobado === true) throw AppError.conflict('Este diff ya fue aprobado')

  const datos: Record<string, string> = JSON.parse(diff.valorNuevo ?? '{}')

  await prisma.$transaction(async (tx: PrismaTx) => {
    // Resolver hospital y escalafón
    const sigla = datos.siglas ?? ''
    let hospital = (await tx.hospital.findUnique({ where: { sigla } })) as HospitalRow | null
    if (!hospital) {
      hospital = (await tx.hospital.create({
        data: { sigla, nombre: sigla, tipo: datos.tipo_hospital_sigla || null },
      })) as HospitalRow
    }

    let escalafon: EscalafonRow | null = null
    if (datos.codigo_de_registro) {
      const cr = (await tx.codigoRegistro.findUnique({
        where: { codigo: datos.codigo_de_registro },
        include: { escalafon: true },
      })) as { escalafon: EscalafonRow } | null
      escalafon = cr?.escalafon ?? null
    }
    if (!escalafon && datos.escalafon) {
      escalafon = (await tx.escalafon.findFirst({
        where: { nombre: datos.escalafon, activo: true },
      })) as EscalafonRow | null
    }
    // Fallback de raíz: el código de registro puede existir como `codigo` de un
    // ESCALAFÓN aunque falte la fila en `codigos_registro` (ej. '16T' = Plantas
    // Transitorias Modulo Operativo). El padrón a veces trae el nombre de
    // escalafón corrupto ('??????????') pero el código sí es válido; usamos el
    // escalafón que comparte ese código antes de rendirnos.
    if (!escalafon && datos.codigo_de_registro) {
      escalafon = (await tx.escalafon.findFirst({
        where: { codigo: datos.codigo_de_registro, activo: true },
      })) as EscalafonRow | null
    }
    if (!escalafon)
      throw AppError.badRequest(
        `Escalafón no encontrado para este cargo (${datos.escalafon ?? ''})`,
      )

    // Resolver CodigoRegistro
    let codigoRegistroId: string | null = null
    if (datos.codigo_de_registro) {
      const cr = await tx.codigoRegistro.findUnique({ where: { codigo: datos.codigo_de_registro } })
      codigoRegistroId = cr?.id ?? null
    }

    // Crear o recuperar persona
    const cuil = cuilDe(datos)
    let persona: PersonaRow | null = null
    if (cuil) {
      persona = (await tx.persona.findUnique({ where: { cuil } })) as PersonaRow | null
      if (!persona) {
        persona = (await tx.persona.create({
          data: {
            cuil,
            apellidoNombre: datos.ayn ?? '',
            numeroDoc: datos.numero_doc || null,
            tipoDoc: datos.tipo_doc || null,
            sexo: datos.sexo || null,
            fechaNacimiento: parseFechaDDMMYYYY(datos.fecha_nacimiento),
            antiguedadDesde: parseFechaDDMMYYYY(datos.antiguedad),
            telefono: datos.telefono || null,
            mailPersonal: datos.mail_personal || null,
            mailLaboral: datos.mail_laboral || null,
            domicilio: datos.domicilio || null,
            localidad: datos.localidad || null,
            provincia: datos.provincia || null,
          },
        })) as PersonaRow
        // Poblar especialidad_cph desde ref_especialidades_cuil
        await tx.$executeRaw`
          UPDATE personas p
          SET especialidad_cph = ec.especialidad, updated_at = now()
          FROM (
            SELECT DISTINCT ON (cuil) cuil, especialidad
            FROM (
              SELECT cuil, especialidad, count(*) AS freq,
                CASE WHEN especialidad = 'Sin Especialidad' THEN 1 ELSE 0 END AS es_sin_esp
              FROM ref_especialidades_cuil
              WHERE tipo = 'cph' AND cuil = ${cuil}
              GROUP BY cuil, especialidad
            ) ranked
            ORDER BY cuil, es_sin_esp ASC, freq DESC
          ) ec
          WHERE p.cuil = ec.cuil
        `
      }
    }

    // Si hay concurso a vincular, usar el cargo del concurso directamente
    // (no crear uno nuevo — el cargo ya existe y tiene código asignado)
    let cargo: CargoRow | null = null
    if (vincularConcursoId) {
      const concurso = (await tx.concursoCph.findUnique({
        where: { id: vincularConcursoId },
        select: { cargo: { select: { id: true, idSial: true, estado: true } } },
      })) as { cargo: CargoRow } | null
      if (concurso?.cargo) {
        cargo = concurso.cargo
        // Paso 2 — ocupar el cargo del concurso: idSial real del padrón +
        // estado vigente + sub_estado 'ocupado' (invariante del backfill:
        // ocupado = vigente + ocupación viva). Incondicional: el designado que
        // aparece en el padrón ocupa el cargo aunque ya estuviera vigente.
        await tx.cargo.update({
          where: { id: cargo.id },
          data: {
            idSial: datos.id_sial,
            estado: 'vigente',
            subEstado: 'ocupado',
            estadoDesde: new Date(),
          },
        })
        cargo = { ...cargo, idSial: datos.id_sial, estado: 'vigente' }
      }
    }

    // Si no hay concurso, buscar por idSial exacto (fuente de verdad del padrón)
    if (!cargo) {
      cargo = datos.id_sial
        ? ((await tx.cargo.findUnique({ where: { idSial: datos.id_sial } })) as CargoRow | null)
        : null
    }

    if (cargo) {
      if (cargo.estado === 'no_vigente' || cargo.estado === 'validacion_vacante') {
        await tx.cargo.update({
          where: { id: cargo.id },
          data: { estado: 'vigente', estadoDesde: null },
        })
      }
    }

    // S24-6: antes de crear un cargo nuevo, si la ocupación es de jefatura y hay
    // un cargo de conducción VACANTE del organigrama en ese codigo_repa, cubrirlo
    // en vez de duplicar (mismo helper que aprobarSnapshotService).
    if (!cargo && datos.id_sial) {
      const cargoVinculadoId = await reconciliarCargoConduccionVacante(tx, {
        codigoRepa: datos.codigo_repa,
        codigoJefaturas: datos.codigo_jefaturas,
        idSial: datos.id_sial,
        escalafonId: escalafon.id,
        literalPuesto: datos.literal_puesto,
        especialidadLegacy: datos.especialidad,
        codigoRegistroId,
      })
      if (cargoVinculadoId) {
        cargo = (await tx.cargo.findUnique({ where: { id: cargoVinculadoId } })) as CargoRow | null
      }
    }

    if (!cargo && datos.id_sial) {
      const catalogoPuestos = await cargarCatalogoPuestos(tx)
      const puestoResuelto = await resolverPuestoCargoId(tx, catalogoPuestos, {
        escalafonId: escalafon.id,
        literalPuesto: datos.literal_puesto ?? null,
        unificadorPuesto: datos.unificador_de_puestos ?? null,
      })
      // Bug A: alta — preferir el especialidad_puesto_id del Dotaneitor si valida.
      const especialidadResuelta = await especialidadPuestoIdFinal(
        tx,
        catalogoPuestos,
        puestoResuelto.id,
        datos.especialidad_puesto_id ?? null,
        datos.especialidad ?? null,
        puestoResuelto.nombre,
        datos.id_sial,
      )
      const prefijo = prefijoDeCargo({
        escalafon: escalafon.nombre ?? null,
        unificadorPuesto: datos.unificador_de_puestos ?? null,
        agrupador: datos.agrupador ?? null,
        puestoCargo: puestoResuelto,
      })
      const siguiente = (await maxSecuencialCargo(prefijo, tx)) + 1
      const codigo = `${prefijo}-${String(siguiente).padStart(6, '0')}`

      cargo = (await tx.cargo.create({
        data: {
          idSial: datos.id_sial,
          codigo,
          hospitalId: hospital.id,
          escalafonId: escalafon.id,
          puestoCargoId: puestoResuelto.id,
          especialidadPuestoId: especialidadResuelta,
          codigoRegistroId,
          literalPuesto: datos.literal_puesto ?? null,
          especialidadLegacy: datos.especialidad ?? null,
          agrupador: datos.agrupador ?? null,
          unificadorPuesto: datos.unificador_de_puestos ?? null,
          regimen: datos.regimen || null,
          codigoRepa: datos.codigo_repa || null,
          descripcionRepa: datos.descripcion_repa || null,
          agrupamiento: datos.agrupamiento || null,
          createdById: usuarioId,
        },
      })) as CargoRow
    }

    // Paso 2 — reconciliación de la ocupación MANUAL. Si el cargo del concurso
    // ya tiene una ocupación viva sintética (idSialRol LIKE 'MANUAL-{cargo8}-%'),
    // creada por la designación manual antes de que el padrón trajera a la
    // persona, se ACTUALIZA su idSialRol al real del padrón en vez de crear otra
    // (evita violar Ocupacion.idSialRol @unique y duplicar). Sólo en la rama de
    // vínculo a concurso y sólo si no hay ya una ocupación con el idSialRol real
    // (idempotencia ante reejecución de "aprobar todos").
    if (vincularConcursoId && persona && cargo) {
      const yaReconciliada = await tx.ocupacion.findUnique({
        where: { idSialRol: diff.idSialRol },
      })
      if (!yaReconciliada) {
        const ocupManual = await tx.ocupacion.findFirst({
          where: {
            cargoId: cargo.id,
            hasta: null,
            idSialRol: { startsWith: `MANUAL-${cargo.id.slice(0, 8)}-` },
          },
        })
        if (ocupManual) {
          await tx.ocupacion.update({
            where: { id: ocupManual.id },
            data: {
              idSialRol: diff.idSialRol,
              personaId: persona.id,
              cuil: cuilDe(datos),
              situacionRevista: datos.situacion_de_revista ?? null,
              estadoPersona: datos.estado ?? null,
              snapshotId,
            },
          })
        }
      }
    }

    // Crear ocupación si no existe
    if (persona && cargo) {
      const ocupExistente = await tx.ocupacion.findUnique({ where: { idSialRol: diff.idSialRol } })
      if (!ocupExistente) {
        await tx.ocupacion.create({
          data: {
            personaId: persona.id,
            cargoId: cargo.id,
            idSialRol: diff.idSialRol,
            cuil: cuilDe(datos),
            situacionRevista: datos.situacion_de_revista ?? null,
            estadoPersona: datos.estado ?? null,
            codigoJefaturas: datos.codigo_jefaturas || null,
            cargoJefaturaPuestoId: datos.cargo_jefatura_puesto_id || null,
            jefeEscalafon: datos.jefe_escalafon || null,
            comision: datos.comision || null,
            repaComision: datos.repa_comision || null,
            codSituacion: datos.cod_situacion || null,
            cargoDesdeFecha: parseFechaDDMMYYYY(datos.cargo_desde),
            cargoHastaFecha: parseFechaDDMMYYYY(datos.cargo_hasta),
            snapshotId,
          },
        })
      }
    }

    // Vincular concurso CPH: si tiene resolucionDesignacion → finalizado;
    // si no → solo asignar persona designada (queda activo, pendiente de completar)
    if (vincularConcursoId && persona) {
      const concursoActual = await tx.concursoCph.findUnique({
        where: { id: vincularConcursoId },
        select: {
          resolucionDesignacion: true,
          especialidadSolicitada: true,
          validado: true,
          concurso: { select: { cargo: { select: { escalafonId: true, codigo: true } } } },
        },
      })
      const estaCompleto = !!concursoActual?.resolucionDesignacion

      // Validación (flag INDEPENDIENTE del sub-estado): el cargo del padrón
      // triangula con el concurso si coincide la carrera (escalafón) y la
      // especialidad. `escalafon` ya está resuelto arriba (del diff).
      const carreraCoincide =
        !!concursoActual?.concurso?.cargo?.escalafonId &&
        escalafon.id === concursoActual.concurso.cargo.escalafonId
      const especialidadCoincide =
        !!datos.especialidad &&
        !!concursoActual?.especialidadSolicitada &&
        datos.especialidad
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim() ===
          concursoActual.especialidadSolicitada
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim()
      const debeValidar = carreraCoincide && especialidadCoincide && !concursoActual?.validado
      const nombrePersona = datos.ayn || 'La persona'

      await tx.concursoCph.update({
        where: { id: vincularConcursoId },
        data: {
          personaDesignadaId: persona.id,
          cargoSial: datos.id_sial ?? null,
          ...(estaCompleto ? { estado: 'finalizado' } : {}),
          ...(debeValidar
            ? { validado: true, validadoAt: new Date(), validadoIdSialRol: diff.idSialRol }
            : {}),
        },
      })

      if (debeValidar) {
        // Paso 2 — recalcular el concurso tras encender `validado`. El primer
        // update escribe validado pero NO recalcula el sub-estado; con el
        // disparador por `validado` (Parte A), un concurso validado debe quedar
        // en 'o-alta sial'. Releemos la fila completa y persistimos el recálculo.
        const rowCompleta = await tx.concursoCph.findUnique({ where: { id: vincularConcursoId } })
        if (rowCompleta) {
          const calc = calcConcursoCph(toCalcInputPadron(rowCompleta))
          await tx.concursoCph.update({
            where: { id: vincularConcursoId },
            data: {
              estado: calc.estado,
              subEstado: calc.subEstado,
              subEstado3: calc.subEstado3,
            },
          })
        } else {
          // No debería ocurrir dentro de la tx; se deja el concurso validado con
          // el sub-estado viejo y se registra para diagnóstico (no bloquea el batch).
          console.warn(
            `[padron] recálculo omitido: concurso ${vincularConcursoId} no encontrado tras validar`,
          )
        }

        const cargoCodigo = concursoActual?.concurso?.cargo?.codigo ?? nombrePersona
        await crearNotificacion({
          tipo: 'autorizacion_resuelta',
          rolSlug: 'concursales_cph',
          titulo: `Concurso validado — ${cargoCodigo}`,
          mensaje: `${nombrePersona} apareció en el padrón con el rol ${diff.idSialRol}, que coincide con la carrera y especialidad del concurso. La asignación quedó validada.`,
          origenTipo: 'concurso_cph',
          origenId: vincularConcursoId,
          origenKey: `cph_validado:${vincularConcursoId}`,
        })
      }
    }

    // Marcar diff como aprobado
    await tx.padronDiff.update({ where: { id: diffId }, data: { aprobado: true } })
  }, TRANSACTION_OPTS) // timeout largo: aprobar un diff hace varias queries contra Neon y el default de 5s se queda corto (ver TRANSACTION_OPTS)

  return { ok: true, diffId }
}

// ─── Marcar un diff nuevo como transferencia de otro ministerio ─────────────
// Aprueba el cargo igual que aprobarDiffNuevoService pero además crea una
// SolicitudAlta con esTransferencia=true y estado='aprobada' para que quede
// registrada en Alta de Cargos > Transferencia.
export async function marcarTransferenciaService(
  snapshotId: string,
  diffId: string,
  usuarioId: string,
) {
  // Primero aprobar el diff normalmente (crea Cargo + Persona + Ocupacion)
  await aprobarDiffNuevoService(snapshotId, diffId, usuarioId)

  // Leer el diff para obtener los datos del cargo recién creado
  const diff = await prisma.padronDiff.findUnique({ where: { id: diffId } })
  if (!diff) throw AppError.notFound('Diff no encontrado')
  const datos: Record<string, string> = JSON.parse(diff.valorNuevo ?? '{}')

  // Resolver hospital y escalafón para la SolicitudAlta
  const sigla = datos.siglas ?? ''
  const hospital = await prisma.hospital.findUnique({ where: { sigla } })
  if (!hospital) throw AppError.notFound('Hospital no encontrado')

  let escalafon: EscalafonRow | null = null
  if (datos.codigo_de_registro) {
    const cr = (await prisma.codigoRegistro.findUnique({
      where: { codigo: datos.codigo_de_registro },
      include: { escalafon: true },
    })) as { escalafon: EscalafonRow } | null
    escalafon = cr?.escalafon ?? null
  }
  if (!escalafon && datos.escalafon) {
    escalafon = (await prisma.escalafon.findFirst({
      where: { nombre: datos.escalafon, activo: true },
    })) as EscalafonRow | null
  }
  if (!escalafon) throw AppError.badRequest(`Escalafón no encontrado (${datos.escalafon ?? ''})`)

  const catalogoPuestosTransferencia = await cargarCatalogoPuestos(prisma)
  const puestoResueltoTransferencia = await resolverPuestoCargoId(
    prisma,
    catalogoPuestosTransferencia,
    {
      escalafonId: escalafon.id,
      literalPuesto: datos.literal_puesto ?? null,
      unificadorPuesto: datos.unificador_de_puestos ?? null,
    },
  )
  // Bug A: transferencia — preferir el especialidad_puesto_id del Dotaneitor si valida.
  const especialidadResueltaTransferencia = await especialidadPuestoIdFinal(
    prisma,
    catalogoPuestosTransferencia,
    puestoResueltoTransferencia.id,
    datos.especialidad_puesto_id ?? null,
    datos.especialidad ?? null,
    puestoResueltoTransferencia.nombre,
    datos.id_sial,
  )

  // Crear SolicitudAlta como transferencia aprobada directamente
  await prisma.solicitudAlta.create({
    data: {
      hospitalId: hospital.id,
      escalafonId: escalafon.id,
      puestoCargoId: puestoResueltoTransferencia.id,
      especialidadPuestoId: especialidadResueltaTransferencia,
      literalPuesto: datos.literal_puesto ?? '',
      especialidad: datos.especialidad || null,
      agrupador: datos.agrupador || null,
      unificadorPuesto: datos.unificador_de_puestos || null,
      regimen: datos.regimen || null,
      cantidad: 1,
      esTransferencia: true,
      estado: 'aprobada',
      solicitadoPorId: usuarioId,
    },
  })

  return { ok: true, diffId }
}

// ─── Rechazar un diff nuevo individual (crea sin código de cargo) ────────────

export async function rechazarDiffNuevoService(snapshotId: string, diffId: string) {
  const diff = await prisma.padronDiff.findUnique({ where: { id: diffId } })
  if (!diff || diff.snapshotId !== snapshotId) throw AppError.notFound('Diff no encontrado')
  if (diff.tipo !== 'nuevo')
    throw AppError.badRequest('Solo se pueden rechazar diffs de tipo nuevo')
  // Guard desdoblado (§4.5): ver aprobarDiffNuevoService. Rechazar de a uno un
  // alta 24/07 resolvería por datos.id_sial (el del titular) y recrearía/
  // modificaría el cargo compartido. Se bloquea.
  if (diff.campo === '__alta_desdoblada__')
    throw AppError.badRequest(
      'Un alta desdoblada (Residencias 24 / Docentes 07) no se aprueba, rechaza ni transfiere individualmente; se materializa al aprobar el snapshot completo',
    )
  if (diff.aprobado === false) throw AppError.conflict('Este diff ya fue rechazado')

  const datos: Record<string, string> = JSON.parse(diff.valorNuevo ?? '{}')

  await prisma.$transaction(async (tx: PrismaTx) => {
    // Resolver hospital
    const sigla = datos.siglas ?? ''
    let hospital = (await tx.hospital.findUnique({ where: { sigla } })) as HospitalRow | null
    if (!hospital) {
      hospital = (await tx.hospital.create({
        data: { sigla, nombre: sigla, tipo: datos.tipo_hospital_sigla || null },
      })) as HospitalRow
    }

    // Resolver escalafón
    let escalafon: EscalafonRow | null = null
    if (datos.codigo_de_registro) {
      const cr = (await tx.codigoRegistro.findUnique({
        where: { codigo: datos.codigo_de_registro },
        include: { escalafon: true },
      })) as { escalafon: EscalafonRow } | null
      escalafon = cr?.escalafon ?? null
    }
    if (!escalafon && datos.escalafon) {
      escalafon = (await tx.escalafon.findFirst({
        where: { nombre: datos.escalafon, activo: true },
      })) as EscalafonRow | null
    }
    // Fallback de raíz: el código de registro puede existir como `codigo` de un
    // ESCALAFÓN aunque falte la fila en `codigos_registro` (ej. '16T' = Plantas
    // Transitorias Modulo Operativo). El padrón a veces trae el nombre de
    // escalafón corrupto ('??????????') pero el código sí es válido; usamos el
    // escalafón que comparte ese código antes de rendirnos.
    if (!escalafon && datos.codigo_de_registro) {
      escalafon = (await tx.escalafon.findFirst({
        where: { codigo: datos.codigo_de_registro, activo: true },
      })) as EscalafonRow | null
    }
    if (!escalafon)
      throw AppError.badRequest(
        `Escalafón no encontrado para este cargo (${datos.escalafon ?? ''})`,
      )

    let codigoRegistroId: string | null = null
    if (datos.codigo_de_registro) {
      const cr = await tx.codigoRegistro.findUnique({ where: { codigo: datos.codigo_de_registro } })
      codigoRegistroId = cr?.id ?? null
    }

    // Crear o recuperar persona
    const cuil = cuilDe(datos)
    let persona: PersonaRow | null = null
    if (cuil) {
      persona = (await tx.persona.findUnique({ where: { cuil } })) as PersonaRow | null
      if (!persona) {
        persona = (await tx.persona.create({
          data: {
            cuil,
            apellidoNombre: datos.ayn ?? '',
            numeroDoc: datos.numero_doc || null,
            tipoDoc: datos.tipo_doc || null,
            sexo: datos.sexo || null,
            fechaNacimiento: parseFechaDDMMYYYY(datos.fecha_nacimiento),
            antiguedadDesde: parseFechaDDMMYYYY(datos.antiguedad),
            telefono: datos.telefono || null,
            mailPersonal: datos.mail_personal || null,
            mailLaboral: datos.mail_laboral || null,
            domicilio: datos.domicilio || null,
            localidad: datos.localidad || null,
            provincia: datos.provincia || null,
          },
        })) as PersonaRow
      }
    }

    // Crear cargo SIN código (rechazado = sin asignar)
    let cargo: CargoRow | null = datos.id_sial
      ? ((await tx.cargo.findUnique({ where: { idSial: datos.id_sial } })) as CargoRow | null)
      : null

    if (!cargo && datos.id_sial) {
      const catalogoPuestos = await cargarCatalogoPuestos(tx)
      const puestoResuelto = await resolverPuestoCargoId(tx, catalogoPuestos, {
        escalafonId: escalafon.id,
        literalPuesto: datos.literal_puesto ?? null,
        unificadorPuesto: datos.unificador_de_puestos ?? null,
      })
      // Bug A: alta (rechazado sin código) — preferir el id del Dotaneitor si valida.
      const especialidadResuelta = await especialidadPuestoIdFinal(
        tx,
        catalogoPuestos,
        puestoResuelto.id,
        datos.especialidad_puesto_id ?? null,
        datos.especialidad ?? null,
        puestoResuelto.nombre,
        datos.id_sial,
      )
      cargo = (await tx.cargo.create({
        data: {
          idSial: datos.id_sial,
          codigo: null, // sin código — aparece como "Sin asignar" en historial
          hospitalId: hospital.id,
          escalafonId: escalafon.id,
          puestoCargoId: puestoResuelto.id,
          especialidadPuestoId: especialidadResuelta,
          codigoRegistroId,
          literalPuesto: datos.literal_puesto ?? null,
          especialidadLegacy: datos.especialidad ?? null,
          agrupador: datos.agrupador ?? null,
          unificadorPuesto: datos.unificador_de_puestos ?? null,
          regimen: datos.regimen || null,
          codigoRepa: datos.codigo_repa || null,
          descripcionRepa: datos.descripcion_repa || null,
          agrupamiento: datos.agrupamiento || null,
        },
      })) as CargoRow
    }

    // Crear ocupación si no existe
    if (persona && cargo) {
      const ocupExistente = await tx.ocupacion.findUnique({ where: { idSialRol: diff.idSialRol } })
      if (!ocupExistente) {
        await tx.ocupacion.create({
          data: {
            personaId: persona.id,
            cargoId: cargo.id,
            idSialRol: diff.idSialRol,
            cuil: cuilDe(datos),
            situacionRevista: datos.situacion_de_revista ?? null,
            estadoPersona: datos.estado ?? null,
            codigoJefaturas: datos.codigo_jefaturas || null,
            cargoJefaturaPuestoId: datos.cargo_jefatura_puesto_id || null,
            jefeEscalafon: datos.jefe_escalafon || null,
            comision: datos.comision || null,
            repaComision: datos.repa_comision || null,
            codSituacion: datos.cod_situacion || null,
            cargoDesdeFecha: parseFechaDDMMYYYY(datos.cargo_desde),
            cargoHastaFecha: parseFechaDDMMYYYY(datos.cargo_hasta),
            snapshotId,
          },
        })
      }
    }

    await tx.padronDiff.update({ where: { id: diffId }, data: { aprobado: false } })
  }, TRANSACTION_OPTS) // timeout largo: rechazar un diff hace varias queries contra Neon y el default de 5s se queda corto (ver TRANSACTION_OPTS)

  return { ok: true, diffId }
}

// ─── S8A-3: detectar conflictos validacion_vacante antes de aprobar ──────────
export async function getConflictosValidacionService(snapshotId: string) {
  const snapshot = await getSnapshotOrThrow(snapshotId)
  if (snapshot.estado !== 'pendiente') return { conflictos: [] }

  const nuevos = await prisma.padronDiff.findMany({
    where: { snapshotId, tipo: 'nuevo' },
    select: { valorNuevo: true },
  })

  const idSialsNuevos = nuevos
    .map((d) => {
      try {
        return JSON.parse(d.valorNuevo ?? '{}').id_sial as string
      } catch {
        return null
      }
    })
    .filter((v): v is string => Boolean(v))

  if (idSialsNuevos.length === 0) return { conflictos: [] }

  const cargos = await prisma.cargo.findMany({
    where: { idSial: { in: idSialsNuevos }, estado: 'validacion_vacante' },
    include: {
      hospital: { select: { sigla: true } },
      escalafon: { select: { nombre: true } },
      ocupaciones: {
        where: { hasta: { not: null } },
        include: { persona: { select: { apellidoNombre: true, cuil: true } } },
        orderBy: { hasta: 'desc' },
        take: 1,
      },
    },
  })

  const hoy = new Date()
  return {
    conflictos: cargos.map(({ ocupaciones, estadoDesde, ...c }) => ({
      cargoId: c.id,
      codigo: c.codigo,
      literalPuesto: c.literalPuesto,
      hospital: c.hospital.sigla,
      escalafon: c.escalafon.nombre,
      diasEnValidacion: estadoDesde
        ? Math.floor((hoy.getTime() - estadoDesde.getTime()) / 86_400_000)
        : null,
      ultimaPersona: ocupaciones[0]?.persona ?? null,
    })),
  }
}

// ─── exportar Excel del Dotaneitor ──────────────────────────────────────────

export async function exportarSnapshotService(id: string) {
  const snapshot = await getSnapshotOrThrow(id)
  if (!snapshot.archivoResultadoPath) {
    throw AppError.notFound('El archivo Excel no está disponible para este snapshot')
  }
  try {
    const fileStream = await python.get(`/${snapshot.archivoResultadoPath}`, {
      responseType: 'stream',
    })
    return { stream: fileStream.data as NodeJS.ReadableStream, snapshotId: id }
  } catch (err) {
    // Dotaneitor devuelve 404 si el Excel no llegó a escribirse en disco (ej.
    // exports/ no persistido entre reinicios del contenedor, o snapshot
    // aprobado antes de que /cruzar empezara a generar el archivo) — se
    // traduce a 404 propio en vez de dejar que el AxiosError tumbe la
    // request con un 500 genérico.
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      throw AppError.notFound('El archivo Excel no está disponible para este snapshot')
    }
    throw err
  }
}

// ─── borrar snapshot (solo error/rechazado) ─────────────────────────────────

export async function deleteSnapshotService(id: string) {
  const snapshot = await getSnapshotOrThrow(id)
  if (!['error', 'rechazado'].includes(snapshot.estado)) {
    throw AppError.conflict(
      `Solo se pueden eliminar snapshots en estado error o rechazado (estado actual: ${snapshot.estado})`,
    )
  }

  await prisma.$transaction(async (tx: PrismaTx) => {
    await tx.padronDiff.deleteMany({ where: { snapshotId: id } })
    await tx.padronSnapshot.delete({ where: { id } })
  })

  return { ok: true, snapshotId: id }
}

// ─── Buscar concursos CPH para vincular a un diff nuevo ────────────────────
// Pre-filtra por hospital + escalafón del diff. Acepta búsqueda libre (q)
// para afinar. Solo devuelve concursos no finalizados y no suspendidos.
export async function buscarConcursosParaDiffService(
  snapshotId: string,
  diffId: string,
  q?: string,
) {
  const diff = await prisma.padronDiff.findUnique({ where: { id: diffId } })
  if (!diff || diff.snapshotId !== snapshotId) throw AppError.notFound('Diff no encontrado')

  const datos: Record<string, string> = JSON.parse(diff.valorNuevo ?? '{}')

  // Resolver hospital y escalafón del diff para pre-filtrar
  const hospital = datos.siglas
    ? await prisma.hospital.findUnique({ where: { sigla: datos.siglas }, select: { id: true } })
    : null

  let escalafonId: string | null = null
  if (datos.codigo_de_registro) {
    const cr = await prisma.codigoRegistro.findUnique({
      where: { codigo: datos.codigo_de_registro },
      select: { escalafonId: true },
    })
    escalafonId = cr?.escalafonId ?? null
  }
  if (!escalafonId && datos.escalafon) {
    const esc = await prisma.escalafon.findFirst({
      where: { nombre: datos.escalafon, activo: true },
      select: { id: true },
    })
    escalafonId = esc?.id ?? null
  }

  // Búsqueda libre por texto en literal_puesto, hospital sigla/nombre, código cargo
  let searchIds: string[] | undefined
  if (q) {
    const like = `%${q}%`
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT cc.id
      FROM concursos_cph cc
      JOIN cargos ca ON ca.id = cc.cargo_id
      JOIN hospitales h ON h.id = cc.hospital_id
      WHERE unaccent(coalesce(ca.literal_puesto,'')) ILIKE unaccent(${like})
         OR unaccent(coalesce(h.sigla,''))           ILIKE unaccent(${like})
         OR unaccent(coalesce(h.nombre,''))          ILIKE unaccent(${like})
         OR unaccent(coalesce(ca.codigo,''))         ILIKE unaccent(${like})
         OR unaccent(coalesce(cc.ee_concurso,''))    ILIKE unaccent(${like})
    `
    searchIds = rows.map((r) => r.id)
  }

  const concursos = await prisma.concursoCph.findMany({
    where: {
      estado: { notIn: ['finalizado', 'suspendido'] },
      suspendido: false,
      ...(hospital && { hospitalId: hospital.id }),
      ...(searchIds !== undefined && { id: { in: searchIds } }),
    },
    select: {
      id: true,
      estado: true,
      resolucionDesignacion: true,
      eeConcurso: true,
      personaDesignadaId: true,
      cargo: {
        select: {
          id: true,
          codigo: true,
          literalPuesto: true,
          escalafonId: true,
          especialidadLegacy: true,
        },
      },
      hospital: { select: { sigla: true, nombre: true } },
      concurso: { select: { expediente: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 30,
  })

  // Filtrar por escalafón si se pudo resolver (post-query para no complicar el where)
  const filtrados = escalafonId
    ? concursos.filter((c) => c.cargo.escalafonId === escalafonId)
    : concursos

  return filtrados.map((c) => ({
    id: c.id,
    estado: c.estado,
    estaCompleto: !!c.resolucionDesignacion,
    yaDesignado: !!c.personaDesignadaId,
    eeConcurso: c.eeConcurso,
    expediente: c.concurso.expediente,
    codigoCargo: c.cargo.codigo,
    literalPuesto: c.cargo.literalPuesto,
    especialidad: c.cargo.especialidadLegacy,
    hospital: c.hospital.sigla,
  }))
}

// ─── S2-8: rechazar snapshot ──────────────────────────────────────────────────

export async function rechazarSnapshotService(id: string) {
  const snapshot = await getSnapshotOrThrow(id)
  if (snapshot.estado !== 'pendiente')
    throw AppError.conflict(`El snapshot ya está ${snapshot.estado}`)

  await prisma.padronSnapshot.update({
    where: { id },
    data: { estado: 'rechazado' },
  })

  return { ok: true, snapshotId: id }
}
