import { createRequire } from 'node:module'
import { prisma } from '../../../shared/prisma.js'
import type { ResolucionesConfirmar } from '../carga-semanal.service.js'
import { normalizarTexto } from '@srrhh/utils'
import { clasificarGestionablesBulk } from './gestionables.js'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx') as {
  read: (data: Buffer, opts: Record<string, unknown>) => {
    SheetNames: string[]
    Sheets: Record<string, unknown>
  }
  utils: {
    sheet_to_json: (ws: unknown, opts: Record<string, unknown>) => Record<string, unknown>[]
  }
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FilaCargo {
  idSialRol: string
  cuil: string
  apellidoNombre: string
  fecNacim: Date | null
  sexo: string | null
  tipDoc: string | null
  numDoc: string | null
  codRep: string | null
  descRep: string | null
  sigla: string | null
  escalafon: string | null
  sitRev: string | null
  jcat: string | null
  docRespald: string | null
  codReg: string | null
  litCodReg: string | null
  puesto: string | null
  litPuesto: string | null
  especialidad: string | null
  cargoDesde: Date | null
  cargoHasta: Date | null
  docRespAlta: string | null
  docRespBaja: string | null
  bloqDesde: Date | null
  blMotivo: string | null
  escritorio: string | null
  pouDesde: Date | null
  dia: string | null
  docResp: string | null
  telefono: string | null
  mailPersonal: string | null
  mailLaboral: string | null
  domicilio: string | null
  localidad: string | null
  provincia: string | null
  saludPrimerCargo: Date | null
  srDocRespald: string | null
}

export interface ResumenCargosSalud {
  totalFilas: number
  dimPuestos: { nuevos: number; modificados: number; eliminados: number }
  dimPersonas: { nuevas: number; modificadas: number }
  dimActividadHechos: { aAbrir: number; aCerrar: number }
  gestionables: { puestosNuevos: number }
  advertencias: AdvertenciaFila[]
}

export interface AdvertenciaFila {
  idSialRol: string
  cuil: string
  motivos: string[]
}

// ─── Parser ────────────────────────────────���──────────────────────────────────

