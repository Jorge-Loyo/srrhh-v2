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
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  AlignmentType,
  WidthType,
  ShadingType,
  BorderStyle,
} from 'docx'
import type { ConcursoCph, ConcursoCeetps } from '@srrhh/types'

// ─── Paleta ─────────────────────────────────────────────────────────────────
// Sacada por muestreo de píxeles de las capturas reales embebidas en
// "FORMULARIOS X CASO.docx" (la referencia oficial, no el legacy JS: el
// propio dotacion-rrhh/frontend/src/utils/exportReport.js ya usaba una
// paleta distinta a esta, más parecida a Tailwind — se ve que nunca
// terminó de igualar el Word oficial). Confirmado igual en 5 casos
// distintos (CPH y CEETPS): #45818E / #CC0000 / #38761D, la paleta default
// de Google Docs — el Word original se armó ahí.
const RED: [number, number, number] = [204, 0, 0]
const GREEN: [number, number, number] = [56, 118, 29]
const TEAL: [number, number, number] = [69, 129, 142]
const WHITE: [number, number, number] = [255, 255, 255]
const BLACK: [number, number, number] = [0, 0, 0]
// El legacy no tiene franjas alternadas ni texto en gris azulado — todas las
// filas son blanco liso, texto y bordes en negro (ver FORMULARIOS X CASO).
const INK: [number, number, number] = BLACK
const LABEL: [number, number, number] = BLACK

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
  const cargo = data.concurso?.cargo
  const persona = data.concurso?.persona
  const baja = data.concurso?.baja
  const hospital = data.hospital ?? cargo?.hospital
  const origen = data.concurso?.origen ?? ''

  const efector = efectorTexto(hospital?.sigla, hospital?.nombre)
  const puestoBaja = cargo?.literalPuesto || ''
  const puestoSolic = data.puestoSolicitado || puestoBaja
  // cargo.especialidad es una relación (Especialidad?, no viene incluida en
  // el payload de la API) — el string real está en especialidadLegacy, ver
  // migración especialidades_fk. Usar el campo viejo acá dejaba "Especialidad"
  // en blanco ("-") en TODOS los documentos generados.
  const especBaja = cargo?.especialidadLegacy || '-'
  const especSolic = data.especialidadSolicitada || especBaja
  const esSolicitud = origen === 'Ampliación' || origen === 'POU a POF'
  const esSuplente = cargo?.unificadorPuesto === 'Suplente de Guardia'
  const esJefatura = cargo?.unificadorPuesto === 'Jefaturas'
  const esCobertura = origen === 'Cobertura Dotación'
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
          ['Cantidad de Cargos', String(data.cantidadCargos ?? 1)],
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
        cierre:
          'Asimismo, se autoriza la cobertura de la vacante, en reemplazo de la mencionada baja.',
        camposVerde: [
          ['Expediente de Concurso', data.eeConcurso],
          ['Cantidad de Cargos', String(data.cantidadCargos ?? 1)],
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
          ['Cantidad de Cargos', String(data.cantidadCargos ?? 1)],
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
        ['Cantidad de Cargos', String(data.cantidadCargos ?? 1)],
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
  const cargo = data.concurso?.cargo
  const persona = data.concurso?.persona
  const baja = data.concurso?.baja
  const hospital = data.hospital ?? cargo?.hospital
  const origen = data.concurso?.origen ?? ''

  const codigo = cargo?.codigoRegistro?.codigo ?? ''
  const efector = efectorTexto(hospital?.sigla, hospital?.nombre)
  const escalafonTexto = ESCALAFON_CEETPS[codigo] || ''
  const puestoBaja = cargo?.literalPuesto || ''
  const puestoSolic = data.puestoSolicitado || puestoBaja
  // Ver mismo comentario en getCasoCph — .especialidad es la relación (no
  // viene en el payload), el string real está en especialidadLegacy.
  const especBaja = cargo?.especialidadLegacy || '-'
  const esAmpliacion = origen === 'Ampliación' || origen === 'POU a POF'
  const conCarga = codigo === '87' || codigo === '85'
  const filaCarga: Campo[] =
    conCarga && data.cargaHoraria ? [['Carga Horaria', `${data.cargaHoraria} HS`]] : []

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
          cierre:
            'Asimismo, se AUTORIZA la cobertura de las vacantes que a continuación se detallan.\n\n[COMPLETAR: fundamento / justificación de la ampliación]',
          camposVerde: [
            ['Expediente(s) de Concurso', data.expedienteConcurso],
            ['Cantidad de Cargos', String(data.cantidadCargos ?? 1)],
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
            [
              'Expediente(s) de Concurso',
              [data.expedienteConcurso, data.expedienteConcurso2].filter(Boolean).join(' / '),
            ],
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
          ['Cantidad de Cargos', String(data.cantidadCargos ?? 1)],
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
          cierre:
            'Asimismo, se AUTORIZA la cobertura de la vacante de:\n\n[COMPLETAR: fundamento / justificación de la ampliación]',
          camposVerde: [
            ['Expediente(s) de Concurso', data.expedienteConcurso],
            ['Cantidad de Cargos', String(data.cantidadCargos ?? 1)],
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
          ['Cantidad de Cargos', String(data.cantidadCargos ?? 1)],
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
      cierre:
        'Asimismo, se AUTORIZA la cobertura de la vacante, en reemplazo de la mencionada baja.',
      camposVerde: [
        ['Expediente de Concurso', data.expedienteConcurso],
        ['Cantidad de Cargos', String(data.cantidadCargos ?? 1)],
        ['Puesto', puestoSolic],
        ['Especialidad', especBaja],
        ['Efector', efector],
        ['Partida Presupuestaria', baja?.partidaPresupuestaria],
      ],
    },
  }
}

