import { createRequire } from 'node:module'
import { prisma } from '../../../shared/prisma.js'
import { marcarSesionCompletada, marcarSesionPendiente } from '../carga-semanal.service.js'
import type { ResolucionesConfirmar } from '../carga-semanal.service.js'
import { normalizarTexto } from '@srrhh/utils'

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
      diffCampo(diffs, sesionId, 'dim_puestos', f.idSialRol, 'literal_puesto',    actual.literalPuesto,    f.litPuesto)
      diffCampo(diffs, sesionId, 'dim_puestos', f.idSialRol, 'especialidad',      actual.especialidad,     f.especialidad)
      diffCampo(diffs, sesionId, 'dim_puestos', f.idSialRol, 'codigo_registro',   actual.codigoRegistro,   f.codReg)
      diffCampo(diffs, sesionId, 'dim_puestos', f.idSialRol, 'cod_rep',           actual.codRep,           f.codRep)
      diffCampo(diffs, sesionId, 'dim_puestos', f.idSialRol, 'situacion_revista', actual.situacionRevista, f.sitRev)
      diffCampo(diffs, sesionId, 'dim_puestos', f.idSialRol, 'efector',           actual.hospitalSigla,    f.sigla)
    }

    // dim_personas (primera aparición por CUIL)
    if (f.cuil && !cuilsVistos.has(f.cuil)) {
      cuilsVistos.add(f.cuil)
      const actualP = mapaActualPersonas.get(f.cuil)
      if (!actualP) {
        diffs.push({ sesionId, tablaAfectada: 'dim_personas', tipoDiff: 'nuevo', clave: f.cuil })
      } else {
        diffCampo(diffs, sesionId, 'dim_personas', f.cuil, 'apellido_nombre', actualP.apellidoNombre, f.apellidoNombre)
        diffCampo(diffs, sesionId, 'dim_personas', f.cuil, 'sexo',            actualP.sexo,           f.sexo)
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

  // 4. Persistir diffs y actualizar conteo de filas
  await Promise.all([
    (async () => {
      for (let i = 0; i < diffs.length; i += LOTE) {
        await prisma.dimCargaDiff.createMany({ data: diffs.slice(i, i + LOTE) })
      }
    })(),
    prisma.dimCargaArchivo.updateMany({ where: { sesionId }, data: { filas: filas.length } }),
  ])

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
    advertencias,
  }

  // 5. Marcar sesión como pendiente de confirmación
  await marcarSesionPendiente(sesionId, { tipo: 'cargos_salud', ...resumen, advertencias })

  return resumen
}

// ─── FASE 2: aplicar cambios (escribe en BD, se llama al confirmar) ───────────

