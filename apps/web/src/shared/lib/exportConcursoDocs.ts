// Puerto de dotacion-rrhh/frontend/src/utils/exportReport.js (getCasoCph/getCasoCeetps +
// renderers PDF/Word) — mismos 8 "casos" documentales, mismo contenido y diseño visual,
// adaptado al modelo de datos anidado de srrhh-v2 (el legacy trabajaba sobre un row plano
// de una vista SQL; acá se arma leyendo concurso.cargo/persona/baja/hospital).
//
// Ver Doc/Contrato_logica-cargo.md y la tabla de mapeo de campos en el plan de esta feature
// para el detalle de qué campo legacy corresponde a qué relación acá.
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, AlignmentType, WidthType, ShadingType, BorderStyle,
} from 'docx'
import type { ConcursoCph, ConcursoCeetps } from '@srrhh/types'

// ─── Paleta (igual que el legacy) ──────────────────────────────────────────────
const RED: [number, number, number]   = [220, 38, 38]
const GREEN: [number, number, number] = [5, 150, 105]
const TEAL: [number, number, number]  = [42, 113, 133]
const S50: [number, number, number]   = [248, 250, 252]
const S100: [number, number, number]  = [241, 245, 249]
const S200: [number, number, number]  = [226, 232, 240]
const WHITE: [number, number, number] = [255, 255, 255]
const INK: [number, number, number]   = [15, 23, 42]
const LABEL: [number, number, number] = [30, 41, 59]

type Campo = [string, string | null | undefined]

function v(x: unknown): string {
  return x != null && x !== '' ? String(x) : '—'
}

function vFecha(x: string | null | undefined): string {
  if (!x) return '—'
  try {
    return new Date(x).toLocaleDateString('es-AR')
  } catch {
    return String(x)
  }
}

function efectorTexto(sigla?: string | null, descr?: string | null): string {
  return sigla ? `${sigla} - ${descr || ''}` : descr || ''
}

interface Seccion {
  intro: string
  boxTitulo: string
  campos: Campo[]
  cierre: string
  camposVerde?: Campo[]
}

export interface Caso {
  caso: string
  validacion?: Seccion
  autorizacion: Seccion
}

// ─── CPH ────────────────────────────────────────────────────────────────────────
const ESCALAFON_CPH = 'Carrera de Profesionales de la Salud'

