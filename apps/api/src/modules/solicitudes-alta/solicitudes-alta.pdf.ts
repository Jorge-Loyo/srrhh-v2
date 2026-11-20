import PDFDocument from 'pdfkit'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'

const include = {
  hospital:       { select: { sigla: true, nombre: true } },
  escalafon:      { select: { nombre: true } },
  codigoRegistro: { select: { literal: true } },
  solicitadoPor:  { select: { username: true, email: true } },
  // unificadorPuesto viene del modelo directamente (no es relación),
  // pero al usar `include` Prisma devuelve todos los campos escalares.
} as const

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  aprobada:  'Aprobada',
  rechazada: 'Rechazada',
}

function fmtFecha(d: Date | null): string {
  if (!d) return '--'
  return d.toISOString().slice(0, 10)
}

export async function getGrupoSolicitudesAltaService(expediente: string) {
  const solicitudes = await prisma.solicitudAlta.findMany({
    where:   { expediente },
    include,
    orderBy: { createdAt: 'asc' },
  })
  if (solicitudes.length === 0) {
    throw AppError.notFound(`No hay solicitudes de alta para el expediente ${expediente}`)
  }
  return solicitudes
}

async function resolverCodigosCargos(cargoIds: string[]): Promise<Map<string, string>> {
  if (cargoIds.length === 0) return new Map()
  const cargos = await prisma.cargo.findMany({
    where:  { id: { in: cargoIds } },
    select: { id: true, codigo: true },
  })
  return new Map(cargos.map((c) => [c.id, c.codigo ?? '--']))
}

type SolicitudGrupo = Awaited<ReturnType<typeof getGrupoSolicitudesAltaService>>[number]

// ── Helpers de dibujo compartidos ────────────────────────────────────────────

function dibujarSeparador(doc: InstanceType<typeof PDFDocument>, color = '#1e2952') {
  const left  = doc.page.margins.left
  const right = doc.page.width - doc.page.margins.right
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor(color).lineWidth(0.5).stroke()
  doc.moveDown(0.4)
}

function encabezadoDocumento(
  doc: InstanceType<typeof PDFDocument>,
  titulo: string,
  expediente: string,
  fechaCreacion: string,
  solicitante: string,
  totalCargos: number,
  subtitulo?: string,
) {
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#1e2952').text(titulo, { align: 'left' })
  if (subtitulo) {
    doc.moveDown(0.2)
    doc.font('Helvetica').fontSize(9).fillColor('#555555').text(subtitulo)
  }
  doc.moveDown(0.4)
  doc.font('Helvetica').fontSize(9).fillColor('#333333')
  const meta = (label: string, valor: string) => {
    doc.font('Helvetica-Bold').text(`${label}: `, { continued: true })
    doc.font('Helvetica').text(valor)
  }
  meta('Expediente', expediente)
  meta('Fecha', fechaCreacion)
  meta('Solicitante', solicitante)
  meta('Total de cargos', String(totalCargos))
  doc.moveDown(0.6)
  dibujarSeparador(doc)
}

function piePaginas(doc: InstanceType<typeof PDFDocument>) {
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    doc.font('Helvetica').fontSize(7).fillColor('#999999')
    doc.text(
      `Documento generado por el Sistema SRRHH — ${fmtFecha(new Date())} — Pagina ${i + 1} de ${range.count}`,
      doc.page.margins.left,
      doc.page.height - doc.page.margins.bottom + 8,
      { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' },
    )
  }
}

// ── PDF estándar (POF / Estructura) ──────────────────────────────────────────