function parseFecha(v: unknown): Date | null {
  if (!v) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  const s = String(v).trim()
  if (!s || s === '01/01/4000 0:00:00' || s === '1/1/4000 0:00:00') return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function norm(v: unknown): string | null {
  return normalizarTexto(str(v))
}

function normalizarCuil(v: unknown): string {
  return String(v ?? '').replace(/-/g, '').trim()
}

function parsearFila(row: Record<string, unknown>): FilaCargo {
  return {
    idSialRol:        String(row['CARGO'] ?? '').trim(),
    cuil:             normalizarCuil(row['CUIL']),
    apellidoNombre:   str(row['AYN']) ?? '',
    fecNacim:         parseFecha(row['FEC_NACIM']),
    sexo:             str(row['SEXO']),
    tipDoc:           str(row['TIP_DOC']),
    numDoc:           str(row['NUM_DOC']),
    codRep:           str(row['COD_REP']),
    descRep:          str(row['DESC_REP']),
    sigla:            str(row['SIGLA']),
    escalafon:        norm(row['ESCALAFON']),
    sitRev:           norm(row['SIT_REV']),
    jcat:             str(row['JCAT']),
    docRespald:       str(row['DOC_RESPALD']),
    codReg:           str(row['COD_REG']),
    litCodReg:        str(row['LIT_COD_REG']),
    puesto:           str(row['PUESTO']),
    litPuesto:        norm(row['LIT_PUESTO']),
    especialidad:     norm(row['LIT_ESP_CARGO']),
    cargoDesde:       parseFecha(row['CARGO_DESDE']),
    cargoHasta:       parseFecha(row['CARGO_HASTA']),
    docRespAlta:      str(row['DOC_RESP_ALTA']),
    docRespBaja:      str(row['DOC_RESP_BAJA']),
    bloqDesde:        parseFecha(row['BLOQ_DESDE']),
    blMotivo:         str(row['BL_MOTIVO']),
    escritorio:       str(row['ESCRITORIO']),
    pouDesde:         parseFecha(row['POU_DESDE']),
    dia:              str(row['DIA']),
    docResp:          str(row['DOC_RESP']),
    telefono:         str(row['TELEFONO']),
    mailPersonal:     str(row['MAIL_PERSONAL']),
    mailLaboral:      str(row['MAIL_LABORAL']),
    domicilio:        str(row['DOMICILIO']),
    localidad:        str(row['LOCALIDAD']),
    provincia:        str(row['PROVINCIA']),
    saludPrimerCargo: parseFecha(row['SALUD_1ER_CARGO']),
    srDocRespald:     str(row['SR_DOC_RESPALD']),
  }
}

// ─── Validaciones y advertencias ──────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function advertenciasFila(f: FilaCargo): string[] {
  const motivos: string[] = []

  // CUIL con formato inválido
  if (f.cuil) {
    const digits = f.cuil.replace(/\D/g, '')
    if (digits.length < 10 || digits.length > 11) {
      motivos.push(`CUIL con formato inválido: "${f.cuil}"`)
    } else if (f.numDoc) {
      // CUIL vs DNI: los dígitos 2-9 del CUIL deben coincidir con el DNI
      const cuilDni = digits.slice(2, 10).replace(/^0+/, '')
      const dni = f.numDoc.replace(/\D/g, '').replace(/^0+/, '')
      if (dni && cuilDni !== dni) {
        motivos.push(`DNI (${f.numDoc}) no coincide con CUIL (${f.cuil})`)
      }
    }
  }

  // Emails con formato dudoso
  if (f.mailPersonal && !EMAIL_RE.test(f.mailPersonal)) {
    motivos.push(`Email personal con formato dudoso: "${f.mailPersonal}"`)
  }
  if (f.mailLaboral && !EMAIL_RE.test(f.mailLaboral)) {
    motivos.push(`Email laboral con formato dudoso: "${f.mailLaboral}"`)
  }

  // Fechas invertidas cargo_desde > cargo_hasta
  if (f.cargoDesde && f.cargoHasta) {
    const hasta = f.cargoHasta.getFullYear()
    if (hasta < 4000 && f.cargoHasta < f.cargoDesde) {
      motivos.push(`CARGO_HASTA (${f.cargoHasta.toISOString().slice(0, 10)}) anterior a CARGO_DESDE`)
    }
  }

  return motivos
}

// ─── Helpers de diff ──────────────────────────────────────────────────────────

type DiffInput = {
  sesionId: string
  tablaAfectada: string
  tipoDiff: 'nuevo' | 'modificado' | 'eliminado'
  clave: string
  campo?: string
  valorAnterior?: string | null
  valorNuevo?: string | null
}

function diffCampo(
  acum: DiffInput[],
  sesionId: string,
  tabla: string,
  clave: string,
  campo: string,
  anterior: string | null | undefined,
  nuevo: string | null | undefined,
) {
  const a = anterior ?? null
  const n = nuevo ?? null
  if (a !== n) {
    acum.push({ sesionId, tablaAfectada: tabla, tipoDiff: 'modificado', clave, campo, valorAnterior: a, valorNuevo: n })
  }
}

// ─── FASE 1: parsear + calcular diff (sin escribir datos de negocio) ──────────

const LOTE = 500