// ─── PDF: render genérico por caso ─────────────────────────────────────────────
// valorColor: en el cuadro rojo (BAJA/AMPLIACIÓN/etc.) el valor de cada campo
// va en rojo, igual que el header — en el cuadro verde (AUTORIZACIÓN) va en
// negro. Confirmado por muestreo de píxeles en FORMULARIOS X CASO.
function pdfSeccion(
  doc: jsPDF,
  y: number,
  cabecera: string,
  color: [number, number, number],
  filas: Campo[],
  valorColor: [number, number, number] = INK,
) {
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
      0: { fontStyle: 'bold', cellWidth: 68, fillColor: WHITE, textColor: LABEL, fontSize: 9.5 },
      1: { fillColor: WHITE, textColor: valorColor, fontSize: 9.5 },
    },
    // Sin franjas alternadas — todas las filas blanco liso, bordes negros
    // (ver FORMULARIOS X CASO, no hay banding gris en ninguno de los casos).
    styles: {
      cellPadding: { top: 3.5, bottom: 3.5, left: 5, right: 5 },
      lineColor: BLACK,
      lineWidth: 0.25,
      overflow: 'linebreak',
      valign: 'top',
    },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable.finalY as number
}

function pdfParrafo(
  doc: jsPDF,
  y: number,
  texto: string,
  opts: {
    fontSize?: number
    color?: [number, number, number]
    maxWidth?: number
    lineHeight?: number
  } = {},
) {
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
  y = pdfSeccion(doc, y, seccion.boxTitulo, RED, seccion.campos, RED) + 8
  y = pdfParrafo(doc, y, seccion.cierre)

  if (seccion.camposVerde) {
    y += 6
    const pageHeight = doc.internal.pageSize.getHeight()
    if (pageHeight - y < 70) {
      doc.addPage()
      y = 20
    }
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
  renderCasoPdf(
    seccion,
    tipo,
    nombreArchivo('cph', tipo, v(data.concurso?.persona?.cuil ?? data.id), 'pdf'),
  )
}

export function exportCeetpsPdf(data: ConcursoCeetps, tipo: 'validacion' | 'autorizacion') {
  const seccion = getCasoCeetps(data)[tipo]
  if (!seccion) return
  renderCasoPdf(
    seccion,
    tipo,
    nombreArchivo('ceetps', tipo, v(data.concurso?.persona?.cuil ?? data.id), 'pdf'),
  )
}

// ─── PDF: Acta de sorteo de jurado ──────────────────────────────────────────
// Genera el acta del jurado sorteado (titulares/suplentes) para un ConcursoCph.
// Solo PDF (no hay versión Word del acta, a diferencia de Validación/Autorización).
interface MiembroJuradoActa {
  rol: 'titular' | 'suplente'
  orden: number
  apellidoNombre: string
  cuil: string
  hospitalNombre?: string | null
  puesto?: string | null
  especialidad?: string | null
  ambito: 'hospital' | 'sistema'
  reglaAplicada?: number | null
  cumpleEspecialidad?: boolean
  esConduccion?: boolean
  antiguedadAnios?: number | null
}
interface SorteoJuradoActa {
  fechaSorteo: string
  ambito: string
  confirmado?: boolean
  observaciones?: string | null
  criterios?: {
    escalafonNombre?: string | null
    especialidadConcurso?: string | null
    hospitalNombre?: string | null
    antiguedadMinimaAnios?: number
    especialidadesAdicionales?: string[]
    expedienteEspecialidades?: string | null
    tipoGestion?: 'centralizado' | 'descentralizado' | null
    modalidadConcurso?: 'pou' | 'pof' | null
    reglaUsada?: number
  } | null
  miembros: MiembroJuradoActa[]
}

// Texto de fundamento de cada regla de elegibilidad — documentación
// respaldatoria que explica por qué cada miembro del jurado es válido, según
// la regla que le tocó (ver comentario de cabecera de sorteoJurado.service.ts,
// misma fuente de verdad). Necesario para que el acta se sostenga como
// prueba documental al momento de aprobarse el jurado.
function textoReglas(
  tipoGestion: 'centralizado' | 'descentralizado' | null | undefined,
  modalidad: 'pou' | 'pof' | null | undefined,
  antiguedadMin: number,
): string[] {
  if (tipoGestion === 'centralizado') {
    return [
      'Regla única: cargo de conducción (Jefe de Sección o superior) + misma especialidad, en cualquier hospital de toda la base (sin prioridad de hospital ni cascada).',
    ]
  }
  if (modalidad === 'pou') {
    return [
      'Regla 1: mismo hospital del cargo a concursar + Jefe de guardia (POU) + misma especialidad.',
      'Regla 2: mismo hospital + Jefe de planta (POF) + misma especialidad.',
      `Regla 3: mismo hospital + antigüedad mínima de ${antiguedadMin} años + misma especialidad.`,
      `Regla 4: se amplía a todo el sistema de salud (cualquier hospital) + antigüedad mínima de ${antiguedadMin} años + misma especialidad.`,
    ]
  }
  return [
    'Regla 1: mismo hospital del cargo a concursar + cargo de conducción (Jefe de Sección o superior) + misma especialidad.',
    `Regla 2: mismo hospital + antigüedad mínima de ${antiguedadMin} años (la especialidad no es obligatoria en esta regla).`,
    'Regla 3: se amplía a todo el sistema de salud (cualquier hospital) + cargo de conducción + misma especialidad.',
  ]
}

export function exportJuradoPdf(data: ConcursoCph, jurado: SorteoJuradoActa) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw = doc.internal.pageSize.getWidth()

  // Banner
  doc.setFillColor(...TEAL)
  doc.rect(0, 0, pw, 20, 'F')
  doc.setTextColor(...WHITE)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('ACTA DE SORTEO DE JURADO', pw / 2, 13, { align: 'center' })
  let y = 30

  const cargo = data.concurso?.cargo
  const hospital = data.hospital ?? cargo?.hospital
  const encabezado: Campo[] = [
    ['Expediente de Concurso', data.eeConcurso],
    ['Efector', efectorTexto(hospital?.sigla, hospital?.nombre)],
    ['Puesto', data.puestoSolicitado || cargo?.literalPuesto],
    [
      'Especialidad',
      jurado.criterios?.especialidadConcurso ??
        data.especialidadSolicitada ??
        cargo?.especialidadLegacy,
    ],
    ['Profesión / Carrera', jurado.criterios?.escalafonNombre],
    ['Fecha del sorteo', vFecha(jurado.fechaSorteo)],
    [
      'Ámbito',
      jurado.ambito === 'hospital'
        ? 'Misma unidad organizativa'
        : jurado.ambito === 'sistema'
          ? 'Sistema de salud'
          : 'Mixto (hospital + sistema)',
    ],
    ...(jurado.criterios?.reglaUsada != null
      ? [['Cascada de reglas', `Hasta Regla ${jurado.criterios.reglaUsada}`] as Campo]
      : []),
    ['Estado', jurado.confirmado ? 'Confirmado' : 'Borrador (sin confirmar)'],
  ]
  y = pdfSeccion(doc, y, 'CONCURSO', TEAL, encabezado) + 8

  const filasRol = (rol: 'titular' | 'suplente'): Campo[] =>
    jurado.miembros
      .filter((m) => m.rol === rol)
      .sort((a, b) => a.orden - b.orden)
      .map((m) => {
        // "✓" no existe en la fuente helvetica estándar de jsPDF — sale como
        // un glifo roto ("'"). Se reemplaza por texto plano.
        const marcas = [
          m.reglaAplicada != null ? `Regla ${m.reglaAplicada}` : null,
          m.cumpleEspecialidad ? 'cumple especialidad' : 'no cumple especialidad',
          m.esConduccion ? 'cargo de conducción' : null,
          m.antiguedadAnios != null ? `${m.antiguedadAnios} años de antigüedad` : null,
          m.ambito === 'hospital' ? 'mismo hospital' : 'sistema de salud',
        ].filter(Boolean)
        // Una línea por dato (en vez de todo unido en una sola línea larga
        // con " — "/" · "): esas líneas densas no tenían puntos de corte
        // suficientes para el ancho de columna y se salían del recuadro.
        const lineas = [m.cuil, m.especialidad, m.puesto, m.hospitalNombre, ...marcas].filter(
          Boolean,
        )
        return [
          `${rol === 'titular' ? 'Titular' : 'Suplente'} ${m.orden}`,
          `${m.apellidoNombre}\n${lineas.join('\n')}`,
        ]
      })

  const titulares = filasRol('titular')
  const suplentes = filasRol('suplente')

  if (titulares.length) y = pdfSeccion(doc, y, 'TITULARES', GREEN, titulares) + 6
  if (suplentes.length) {
    const ph = doc.internal.pageSize.getHeight()
    if (ph - y < 60) {
      doc.addPage()
      y = 20
    }
    y = pdfSeccion(doc, y, 'SUPLENTES', GREEN, suplentes) + 6
  }

  if (jurado.observaciones) {
    y += 2
    y = pdfParrafo(doc, y, `Observaciones: ${jurado.observaciones}`, { fontSize: 9 })
  }

  // Detalle de fundamento — documentación respaldatoria de por qué cada
  // miembro es elegible según la regla que le tocó. Necesario para que el
  // acta sostenga la validez del jurado al momento de aprobarse.
  {
    const ph = doc.internal.pageSize.getHeight()
    if (ph - y < 70) {
      doc.addPage()
      y = 20
    }
    y += 4
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...INK)
    doc.text('DETALLE DE REGLAS APLICADAS', 16, y)
    y += 5

    const tipoGestion = jurado.criterios?.tipoGestion
    const esCentralizado = tipoGestion === 'centralizado'
    const modalidad = jurado.criterios?.modalidadConcurso
    const antiguedadMin = jurado.criterios?.antiguedadMinimaAnios ?? 15
    const reglas = textoReglas(tipoGestion, modalidad, antiguedadMin)
    const intro = esCentralizado
      ? `Tipo de gestión: centralizado. Al ser centralizado, no hay cascada de reglas ni prioridad de hospital: se aplicó una única regla en toda la base de datos (exige además la misma profesión/escalafón que el cargo a concursar y ocupación activa; Director y Subdirector quedan excluidos de cualquier jurado):`
      : `Tipo de gestión: descentralizado. Cargo a concursar: ${modalidad === 'pou' ? 'guardia (POU)' : 'planta (POF)'}. Cada titular y suplente fue seleccionado aplicando, en cascada y en este orden, las siguientes reglas de elegibilidad (todas exigen además la misma profesión/escalafón que el cargo a concursar y ocupación activa; Director y Subdirector quedan excluidos de cualquier jurado):`
    y = pdfParrafo(
      doc,
      y,
      `${intro}\n\n${reglas.map((r) => `• ${r}`).join('\n')}`,
      { fontSize: 8.5 },
    )

    if (
      jurado.criterios?.especialidadesAdicionales?.length ||
      jurado.criterios?.expedienteEspecialidades
    ) {
      y += 1
      const especs = jurado.criterios?.especialidadesAdicionales ?? []
      y = pdfParrafo(
        doc,
        y,
        `Especialidades adicionales admitidas como "cumple especialidad" además de ${jurado.criterios?.especialidadConcurso ?? 'la propia del concurso'}: ${especs.length ? especs.join(', ') : '—'}. Expediente que respalda la ampliación: ${jurado.criterios?.expedienteEspecialidades ?? '—'}.`,
        { fontSize: 8.5 },
      )
    }

    y = pdfParrafo(
      doc,
      y,
      `Regla efectivamente utilizada para completar el jurado: Regla ${jurado.criterios?.reglaUsada ?? '—'}. Junto a cada integrante (más arriba) se detalla la regla puntual que le corresponde, si cumple la especialidad, si tiene cargo de conducción, su antigüedad y el ámbito (mismo hospital o sistema de salud).`,
      { fontSize: 8.5 },
    )
  }

  doc.save(nombreArchivo('jurado', 'acta', v(data.eeConcurso ?? data.id), 'pdf'))
}