export async function aplicarCambiosCargosSalud(
  sesionId: string,
  buffer: Buffer,
  resoluciones: ResolucionesConfirmar,
): Promise<void> {
  // Re-parsear el buffer (ya fue validado en fase 1)
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]!]
  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[]
  const filas = rawRows.map(parsearFila).filter((f) => f.idSialRol.length > 0)
  const fechaCorte = new Date()

  // Leer diffs ya calculados en fase 1
  const diffs = await prisma.dimCargaDiff.findMany({
    where: { sesionId },
    select: { tipoDiff: true, clave: true, tablaAfectada: true, campo: true },
  })

  const eliminadosPuestos = diffs
    .filter((d) => d.tablaAfectada === 'dim_puestos' && d.tipoDiff === 'eliminado')
    .map((d) => d.clave)

  const nuevosPuestos = diffs
    .filter((d) => d.tablaAfectada === 'dim_puestos' && d.tipoDiff === 'nuevo')
    .map((d) => d.clave)

  const modResol = resoluciones.modificados ?? {}
  const delResol = resoluciones.eliminados ?? {}

  // Construir upserts respetando resoluciones
  const upsertsPuestos: Parameters<typeof prisma.dimPuestos.upsert>[0][] = []
  const upsertsPersonas: Parameters<typeof prisma.dimPersonas.upsert>[0][] = []
  const cuilsVistos = new Set<string>()

  for (const f of filas) {
    // Si el puesto está modificado y el usuario eligió 'actual', no pisamos
    const estaModificado = diffs.some(
      (d) => d.tablaAfectada === 'dim_puestos' && d.tipoDiff === 'modificado' && d.clave === f.idSialRol,
    )
    if (estaModificado && modResol[f.idSialRol] === 'actual') continue

    upsertsPuestos.push({
      where: { idSialRol: f.idSialRol },
      create: {
        idSialRol: f.idSialRol, literalPuesto: f.litPuesto, especialidad: f.especialidad,
        codigoRegistro: f.codReg, codRep: f.codRep, descRep: f.descRep, jcat: f.jcat,
        hospitalSigla: f.sigla, situacionRevista: f.sitRev, puestoDesde: f.cargoDesde,
        puestoHasta: f.cargoHasta, docRespaldAlta: f.docRespAlta, docRespBaja: f.docRespBaja,
        srDocRespald: f.srDocRespald, bloqDesde: f.bloqDesde, blMotivo: f.blMotivo,
        escritorio: f.escritorio, pouDesde: f.pouDesde, dia: f.dia, docResp: f.docResp,
        padronExist: fechaCorte,
      },
      update: {
        literalPuesto: f.litPuesto, especialidad: f.especialidad, codigoRegistro: f.codReg,
        codRep: f.codRep, descRep: f.descRep, jcat: f.jcat, hospitalSigla: f.sigla,
        situacionRevista: f.sitRev, puestoDesde: f.cargoDesde, puestoHasta: f.cargoHasta,
        docRespaldAlta: f.docRespAlta, docRespBaja: f.docRespBaja, srDocRespald: f.srDocRespald,
        bloqDesde: f.bloqDesde, blMotivo: f.blMotivo, escritorio: f.escritorio,
        pouDesde: f.pouDesde, dia: f.dia, docResp: f.docResp, padronExist: fechaCorte,
      },
    })

    if (f.cuil && !cuilsVistos.has(f.cuil)) {
      cuilsVistos.add(f.cuil)
      upsertsPersonas.push({
        where: { cuil: f.cuil },
        create: {
          cuil: f.cuil, apellidoNombre: f.apellidoNombre, fechaNacimiento: f.fecNacim,
          sexo: f.sexo, telefono: f.telefono, mailPersonal: f.mailPersonal,
          mailLaboral: f.mailLaboral, domicilio: f.domicilio, localidad: f.localidad,
          provincia: f.provincia, saludPrimerCargo: f.saludPrimerCargo, activo: true,
        },
        update: {
          apellidoNombre: f.apellidoNombre, fechaNacimiento: f.fecNacim, sexo: f.sexo,
          telefono: f.telefono, mailPersonal: f.mailPersonal, mailLaboral: f.mailLaboral,
          domicilio: f.domicilio, localidad: f.localidad, provincia: f.provincia,
          saludPrimerCargo: f.saludPrimerCargo, activo: true,
        },
      })
    }
  }

  // Puestos a eliminar (respetando resolución 'mantener')
  const idsAEliminar = eliminadosPuestos.filter((id) => delResol[id] !== 'mantener')

  await prisma.$transaction(
    async (tx) => {
      for (let i = 0; i < upsertsPuestos.length; i += LOTE) {
        for (const u of upsertsPuestos.slice(i, i + LOTE)) await tx.dimPuestos.upsert(u)
      }
      for (let i = 0; i < upsertsPersonas.length; i += LOTE) {
        for (const u of upsertsPersonas.slice(i, i + LOTE)) await tx.dimPersonas.upsert(u)
      }
    },
    { timeout: 300_000 },
  )

  // Cerrar actividad de puestos eliminados
  if (idsAEliminar.length > 0) {
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

    const mapaFilas = new Map(filas.map((f) => [f.idSialRol, f]))
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

  // Snapshot y KPIs
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

  type KpiKey = string
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

  await marcarSesionCompletada(sesionId, {
    tipo: 'cargos_salud',
    fechaCorte: fechaCorte.toISOString(),
    totalFilas: filas.length,
    dimPuestos: {
      escritos:   upsertsPuestos.length,
      eliminados: idsAEliminar.length,
    },
    dimPersonas: { escritas: upsertsPersonas.length },
    snapshot:    { filas: snapshotData.length },
    kpis:        { grupos: kpisMap.size },
  })
}
