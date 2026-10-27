/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────────
// Carga masiva de concursos (CPH 1228 + CEETPS 393) en Neon — script de ingesta
// autocontenido. Implementa el DISEÑO/PLAN aprobados en
// .agents/tasks/carga-concursos/{DISENO,PLAN}.md (RAMA C ESTRICTA; regla de oro
// escalafonId = CR.escalafon_id; --usuario-carga obligatorio).
//
// Se corre con el runtime del backend (tsx), NO con `node -e` (cuelga en MINGW).
// Lee el Excel por buffer (fs.readFileSync + XLSX.read(buf,{type:'buffer'})) y
// termina con process.exit(0).
//
// Uso:
//   pnpm --filter @srrhh/api exec tsx --env-file=.env \
//     scripts/carga-concursos/cargar-concursos.ts --usuario-carga <uuid> [flags]
//
// Flags:
//   --usuario-carga <uuid>   OBLIGATORIO. createdById (Cargo) + registradoPorId (Concurso).
//   --dry-run                Resuelve TODO y reporta conteos SIN escribir nada.
//   --excel <ruta>           Ruta absoluta al Excel (default = ruta del repo base).
//   --solo cph|ceetps        Procesa una sola hoja (para las etapas reales por separado).
//   --help                   Imprime el uso y termina.
//
// El script NO hace backup ni borra concursos (eso lo corre Jorge por SQL).
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs'
import { PrismaClient, Prisma } from '@prisma/client'
import * as XLSX from 'xlsx'

import {
  prefijoDeCargo,
  siguienteCodigoCargo,
} from '../../src/shared/codigoCargo.js'
import {
  cargarCatalogoPuestos,
  resolverPuestoCargoId,
  resolverEspecialidadPuestoId,
  type CatalogoPuestosCache,
} from '../../src/modules/padron/resolverPuestoCargo.js'
import { calcConcursoCph } from '../../src/modules/concursos-cph/concursosCph.calc.js'
import type { ConcursoCphCalcInput } from '../../src/modules/concursos-cph/concursosCph.calc.js'
import { calcEstadoCeetps } from '../../src/modules/concursos-ceetps/concursosCeetps.calc.js'

import {
  str,
  num,
  bool,
  fecha,
  normalizarCuil,
  esDesignadoVacante,
  prefijoCeetpsPorSubCarrera,
  FECHA_CENTINELA,
  type Warnings,
} from './helpers.js'

// ─── Constantes de dominio (ids fijos verificados en QB — DISEÑO §d/§h) ──────
const EXCEL_DEFAULT =
  'c:/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Concursos/3CONCURSOS_LIMPIO_2026-10-26_v2.xlsx'

// El DISEÑO fija los CR por su UUID (CR 22 CPH `2c597732-…`; CEETPS 87/85/83),
// pero solo expone prefijos de los UUIDs. Para no hardcodear UUIDs truncados, el
// script resuelve el codigoRegistroId por el CÓDIGO canónico (22/87/85/83) contra
// la tabla codigos_registro y cachea el par {id, escalafonId}. Es equivalente y
// robusto (`codigo` es @unique), y respeta la regla de oro escalafonId = CR.escalafon_id.
const COD_CR_CPH = '22'
const COD_CR_POR_SUBCARRERA: Record<string, string> = {
  ENFERMERIA: '87',
  TECNICOS: '85',
  ANEXO2: '83',
}

// ─── Parseo de flags ─────────────────────────────────────────────────────────
interface Flags {
  dryRun: boolean
  usuarioCarga: string | null
  excel: string
  solo: 'cph' | 'ceetps' | null
  help: boolean
}

function parseFlags(argv: string[]): Flags {
  const f: Flags = { dryRun: false, usuarioCarga: null, excel: EXCEL_DEFAULT, solo: null, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') f.dryRun = true
    else if (a === '--help' || a === '-h') f.help = true
    else if (a === '--usuario-carga') f.usuarioCarga = argv[++i] ?? null
    else if (a === '--excel') f.excel = argv[++i] ?? f.excel
    else if (a === '--solo') {
      const v = (argv[++i] ?? '').toLowerCase()
      if (v !== 'cph' && v !== 'ceetps') {
        console.error(`--solo espera "cph" o "ceetps" (recibido: "${v}")`)
        process.exit(1)
      }
      f.solo = v
    } else if (a.startsWith('--')) {
      console.error(`Flag desconocido: ${a}`)
      process.exit(1)
    }
  }
  return f
}

const USO = `
Carga masiva de concursos (CPH + CEETPS) — ingesta en Neon.

Uso:
  pnpm --filter @srrhh/api exec tsx --env-file=.env \\
    scripts/carga-concursos/cargar-concursos.ts --usuario-carga <uuid> [flags]

Flags:
  --usuario-carga <uuid>   OBLIGATORIO. Usuario activo (createdById / registradoPorId).
  --dry-run                Resuelve todo y reporta conteos SIN escribir nada.
  --excel <ruta>           Ruta absoluta al Excel (default repo base).
  --solo cph|ceetps        Procesa una sola hoja.
  --help                   Muestra esta ayuda.

Ejemplo DRY-RUN:
  pnpm --filter @srrhh/api exec tsx --env-file=.env \\
    scripts/carga-concursos/cargar-concursos.ts --dry-run --usuario-carga <uuid>
`