export async function parsearYDiffearCargosSalud(
  sesionId: string,
  buffer: Buffer,
): Promise<ResumenCargosSalud> {
  // 1. Parsear Excel
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  if (!wb.SheetNames.length) throw new Error('El archivo no tiene hojas')
  const ws = wb.Sheets[wb.SheetNames[0]!]
  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[]
  if (!rawRows.length) throw new Error('El archivo no tiene filas de datos')

  const filas = rawRows.map(parsearFila).filter((f) => f.idSialRol.length > 0)

  // 2. Cargar estado actual en memoria
  const [puestosActuales, personasActuales] = await Promise.all([
    prisma.dimPuestos.findMany({
      where: { padronExist: { not: null } },
      select: {
        idSialRol: true, literalPuesto: true, especialidad: true,
        codigoRegistro: true, codRep: true, hospitalSigla: true, situacionRevista: true,
      },
    }),
    prisma.dimPersonas.findMany({
      select: {
        cuil: true, apellidoNombre: true, sexo: true, mailLaboral: true, telefono: true,
      },
    }),
  ])

  const mapaActualPuestos = new Map(puestosActuales.map((p) => [p.idSialRol, p]))
  const mapaActualPersonas = new Map(personasActuales.map((p) => [p.cuil, p]))

  // 3. Calcular diffs
  const diffs: DiffInput[] = []
  const idsEnArchivo = new Set<string>()
  const cuilsVistos = new Set<string>()
  const advertencias: AdvertenciaFila[] = []

  for (const f of filas) {
    idsEnArchivo.add(f.idSialRol)

    // Advertencias
    const motivos = advertenciasFila(f)
    if (motivos.length > 0) advertencias.push({ idSialRol: f.idSialRol, cuil: f.cuil, motivos })

    // dim_puestos
    const actual = mapaActualPuestos.get(f.idSialRol)
    if (!actual) {
      diffs.push({ sesionId, tablaAfectada: 'dim_puestos', tipoDiff: 'nuevo', clave: f.idSialRol })
    } else {
      diffCampo(diffs, sesionId, 'dim_puestos', f.idSialRol, 'literal_puesto',    norm(actual.literalPuesto),    f.litPuesto)
      if (f.especialidad !== null)
        diffCampo(diffs, sesionId, 'dim_puestos', f.idSialRol, 'especialidad',    norm(actual.especialidad),     f.especialidad)
      diffCampo(diffs, sesionId, 'dim_puestos', f.idSialRol, 'codigo_registro',   actual.codigoRegistro,         f.codReg)
      diffCampo(diffs, sesionId, 'dim_puestos', f.idSialRol, 'cod_rep',           actual.codRep,                 f.codRep)
      diffCampo(diffs, sesionId, 'dim_puestos', f.idSialRol, 'situacion_revista', norm(actual.situacionRevista), f.sitRev)
      diffCampo(diffs, sesionId, 'dim_puestos', f.idSialRol, 'efector',           actual.hospitalSigla,          f.sigla)
    }

    // dim_personas (primera aparición por CUIL)
    if (f.cuil && !cuilsVistos.has(f.cuil)) {
      cuilsVistos.add(f.cuil)
      const actualP = mapaActualPersonas.get(f.cuil)
      if (!actualP) {
        diffs.push({ sesionId, tablaAfectada: 'dim_personas', tipoDiff: 'nuevo', clave: f.cuil })
      } else {
        diffCampo(diffs, sesionId, 'dim_personas', f.cuil, 'apellido_nombre', actualP.apellidoNombre, f.apellidoNombre)
        diffCampo(diffs, sesionId, 'dim_personas', f.cuil, 'mail_laboral',    actualP.mailLaboral,    f.mailLaboral)
        diffCampo(diffs, sesionId, 'dim_personas', f.cuil, 'telefono',        actualP.telefono,       f.telefono)
      }
    }
  }

  // Puestos eliminados (estaban en BD, ya no están en el archivo)
  for (const id of mapaActualPuestos.keys()) {
    if (!idsEnArchivo.has(id)) {
      diffs.push({ sesionId, tablaAfectada: 'dim_puestos', tipoDiff: 'eliminado', clave: id })
    }
  }

  // dim_actividad_hechos — actividades a abrir (puestos nuevos) y cerrar (puestos eliminados)
  const idsNuevosPuestos = diffs
    .filter((d) => d.tablaAfectada === 'dim_puestos' && d.tipoDiff === 'nuevo')
    .map((d) => d.clave)
  const idsEliminadosPuestos = diffs
    .filter((d) => d.tablaAfectada === 'dim_puestos' && d.tipoDiff === 'eliminado')
    .map((d) => d.clave)

  // Clasificar gestionables una sola vez para el resumen del preview
  const mapaFilasPreview = new Map(filas.map((f) => [f.idSialRol, f]))
  const clasificacionPreview = await clasificarGestionablesBulk(
    idsNuevosPuestos.map((id) => ({
      id,
      codigoRegistro: mapaFilasPreview.get(id)?.codReg ?? null,
      literalPuesto:  mapaFilasPreview.get(id)?.litPuesto ?? null,
    }))
  )

  // Actividades abiertas existentes para los eliminados (para saber cuáles se van a cerrar)
  const actividadesAbiertas = idsEliminadosPuestos.length > 0
    ? await prisma.dimActividadHechos.findMany({
        where: { idSialRol: { in: idsEliminadosPuestos }, fechaHasta: null },
        select: { idSialRol: true, situacionRevista: true },
      })
    : []
  const mapaActividadesAbiertas = new Map(actividadesAbiertas.map((a) => [a.idSialRol, a]))

  for (const id of idsNuevosPuestos) {
    diffs.push({
      sesionId, tablaAfectada: 'dim_actividad_hechos', tipoDiff: 'nuevo', clave: id,
      campo: 'fecha_desde', valorAnterior: null, valorNuevo: new Date().toISOString().slice(0, 10),
    })
  }
  for (const id of idsEliminadosPuestos) {
    if (mapaActividadesAbiertas.has(id)) {
      diffs.push({
        sesionId, tablaAfectada: 'dim_actividad_hechos', tipoDiff: 'eliminado', clave: id,
        campo: 'fecha_hasta', valorAnterior: null, valorNuevo: new Date().toISOString().slice(0, 10),
      })
    }
  }

  // 4. Persistir diffs y actualizar conteo de filas (en serie para no saturar Neon)
  for (let i = 0; i < diffs.length; i += LOTE) {
    await prisma.dimCargaDiff.createMany({ data: diffs.slice(i, i + LOTE) })
  }
  await prisma.dimCargaArchivo.updateMany({ where: { sesionId }, data: { filas: filas.length } })

  const resumen: ResumenCargosSalud = {
    totalFilas: filas.length,
    dimPuestos: {
      nuevos:      diffs.filter((d) => d.tablaAfectada === 'dim_puestos'  && d.tipoDiff === 'nuevo').length,
      modificados: diffs.filter((d) => d.tablaAfectada === 'dim_puestos'  && d.tipoDiff === 'modificado').length,
      eliminados:  diffs.filter((d) => d.tablaAfectada === 'dim_puestos'  && d.tipoDiff === 'eliminado').length,
    },
    dimPersonas: {
      nuevas:      diffs.filter((d) => d.tablaAfectada === 'dim_personas' && d.tipoDiff === 'nuevo').length,
      modificadas: diffs.filter((d) => d.tablaAfectada === 'dim_personas' && d.tipoDiff === 'modificado').length,
    },
    dimActividadHechos: {
      aAbrir:  diffs.filter((d) => d.tablaAfectada === 'dim_actividad_hechos' && d.tipoDiff === 'nuevo').length,
      aCerrar: diffs.filter((d) => d.tablaAfectada === 'dim_actividad_hechos' && d.tipoDiff === 'eliminado').length,
    },
    gestionables: {
      puestosNuevos: idsNuevosPuestos.filter((id) => clasificacionPreview.get(id) != null).length,
    },
    advertencias,
  }

  // 5. Marcar sesión como pendiente de confirmación — lo hace registrarResumenParcial en index.ts
  return resumen
}