function construirPdfEstandar(
  expediente: string,
  solicitudes: SolicitudGrupo[],
  codigosPorCargo: Map<string, string>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end',  () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const totalCargos   = solicitudes.reduce((acc, s) => acc + s.cantidad, 0)
    const primera       = solicitudes[0]!
    const solicitante   = primera.solicitadoPor?.username ?? primera.solicitadoPor?.email ?? '--'
    const fechaCreacion = fmtFecha(primera.createdAt)

    encabezadoDocumento(doc, 'Expediente de creacion de cargos', expediente, fechaCreacion, solicitante, totalCargos)

    const left   = doc.page.margins.left
    const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right
    const cols = [
      { key: 'n',      label: '#',            w: 0.03 },
      { key: 'codigo', label: 'Codigo',       w: 0.11 },
      { key: 'hosp',   label: 'Hospital',     w: 0.16 },
      { key: 'carr',   label: 'Carrera',      w: 0.13 },
      { key: 'puesto', label: 'Puesto',       w: 0.17 },
      { key: 'esp',    label: 'Especialidad', w: 0.12 },
      { key: 'reg',    label: 'Reg.',         w: 0.06 },
      { key: 'cant',   label: 'Cant.',        w: 0.05 },
      { key: 'estado', label: 'Estado',       w: 0.09 },
      { key: 'desde',  label: 'Desde',        w: 0.08 },
    ] as const

    const xs: number[] = []
    let acc = left
    for (const c of cols) { xs.push(acc); acc += c.w * usable }

    const rowGap = 4

    const dibujarHeader = () => {
      const y = doc.y
      doc.rect(left, y - 2, usable, 16).fill('#1e2952')
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff')
      cols.forEach((c, i) => doc.text(c.label, xs[i]! + 2, y + 2, { width: c.w * usable - 4, lineBreak: false }))
      doc.y = y + 18
      doc.fillColor('#333333')
    }

    dibujarHeader()
    doc.font('Helvetica').fontSize(7.5)

    solicitudes.forEach((s, idx) => {
      const codigos   = s.cargosCreadosIds.map((id) => codigosPorCargo.get(id) ?? '--').filter((v) => v !== '--')
      const codigoTxt = codigos.length > 0 ? codigos.join(', ') : 'pendiente'
      const valores: Record<string, string> = {
        n:      String(idx + 1),
        codigo: codigoTxt,
        hosp:   s.hospital ? `${s.hospital.sigla} - ${s.hospital.nombre}` : '--',
        carr:   s.escalafon?.nombre ?? '--',
        puesto: s.literalPuesto ?? '--',
        esp:    s.especialidad ?? '--',
        reg:    s.codigoRegistro?.literal ?? '--',
        cant:   String(s.cantidad),
        estado: ESTADO_LABEL[s.estado] ?? s.estado,
        desde:  fmtFecha(s.desde),
      }
      const rowH = Math.max(...cols.map((c) => doc.heightOfString(valores[c.key] ?? '', { width: c.w * usable - 4 }))) + rowGap
      if (doc.y + rowH > doc.page.height - doc.page.margins.bottom) {
        doc.addPage(); dibujarHeader(); doc.font('Helvetica').fontSize(7.5).fillColor('#333333')
      }
      const yRow = doc.y
      if (idx % 2 === 1) { doc.rect(left, yRow - 1, usable, rowH).fill('#f3f5fa'); doc.fillColor('#333333') }
      cols.forEach((c, i) => doc.text(valores[c.key] ?? '', xs[i]! + 2, yRow + 1, { width: c.w * usable - 4 }))
      doc.y = yRow + rowH
    })

    piePaginas(doc)
    doc.end()
  })
}

// ── PDF POU: norma completa + inciso de modificación ─────────────────────────
//
// Estructura del documento:
//   1. Encabezado (expediente, fecha, solicitante)
//   2. INCISO — tabla de modificaciones: fila por solicitud con
//      hospital | perfil | especialidad | dot.total anterior | +cantidad | dot.total nueva
//   3. NORMA COMPLETA — toda la tabla pou agrupada por hospital (sigla),
//      con las filas modificadas resaltadas en amarillo.
//
// Mapeo solicitud → fila POU:
//   sigla   = solicitud.hospital.sigla
//   perfil  = solicitud.literalPuesto   (normalizado a minúscula sin tilde)
//   esp     = solicitud.especialidad    (ídem, o null)
//
// "Dotación total nueva" = dotacionTotal actual + cantidad de la solicitud.
// Si la fila POU no existe todavía (cargo nuevo sin fila previa), se muestra
// anterior = 0 y se indica "(fila nueva)".