// ─── Tipos auxiliares ────────────────────────────────────────────────────────
export type Fila = Record<string, unknown>
type Tx = Prisma.TransactionClient

export interface CrInfo {
  id: string
  escalafonId: string
  escalafonNombre: string
}

export interface Caches {
  catalogo: CatalogoPuestosCache
  hospitalesPorSigla: Map<string, string> // sigla normalizada → hospitalId
  crCph: CrInfo
  crPorSubCarrera: Record<string, CrInfo>
}

// Reporte agregado (dry-run y real emiten lo mismo).
interface Reporte {
  totalFilas: number
  vinculanCargo: number // Paso G: designado activo → reusa cargo existente
  creanCargo: number
  designadosYaActivos: number
  designadosExternos: number // CUIL válido sin persona en padrón
  sinHospital: Array<{ hoja: string; fila: number; sigla: string | null }>
  warnings: Array<{ hoja: string; fila: number; msgs: string[] }>
  discrepanciaSubestado: Array<{ fila: number; etapaExcel: string; subEstadoRecalc: string }>
  revisarManual: number // filas 74–87 (CPH) con outlier sin celda ubicada
  errorInsert: Array<{ hoja: string; fila: number; error: string }>
  insertados: number
}

function nuevoReporte(): Reporte {
  return {
    totalFilas: 0,
    vinculanCargo: 0,
    creanCargo: 0,
    designadosYaActivos: 0,
    designadosExternos: 0,
    sinHospital: [],
    warnings: [],
    discrepanciaSubestado: [],
    revisarManual: 0,
    errorInsert: [],
    insertados: 0,
  }
}

// Filas CPH 74–87 (0-based de la hoja) = outlier "Revisar manual" (DISEÑO §e).
const REVISAR_MANUAL_DESDE = 74
const REVISAR_MANUAL_HASTA = 87

// ─── Normalización de sigla ────────────────────────────────────────────────
const normSigla = (s: string | null | undefined) => (s ?? '').trim().toUpperCase()

// ─── Aislamiento del catálogo por transacción de fila ────────────────────────
// BUG (dry-run CEETPS): el catálogo de puestos se construye UNA vez al arranque,
// fuera de toda transacción, y se procesa UNA transacción por fila. Cuando una
// fila auto-crea un PuestoCargo, resolverPuestoCargoId() lo inserta con `tx`
// (correcto) PERO además lo cachea en memoria (`cache.puestos.set`). En dry-run
// la transacción hace rollback: el INSERT se descarta, pero la entrada queda en
// el cache compartido. La siguiente fila con el MISMO puesto lo encuentra en el
// cache ("existente"), devuelve ese id YA REVERTIDO y lo pasa a cargo.create →
// viola cargos_puesto_cargo_id_fkey. CEETPS lo dispara en masa porque sus ~393
// filas comparten pocos nombres de puesto; CPH tiene la misma falla latente.
//
// El pipeline real (aprobarSnapshotService, padron.service.ts ~1798) no la sufre
// porque arma el cache DENTRO del mismo $transaction que crea todos los cargos:
// una sola tx, un solo cache, y lo creado es visible SOLO si la tx commitea.
//
// Fix que respeta el diseño per-fila: clonar el cache ANTES de la tx de cada
// fila, mutar el CLON dentro de la tx, y recién al COMMITEAR volcar el clon al
// cache compartido. En rollback/error/dry-run se descarta el clon → nada se
// filtra a filas siguientes y el cache nunca referencia un id revertido.
function clonarCatalogo(c: CatalogoPuestosCache): CatalogoPuestosCache {
  return {
    puestos: new Map(c.puestos),
    especialidades: new Map(c.especialidades),
    especialidadesPorPuesto: new Map(
      [...c.especialidadesPorPuesto].map(
        ([k, v]) => [k, [...v]] as [string, { id: string; nombre: string }[]],
      ),
    ),
    especialidadPuestoCargId: new Map(c.especialidadPuestoCargId),
  }
}

function volcarCatalogo(destino: CatalogoPuestosCache, origen: CatalogoPuestosCache): void {
  for (const [k, v] of origen.puestos) destino.puestos.set(k, v)
  for (const [k, v] of origen.especialidades) destino.especialidades.set(k, v)
  for (const [k, v] of origen.especialidadesPorPuesto) {
    destino.especialidadesPorPuesto.set(k, [...v])
  }
  for (const [k, v] of origen.especialidadPuestoCargId) {
    destino.especialidadPuestoCargId.set(k, v)
  }
}

