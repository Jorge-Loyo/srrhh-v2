import PDFDocument from 'pdfkit'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'

// ─── PDF del GRUPO de solicitudes de alta (unificado por expediente) ──────────
//
// El `expediente` es el UNIFICADOR del lote: todas las solicitudes creadas en un
// mismo "Enviar a aprobación" comparten ese valor. Este documento arma UN PDF
// con el encabezado del expediente + una fila por cargo/solicitud del grupo.
//
// Se genera SIEMPRE on-demand del dato actual (no se guarda archivo): así se
// puede volver a descargar en cualquier momento y refleja el estado vigente
// (ej. si el director ya aprobó, el estado y el código del cargo aparecen).
//
// Lo consume tanto el modal de confirmación del alta (al enviar a aprobación)
// como la futura vista de "Cargos Históricos" — por eso vive en un endpoint
// propio por expediente, no acoplado a una solicitud individual.
//
// pdfkit se eligió por ser liviano y de streaming, sin navegador headless
// (a diferencia de puppeteer, pesado y problemático en Render). Las fuentes
// estándar (Helvetica) cubren Latin-1, así que los acentos es-AR se renderizan
// bien sin embeber fuentes.

const include = {
  hospital:       { select: { sigla: true, nombre: true } },
  escalafon:      { select: { nombre: true } },
  codigoRegistro: { select: { literal: true } },
  solicitadoPor:  { select: { username: true, email: true } },
} as const

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  aprobada:  'Aprobada',
  rechazada: 'Rechazada',
}

function fmtFecha(d: Date | null): string {
  if (!d) return '--'
  // Formato ISO corto (YYYY-MM-DD) — estable y sin dependencia de locale del server.
  return d.toISOString().slice(0, 10)
}

// Devuelve las solicitudes del grupo (mismo expediente), ordenadas por creación.
// 404 si el expediente no corresponde a ninguna solicitud.
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

// Resuelve los códigos de los Cargo ya creados (post-aprobación) de un grupo.
// Devuelve un mapa cargoId → codigo para pintar el código real en el PDF; las
// solicitudes aún pendientes no tienen cargo, así que se muestra "pendiente".
async function resolverCodigosCargos(cargoIds: string[]): Promise<Map<string, string>> {
  if (cargoIds.length === 0) return new Map()
  const cargos = await prisma.cargo.findMany({
    where:  { id: { in: cargoIds } },
    select: { id: true, codigo: true },
  })
  return new Map(cargos.map((c) => [c.id, c.codigo ?? '--']))
}

type SolicitudGrupo = Awaited<ReturnType<typeof getGrupoSolicitudesAltaService>>[number]