// ─── PDF: Acta de orden de mérito ────────────────────────────────────────────
interface InscriptoActa {
  apellido: string
  nombre: string
  cuil?: string | null
  dni?: string | null
  email?: string | null
  presentoExamen?: boolean
  ordenMerito?: number | null
}

export function exportOrdenMeritoPdf(data: ConcursoCph, inscriptos: InscriptoActa[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw = doc.internal.pageSize.getWidth()

  doc.setFillColor(...TEAL)
  doc.rect(0, 0, pw, 20, 'F')
  doc.setTextColor(...WHITE)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('ACTA DE ORDEN DE MÉRITO', pw / 2, 13, { align: 'center' })
  let y = 30

  const cargo = data.concurso?.cargo
  const hospital = data.hospital ?? cargo?.hospital
  const encabezado: Campo[] = [
    ['Expediente de Concurso', data.eeConcurso],
    ['Efector', efectorTexto(hospital?.sigla, hospital?.nombre)],
    ['Puesto', data.puestoSolicitado || cargo?.literalPuesto],
    ['Especialidad', data.especialidadSolicitada ?? cargo?.especialidadLegacy],
    ['Fecha de examen', vFecha(data.fechaExamen)],
    ['Fecha orden de mérito', vFecha(data.fechaOrdenMerito)],
    ['Estado', data.ordenMeritoConfirmado ? 'Confirmado' : 'Borrador (sin confirmar)'],
  ]
  y = pdfSeccion(doc, y, 'CONCURSO', TEAL, encabezado) + 8

  // Ranking: presentados con posición, ordenados por posición.
  const ranking = inscriptos
    .filter((i) => i.presentoExamen && i.ordenMerito != null)
    .sort((a, b) => (a.ordenMerito as number) - (b.ordenMerito as number))
    .map((i) => {
      const detalle = [i.dni ? `DNI ${i.dni}` : null, i.cuil, i.email].filter(Boolean).join(' — ')
      return [
        String(i.ordenMerito),
        `${i.apellido}, ${i.nombre}${detalle ? `\n${detalle}` : ''}`,
      ] as Campo
    })

  if (ranking.length) {
    y = pdfSeccion(doc, y, 'ORDEN DE MÉRITO', GREEN, ranking) + 6
  } else {
    y = pdfParrafo(doc, y, 'No hay inscriptos con posición asignada en el orden de mérito.', {
      fontSize: 9,
    })
  }

  doc.save(nombreArchivo('orden-merito', 'acta', v(data.eeConcurso ?? data.id), 'pdf'))
}

// ─── WORD: helpers ────────────────────────────────────────────────────────────
// Bordes negros, sin franjas — igual que el PDF (ver comentario de paleta arriba).
const BORDE = (color = '000000') => ({
  top: { style: BorderStyle.SINGLE, size: 4, color },
  bottom: { style: BorderStyle.SINGLE, size: 4, color },
  left: { style: BorderStyle.SINGLE, size: 4, color },
  right: { style: BorderStyle.SINGLE, size: 4, color },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color },
  insideVertical: { style: BorderStyle.SINGLE, size: 2, color },
})