// ─── Arranque de caches (una vez) ────────────────────────────────────────────
async function construirCaches(prisma: PrismaClient): Promise<Caches> {
  const catalogo = await cargarCatalogoPuestos(prisma)

  const hospitales = await prisma.hospital.findMany({ select: { id: true, sigla: true } })
  const hospitalesPorSigla = new Map<string, string>()
  for (const h of hospitales) {
    if (h.sigla) hospitalesPorSigla.set(normSigla(h.sigla), h.id)
  }

  const codigos = [COD_CR_CPH, ...Object.values(COD_CR_POR_SUBCARRERA)]
  const crRows = await prisma.codigoRegistro.findMany({
    where: { codigo: { in: codigos } },
    select: { id: true, codigo: true, escalafonId: true, escalafon: { select: { nombre: true } } },
  })
  const porCodigo = new Map<string, CrInfo>()
  for (const cr of crRows) {
    porCodigo.set(cr.codigo, {
      id: cr.id,
      escalafonId: cr.escalafonId,
      escalafonNombre: cr.escalafon.nombre,
    })
  }

  const crCph = porCodigo.get(COD_CR_CPH)
  if (!crCph) {
    console.error(`ABORTA: no existe codigo_registro ${COD_CR_CPH} (CPH) en la base.`)
    process.exit(1)
  }

  const crPorSubCarrera: Record<string, CrInfo> = {}
  for (const [sub, cod] of Object.entries(COD_CR_POR_SUBCARRERA)) {
    const cr = porCodigo.get(cod)
    if (!cr) {
      console.error(`ABORTA: no existe codigo_registro ${cod} (${sub}) en la base.`)
      process.exit(1)
    }
    crPorSubCarrera[sub] = cr
  }

  return { catalogo, hospitalesPorSigla, crCph, crPorSubCarrera }
}

// ─── Resolución designado-activo (Paso G, DISEÑO §g) ─────────────────────────
// Devuelve el cargoId a reusar (si el designado tiene ocupación vigente en un
// cargo 'vigente') y la personaDesignadaId resuelta.
export async function resolverDesignadoActivo(
  tx: Tx,
  fila: Fila,
  warnings: Warnings,
): Promise<{ cargoIdExistente: string | null; personaDesignadaId: string | null; yaActivo: boolean; externo: boolean }> {
  const nombre = fila['nombre_designado']
  if (esDesignadoVacante(nombre)) {
    return { cargoIdExistente: null, personaDesignadaId: null, yaActivo: false, externo: false }
  }
  const cuil = normalizarCuil(fila['cuil_designado'], warnings)
  if (!cuil) {
    // CUIL inválido/ausente con nombre presente → se trata como sin designar.
    return { cargoIdExistente: null, personaDesignadaId: null, yaActivo: false, externo: false }
  }
  const persona = await tx.persona.findUnique({ where: { cuil }, select: { id: true } })
  if (!persona) {
    warnings.push(`designado externo: CUIL ${cuil} válido pero sin persona en el padrón`)
    return { cargoIdExistente: null, personaDesignadaId: null, yaActivo: false, externo: true }
  }
  const ocup = await tx.ocupacion.findFirst({
    where: { personaId: persona.id, hasta: null, cargo: { estado: 'vigente' } },
    select: { cargoId: true },
  })
  if (ocup) {
    return {
      cargoIdExistente: ocup.cargoId,
      personaDesignadaId: persona.id,
      yaActivo: true,
      externo: false,
    }
  }
  // Persona en padrón pero sin ocupación vigente → se designa igual, pero se
  // crea cargo nuevo (no reusa).
  return { cargoIdExistente: null, personaDesignadaId: persona.id, yaActivo: false, externo: false }
}