/** Caso de un ConcursoCph (ver FORMULARIOS X CASO del legacy, sección CPH). */
export function getCasoCph(data: ConcursoCph): Caso {
  const cargo   = data.concurso?.cargo
  const persona = data.concurso?.persona
  const baja    = data.concurso?.baja
  const hospital = data.hospital ?? cargo?.hospital
  const origen  = data.concurso?.origen ?? ''

  const efector      = efectorTexto(hospital?.sigla, hospital?.nombre)
  const puestoBaja    = cargo?.literalPuesto || ''
  const puestoSolic   = data.puestoSolicitado || puestoBaja
  const especBaja     = cargo?.especialidad || '-'
  const especSolic    = data.especialidadSolicitada || especBaja
  const esSolicitud   = origen === 'Ampliación' || origen === 'POU a POF'
  const esSuplente    = cargo?.unificadorPuesto === 'Suplente de Guardia'
  const esJefatura    = cargo?.unificadorPuesto === 'Jefaturas'
  const esCobertura   = origen === 'Cobertura Dotación'
  const codigoRegistro = esSuplente ? '23' : '37'

  // 4 — Ampliación / POU a POF: no surge de una baja real sino de un expediente
  // de solicitud ya validado → solo Autorización, caja roja "AMPLIACIÓN".
  if (esSolicitud) {
    return {
      caso: 'CPH_AMPLIACION',
      autorizacion: {
        intro: 'La presente procesa el registro de la cobertura de:',
        boxTitulo: 'AMPLIACIÓN',
        campos: [
          ['Repartición', efector],
          ['EE de solicitud', data.eeBaja],
          ['Carrera', ESCALAFON_CPH],
          ['Puesto', puestoBaja],
          ['Especialidad', especBaja],
          ['Código de Registro', codigoRegistro],
        ],
        cierre: 'Asimismo, se AUTORIZA la cobertura de las vacantes, según detalle:',
        camposVerde: [
          ['Expediente de Concurso', data.eeConcurso],
          ['Cantidad de Cargos', '1'],
          ['Puesto', puestoSolic],
          ['Especialidad', especSolic],
          ['Efector', efector],
        ],
      },
    }
  }

  const camposBaja = (puesto: string): Campo[] => [
    ['Repartición', efector],
    ['EE de Baja', data.eeBaja],
    ['Nombre y Apellido', persona?.apellidoNombre],
    ['CUIL', persona?.cuil],
    ['Puesto', puesto],
    ['Especialidad', especBaja],
    ['Escalafón', ESCALAFON_CPH],
    ['Tipo', baja?.tipoBaja],
    ['Código de Registro', codigoRegistro],
    ['Fecha de Baja', vFecha(data.fechaBaja)],
    ['Autorización', vFecha(data.fechaAutorizacion)],
  ]

  // 3 — Suplente de guardia: no pasa por Hacienda → solo Autorización, con el
  // puesto marcado "- Suplente".
  if (esSuplente) {
    return {
      caso: 'CPH_SUPLENTE',
      autorizacion: {
        intro: 'La presente procesa el registro de la baja de:',
        boxTitulo: 'BAJA',
        campos: camposBaja(`${puestoBaja} - Suplente`),
        cierre: 'Asimismo, se autoriza la cobertura de la vacante, en reemplazo de la mencionada baja.',
        camposVerde: [
          ['Expediente de Concurso', data.eeConcurso],
          ['Cantidad de Cargos', '1'],
          ['Puesto', `${puestoSolic} - Suplente`],
          ['Especialidad', especSolic],
          ['Efector', efector],
          ['Partida Presupuestaria', baja?.partidaPresupuestaria],
        ],
      },
    }
  }

  // 2 — Cobertura de dotación POU: sin Nombre/CUIL (no hay una persona puntual) +
  // nota del Decreto 315/22 (el fundamento puntual se completa a mano en el Word).
  if (esCobertura) {
    const camposCobertura = (eeLabel: string): Campo[] => [
      ['Repartición', efector],
      [eeLabel, data.eeBaja],
      ['Puesto', puestoBaja],
      ['Especialidad', especBaja],
      ['Escalafón', ESCALAFON_CPH],
      ['Tipo', baja?.tipoBaja],
      ['Código de Registro', codigoRegistro],
      ['Fecha de Baja', vFecha(data.fechaBaja)],
    ]
    const decreto = `En virtud de lo dictado en el Decto. 315/22 y sus resoluciones modificatorias, y atendiendo la dotación de personal [COMPLETAR: ej. "de la Guardia Médica"] del ${hospital?.nombre || '[Efector]'}, se considera pertinente iniciar un (1) proceso concursal para cubrir el cargo de ${puestoBaja || '[Puesto]'} (${especBaja}), en carácter titular, en función de lo solicitado en el expediente N° ${data.eeBaja || '[Expediente]'}.`
    return {
      caso: 'CPH_COBERTURA_POU',
      validacion: {
        intro: 'La presente procesa el registro de la baja de:',
        boxTitulo: 'SOLICITUD',
        campos: camposCobertura('EE de Solicitud'),
        cierre: `Asimismo, se solicita la validación de la vacante originada por la baja mencionada.\n\n${decreto}`,
      },
      autorizacion: {
        intro: 'En la presente se procesa la baja que se menciona a continuación:',
        boxTitulo: 'COBERTURA',
        campos: camposCobertura('EE de Baja'),
        cierre: `Asimismo, se autoriza la vacante por la baja indicada.\n\n${decreto}`,
        camposVerde: [
          ['Expediente de Concurso', data.eeConcurso],
          ['Cantidad de Cargos', '1'],
          ['Puesto', puestoSolic],
          ['Especialidad', especSolic],
          ['Efector', efector],
        ],
      },
    }
  }

  // 1 — Estándar / 1b — Jefaturas: mismo layout; en Jefaturas la Especialidad del
  // cuadro verde va siempre "-" (quien asuma el cargo puede no ser de esa especialidad).
  return {
    caso: esJefatura ? 'CPH_JEFATURAS' : 'CPH_ESTANDAR',
    validacion: {
      intro: 'La presente procesa el registro de la baja de:',
      boxTitulo: 'BAJA',
      campos: camposBaja(puestoBaja),
      cierre: 'Asimismo, se solicita la validación de la vacante por la baja indicada.',
    },
    autorizacion: {
      intro: 'La presente procesa el registro de la baja de:',
      boxTitulo: 'BAJA',
      campos: camposBaja(puestoBaja),
      cierre: 'Asimismo, se autoriza la vacante por la baja indicada.',
      camposVerde: [
        ['Expediente de Concurso', data.eeConcurso],
        ['Cantidad de Cargos', '1'],
        ['Puesto', puestoSolic],
        ['Especialidad', esJefatura ? '-' : especSolic],
        ['Efector', efector],
        ['Partida Presupuestaria', baja?.partidaPresupuestaria],
        ['Autorización', vFecha(data.fechaAutorizacion)],
      ],
    },
  }
}