const BORDE_NONE = () => ({
  top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
})

// valorColorHex: en el cuadro rojo el valor de cada campo va en rojo, igual
// que el header — en el verde va en negro (ver comentario en pdfSeccion).
function wordTabla(cabecera: string, fillHex: string, filas: Campo[], valorColorHex = '000000') {
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
      // Sin franjas alternadas — todas las filas blanco liso (ver FORMULARIOS X CASO).
      ...filas.map(
        ([label, value]) =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: 1750, type: WidthType.PERCENTAGE },
                shading: { fill: 'FFFFFF', type: ShadingType.CLEAR, color: 'auto' },
                margins: { top: 60, bottom: 60, left: 120, right: 80 },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: label, bold: true, size: 19, color: '000000' })],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 3250, type: WidthType.PERCENTAGE },
                shading: { fill: 'FFFFFF', type: ShadingType.CLEAR, color: 'auto' },
                margins: { top: 60, bottom: 60, left: 120, right: 80 },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: v(value), size: 19, color: valorColorHex })],
                  }),
                ],
              }),
            ],
          }),
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
            shading: { fill: '45818E', type: ShadingType.CLEAR, color: 'auto' },
            margins: { top: 140, bottom: 140, left: 120, right: 120 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'AUTORIZACIÓN PARA LA COBERTURA DE VACANTE',
                    bold: true,
                    size: 26,
                    color: 'FFFFFF',
                  }),
                ],
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
  const { color = '000000', spacingBefore = 0 } = opts
  return texto
    .split('\n\n')
    .filter(Boolean)
    .map(
      (bloque, i) =>
        new Paragraph({
          spacing: { before: i === 0 ? spacingBefore : 160, after: 160 },
          children: [new TextRun({ text: bloque, size: 20, color })],
        }),
    )
}