// ─── Creación de cargo nuevo (molde _aprobarAltaCargo, DISEÑO §d/§h) ─────────
export async function crearCargo(
  tx: Tx,
  caches: Caches,
  params: {
    tipo: 'cph' | 'ceetps'
    fila: Fila
    hospitalId: string
    usuarioCarga: string
    // Catálogo AISLADO de esta transacción de fila (clon). Toda auto-creación de
    // PuestoCargo/EspecialidadPuesto se cachea acá; solo se vuelca al cache
    // compartido si la tx commitea (ver clonarCatalogo/volcarCatalogo).
    catalogo: CatalogoPuestosCache
  },
): Promise<string> {
  const { tipo, fila, hospitalId, usuarioCarga, catalogo } = params
  const puestoSolicitado = str(fila['puesto_solicitado'])
  const especialidadSolicitada = str(fila['especialidad_solicitada'])

  let cr: CrInfo
  let prefijo: string

  if (tipo === 'cph') {
    cr = caches.crCph
    // CPH usa prefijoDeCargo (rama 1, sin ambigüedad). Se pasa el nombre del
    // escalafón canónico resuelto por id (no un literal hardcodeado).
    const puestoResuelto = await resolverPuestoCargoId(tx, catalogo, {
      escalafonId: cr.escalafonId,
      literalPuesto: puestoSolicitado,
      unificadorPuesto: puestoSolicitado,
    })
    prefijo = prefijoDeCargo({
      escalafon: cr.escalafonNombre,
      unificadorPuesto: puestoSolicitado,
      agrupador: puestoSolicitado,
      puestoCargo: puestoResuelto,
    })
    const especialidadPuestoId = await resolverEspecialidadPuestoId(
      tx,
      catalogo,
      puestoResuelto.id,
      especialidadSolicitada,
      puestoResuelto.nombre,
    )
    const codigo = await siguienteCodigoCargo(prefijo, tx as unknown as PrismaClient)
    assertEscalafonCr(cr)
    const cargo = await tx.cargo.create({
      data: {
        idSial: `MANUAL-${codigo}`,
        codigo,
        hospitalId,
        escalafonId: cr.escalafonId,
        codigoRegistroId: cr.id,
        puestoCargoId: puestoResuelto.id,
        especialidadPuestoId,
        literalPuesto: puestoSolicitado,
        especialidadLegacy: especialidadSolicitada,
        estado: 'validacion_vacante',
        origen: 'manual',
        createdById: usuarioCarga,
      },
      select: { id: true },
    })
    return cargo.id
  }

  // CEETPS
  const sub = (str(fila['sub_carrera']) ?? '').toUpperCase()
  cr = caches.crPorSubCarrera[sub] ?? caches.crPorSubCarrera['ANEXO2']!
  prefijo = prefijoCeetpsPorSubCarrera(str(fila['sub_carrera']), puestoSolicitado)
  const puestoResuelto = await resolverPuestoCargoId(tx, catalogo, {
    escalafonId: cr.escalafonId,
    literalPuesto: puestoSolicitado,
    unificadorPuesto: puestoSolicitado,
  })
  const especialidadPuestoId = await resolverEspecialidadPuestoId(
    tx,
    catalogo,
    puestoResuelto.id,
    null,
    puestoResuelto.nombre,
  )
  const codigo = await siguienteCodigoCargo(prefijo, tx as unknown as PrismaClient)
  assertEscalafonCr(cr)
  const cargo = await tx.cargo.create({
    data: {
      idSial: `MANUAL-${codigo}`,
      codigo,
      hospitalId,
      escalafonId: cr.escalafonId,
      codigoRegistroId: cr.id,
      puestoCargoId: puestoResuelto.id,
      especialidadPuestoId,
      literalPuesto: puestoSolicitado,
      estado: 'validacion_vacante',
      origen: 'manual',
      createdById: usuarioCarga,
    },
    select: { id: true },
  })
  return cargo.id
}

// Regla de oro: cargo.escalafonId === CR.escalafon_id (por construcción). La
// aserción deja la invariante explícita y falla ruidosamente si se rompe.
function assertEscalafonCr(cr: CrInfo): void {
  if (!cr.escalafonId) {
    console.error('ABORTA: escalafonId del codigo_registro vacío — invariante rota.')
    process.exit(1)
  }
}

// ─── Observaciones [ETL] (trazabilidad) ──────────────────────────────────────
export function armarObservaciones(fila: Fila, hoja: 'cph' | 'ceetps', warnings: Warnings): string | null {
  const partes: string[] = []
  const obsExcel = str(fila['observaciones'])
  if (obsExcel) partes.push(obsExcel)

  const trazas: string[] = []
  const add = (k: string, label?: string) => {
    const v = str(fila[k])
    if (v) trazas.push(`${label ?? k}=${v}`)
  }
  if (hoja === 'cph') {
    const resp = str(fila['Respuesta'])
    if (resp) trazas.push(`Respuesta=${resp}`)
    add('cuil_baja')
    add('puesto_baja')
    add('especialidad_baja')
    add('id_cargo_legacy')
    add('cargos_2_0')
  } else {
    add('puesto_designado')
    add('estado_apto')
    add('ee_baja')
    add('sigla_baja')
    add('cuil_baja')
    add('fecha_baja', 'fecha_baja')
    add('puesto_baja')
    add('especialidad_baja')
    add('motivo_baja')
    add('doc_respaldatoria_baja')
    add('id_cargo_legacy')
  }
  const warnExcel = str(fila['_warnings'])
  if (warnExcel) trazas.push(`_warnings=${warnExcel}`)
  if (warnings.length) trazas.push(`loader_warnings=${warnings.join(' | ')}`)

  if (trazas.length) partes.push(`[ETL] ${trazas.join(' | ')}`)
  return partes.length ? partes.join('\n') : null
}