// ─── helpers SQL bulk ─────────────────────────────────────────────────────────

// Ejecuta un INSERT ... ON CONFLICT DO UPDATE en un solo round-trip
async function bulkUpsertPuestos(filas: FilaCargo[], fechaCorte: Date): Promise<void> {
  if (!filas.length) return
  const { Prisma } = await import('@prisma/client')
  // Deduplicar por id_sial_rol (última fila gana)
  const porId = new Map<string, FilaCargo>()
  for (const f of filas) porId.set(f.idSialRol, f)
  const unicas = [...porId.values()]
  for (let i = 0; i < unicas.length; i += LOTE) {
    const lote = unicas.slice(i, i + LOTE)
    const values = lote.map((f) => Prisma.sql`(
      ${f.idSialRol}, ${f.litPuesto}, ${f.especialidad}, ${f.codReg}, ${f.codRep},
      ${f.descRep}, ${f.jcat}, ${f.sitRev}, ${f.cargoDesde}, ${f.cargoHasta},
      ${f.docRespAlta}, ${f.docRespBaja}, ${f.srDocRespald}, ${f.bloqDesde}, ${f.blMotivo},
      ${f.escritorio}, ${f.pouDesde}, ${f.dia}, ${f.docResp}, ${fechaCorte},
      (SELECT sigla FROM dim_efectores WHERE sigla = ${f.sigla} LIMIT 1)
    )`)
    await prisma.$executeRaw`
      INSERT INTO dim_puestos
        (id_sial_rol, literal_puesto, especialidad, codigo_registro, cod_rep,
         desc_rep, jcat, situacion_revista, puesto_desde, puesto_hasta,
         doc_respald_alta, doc_resp_baja, sr_doc_respald, bloq_desde, bl_motivo,
         escritorio, pou_desde, dia, doc_resp, padron_exist, efector)
      VALUES ${Prisma.join(values)}
      ON CONFLICT (id_sial_rol) DO UPDATE SET
        literal_puesto     = EXCLUDED.literal_puesto,
        especialidad       = COALESCE(EXCLUDED.especialidad, dim_puestos.especialidad),
        codigo_registro    = EXCLUDED.codigo_registro,
        cod_rep            = EXCLUDED.cod_rep,
        desc_rep           = EXCLUDED.desc_rep,
        jcat               = EXCLUDED.jcat,
        efector            = EXCLUDED.efector,
        situacion_revista  = EXCLUDED.situacion_revista,
        puesto_desde       = EXCLUDED.puesto_desde,
        puesto_hasta       = EXCLUDED.puesto_hasta,
        doc_respald_alta   = EXCLUDED.doc_respald_alta,
        doc_resp_baja      = EXCLUDED.doc_resp_baja,
        sr_doc_respald     = EXCLUDED.sr_doc_respald,
        bloq_desde         = EXCLUDED.bloq_desde,
        bl_motivo          = EXCLUDED.bl_motivo,
        escritorio         = EXCLUDED.escritorio,
        pou_desde          = EXCLUDED.pou_desde,
        dia                = EXCLUDED.dia,
        doc_resp           = EXCLUDED.doc_resp,
        padron_exist       = EXCLUDED.padron_exist
    `
  }
}