// ─── CEETPS ─────────────────────────────────────────────────────────────────────
const ESCALAFON_CEETPS: Record<string, string> = {
  '87': 'Enfermería Profesional del Sistema Público de Salud',
  '85': 'Carrera de Especialidades Técnico Profesionales de la Salud',
  '83': 'Carrera de la Administración Pública - Anexo II',
}

/** Caso de un ConcursoCeetps (Enfermería 87 / Técnicos 85 / Servicios Generales 83). */
export function getCasoCeetps(data: ConcursoCeetps): Caso {
  const cargo    = data.concurso?.cargo
  const persona  = data.concurso?.persona
  const baja     = data.concurso?.baja
  const hospital = data.hospital ?? cargo?.hospital
  const origen   = data.concurso?.origen ?? ''

  const codigo         = cargo?.codigoRegistro?.codigo ?? ''
  const efector         = efectorTexto(hospital?.sigla, hospital?.nombre)
  const escalafonTexto  = ESCALAFON_CEETPS[codigo] || ''
  const puestoBaja      = cargo?.literalPuesto || ''
  const puestoSolic     = data.puestoSolicitado || puestoBaja
  const especBaja       = cargo?.especialidad || '-'
  const esAmpliacion    = origen === 'Ampliación' || origen === 'POU a POF'
  const conCarga        = codigo === '87' || codigo === '85'
  const filaCarga: Campo[] = conCarga && data.cargaHoraria ? [['Carga Horaria', `${data.cargaHoraria} HS`]] : []

  const camposBaja = (puesto: string = puestoBaja): Campo[] => [
    ['Repartición', efector],
    ['EE de Baja', baja?.eeBaja ?? baja?.tipificadorOrigen],
    ['Nombre y Apellido', persona?.apellidoNombre],
    ['CUIL', persona?.cuil],
    ['Puesto', puesto],
    ['Especialidad', especBaja],
    ['Escalafón', escalafonTexto],
    ['Tipo', baja?.tipoBaja],
    ['Código de Registro', codigo],
    ['Fecha de Baja', vFecha(baja?.fechaBaja)],
    ...filaCarga,
  ]

  // ── Enfermería (87) ──────────────────────────────────────────────────────
  if (codigo === '87') {
    // Ampliación: no surge de una baja real → solo Autorización, caja "SOLICITUD".
    if (esAmpliacion) {
      return {
        caso: 'CEETPS_ENF_AMPLIACION',
        autorizacion: {
          intro: 'La presente procesa el registro de solicitud:',
          boxTitulo: 'SOLICITUD',
          campos: [
            ['Repartición', efector],
            ['EE de Solicitud', baja?.eeBaja],
            ['Carrera', escalafonTexto],
            ['Puesto', puestoBaja],
            ['Especialidad', especBaja],
            ['Código de Registro', codigo],
            ...filaCarga,
          ],
          cierre: 'Asimismo, se AUTORIZA la cobertura de las vacantes que a continuación se detallan.\n\n[COMPLETAR: fundamento / justificación de la ampliación]',
          camposVerde: [
            ['Expediente(s) de Concurso', data.expedienteConcurso],
            ['Cantidad de Cargos', '1'],
            ['Puesto', puestoSolic],
            ['Especialidad', especBaja],
            ['Efector', efector],
            ...filaCarga,
          ],
        },
      }
    }

    // Apertura 2x18hs: 1 cargo de 35hs se abre en 2 de 18hs.
    if (data.apertura2x18) {
      const nota = `Cabe destacar que, según el informe N° ${data.informeApertura || '[N° de informe]'}, se solicitó cubrir dos (2) cargos de Enfermería ATP de 18hs, los cuales tramitan mediante ${data.expedienteConcurso || '[Expediente 1]'} y ${data.expedienteConcurso2 || '[Expediente 2]'}.`
      return {
        caso: 'CEETPS_ENF_APERTURA',
        validacion: {
          intro: 'La presente procesa el registro de la baja de:',
          boxTitulo: 'BAJA',
          campos: camposBaja(),
          cierre: `Asimismo, se solicita la validación de la vacante por la baja indicada.\n\n${nota}`,
        },
        autorizacion: {
          intro: 'La presente procesa el registro de la baja de:',
          boxTitulo: 'BAJA',
          campos: camposBaja(),
          cierre: `Asimismo, se autoriza la vacante por la baja indicada.\n\n${nota}`,
          camposVerde: [
            ['Expediente(s) de Concurso', [data.expedienteConcurso, data.expedienteConcurso2].filter(Boolean).join(' / ')],
            ['Cantidad de Cargos', '2'],
            ['Puesto', 'Enfermería'],
            ['Especialidad', '-'],
            ['Efector', efector],
            ['Carga Horaria', '18hs'],
          ],
        },
      }
    }

    // Estándar: puesto del cuadro verde siempre "Enfermería Profesional".
    return {
      caso: 'CEETPS_ENF_ESTANDAR',
      validacion: {
        intro: 'La presente procesa el registro de la baja de:',
        boxTitulo: 'BAJA',
        campos: camposBaja(),
        cierre: 'Asimismo, se solicita la validación de la vacante por la baja indicada.',
      },
      autorizacion: {
        intro: 'La presente procesa el registro de la baja de:',
        boxTitulo: 'BAJA',
        campos: camposBaja(),
        cierre: 'Asimismo, se autoriza cobertura de la vacante en reemplazo de la mencionada baja.',
        camposVerde: [
          ['Expediente de Concurso', data.expedienteConcurso],
          ['Cantidad de Cargos', '1'],
          ['Puesto', 'Enfermería Profesional'],
          ['Especialidad', '-'],
          ['Efector', efector],
          ['Partida Presupuestaria', baja?.partidaPresupuestaria],
          ...filaCarga,
        ],
      },
    }
  }

  // ── Técnicos (85) ────────────────────────────────────────────────────────
  if (codigo === '85') {
    if (esAmpliacion) {
      return {
        caso: 'CEETPS_TEC_AMPLIACION',
        autorizacion: {
          intro: 'La presente procesa el registro de la cobertura de:',
          boxTitulo: 'AMPLIACIÓN',
          campos: [
            ['Repartición', efector],
            ['EE de Ampliación', baja?.eeBaja],
            ['Puesto', puestoBaja],
            ['Especialidad', especBaja],
            ['Escalafón', escalafonTexto],
            ['Tipo', 'Ampliación'],
            ['Código de Registro', codigo],
            ['Fecha de Ampliación', vFecha(baja?.fechaBaja)],
          ],
          cierre: 'Asimismo, se AUTORIZA la cobertura de la vacante de:\n\n[COMPLETAR: fundamento / justificación de la ampliación]',
          camposVerde: [
            ['Expediente(s) de Concurso', data.expedienteConcurso],
            ['Cantidad de Cargos', '1'],
            ['Puesto', puestoSolic],
            ['Especialidad', especBaja],
            ['Efector', efector],
            ...filaCarga,
          ],
        },
      }
    }

    return {
      caso: 'CEETPS_TEC_ESTANDAR',
      validacion: {
        intro: 'La presente procesa el registro de la baja de:',
        boxTitulo: 'BAJA',
        campos: camposBaja(),
        cierre: 'Asimismo, se solicita la validación de la vacante por la baja indicada.',
      },
      autorizacion: {
        intro: 'La presente procesa el registro de la baja de:',
        boxTitulo: 'BAJA',
        campos: camposBaja(),
        cierre: 'Asimismo, se autoriza la vacante por la baja indicada.',
        camposVerde: [
          ['Expediente de Concurso', data.expedienteConcurso],
          ['Cantidad de Cargos', '1'],
          ['Puesto', puestoSolic],
          ['Especialidad', especBaja],
          ['Efector', efector],
          ['Partida Presupuestaria', baja?.partidaPresupuestaria],
          ...filaCarga,
        ],
      },
    }
  }

  // ── Servicios Generales (83) — sin excepciones ──────────────────────────
  return {
    caso: 'CEETPS_SERV_ESTANDAR',
    validacion: {
      intro: 'La presente procesa el registro de la baja de:',
      boxTitulo: 'BAJA',
      campos: camposBaja(),
      cierre: 'Así mismo se solicita la validación de la vacante por la baja mencionada.',
    },
    autorizacion: {
      intro: 'La presente procesa el registro de la baja de:',
      boxTitulo: 'BAJA',
      campos: camposBaja(),
      cierre: 'Asimismo, se AUTORIZA la cobertura de la vacante, en reemplazo de la mencionada baja.',
      camposVerde: [
        ['Expediente de Concurso', data.expedienteConcurso],
        ['Cantidad de Cargos', '1'],
        ['Puesto', puestoSolic],
        ['Especialidad', especBaja],
        ['Efector', efector],
        ['Partida Presupuestaria', baja?.partidaPresupuestaria],
      ],
    },
  }
}