// ─── Mapeo + persistencia de una fila CPH ────────────────────────────────────
export function cphCalcInput(fila: Fila, warnings: Warnings): ConcursoCphCalcInput {
  return {
    suspendido: bool(fila['suspendido']) ?? false,
    eeBaja: str(fila['ee_baja']),
    fechaBaja: fecha(fila['fecha_baja'], 'fecha_baja', warnings),
    eeConcurso: str(fila['ee_concurso']),
    fechaEeConcurso: fecha(fila['fecha_ee_concurso'], 'fecha_ee_concurso', warnings),
    fechaAutorizacion: fecha(fila['fecha_autorizacion'], 'fecha_autorizacion', warnings),
    sorteoJurado: fecha(fila['sorteo_jurado'], 'sorteo_jurado', warnings),
    disposicion: null, // sin columna en el Excel limpio (DISEÑO §c/§f)
    fechaInscDesde: fecha(fila['fecha_insc_desde'], 'fecha_insc_desde', warnings),
    fechaInscHasta: fecha(fila['fecha_insc_hasta'], 'fecha_insc_hasta', warnings),
    inscripcionCerrada: false,
    ordenMeritoConfirmado: false,
    fechaExamen: fecha(fila['fecha_examen'], 'fecha_examen', warnings),
    fechaOrdenMerito: fecha(fila['fecha_orden_merito'], 'fecha_orden_merito', warnings),
    fechaIfacs: fecha(fila['fecha_ifacs'], 'fecha_ifacs', warnings),
    fechaInsal: fecha(fila['fecha_insal'], 'fecha_insal', warnings),
    eeDesignacion: str(fila['ee_designacion']),
    cargaDocumentacion: bool(fila['carga_documentacion']),
    fechaAptoMedico: fecha(fila['fecha_apto_medico'], 'fecha_apto_medico', warnings),
    fechaIte: fecha(fila['fecha_ite'], 'fecha_ite', warnings),
    proyectoResolucion: bool(fila['proyecto_resolucion']),
    resoALaFirma: bool(fila['reso_a_la_firma']),
    resolucionDesignacion: str(fila['resolucion_designacion']),
    fechaResolucion: fecha(fila['fecha_resolucion'], 'fecha_resolucion', warnings),
    cargoSial: str(fila['cargo_sial']),
    dispoDesierta: str(fila['dispo_desierta']),
    fechaDispoDesierta: fecha(fila['fecha_dispo_desierta'], 'fecha_dispo_desierta', warnings),
  }
}