type PouRowDb = Awaited<ReturnType<typeof prisma.pou.findMany>>[number]

function normalizar(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

interface ModificacionPou {
  sigla: string
  hospital: string
  perfil: string
  especialidad: string
  dotAnterior: number
  cantidad: number
  dotNueva: number
  esFilaNueva: boolean
}

function calcularModificaciones(
  solicitudes: SolicitudGrupo[],
  pouRows: PouRowDb[],
): ModificacionPou[] {
  // Índice por sigla+perfil+especialidad (normalizados)
  const idx = new Map<string, PouRowDb>()
  for (const r of pouRows) {
    idx.set(`${normalizar(r.sigla)}::${normalizar(r.perfil)}::${normalizar(r.especialidad)}`, r)
  }

  return solicitudes.map((s) => {
    const sigla = s.hospital?.sigla ?? ''
    const key   = `${normalizar(sigla)}::${normalizar(s.literalPuesto)}::${normalizar(s.especialidad)}`
    const fila  = idx.get(key)
    const dotAnterior = fila?.dotacionTotal ?? 0
    return {
      sigla,
      hospital:    s.hospital ? `${s.hospital.sigla} - ${s.hospital.nombre}` : '--',
      perfil:      s.literalPuesto ?? '--',
      especialidad: s.especialidad ?? '--',
      dotAnterior,
      cantidad:    s.cantidad,
      dotNueva:    dotAnterior + s.cantidad,
      esFilaNueva: !fila,
    }
  })
}

// Claves normalizadas de las filas modificadas (para resaltarlas en la norma)
function clavesModificadas(mods: ModificacionPou[]): Set<string> {
  return new Set(mods.map((m) => `${normalizar(m.sigla)}::${normalizar(m.perfil)}::${normalizar(m.especialidad)}`))
}

function construirPdfPou(
  expediente: string,
  solicitudes: SolicitudGrupo[],
  pouRows: PouRowDb[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end',  () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const totalCargos   = solicitudes.reduce((acc, s) => acc + s.cantidad, 0)
    const primera       = solicitudes[0]!
    const solicitante   = primera.solicitadoPor?.username ?? primera.solicitadoPor?.email ?? '--'
    const fechaCreacion = fmtFecha(primera.createdAt)
    const mods          = calcularModificaciones(solicitudes, pouRows)
    const clavesMod     = clavesModificadas(mods)

    const left   = doc.page.margins.left
    const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right

    encabezadoDocumento(
      doc,
      'Norma de Estructura POU — Modificacion',
      expediente,
      fechaCreacion,
      solicitante,
      totalCargos,
      'Creacion de cargos POU. Este documento refleja la norma completa con la modificacion incorporada.',
    )

    // ── Sección 1: Inciso de modificación ────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#1e2952')
      .text('INCISO — Detalle de la modificacion')
    doc.moveDown(0.3)

    const colsMod = [
      { key: 'hospital',    label: 'Hospital',        w: 0.26 },
      { key: 'perfil',      label: 'Perfil',          w: 0.22 },
      { key: 'especialidad',label: 'Especialidad',    w: 0.20 },
      { key: 'dotAnt',      label: 'Dot. anterior',   w: 0.10 },
      { key: 'delta',       label: 'Modificacion',    w: 0.11 },
      { key: 'dotNueva',    label: 'Dot. nueva',      w: 0.11 },
    ] as const

    const xsMod: number[] = []
    let accMod = left
    for (const c of colsMod) { xsMod.push(accMod); accMod += c.w * usable }

    const dibujarHeaderMod = () => {
      const y = doc.y
      doc.rect(left, y - 2, usable, 16).fill('#1e2952')
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff')
      colsMod.forEach((c, i) => doc.text(c.label, xsMod[i]! + 2, y + 2, { width: c.w * usable - 4, lineBreak: false }))
      doc.y = y + 18
      doc.fillColor('#333333')
    }

    dibujarHeaderMod()
    doc.font('Helvetica').fontSize(7.5)

    mods.forEach((m, idx) => {
      const valores: Record<string, string> = {
        hospital:     m.hospital,
        perfil:       m.perfil,
        especialidad: m.especialidad,
        dotAnt:       m.esFilaNueva ? '(nueva)' : String(m.dotAnterior),
        delta:        `+${m.cantidad}`,
        dotNueva:     String(m.dotNueva),
      }
      const rowH = Math.max(...colsMod.map((c) => doc.heightOfString(valores[c.key] ?? '', { width: c.w * usable - 4 }))) + 4
      if (doc.y + rowH > doc.page.height - doc.page.margins.bottom) {
        doc.addPage(); dibujarHeaderMod(); doc.font('Helvetica').fontSize(7.5).fillColor('#333333')
      }
      const yRow = doc.y
      // Fondo amarillo para todas las filas del inciso
      doc.rect(left, yRow - 1, usable, rowH).fill('#fffbeb')
      doc.fillColor('#333333')
      colsMod.forEach((c, i) => {
        const isBold = c.key === 'delta' || c.key === 'dotNueva'
        doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5)
          .fillColor(c.key === 'delta' ? '#166534' : '#333333')
          .text(valores[c.key] ?? '', xsMod[i]! + 2, yRow + 1, { width: c.w * usable - 4 })
      })
      doc.y = yRow + rowH
    })

    doc.moveDown(1)
    dibujarSeparador(doc, '#cccccc')

    // ── Sección 2: Norma completa ─────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#1e2952')
      .text('NORMA COMPLETA — Dotacion POU por hospital (con modificacion incorporada)')
    doc.moveDown(0.3)

    // Agrupar por sigla, ordenar hospitales y filas
    const porSigla = new Map<string, PouRowDb[]>()
    for (const r of pouRows) {
      const arr = porSigla.get(r.sigla) ?? []
      arr.push(r)
      porSigla.set(r.sigla, arr)
    }
    const siglas = [...porSigla.keys()].sort()

    const colsNorma = [
      { key: 'perfil',      label: 'Perfil',          w: 0.30 },
      { key: 'especialidad',label: 'Especialidad',    w: 0.28 },
      { key: 'dotDiaria',   label: 'Dot. Diaria',     w: 0.10 },
      { key: 'dotSem',      label: 'Dot. Semanal',    w: 0.10 },
      { key: 'dotTotal',    label: 'Dot. Total',      w: 0.10 },
      { key: 'vacantes',    label: 'Vacantes',        w: 0.12 },
    ] as const

    const xsNorma: number[] = []
    let accNorma = left
    for (const c of colsNorma) { xsNorma.push(accNorma); accNorma += c.w * usable }

    const dibujarHeaderNorma = () => {
      const y = doc.y
      doc.rect(left, y - 2, usable, 14).fill('#374151')
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff')
      colsNorma.forEach((c, i) => doc.text(c.label, xsNorma[i]! + 2, y + 2, { width: c.w * usable - 4, lineBreak: false }))
      doc.y = y + 16
      doc.fillColor('#333333')
    }

    for (const sigla of siglas) {
      const filas = (porSigla.get(sigla) ?? []).sort((a, b) => {
        const cp = a.perfil.localeCompare(b.perfil, 'es')
        return cp !== 0 ? cp : a.especialidad.localeCompare(b.especialidad, 'es')
      })
      const descripcion = filas[0]?.descripcionSigla ?? ''

      // Subtítulo del hospital — salto de página si no entra
      if (doc.y + 30 > doc.page.height - doc.page.margins.bottom) doc.addPage()

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1e2952')
        .text(`${sigla}${descripcion ? '  —  ' + descripcion : ''}`)
      doc.moveDown(0.2)
      dibujarHeaderNorma()
      doc.font('Helvetica').fontSize(7)

      filas.forEach((fila, fi) => {
        const clave    = `${normalizar(fila.sigla)}::${normalizar(fila.perfil)}::${normalizar(fila.especialidad)}`
        const esModif  = clavesMod.has(clave)
        // Dotación total: si es fila modificada, mostrar el valor nuevo
        const modFila  = esModif ? mods.find((m) =>
          normalizar(m.sigla) === normalizar(fila.sigla) &&
          normalizar(m.perfil) === normalizar(fila.perfil) &&
          normalizar(m.especialidad) === normalizar(fila.especialidad)
        ) : undefined

        const dotTotalMostrar = modFila ? modFila.dotNueva : (fila.dotacionTotal ?? 0)

        const valores: Record<string, string> = {
          perfil:       fila.perfil,
          especialidad: fila.especialidad,
          dotDiaria:    fila.dotacionDiaria != null ? String(fila.dotacionDiaria) : '--',
          dotSem:       fila.dotacionSem    != null ? String(fila.dotacionSem)    : '--',
          dotTotal:     String(dotTotalMostrar),
          vacantes:     fila.vacantes       != null ? String(fila.vacantes)       : '--',
        }

        const rowH = Math.max(...colsNorma.map((c) => doc.heightOfString(valores[c.key] ?? '', { width: c.w * usable - 4 }))) + 3
        if (doc.y + rowH > doc.page.height - doc.page.margins.bottom) {
          doc.addPage(); dibujarHeaderNorma(); doc.font('Helvetica').fontSize(7).fillColor('#333333')
        }

        const yRow = doc.y
        if (esModif) {
          doc.rect(left, yRow - 1, usable, rowH).fill('#fef9c3')
        } else if (fi % 2 === 1) {
          doc.rect(left, yRow - 1, usable, rowH).fill('#f9fafb')
        }
        doc.fillColor('#333333')

        colsNorma.forEach((c, i) => {
          const bold = esModif && c.key === 'dotTotal'
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7)
            .fillColor(bold ? '#166534' : '#333333')
            .text(valores[c.key] ?? '', xsNorma[i]! + 2, yRow + 1, { width: c.w * usable - 4 })
        })
        doc.y = yRow + rowH
      })

      doc.moveDown(0.6)
    }

    piePaginas(doc)
    doc.end()
  })
}