// ─── PDF: render genérico por caso ─────────────────────────────────────────────
function pdfSeccion(doc: jsPDF, y: number, cabecera: string, color: [number, number, number], filas: Campo[]) {
  autoTable(doc, {
    startY: y,
    head: [[{ content: cabecera, colSpan: 2 }]],
    body: filas.map(([l, val]) => [l, v(val)]),
    margin: { left: 16, right: 16 },
    theme: 'grid',
    headStyles: {
      fillColor: color,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 11,
      halign: 'center',
      cellPadding: { top: 5, bottom: 5, left: 4, right: 4 },
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 68, fillColor: S50, textColor: LABEL, fontSize: 9.5 },
      1: { textColor: INK, fontSize: 9.5 },
    },
    alternateRowStyles: { fillColor: S100 },
    styles: {
      cellPadding: { top: 3.5, bottom: 3.5, left: 5, right: 5 },
      lineColor: S200,
      lineWidth: 0.25,
    },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable.finalY as number
}

function pdfParrafo(doc: jsPDF, y: number, texto: string, opts: { fontSize?: number; color?: [number, number, number]; maxWidth?: number; lineHeight?: number } = {}) {
  const { fontSize = 9.5, color = LABEL, maxWidth = 178, lineHeight = 4.6 } = opts
  doc.setFontSize(fontSize)
  doc.setTextColor(...color)
  doc.setFont('helvetica', 'normal')
  const bloques = texto.split('\n\n')
  for (const bloque of bloques) {
    const lines = doc.splitTextToSize(bloque, maxWidth)
    doc.text(lines, 16, y)
    y += lines.length * lineHeight + 3
  }
  return y
}

function renderCasoPdf(seccion: Seccion, tipo: 'validacion' | 'autorizacion', filename: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw = doc.internal.pageSize.getWidth()
  let y = 20

  if (tipo === 'autorizacion') {
    doc.setFillColor(...TEAL)
    doc.rect(0, 0, pw, 20, 'F')
    doc.setTextColor(...WHITE)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('AUTORIZACIÓN PARA LA COBERTURA DE VACANTE', pw / 2, 13, { align: 'center' })
    y = 30
  }

  y = pdfParrafo(doc, y, seccion.intro, { fontSize: 10, color: INK }) + 4
  y = pdfSeccion(doc, y, seccion.boxTitulo, RED, seccion.campos) + 8
  y = pdfParrafo(doc, y, seccion.cierre)

  if (seccion.camposVerde) {
    y += 6
    const pageHeight = doc.internal.pageSize.getHeight()
    if (pageHeight - y < 70) { doc.addPage(); y = 20 }
    pdfSeccion(doc, y, 'AUTORIZACIÓN', GREEN, seccion.camposVerde)
  }

  doc.save(filename)
}

function nombreArchivo(prefijo: string, tipo: string, sufijo: string, ext: string) {
  return `${tipo}-${prefijo}-${sufijo}.${ext}`.replace(/[^a-zA-Z0-9._-]/g, '-')
}

export function exportCphPdf(data: ConcursoCph, tipo: 'validacion' | 'autorizacion') {
  const seccion = getCasoCph(data)[tipo]
  if (!seccion) return
  renderCasoPdf(seccion, tipo, nombreArchivo('cph', tipo, v(data.concurso?.persona?.cuil ?? data.id), 'pdf'))
}

export function exportCeetpsPdf(data: ConcursoCeetps, tipo: 'validacion' | 'autorizacion') {
  const seccion = getCasoCeetps(data)[tipo]
  if (!seccion) return
  renderCasoPdf(seccion, tipo, nombreArchivo('ceetps', tipo, v(data.concurso?.persona?.cuil ?? data.id), 'pdf'))
}

// ─── WORD: helpers ────────────────────────────────────────────────────────────
const BORDE = (color = 'CBD5E1') => ({
  top:     { style: BorderStyle.SINGLE, size: 4, color },
  bottom:  { style: BorderStyle.SINGLE, size: 4, color },
  left:    { style: BorderStyle.SINGLE, size: 4, color },
  right:   { style: BorderStyle.SINGLE, size: 4, color },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color },
  insideVertical:   { style: BorderStyle.SINGLE, size: 2, color },
})