// ─── Procesamiento de una hoja ────────────────────────────────────────────────
async function procesarHoja(
  prisma: PrismaClient,
  caches: Caches,
  hoja: 'cph' | 'ceetps',
  filas: Fila[],
  flags: Flags,
  reporte: Reporte,
): Promise<void> {
  for (let idx = 0; idx < filas.length; idx++) {
    const fila = filas[idx]!
    reporte.totalFilas++
    const warnings: Warnings = []

    // Paso 0 — hospital
    const siglaRaw = str(fila['sigla_efector'])
    const hospitalId = siglaRaw ? caches.hospitalesPorSigla.get(normSigla(siglaRaw)) : undefined
    if (!hospitalId) {
      reporte.sinHospital.push({ hoja, fila: idx, sigla: siglaRaw })
      continue
    }

    // Flag "Revisar manual" (solo CPH, filas 74–87)
    if (hoja === 'cph' && idx >= REVISAR_MANUAL_DESDE && idx <= REVISAR_MANUAL_HASTA) {
      reporte.revisarManual++
    }

    // Catálogo aislado de ESTA fila: se parte del cache compartido y se muta el
    // clon dentro de la tx. Solo si la tx commitea (real, sin dry-run) se vuelca
    // al cache compartido. Evita que un puesto auto-creado y luego revertido
    // (dry-run / error) deje un id fantasma que viole la FK en filas siguientes.
    const catalogoFila = clonarCatalogo(caches.catalogo)
    try {
      await prisma.$transaction(async (tx) => {
        // Paso G — designado activo
        const des = await resolverDesignadoActivo(tx, fila, warnings)
        if (des.yaActivo) reporte.designadosYaActivos++
        if (des.externo) reporte.designadosExternos++

        let cargoId: string
        if (des.cargoIdExistente) {
          cargoId = des.cargoIdExistente
          reporte.vinculanCargo++
        } else {
          cargoId = await crearCargo(tx, caches, {
            tipo: hoja,
            fila,
            hospitalId,
            usuarioCarga: flags.usuarioCarga!,
            catalogo: catalogoFila,
          })
          reporte.creanCargo++
        }

        const fechaBaja = fecha(fila['fecha_baja'], 'fecha_baja', warnings)
        const observaciones = armarObservaciones(fila, hoja, warnings)

        if (hoja === 'cph') {
          const calcInput = cphCalcInput(fila, warnings)
          const calc = calcConcursoCph(calcInput)

          // QA de sub-estado: comparar contra etapa del Excel.
          const etapaExcel = (str(fila['etapa']) ?? '').toLowerCase().trim()
          if (etapaExcel && etapaExcel !== calc.subEstado) {
            reporte.discrepanciaSubestado.push({
              fila: idx,
              etapaExcel,
              subEstadoRecalc: calc.subEstado,
            })
          }

          if (!flags.dryRun) {
            const concurso = await tx.concurso.create({
              data: {
                cargoId,
                hospitalId,
                origen: 'Carga concursos 2026',
                fechaVacante: fechaBaja ?? new Date(FECHA_CENTINELA),
                tipoConcurso: 'cph',
                motivo: str(fila['motivo_origen']),
                expediente: str(fila['ee_concurso']),
                bajaId: null,
                registradoPorId: flags.usuarioCarga!,
              },
              select: { id: true },
            })
            await tx.concursoCph.create({
              data: {
                concursoId: concurso.id,
                cargoId,
                hospitalId,
                eeBaja: calcInput.eeBaja,
                fechaBaja: calcInput.fechaBaja,
                eeConcurso: calcInput.eeConcurso,
                fechaEeConcurso: calcInput.fechaEeConcurso,
                fechaAutorizacion: calcInput.fechaAutorizacion,
                sorteoJurado: calcInput.sorteoJurado,
                fechaInscDesde: calcInput.fechaInscDesde,
                fechaInscHasta: calcInput.fechaInscHasta,
                qInscriptos: num(fila['q_inscriptos']),
                fechaExamen: calcInput.fechaExamen,
                fechaOrdenMerito: calcInput.fechaOrdenMerito,
                fechaIfacs: calcInput.fechaIfacs,
                insal: str(fila['insal']),
                fechaInsal: calcInput.fechaInsal,
                eeDesignacion: calcInput.eeDesignacion,
                cargaDocumentacion: calcInput.cargaDocumentacion,
                fechaAptoMedico: calcInput.fechaAptoMedico,
                fechaIte: calcInput.fechaIte,
                proyectoResolucion: calcInput.proyectoResolucion,
                resoALaFirma: calcInput.resoALaFirma,
                resolucionDesignacion: calcInput.resolucionDesignacion,
                fechaResolucion: calcInput.fechaResolucion,
                cargoSial: calcInput.cargoSial,
                suspendido: calcInput.suspendido,
                dispoDesierta: calcInput.dispoDesierta,
                fechaDispoDesierta: calcInput.fechaDispoDesierta,
                puestoSolicitado: str(fila['puesto_solicitado']),
                especialidadSolicitada: str(fila['especialidad_solicitada']),
                personaDesignadaId: des.personaDesignadaId,
                observaciones,
                estado: calc.estado,
                subEstado: calc.subEstado,
                subEstado3: calc.subEstado3,
              },
            })
            reporte.insertados++
          }
        } else {
          // CEETPS
          const ceetpsInput = {
            expedienteConcurso: str(fila['expediente_concurso']),
            puestoSolicitado: str(fila['puesto_solicitado']),
            dispoLlamado: str(fila['dispo_llamado']),
            fechaIfacs: fecha(fila['fecha_ifacs'], 'fecha_ifacs', warnings),
            fechaInsal: fecha(fila['fecha_insal'], 'fecha_insal', warnings),
            expedienteDesignacion: str(fila['expediente_designacion']),
            dispoDesignacion: str(fila['dispo_designacion']),
            resolucionDesignacion: str(fila['resolucion_designacion']),
          }
          const estado = calcEstadoCeetps(ceetpsInput)
          const sub = (str(fila['sub_carrera']) ?? '').toUpperCase()
          const cr = caches.crPorSubCarrera[sub] ?? caches.crPorSubCarrera['ANEXO2']!

          if (!flags.dryRun) {
            const concurso = await tx.concurso.create({
              data: {
                cargoId,
                hospitalId,
                origen: 'Carga concursos 2026',
                fechaVacante: fechaBaja ?? new Date(FECHA_CENTINELA),
                tipoConcurso: 'ceetps',
                motivo: str(fila['motivo_origen']),
                expediente: ceetpsInput.expedienteConcurso,
                bajaId: null,
                registradoPorId: flags.usuarioCarga!,
              },
              select: { id: true },
            })
            await tx.concursoCeetps.create({
              data: {
                concursoId: concurso.id,
                cargoId,
                hospitalId,
                escalafonId: cr.escalafonId,
                estado,
                expedienteConcurso: ceetpsInput.expedienteConcurso,
                puestoSolicitado: ceetpsInput.puestoSolicitado,
                dispoLlamado: ceetpsInput.dispoLlamado,
                cargaHoraria: num(fila['carga_horaria'], {
                  smallInt: true,
                  campo: 'carga_horaria',
                  warnings,
                }),
                fechaIfacs: ceetpsInput.fechaIfacs,
                fechaInsal: ceetpsInput.fechaInsal,
                expedienteDesignacion: ceetpsInput.expedienteDesignacion,
                dispoDesignacion: ceetpsInput.dispoDesignacion,
                resolucionDesignacion: ceetpsInput.resolucionDesignacion,
                personaDesignadaId: des.personaDesignadaId,
                observaciones,
              },
            })
            reporte.insertados++
          }
        }

        // En dry-run forzamos rollback para no escribir nada. Los warnings de la
        // fila se vuelcan al reporte UNA sola vez, fuera de la tx (ver más abajo),
        // para no contarlos doble entre el cuerpo de la tx y el catch del rollback.
        if (flags.dryRun) {
          throw new RollbackDryRun()
        }
      })
      // La tx commiteó (modo real): recién ahora los puestos/especialidades
      // auto-creados existen de verdad → se vuelcan al cache compartido para que
      // las filas siguientes los reutilicen sin recrearlos.
      volcarCatalogo(caches.catalogo, catalogoFila)
    } catch (e) {
      if (e instanceof RollbackDryRun) {
        // Esperado en dry-run: la resolución corrió, pero NO se persiste. El clon
        // (catalogoFila) se descarta, así nada auto-creado y revertido se filtra
        // a filas siguientes (ese era el bug de la FK en CEETPS). NO se vuelca el
        // reporte acá: se hace una sola vez al final del loop (ver abajo).
      } else {
        reporte.errorInsert.push({
          hoja,
          fila: idx,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    // Warnings de la fila: se vuelcan UNA sola vez, pase lo que pase con la tx
    // (commit real / rollback de dry-run / error). Antes se empujaban dentro de
    // la tx Y en el catch del rollback, duplicando el conteo en dry-run.
    if (warnings.length) {
      reporte.warnings.push({ hoja, fila: idx, msgs: [...warnings] })
    }
  }
}

// Señal interna para abortar la tx de dry-run sin dejar escritos.
class RollbackDryRun extends Error {
  constructor() {
    super('dry-run rollback')
    this.name = 'RollbackDryRun'
  }
}

// ─── Reporte final ────────────────────────────────────────────────────────────
function imprimirReporte(reporte: Reporte, flags: Flags): void {
  const l = console.log
  l('')
  l('══════════════════════════════════════════════════════════')
  l(`  REPORTE CARGA CONCURSOS ${flags.dryRun ? '(DRY-RUN — sin escribir)' : '(REAL)'}`)
  l('══════════════════════════════════════════════════════════')
  l(`  Filas procesadas ............. ${reporte.totalFilas}`)
  l(`  Vinculan cargo existente ..... ${reporte.vinculanCargo}  (designado activo, Paso G)`)
  l(`  Crean cargo nuevo ............ ${reporte.creanCargo}`)
  l(`  Designados ya activos ........ ${reporte.designadosYaActivos}`)
  l(`  Designados externos .......... ${reporte.designadosExternos}  (CUIL válido sin persona)`)
  l(`  Sin hospital (NO cargadas) ... ${reporte.sinHospital.length}`)
  l(`  Discrepancia sub-estado ...... ${reporte.discrepanciaSubestado.length}`)
  l(`  Filas "Revisar manual" ....... ${reporte.revisarManual}  (CPH 74–87)`)
  l(`  Warnings (filas) ............. ${reporte.warnings.length}`)
  l(`  Errores de insert ............ ${reporte.errorInsert.length}`)
  if (!flags.dryRun) l(`  Concursos insertados ......... ${reporte.insertados}`)
  l('──────────────────────────────────────────────────────────')

  if (reporte.sinHospital.length) {
    l('  Siglas sin efector (fila → sigla):')
    for (const s of reporte.sinHospital) l(`    [${s.hoja}] fila ${s.fila}: ${s.sigla ?? '(vacía)'}`)
  }
  if (reporte.errorInsert.length) {
    l('  Errores de insert:')
    for (const e of reporte.errorInsert) l(`    [${e.hoja}] fila ${e.fila}: ${e.error}`)
  }
  if (reporte.discrepanciaSubestado.length) {
    l(`  Discrepancias sub-estado (esperables por disposicion=null / D sin fecha_examen):`)
    for (const d of reporte.discrepanciaSubestado.slice(0, 50)) {
      l(`    fila ${d.fila}: etapa="${d.etapaExcel}" vs recalc="${d.subEstadoRecalc}"`)
    }
    if (reporte.discrepanciaSubestado.length > 50) {
      l(`    … y ${reporte.discrepanciaSubestado.length - 50} más`)
    }
  }

  // Desglose de warnings por categoría (no por fila): cuántos MENSAJES de cada
  // clase se acumularon. Sirve para distinguir lo benigno (designado externo,
  // fecha fuera de rango conservada) de lo que amerita revisión (CUIL inválido).
  if (reporte.warnings.length) {
    const tally = clasificarWarnings(reporte.warnings)
    l('  Warnings por categoría (mensajes):')
    for (const [cat, n] of tally) l(`    ${cat} ... ${n}`)
  }
  l('══════════════════════════════════════════════════════════')
  l('')
}

// Clasifica cada MENSAJE de warning por un prefijo estable. Devuelve pares
// [categoría, cantidad] ordenados por cantidad desc. Las primeras dos son
// benignas (esperadas); CUIL inválido/verificador y fecha no parseable ameritan
// una mirada si el conteo no es trivial.
function clasificarWarnings(filas: Reporte['warnings']): Array<[string, number]> {
  const cuenta = new Map<string, number>()
  const bump = (k: string) => cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
  for (const f of filas) {
    for (const m of f.msgs) {
      if (m.startsWith('designado externo')) bump('designado externo (CUIL ok, sin persona) [benigno]')
      else if (m.includes('fuera de rango')) bump('fecha fuera de rango 2018–2045 (conservada) [benigno]')
      else if (m.includes('no tiene 11 dígitos')) bump('CUIL sin 11 dígitos (ignorado) [revisar]')
      else if (m.includes('prefijo inusual')) bump('CUIL prefijo inusual (ignorado) [revisar]')
      else if (m.includes('dígito verificador')) bump('CUIL verificador inválido (ignorado) [revisar]')
      else if (m.includes('no parseable')) bump('fecha no parseable (descartada) [revisar]')
      else if (m.includes('excede SmallInt')) bump('carga_horaria > SmallInt (descartada) [revisar]')
      else bump('otro')
    }
  }
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1])
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2))

  if (flags.help) {
    console.log(USO)
    process.exit(0)
  }

  if (!flags.usuarioCarga) {
    console.error('ERROR: falta --usuario-carga <uuid> (obligatorio).')
    console.log(USO)
    process.exit(1)
  }

  // Tolerancia WSL: el default de --excel viene en formato Windows (c:/...), que
  // no existe desde WSL. Si no se encuentra, probar la variante /mnt/c/... antes
  // de abortar. Si el usuario pasó --excel con una ruta válida, este fallback no
  // hace nada. No reemplaza al flag: documentamos la ruta /mnt/c en el RUNBOOK.
  if (!fs.existsSync(flags.excel)) {
    const wsl = flags.excel.replace(/^([a-zA-Z]):[\\/]/, (_m, d) => `/mnt/${d.toLowerCase()}/`)
    if (wsl !== flags.excel && fs.existsSync(wsl)) {
      console.log(`Excel (ruta Windows no encontrada; usando variante WSL): ${wsl}`)
      flags.excel = wsl
    } else {
      console.error(`ERROR: no existe el Excel en: ${flags.excel}`)
      process.exit(1)
    }
  }

  const prisma = new PrismaClient()
  try {
    // Validar usuario de carga
    const usuario = await prisma.usuario.findUnique({
      where: { id: flags.usuarioCarga },
      select: { id: true, username: true, activo: true },
    })
    if (!usuario) {
      console.error(`ERROR: el usuario ${flags.usuarioCarga} no existe.`)
      process.exit(1)
    }
    if (!usuario.activo) {
      console.error(`ERROR: el usuario ${usuario.username} (${usuario.id}) está inactivo.`)
      process.exit(1)
    }
    console.log(`Usuario de carga: ${usuario.username} (${usuario.id})`)
    console.log(`Modo: ${flags.dryRun ? 'DRY-RUN (no escribe)' : 'REAL (escribe en Neon)'}`)
    console.log(`Excel: ${flags.excel}`)

    // Caches (una vez)
    const caches = await construirCaches(prisma)

    // Lectura del Excel por buffer (evita el cuelgue de node -e en MINGW)
    const buf = fs.readFileSync(flags.excel)
    const wb = XLSX.read(buf, { type: 'buffer' })

    const leerHoja = (nombre: string): Fila[] => {
      const ws = wb.Sheets[nombre]
      if (!ws) return []
      return XLSX.utils.sheet_to_json<Fila>(ws, { defval: null, raw: false })
    }

    const reporte = nuevoReporte()

    if (flags.solo !== 'ceetps') {
      const filasCph = leerHoja('CPH')
      console.log(`Hoja CPH: ${filasCph.length} filas`)
      await procesarHoja(prisma, caches, 'cph', filasCph, flags, reporte)
    }
    if (flags.solo !== 'cph') {
      const filasCeetps = leerHoja('CEETPS')
      console.log(`Hoja CEETPS: ${filasCeetps.length} filas`)
      await procesarHoja(prisma, caches, 'ceetps', filasCeetps, flags, reporte)
    }

    imprimirReporte(reporte, flags)
  } finally {
    await prisma.$disconnect()
  }

  process.exit(0)
}

// Solo arranca cuando se ejecuta directo (tsx scripts/.../cargar-concursos.ts),
// NO cuando el módulo se importa desde un test (que prueba las funciones puras
// sin tocar la base). El runner de tests (vitest) tiene un argv[1] que termina
// en algo distinto de este archivo, así que main() no corre al importarlo.
const entradaDirecta = (process.argv[1] ?? '').replace(/\\/g, '/').endsWith('cargar-concursos.ts')

if (entradaDirecta) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