// ── PDF Estructura: organigrama completo + nuevo nodo insertado ──────────────
//
// El campo `observaciones` de cada solicitud de estructura lleva el payload:
//   "nodo:<sigla>|<codigoReparticion>|<path legible>"
// Se parsea acá para saber en qué nodo del árbol insertar el nuevo cargo.
//
// El PDF muestra:
//   1. Encabezado (expediente, fecha, solicitante)
//   2. INCISO — tabla de modificaciones (nodo padre, puesto nuevo, cantidad)
//   3. ORGANIGRAMA COMPLETO — árbol aplanado con el nuevo nodo resaltado

interface InfoNodoEstructura {
  sigla: string
  nodoId: string
  nodoPath: string
}

function parsearNodoOrg(observaciones: string | null): InfoNodoEstructura | null {
  if (!observaciones?.startsWith('nodo:')) return null
  const resto = observaciones.slice(5)
  const partes = resto.split('|')
  if (partes.length < 3) return null
  return { sigla: partes[0]!, nodoId: partes[1]!, nodoPath: partes.slice(2).join('|') }
}

interface OrgNodoRaw {
  codigoReparticion: string
  descRep: string | null
  tipo: string
  lvl: number
  padre: string | null
}

async function cargarNodosOrganigrama(sigla: string): Promise<OrgNodoRaw[]> {
  // Secciones fijas: traer por universo_totalizador
  if (sigla === 'nivel-central') {
    return prisma.organigrama.findMany({
      where: { OR: [{ universoTotalizador: { equals: 'Nivel Central', mode: 'insensitive' } }] },
      select: { codigoReparticion: true, descRep: true, tipo: true, lvl: true, padre: true },
      orderBy: [{ lvl: 'asc' }, { codigoReparticion: 'asc' }],
    })
  }
  if (sigla === 'atencion-primaria') {
    return prisma.organigrama.findMany({
      where: { OR: [
        { universoTotalizador: { equals: 'APS', mode: 'insensitive' } },
        { universoTotalizador: { equals: 'ATENCION PRIMARIA', mode: 'insensitive' } },
      ]},
      select: { codigoReparticion: true, descRep: true, tipo: true, lvl: true, padre: true },
      orderBy: [{ lvl: 'asc' }, { codigoReparticion: 'asc' }],
    })
  }
  return prisma.organigrama.findMany({
    where: { sigla: sigla.toUpperCase() },
    select: { codigoReparticion: true, descRep: true, tipo: true, lvl: true, padre: true },
    orderBy: [{ lvl: 'asc' }, { codigoReparticion: 'asc' }],
  })
}