const BORDE_NONE = () => ({
  top:     { style: BorderStyle.NONE, size: 0, color: 'auto' },
  bottom:  { style: BorderStyle.NONE, size: 0, color: 'auto' },
  left:    { style: BorderStyle.NONE, size: 0, color: 'auto' },
  right:   { style: BorderStyle.NONE, size: 0, color: 'auto' },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  insideVertical:   { style: BorderStyle.NONE, size: 0, color: 'auto' },
})

function wordTabla(cabecera: string, fillHex: string, filas: Campo[]) {
  return new Table({
    width: { size: 5000, type: WidthType.PERCENTAGE },
    borders: BORDE(),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 2,
            shading: { fill: fillHex, type: ShadingType.CLEAR, color: 'auto' },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: cabecera, bold: true, size: 24, color: 'FFFFFF' })],
              }),
            ],
          }),
        ],
      }),
      ...filas.map(([label, value], i) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 1750, type: WidthType.PERCENTAGE },
              shading: { fill: i % 2 === 0 ? 'F1F5F9' : 'F8FAFC', type: ShadingType.CLEAR, color: 'auto' },
              margins: { top: 60, bottom: 60, left: 120, right: 80 },
              children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 19, color: '1E293B' })] })],
            }),
            new TableCell({
              width: { size: 3250, type: WidthType.PERCENTAGE },
              shading: { fill: i % 2 === 0 ? 'FFFFFF' : 'FAFAFA', type: ShadingType.CLEAR, color: 'auto' },
              margins: { top: 60, bottom: 60, left: 120, right: 80 },
              children: [new Paragraph({ children: [new TextRun({ text: v(value), size: 19, color: '0F172A' })] })],
            }),
          ],
        })
      ),
    ],
  })
}