async function bulkUpsertPersonas(filas: FilaCargo[], fechaCorte: Date): Promise<void> {
  if (!filas.length) return
  const { Prisma } = await import('@prisma/client')
  // deduplicar por cuil
  const porCuil = new Map<string, FilaCargo>()
  for (const f of filas) { if (f.cuil) porCuil.set(f.cuil, f) }
  const unicas = [...porCuil.values()]
  for (let i = 0; i < unicas.length; i += LOTE) {
    const lote = unicas.slice(i, i + LOTE)
    const values = lote.map((f) => Prisma.sql`(
      ${f.cuil}, ${f.apellidoNombre}, ${f.fecNacim}, ${f.sexo},
      ${f.telefono}, ${f.mailPersonal}, ${f.mailLaboral},
      ${f.domicilio}, ${f.localidad}, ${f.provincia}, ${f.saludPrimerCargo}, ${true}
    )`)
    await prisma.$executeRaw`
      INSERT INTO dim_personas
        (cuil, apellido_nombre, fecha_nacimiento, sexo,
         telefono, mail_personal, mail_laboral,
         domicilio, localidad, provincia, salud_1er_cargo, activo)
      VALUES ${Prisma.join(values)}
      ON CONFLICT (cuil) DO UPDATE SET
        apellido_nombre    = EXCLUDED.apellido_nombre,
        fecha_nacimiento   = EXCLUDED.fecha_nacimiento,
        sexo               = EXCLUDED.sexo,
        telefono           = EXCLUDED.telefono,
        mail_personal      = EXCLUDED.mail_personal,
        mail_laboral       = EXCLUDED.mail_laboral,
        domicilio          = EXCLUDED.domicilio,
        localidad          = EXCLUDED.localidad,
        provincia          = EXCLUDED.provincia,
        salud_1er_cargo    = EXCLUDED.salud_1er_cargo,
        activo             = true
    `
  }
}

// ─── FASE 2: aplicar cambios (escribe en BD, se llama al confirmar) ───────────