// Arma el PDF en memoria y lo resuelve como Buffer (el endpoint lo envía con
// Content-Type application/pdf). Streaming interno de pdfkit acumulado a Buffer.
function construirPdf(
  expediente: string,
  solicitudes: SolicitudGrupo[],
  codigosPorCargo: Map<string, string>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const totalCargos = solicitudes.reduce((acc, s) => acc + s.cantidad, 0)
    const primera = solicitudes[0]!
    const solicitante = primera.solicitadoPor?.username ?? primera.solicitadoPor?.email ?? '--'
    const fechaCreacion = fmtFecha(primera.createdAt)

    // ── Encabezado ────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#1e2952')
      .text('Expediente de creación de cargos', { align: 'left' })
    doc.moveDown(0.3)
    doc.font('Helvetica').fontSize(10).fillColor('#333333')

    const metaLinea = (label: string, valor: string) => {
      doc.font('Helvetica-Bold').text(`${label}: `, { continued: true })
      doc.font('Helvetica').text(valor)
    }
    metaLinea('Expediente', expediente)
    metaLinea('Fecha de creación', fechaCreacion)
    metaLinea('Usuario solicitante', solicitante)
    metaLinea('Cantidad de solicitudes', String(solicitudes.length))
    metaLinea('Total de cargos', String(totalCargos))

    doc.moveDown(0.8)
    doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor('#1e2952').lineWidth(1).stroke()
    doc.moveDown(0.6)

    // ── Tabla de cargos ─────────────────────────────────────────────────────────
    // Columnas: #, Código, Hospital, Carrera, Puesto, Especialidad, Reg., Cant., Estado, Desde
    const left = doc.page.margins.left
    const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right
    const cols = [
      { key: 'n',      label: '#',           w: 0.03 },
      { key: 'codigo', label: 'Código',      w: 0.11 },
      { key: 'hosp',   label: 'Hospital',    w: 0.16 },
      { key: 'carr',   label: 'Carrera',     w: 0.13 },
      { key: 'puesto', label: 'Puesto',      w: 0.17 },
      { key: 'esp',    label: 'Especialidad', w: 0.12 },
      { key: 'reg',    label: 'Reg.',        w: 0.06 },
      { key: 'cant',   label: 'Cant.',       w: 0.05 },
      { key: 'estado', label: 'Estado',      w: 0.09 },
      { key: 'desde',  label: 'Desde',       w: 0.08 },
    ] as const
    const xs: number[] = []
    let acc = left
    for (const c of cols) { xs.push(acc); acc += c.w * usable }

    const rowGap = 4

    const dibujarEncabezadoTabla = () => {
      const y = doc.y
      doc.rect(left, y - 2, usable, 16).fill('#1e2952')
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff')
      cols.forEach((c, i) => {
        doc.text(c.label, xs[i]! + 2, y + 2, { width: c.w * usable - 4, lineBreak: false })
      })
      doc.y = y + 18
      doc.fillColor('#333333')
    }

    dibujarEncabezadoTabla()

    doc.font('Helvetica').fontSize(7.5)
    solicitudes.forEach((s, idx) => {
      // Código: si la solicitud ya generó cargos, se listan los códigos; si no, "pendiente".
      const codigos = s.cargosCreadosIds
        .map((id) => codigosPorCargo.get(id) ?? '--')
        .filter((v) => v !== '--')
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

      // Altura de fila = la más alta de las celdas con wrap.
      const alturas = cols.map((c) =>
        doc.heightOfString(valores[c.key] ?? '', { width: c.w * usable - 4 }),
      )
      const rowH = Math.max(...alturas) + rowGap

      // Salto de página si no entra.
      if (doc.y + rowH > doc.page.height - doc.page.margins.bottom) {
        doc.addPage()
        dibujarEncabezadoTabla()
        doc.font('Helvetica').fontSize(7.5).fillColor('#333333')
      }

      const yRow = doc.y
      if (idx % 2 === 1) {
        doc.rect(left, yRow - 1, usable, rowH).fill('#f3f5fa')
        doc.fillColor('#333333')
      }
      cols.forEach((c, i) => {
        doc.text(valores[c.key] ?? '', xs[i]! + 2, yRow + 1, { width: c.w * usable - 4 })
      })
      doc.y = yRow + rowH
    })

    // ── Pie ──────────────────────────────────────────────────────────────────
    const range = doc.bufferedPageRange()
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i)
      doc.font('Helvetica').fontSize(7).fillColor('#999999')
      doc.text(
        `Documento generado por el Sistema SRRHH — ${fmtFecha(new Date())} — Página ${i + 1} de ${range.count}`,
        doc.page.margins.left,
        doc.page.height - doc.page.margins.bottom + 8,
        { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' },
      )
    }

    doc.end()
  })
}

// Genera el PDF del grupo + el nombre de archivo sugerido para la descarga.
export async function generarPdfGrupoSolicitudesAltaService(
  expediente: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const solicitudes = await getGrupoSolicitudesAltaService(expediente)

  const cargoIds = solicitudes.flatMap((s) => s.cargosCreadosIds)
  const codigosPorCargo = await resolverCodigosCargos(cargoIds)

  const buffer = await construirPdf(expediente, solicitudes, codigosPorCargo)
  const safe = expediente.replace(/[^a-zA-Z0-9._-]/g, '_')
  return { buffer, filename: `cargos_${safe}.pdf` }
}