async function descargarDocx(doc: Document, nombre: string) {
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function wordBanner() {
  return new Table({
    width: { size: 5000, type: WidthType.PERCENTAGE },
    borders: BORDE_NONE(),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: '2A7185', type: ShadingType.CLEAR, color: 'auto' },
            margins: { top: 140, bottom: 140, left: 120, right: 120 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'AUTORIZACIÓN PARA LA COBERTURA DE VACANTE', bold: true, size: 26, color: 'FFFFFF' })],
              }),
            ],
          }),
        ],
      }),
    ],
  })
}

// Los bloques separados por "\n\n" (cierre + nota/decreto) se parten en párrafos
// aparte para que las notas "[COMPLETAR: ...]" queden editables como texto normal.
function wordParrafos(texto: string, opts: { color?: string; spacingBefore?: number } = {}) {
  const { color = '334155', spacingBefore = 0 } = opts
  return texto.split('\n\n').filter(Boolean).map((bloque, i) =>
    new Paragraph({
      spacing: { before: i === 0 ? spacingBefore : 160, after: 160 },
      children: [new TextRun({ text: bloque, size: 20, color })],
    })
  )
}

async function renderCasoWord(seccion: Seccion, tipo: 'validacion' | 'autorizacion', filename: string) {
  const children = []
  if (tipo === 'autorizacion') children.push(wordBanner())
  children.push(...wordParrafos(seccion.intro, { color: '0F172A', spacingBefore: tipo === 'autorizacion' ? 280 : 0 }))
  children.push(wordTabla(seccion.boxTitulo, 'DC2626', seccion.campos))
  children.push(...wordParrafos(seccion.cierre, { color: tipo === 'autorizacion' ? '0F172A' : '334155', spacingBefore: 280 }))
  if (seccion.camposVerde) {
    children.push(wordTabla('AUTORIZACIÓN', '059669', seccion.camposVerde))
  }

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 800, right: 900, bottom: 800, left: 900 } } },
      children,
    }],
  })

  await descargarDocx(doc, filename)
}

export async function exportCphWord(data: ConcursoCph, tipo: 'validacion' | 'autorizacion') {
  const seccion = getCasoCph(data)[tipo]
  if (!seccion) return
  await renderCasoWord(seccion, tipo, nombreArchivo('cph', tipo, v(data.concurso?.persona?.cuil ?? data.id), 'docx'))
}

export async function exportCeetpsWord(data: ConcursoCeetps, tipo: 'validacion' | 'autorizacion') {
  const seccion = getCasoCeetps(data)[tipo]
  if (!seccion) return
  await renderCasoWord(seccion, tipo, nombreArchivo('ceetps', tipo, v(data.concurso?.persona?.cuil ?? data.id), 'docx'))
}