export async function aplicarCambiosCargosSalud(
  sesionId: string,
  buffer: Buffer,
  resoluciones: ResolucionesConfirmar,
): Promise<void> {
  console.log(`[cargos-salud] iniciando aplicar sesión ${sesionId}`)

  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]!]
  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[]
  const filas = rawRows.map(parsearFila).filter((f) => f.idSialRol.length > 0)
  const fechaCorte = new Date()
  console.log(`[cargos-salud] ${filas.length} filas parseadas`)

  const diffs = await prisma.dimCargaDiff.findMany({
    where: { sesionId },
    select: { tipoDiff: true, clave: true, tablaAfectada: true },
  })
  console.log(`[cargos-salud] ${diffs.length} diffs cargados`)

  const nuevosPuestosSet = new Set(
    diffs.filter((d) => d.tablaAfectada === 'dim_puestos' && d.tipoDiff === 'nuevo').map((d) => d.clave)
  )
  const eliminadosPuestos = diffs
    .filter((d) => d.tablaAfectada === 'dim_puestos' && d.tipoDiff === 'eliminado')
    .map((d) => d.clave)
  const modResol = resoluciones.modificados ?? {}
  const delResol = resoluciones.eliminados ?? {}

  // Filtrar filas respetando resolución 'actual' (no pisar)
  const filasAplicar = filas.filter((f) => {
    const esMod = diffs.some((d) => d.tablaAfectada === 'dim_puestos' && d.tipoDiff === 'modificado' && d.clave === f.idSialRol)
    return !(esMod && modResol[f.idSialRol] === 'actual')
  })

  // dim_puestos — bulk upsert SQL (1 query por lote de 500)
  console.log(`[cargos-salud] upsert dim_puestos (${filasAplicar.length} filas)...`)
  await bulkUpsertPuestos(filasAplicar, fechaCorte)
  console.log(`[cargos-salud] dim_puestos OK`)

  // dim_personas — bulk upsert SQL (1 query por lote de 500)
  console.log(`[cargos-salud] upsert dim_personas...`)
  await bulkUpsertPersonas(filasAplicar, fechaCorte)
  console.log(`[cargos-salud] dim_personas OK`)

  const nuevosPuestos = [...nuevosPuestosSet]
  const idsAEliminar = eliminadosPuestos.filter((id) => delResol[id] !== 'mantener')
  const mapaFilas = new Map(filas.map((f) => [f.idSialRol, f]))

  // Cerrar actividad de puestos eliminados
  if (idsAEliminar.length > 0) {
    console.log(`[cargos-salud] cerrando actividad de ${idsAEliminar.length} puestos eliminados...`)
    await prisma.dimActividadHechos.updateMany({
      where: { idSialRol: { in: idsAEliminar }, fechaHasta: null },
      data: { fechaHasta: fechaCorte },
    })
  }

  // Abrir actividad para puestos nuevos
  if (nuevosPuestos.length > 0) {
    // Excluir los que ya tienen fila abierta (evita duplicados por datos sucios)
    const yaAbiertos = await prisma.dimActividadHechos.findMany({
      where: { idSialRol: { in: nuevosPuestos }, fechaHasta: null },
      select: { idSialRol: true },
    })
    const yaAbiertosSet = new Set(yaAbiertos.map((r) => r.idSialRol))

    const nuevasActividades = nuevosPuestos
      .filter((id) => mapaFilas.has(id) && !yaAbiertosSet.has(id))
      .map((id) => {
        const f = mapaFilas.get(id)!
        return {
          idSialRol:        id,
          cuil:             f.cuil || null,
          situacionRevista: f.sitRev,
          codigoCargo:      null as string | null,
          fechaDesde:       fechaCorte,
          fechaHasta:       null as Date | null,
        }
      })
    for (let i = 0; i < nuevasActividades.length; i += LOTE) {
      await prisma.dimActividadHechos.createMany({ data: nuevasActividades.slice(i, i + LOTE) })
    }
  }

  // 8.1 — Puestos nuevos: gestionables → dim_incidencias, no gestionables → dim_cargos
  if (nuevosPuestos.length > 0) {
    const itemsParaClasificar = nuevosPuestos
      .map((id) => ({ id, codigoRegistro: mapaFilas.get(id)?.codReg ?? null, literalPuesto: mapaFilas.get(id)?.litPuesto ?? null }))
    const clasificacion = await clasificarGestionablesBulk(itemsParaClasificar)

    const incidenciasNuevas: { tipo: 'puesto_nuevo_gestionable'; sesionId: string; idSialRol: string; codigoRegistro: string; efector: string; literalPuesto: string; especialidad: string | null; cuil: string | null }[] = []
    const cargosNuevos: { codigoCargo: string; codigoRegistro: string | null; efector: string; literalPuestoLegacy: string | null; especialidadLegacy: string | null; estado: string; subEstado: string }[] = []

    for (const id of nuevosPuestos) {
      const f = mapaFilas.get(id)
      if (!f || !f.sigla) continue
      const tipoConcurso = clasificacion.get(id)

      if (tipoConcurso) {
        incidenciasNuevas.push({
          tipo:           'puesto_nuevo_gestionable',
          sesionId,
          idSialRol:      id,
          codigoRegistro: f.codReg ?? '',
          efector:        f.sigla,
          literalPuesto:  f.litPuesto ?? '',
          especialidad:   f.especialidad,
          cuil:           f.cuil || null,
        })
      } else {
        cargosNuevos.push({
          codigoCargo:         id,
          codigoRegistro:      f.codReg,
          efector:             f.sigla,
          literalPuestoLegacy: f.litPuesto,
          especialidadLegacy:  f.especialidad,
          estado:              'vigente',
          subEstado:           f.cuil ? 'ocupado' : 'vacante',
        })
      }
    }

    for (let i = 0; i < incidenciasNuevas.length; i += LOTE) {
      await prisma.dimIncidencia.createMany({ data: incidenciasNuevas.slice(i, i + LOTE), skipDuplicates: true })
    }
    for (let i = 0; i < cargosNuevos.length; i += LOTE) {
      await prisma.dimCargos.createMany({ data: cargosNuevos.slice(i, i + LOTE), skipDuplicates: true })
    }
    console.log(`[cargos-salud] gestionables OK`)
  }

  // Snapshot
  console.log(`[cargos-salud] snapshot...`)
  const snapshotData = filas.map((f) => ({
    sesionId, fechaCorte, idSialRol: f.idSialRol, cuil: f.cuil || null,
    apellidoNombre: f.apellidoNombre || null, codigoRegistro: f.codReg,
    litCodReg: f.litCodReg, codRep: f.codRep, descRep: f.descRep,
    literalPuesto: f.litPuesto, especialidad: f.especialidad,
    situacionRevista: f.sitRev, jcat: f.jcat, cargoDesde: f.cargoDesde, cargoHasta: f.cargoHasta,
  }))
  for (let i = 0; i < snapshotData.length; i += LOTE) {
    await prisma.dimCargaPadronSnapshot.createMany({ data: snapshotData.slice(i, i + LOTE) })
  }
  console.log(`[cargos-salud] snapshot OK`)

  // KPIs
  console.log(`[cargos-salud] KPIs...`)
  const kpisMap = new Map<KpiKey, { codigoRegistro: string | null; efector: string | null; activos: Set<string>; personas: Set<string> }>()
  for (const f of filas) {
    const key = `${f.codReg ?? 'NULL'}|${f.sigla ?? 'NULL'}`
    if (!kpisMap.has(key)) kpisMap.set(key, { codigoRegistro: f.codReg, efector: f.sigla, activos: new Set(), personas: new Set() })
    const entry = kpisMap.get(key)!
    entry.activos.add(f.idSialRol)
    if (f.cuil) entry.personas.add(f.cuil)
  }
  const anio = fechaCorte.getFullYear()
  const mes  = fechaCorte.getMonth() + 1
  for (const entry of kpisMap.values()) {
    await prisma.dimCargaKpisPeriodo.upsert({
      where: { fechaCorte_codigoRegistro_efector: { fechaCorte, codigoRegistro: entry.codigoRegistro ?? '', efector: entry.efector ?? '' } },
      create: {
        sesionId, fechaCorte, anio, mes, codigoRegistro: entry.codigoRegistro, efector: entry.efector,
        totalActivos: entry.activos.size, totalPersonas: entry.personas.size, totalVacantes: 0,
        totalNuevos: diffs.filter((d) => d.tablaAfectada === 'dim_puestos' && d.tipoDiff === 'nuevo').length,
        totalBajas: idsAEliminar.length,
      },
      update: { sesionId, totalActivos: entry.activos.size, totalPersonas: entry.personas.size },
    })
  }
  console.log(`[cargos-salud] KPIs OK`)

  // (aplicar no cambia estado — lo hace despacharConfirmar)
}