function construirPdfEstructura(
  expediente: string,
  solicitudes: SolicitudGrupo[],
  nodos: OrgNodoRaw[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end',  () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const totalCargos   = solicitudes.reduce((acc, s) => acc + s.cantidad, 0)
    const primera       = solicitudes[0]!
    const solicitante   = primera.solicitadoPor?.username ?? primera.solicitadoPor?.email ?? '--'
    const fechaCreacion = fmtFecha(primera.createdAt)

    // Parsear info de nodo de cada solicitud
    const infoNodos = solicitudes.map((s) => parsearNodoOrg(s.observaciones ?? null))
    // Conjunto de codigoReparticion de nodos padre afectados (para resaltar)
    const nodosAfectados = new Set(infoNodos.filter(Boolean).map((n) => n!.nodoId))

    const left   = doc.page.margins.left
    const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right

    encabezadoDocumento(
      doc,
      'Norma de Estructura — Modificacion de Organigrama',
      expediente,
      fechaCreacion,
      solicitante,
      totalCargos,
      'Creacion de cargos de estructura. Este documento refleja el organigrama con la modificacion incorporada.',
    )

    // ── Sección 1: Inciso ────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#1e2952')
      .text('INCISO — Detalle de la modificacion')
    doc.moveDown(0.3)

    const colsInc = [
      { key: 'nodo',    label: 'Nodo padre (ubicacion)',  w: 0.45 },
      { key: 'puesto',  label: 'Puesto nuevo',            w: 0.30 },
      { key: 'carrera', label: 'Carrera',                 w: 0.15 },
      { key: 'cant',    label: 'Cant.',                   w: 0.10 },
    ] as const
    const xsInc: number[] = []
    let accInc = left
    for (const c of colsInc) { xsInc.push(accInc); accInc += c.w * usable }

    const dibujarHeaderInc = () => {
      const y = doc.y
      doc.rect(left, y - 2, usable, 16).fill('#1e2952')
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff')
      colsInc.forEach((c, i) => doc.text(c.label, xsInc[i]! + 2, y + 2, { width: c.w * usable - 4, lineBreak: false }))
      doc.y = y + 18
      doc.fillColor('#333333')
    }
    dibujarHeaderInc()
    doc.font('Helvetica').fontSize(7.5)

    solicitudes.forEach((s, idx) => {
      const info = infoNodos[idx]
      const valores: Record<string, string> = {
        nodo:    info?.nodoPath ?? '--',
        puesto:  s.literalPuesto ?? '--',
        carrera: s.escalafon?.nombre ?? '--',
        cant:    String(s.cantidad),
      }
      const rowH = Math.max(...colsInc.map((c) => doc.heightOfString(valores[c.key] ?? '', { width: c.w * usable - 4 }))) + 4
      if (doc.y + rowH > doc.page.height - doc.page.margins.bottom) {
        doc.addPage(); dibujarHeaderInc(); doc.font('Helvetica').fontSize(7.5).fillColor('#333333')
      }
      const yRow = doc.y
      doc.rect(left, yRow - 1, usable, rowH).fill('#ede9fe')
      doc.fillColor('#333333')
      colsInc.forEach((c, i) => {
        doc.font(c.key === 'cant' ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5)
          .fillColor('#333333')
          .text(valores[c.key] ?? '', xsInc[i]! + 2, yRow + 1, { width: c.w * usable - 4 })
      })
      doc.y = yRow + rowH
    })

    doc.moveDown(1)
    dibujarSeparador(doc, '#cccccc')

    // ── Sección 2: Organigrama completo ──────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#1e2952')
      .text('ORGANIGRAMA COMPLETO — con modificacion incorporada')
    doc.moveDown(0.3)

    // Aplanar el árbol en orden jerárquico (ya viene ordenado por lvl)
    // Construir mapa padre→hijos para recorrer en orden
    const mapaHijos = new Map<string | null, OrgNodoRaw[]>()
    for (const n of nodos) {
      const padre = n.padre?.trim() || null
      if (!mapaHijos.has(padre)) mapaHijos.set(padre, [])
      mapaHijos.get(padre)!.push(n)
    }

    const colsOrg = [
      { key: 'tipo',   label: 'Tipo',    w: 0.12 },
      { key: 'nombre', label: 'Nombre',  w: 0.70 },
      { key: 'cod',    label: 'Cod.',    w: 0.18 },
    ] as const
    const xsOrg: number[] = []
    let accOrg = left
    for (const c of colsOrg) { xsOrg.push(accOrg); accOrg += c.w * usable }

    const dibujarHeaderOrg = () => {
      const y = doc.y
      doc.rect(left, y - 2, usable, 14).fill('#374151')
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff')
      colsOrg.forEach((c, i) => doc.text(c.label, xsOrg[i]! + 2, y + 2, { width: c.w * usable - 4, lineBreak: false }))
      doc.y = y + 16
      doc.fillColor('#333333')
    }
    dibujarHeaderOrg()

    // Recorrido DFS para respetar jerarquía visual
    let filaIdx = 0
    function recorrerNodo(cod: string, nivel: number) {
      const nodo = nodos.find((n) => n.codigoReparticion === cod)
      if (!nodo) return
      const esAfectado = nodosAfectados.has(cod)
      const indent = Math.min(nivel, 8) * 6
      const valores: Record<string, string> = {
        tipo:   nodo.tipo,
        nombre: ' '.repeat(Math.min(nivel, 8) * 2) + (nodo.descRep ?? cod),
        cod:    cod,
      }
      const rowH = Math.max(
        doc.heightOfString(valores.tipo,   { width: colsOrg[0].w * usable - 4 }),
        doc.heightOfString(valores.nombre, { width: colsOrg[1].w * usable - 4 - indent }),
        doc.heightOfString(valores.cod,    { width: colsOrg[2].w * usable - 4 }),
      ) + 3

      if (doc.y + rowH > doc.page.height - doc.page.margins.bottom) {
        doc.addPage(); dibujarHeaderOrg(); doc.font('Helvetica').fontSize(7).fillColor('#333333')
      }
      const yRow = doc.y
      if (esAfectado) {
        doc.rect(left, yRow - 1, usable, rowH).fill('#ede9fe')
      } else if (filaIdx % 2 === 1) {
        doc.rect(left, yRow - 1, usable, rowH).fill('#f9fafb')
      }
      doc.fillColor('#333333')

      colsOrg.forEach((c, i) => {
        const bold = esAfectado
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7)
          .fillColor(esAfectado ? '#4c1d95' : '#333333')
          .text(valores[c.key] ?? '', xsOrg[i]! + 2 + (c.key === 'nombre' ? indent : 0), yRow + 1, {
            width: c.w * usable - 4 - (c.key === 'nombre' ? indent : 0),
          })
      })
      doc.y = yRow + rowH
      filaIdx++

      // Agregar los nuevos cargos como sub-filas resaltadas en verde
      if (esAfectado) {
        const solicsDeEsteNodo = solicitudes.filter((_, si) => infoNodos[si]?.nodoId === cod)
        for (const s of solicsDeEsteNodo) {
          const rowHN = doc.heightOfString(`+ ${s.literalPuesto}${s.especialidad ? ' / ' + s.especialidad : ''} (x${s.cantidad})`, { width: colsOrg[1].w * usable - 4 - indent - 8 }) + 3
          if (doc.y + rowHN > doc.page.height - doc.page.margins.bottom) {
            doc.addPage(); dibujarHeaderOrg(); doc.font('Helvetica').fontSize(7).fillColor('#333333')
          }
          const yN = doc.y
          doc.rect(left, yN - 1, usable, rowHN).fill('#f0fdf4')
          doc.font('Helvetica-Bold').fontSize(7).fillColor('#166534')
            .text(
              `+ ${s.literalPuesto}${s.especialidad ? ' / ' + s.especialidad : ''} (x${s.cantidad})`,
              xsOrg[1]! + 2 + indent + 8, yN + 1,
              { width: colsOrg[1].w * usable - 4 - indent - 8 },
            )
          doc.y = yN + rowHN
          filaIdx++
        }
      }

      const hijos = mapaHijos.get(cod) ?? []
      for (const hijo of hijos) recorrerNodo(hijo.codigoReparticion, nivel + 1)
    }

    // Encontrar raíces (nodos sin padre en el conjunto)
    const codigos = new Set(nodos.map((n) => n.codigoReparticion))
    const raices = nodos.filter((n) => !n.padre?.trim() || !codigos.has(n.padre.trim()) || n.padre.trim() === 'ROOT')
    for (const r of raices) recorrerNodo(r.codigoReparticion, 0)

    piePaginas(doc)
    doc.end()
  })
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function generarPdfGrupoSolicitudesAltaService(
  expediente: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const solicitudes = await getGrupoSolicitudesAltaService(expediente)

  const esPou = solicitudes.some((s) =>
    (s.literalPuesto ?? '').toUpperCase().includes('GUARDIA'),
  )
  const esEstructura = solicitudes.some((s) =>
    parsearNodoOrg(s.observaciones ?? null) !== null,
  )

  const safe = expediente.replace(/[^a-zA-Z0-9._-]/g, '_')

  if (esEstructura) {
    // Tomar la sigla del primer nodo con info (todas del mismo lote comparten sigla)
    const sigla = solicitudes.map((s) => parsearNodoOrg(s.observaciones ?? null)).find(Boolean)?.sigla ?? ''
    const nodos = sigla ? await cargarNodosOrganigrama(sigla) : []
    const buffer = await construirPdfEstructura(expediente, solicitudes, nodos)
    return { buffer, filename: `estructura_${safe}.pdf` }
  }

  if (esPou) {
    const pouRows = await prisma.pou.findMany({
      orderBy: [{ sigla: 'asc' }, { perfil: 'asc' }, { especialidad: 'asc' }],
    })
    const buffer = await construirPdfPou(expediente, solicitudes, pouRows)
    return { buffer, filename: `norma_pou_${safe}.pdf` }
  }

  const cargoIds      = solicitudes.flatMap((s) => s.cargosCreadosIds)
  const codigosPorCargo = await resolverCodigosCargos(cargoIds)
  const buffer = await construirPdfEstandar(expediente, solicitudes, codigosPorCargo)
  return { buffer, filename: `cargos_${safe}.pdf` }
}