async function renderCasoWord(
  seccion: Seccion,
  tipo: 'validacion' | 'autorizacion',
  filename: string,
) {
  const children = []
  if (tipo === 'autorizacion') children.push(wordBanner())
  children.push(
    ...wordParrafos(seccion.intro, {
      color: '000000',
      spacingBefore: tipo === 'autorizacion' ? 280 : 0,
    }),
  )
  children.push(wordTabla(seccion.boxTitulo, 'CC0000', seccion.campos, 'CC0000'))
  children.push(...wordParrafos(seccion.cierre, { color: '000000', spacingBefore: 280 }))
  if (seccion.camposVerde) {
    children.push(wordTabla('AUTORIZACIÓN', '38761D', seccion.camposVerde))
  }

  const doc = new Document({
    sections: [
      {
        properties: { page: { margin: { top: 800, right: 900, bottom: 800, left: 900 } } },
        children,
      },
    ],
  })

  await descargarDocx(doc, filename)
}

export async function exportCphWord(data: ConcursoCph, tipo: 'validacion' | 'autorizacion') {
  const seccion = getCasoCph(data)[tipo]
  if (!seccion) return
  await renderCasoWord(
    seccion,
    tipo,
    nombreArchivo('cph', tipo, v(data.concurso?.persona?.cuil ?? data.id), 'docx'),
  )
}

export async function exportCeetpsWord(data: ConcursoCeetps, tipo: 'validacion' | 'autorizacion') {
  const seccion = getCasoCeetps(data)[tipo]
  if (!seccion) return
  await renderCasoWord(
    seccion,
    tipo,
    nombreArchivo('ceetps', tipo, v(data.concurso?.persona?.cuil ?? data.id), 'docx'),
  )
}
