export type Color = 'blue' | 'yellow' | 'green' | 'red' | 'gray' | 'purple' | 'orange'

export interface EtapaFlujo {
  id: string
  label: string
  subEstado: string
  color: Color
  descripcion: string
  campos: { campo: string; desc: string }[]
  reglas: string[]
}

// ── 16 etapas reales del subEstado CPH ───────────────────────────────────────

export const ETAPAS_CPH: EtapaFlujo[] = [
  {
    id: 'vacante',
    label: 'Vacante',
    subEstado: 'VACANTE',
    color: 'gray',
    descripcion:
      'El cargo está vacante y el concurso fue creado pero aún no tiene expediente. Estado inicial antes de que el área de concursos caratule el expediente.',
    campos: [
      { campo: 'motivoConcurso', desc: '"nuevo_cargo" o "alta_por_baja"' },
      { campo: 'cargoId', desc: 'Cargo CPH que origina el concurso' },
    ],
    reglas: [
      'El concurso se crea automáticamente al aprobar un alta CPH o al registrar una baja con genera_concurso = true.',
      'El cargo debe estar vigente + vacante para que el concurso pueda avanzar.',
      'No puede haber dos concursos activos para el mismo cargo.',
    ],
  },
  {
    id: 'a-caratulado',
    label: 'A — Caratulado',
    subEstado: 'A-CARATULADO',
    color: 'orange',
    descripcion:
      'Se caratuló el expediente electrónico del concurso. El área de concursos inicia formalmente el trámite administrativo.',
    campos: [
      { campo: 'eeConcurso', desc: 'Expediente electrónico del concurso (distinto al de la baja)' },
      { campo: 'eeBaja', desc: 'Expediente de la baja que originó la vacante (solo alta_por_baja)' },
    ],
    reglas: [
      'El EE Concurso es diferente al EE Baja — son expedientes independientes.',
      'Sin EE Concurso no puede avanzar a la siguiente etapa.',
    ],
  },
  {
    id: 'a-autzn',
    label: 'A — Autorización',
    subEstado: 'A-AUTZN',
    color: 'orange',
    descripcion:
      'El concurso está en trámite de autorización. Se gestiona la disposición de llamado ante la autoridad competente.',
    campos: [
      { campo: 'fechaAutorizacion', desc: 'Fecha en que la autoridad aprueba el llamado' },
      { campo: 'disposicion', desc: 'Número de disposición de llamado a concurso' },
    ],
    reglas: [
      'La fecha de autorización es el punto de partida para los plazos legales.',
      'La disposición de llamado es el acto administrativo que habilita la inscripción.',
    ],
  },
  {
    id: 'b-sorteo-jur',
    label: 'B — Sorteo jurado',
    subEstado: 'B-SORTEO JUR',
    color: 'blue',
    descripcion:
      'Se realiza el sorteo del jurado evaluador. El acta de sorteo queda registrada en el expediente.',
    campos: [
      { campo: 'sorteoJurado', desc: 'Fecha y acta del sorteo del jurado evaluador' },
    ],
    reglas: [
      'El jurado se sortea entre los profesionales habilitados según la especialidad del cargo.',
      'El acta de sorteo debe quedar incorporada al EE Concurso.',
    ],
  },
  {
    id: 'c-dispo-llamado',
    label: 'C — Dispo. de llamado',
    subEstado: 'C-DISPO DE LLAMADO',
    color: 'blue',
    descripcion:
      'La disposición de llamado fue emitida y publicada. El concurso está formalmente convocado.',
    campos: [
      { campo: 'disposicion', desc: 'Número de disposición de llamado (confirmado)' },
    ],
    reglas: [
      'La disposición debe publicarse en el Boletín Oficial antes de abrir la inscripción.',
    ],
  },
  {
    id: 'd-examen-publicado',
    label: 'D — Examen publicado',
    subEstado: 'D-EXAMEN PUBLICADO',
    color: 'yellow',
    descripcion:
      'El período de inscripción está abierto y la fecha de examen fue publicada. Los postulantes presentan sus antecedentes.',
    campos: [
      { campo: 'inscripcionDesde', desc: 'Fecha de apertura del período de inscripción' },
      { campo: 'inscripcionHasta', desc: 'Fecha de cierre del período de inscripción' },
      { campo: 'fechaExamen', desc: 'Fecha publicada del examen o evaluación de antecedentes' },
    ],
    reglas: [
      'Los postulantes presentan CV, títulos y antecedentes en el hospital.',
      'Si no hay postulantes al cierre: el concurso puede declararse desierto.',
    ],
  },
  {
    id: 'e-orden-merito',
    label: 'E — Orden de mérito',
    subEstado: 'E-ORDEN DE MERITO',
    color: 'purple',
    descripcion:
      'El jurado evaluó los antecedentes y tomó el examen. Se confeccionó el orden de mérito.',
    campos: [
      { campo: 'ordenMerito', desc: 'Texto libre con el orden de mérito resultante' },
    ],
    reglas: [
      'El jurado evalúa antecedentes curriculares + examen escrito/oral.',
      'El orden de mérito es vinculante — el primero tiene derecho preferente.',
      'Si el primero renuncia, se ofrece al siguiente en el orden.',
      'El orden de mérito tiene vigencia de 2 años para cubrir vacantes similares.',
    ],
  },
  {
    id: 'f-ifacs',
    label: 'F — IFACS',
    subEstado: 'F-IFACS',
    color: 'purple',
    descripcion:
      'El ganador del concurso tramita el IFACS (aptitud médica). Es obligatorio antes de emitir la resolución de designación.',
    campos: [
      { campo: 'ifacs', desc: 'Número o referencia del certificado de aptitud médica (IFACS)' },
    ],
    reglas: [
      'El IFACS es obligatorio — sin él no puede emitirse la resolución.',
      'Lo tramita el postulante adjudicado ante el organismo correspondiente.',
    ],
  },
  {
    id: 'g-insal',
    label: 'G — INSAL',
    subEstado: 'G-INSAL',
    color: 'purple',
    descripcion:
      'Se tramita el INSAL (informe de situación laboral). Verifica que la persona no tenga incompatibilidades.',
    campos: [
      { campo: 'insal', desc: 'Número o referencia del informe INSAL' },
    ],
    reglas: [
      'El INSAL verifica incompatibilidades y situación de revista.',
      'Debe estar aprobado antes de avanzar al TAD.',
    ],
  },
  {
    id: 'h-tad',
    label: 'H — TAD',
    subEstado: 'H-TAD',
    color: 'blue',
    descripcion:
      'El expediente de designación se inicia en TAD (Trámites a Distancia). Se carga la documentación del ganador.',
    campos: [
      { campo: 'eeDesignacion', desc: 'Expediente electrónico de designación iniciado en TAD' },
    ],
    reglas: [
      'El EE Designación es el tercer expediente del proceso (Baja → Concurso → Designación).',
      'Se inicia en TAD con la documentación del adjudicado.',
    ],
  },
  {
    id: 'i-carga-docu',
    label: 'I — Carga documentación',
    subEstado: 'I-CARGA DOCU',
    color: 'blue',
    descripcion:
      'Se carga la documentación completa del adjudicado en el expediente de designación.',
    campos: [
      { campo: 'eeDesignacion', desc: 'EE Designación con documentación completa' },
    ],
    reglas: [
      'Toda la documentación del adjudicado debe estar incorporada al EE Designación.',
      'Sin documentación completa no puede avanzar a la revisión médica.',
    ],
  },
  {
    id: 'j-apto-med',
    label: 'J — Apto médico',
    subEstado: 'J-APTO MED',
    color: 'green',
    descripcion:
      'Se verifica el apto médico del adjudicado. Confirmación final de aptitud para el cargo.',
    campos: [
      { campo: 'ifacs', desc: 'IFACS aprobado — apto médico confirmado' },
    ],
    reglas: [
      'El apto médico es la confirmación final de que el adjudicado puede asumir el cargo.',
    ],
  },
  {
    id: 'k-ite',
    label: 'K — ITE',
    subEstado: 'K-ITE',
    color: 'blue',
    descripcion:
      'El expediente pasa por el ITE (Informe Técnico Económico). Verificación presupuestaria del cargo.',
    campos: [],
    reglas: [
      'El ITE verifica que el cargo tiene financiamiento presupuestario disponible.',
      'Sin ITE aprobado no puede emitirse el proyecto de resolución.',
    ],
  },
  {
    id: 'l-pycto-reso',
    label: 'L — Proyecto de resolución',
    subEstado: 'L-PYCTO DE RESO',
    color: 'blue',
    descripcion:
      'Se confecciona el proyecto de resolución de designación. Revisión legal y administrativa antes de la firma.',
    campos: [],
    reglas: [
      'El proyecto de resolución es revisado por el área legal antes de elevar a la firma.',
    ],
  },
  {
    id: 'm-reso-firma',
    label: 'M — Resolución a la firma',
    subEstado: 'M-RESO A LA FIRMA',
    color: 'blue',
    descripcion:
      'La resolución de designación está lista y aguarda la firma de la autoridad ministerial.',
    campos: [],
    reglas: [
      'Esta etapa puede demorar días o semanas según la agenda ministerial.',
    ],
  },
  {
    id: 'n-designado',
    label: 'N — Designado',
    subEstado: 'N-DESIGNADO',
    color: 'green',
    descripcion:
      'La resolución fue firmada. El adjudicado queda formalmente designado en el cargo.',
    campos: [
      { campo: 'disposicionDesignacion', desc: 'Número de disposición de designación' },
      { campo: 'resolucionDesignacion', desc: 'Número de resolución ministerial de designación' },
    ],
    reglas: [
      'La resolución es el acto administrativo final que designa a la persona.',
      'El concurso pasa a estado "finalizado" al registrar la resolución.',
    ],
  },
  {
    id: 'o-alta-sial',
    label: 'O — Alta SIAL',
    subEstado: 'O-ALTA SIAL',
    color: 'green',
    descripcion:
      'El alta de la persona fue procesada en SIAL. El cargo pasa a ocupado y el concurso queda cerrado.',
    campos: [
      { campo: 'resolucionDesignacion', desc: 'Resolución registrada — alta en SIAL confirmada' },
    ],
    reglas: [
      'Al registrar el alta en SIAL, el sistema crea la ocupación (persona_id + cargo_id + hasta = NULL).',
      'El cargo pasa a vigente + ocupado.',
      'La persona queda con situacion_revista = Activo.',
    ],
  },
]

// ── Flujo completo: transiciones ──────────────────────────────────────────────

export interface Transicion {
  desde: string
  hacia: string
  condicion: string
  dashed?: boolean
}

export const TRANSICIONES_CPH: Transicion[] = [
  { desde: 'Origen', hacia: 'VACANTE', condicion: 'Alta aprobada o baja con genera_concurso = true' },
  { desde: 'VACANTE', hacia: 'A-CARATULADO', condicion: 'Área de concursos caratula el expediente' },
  { desde: 'A-CARATULADO', hacia: 'A-AUTZN', condicion: 'EE Concurso registrado' },
  { desde: 'A-AUTZN', hacia: 'B-SORTEO JUR', condicion: 'Disposición de llamado emitida' },
  { desde: 'B-SORTEO JUR', hacia: 'C-DISPO DE LLAMADO', condicion: 'Acta de sorteo de jurado registrada' },
  { desde: 'C-DISPO DE LLAMADO', hacia: 'D-EXAMEN PUBLICADO', condicion: 'Disposición publicada en Boletín Oficial' },
  { desde: 'D-EXAMEN PUBLICADO', hacia: 'E-ORDEN DE MERITO', condicion: 'Cierre de inscripción + examen tomado' },
  { desde: 'D-EXAMEN PUBLICADO', hacia: 'Desierto', condicion: 'Sin postulantes al cierre', dashed: true },
  { desde: 'E-ORDEN DE MERITO', hacia: 'F-IFACS', condicion: 'Orden de mérito confeccionado' },
  { desde: 'E-ORDEN DE MERITO', hacia: 'Desierto', condicion: 'Sin postulantes aptos', dashed: true },
  { desde: 'F-IFACS', hacia: 'G-INSAL', condicion: 'IFACS tramitado' },
  { desde: 'G-INSAL', hacia: 'H-TAD', condicion: 'INSAL aprobado' },
  { desde: 'H-TAD', hacia: 'I-CARGA DOCU', condicion: 'EE Designación iniciado en TAD' },
  { desde: 'I-CARGA DOCU', hacia: 'J-APTO MED', condicion: 'Documentación completa cargada' },
  { desde: 'J-APTO MED', hacia: 'K-ITE', condicion: 'Apto médico confirmado' },
  { desde: 'K-ITE', hacia: 'L-PYCTO DE RESO', condicion: 'ITE aprobado' },
  { desde: 'L-PYCTO DE RESO', hacia: 'M-RESO A LA FIRMA', condicion: 'Proyecto de resolución revisado' },
  { desde: 'M-RESO A LA FIRMA', hacia: 'N-DESIGNADO', condicion: 'Resolución firmada por autoridad ministerial' },
  { desde: 'N-DESIGNADO', hacia: 'O-ALTA SIAL', condicion: 'Alta procesada en SIAL → cargo ocupado' },
  { desde: 'Desierto', hacia: 'C-DISPO DE LLAMADO', condicion: 'Rellamado — mismo EE Concurso', dashed: true },
]

// ── Actores del proceso ───────────────────────────────────────────────────────

export interface Actor {
  nombre: string
  color: Color
  rol: string
  acciones: string[]
}

export const ACTORES_CPH: Actor[] = [
  {
    nombre: 'Director del Hospital',
    color: 'blue',
    rol: 'Aprueba el alta de cargo y habilita el inicio del concurso',
    acciones: [
      'Aprueba o rechaza la solicitud de alta de cargo desde Autorizaciones',
      'Al aprobar un alta CPH, el sistema ofrece iniciar el concurso directamente',
      'Puede iniciar el concurso con motivoConcurso = nuevo_cargo',
    ],
  },
  {
    nombre: 'Área de Concursos (RRHH)',
    color: 'purple',
    rol: 'Gestiona el proceso completo desde la caratulación hasta el alta en SIAL',
    acciones: [
      'Caratula el expediente electrónico del concurso (A-CARATULADO)',
      'Gestiona la autorización y disposición de llamado (A-AUTZN → C-DISPO DE LLAMADO)',
      'Registra las fechas de inscripción y examen (D-EXAMEN PUBLICADO)',
      'Registra el orden de mérito (E-ORDEN DE MERITO)',
      'Acompaña el trámite de IFACS, INSAL y TAD (F → I)',
      'Gestiona el ITE y el proyecto de resolución (K → L)',
      'Registra la resolución de designación (N-DESIGNADO)',
      'Confirma el alta en SIAL (O-ALTA SIAL)',
    ],
  },
  {
    nombre: 'Jurado',
    color: 'orange',
    rol: 'Evalúa a los postulantes y confecciona el orden de mérito',
    acciones: [
      'Se sortea en la etapa B-SORTEO JUR',
      'Evalúa antecedentes curriculares',
      'Toma el examen escrito/oral',
      'Confecciona y firma el acta de orden de mérito',
    ],
  },
  {
    nombre: 'Postulante',
    color: 'green',
    rol: 'Se inscribe y participa del proceso de selección',
    acciones: [
      'Presenta CV, títulos y antecedentes durante el período de inscripción',
      'Rinde el examen en la fecha indicada',
      'Tramita el IFACS (aptitud médica) si es adjudicado',
      'Inicia el trámite en TAD con su documentación',
    ],
  },
  {
    nombre: 'Ministerio (MSGC)',
    color: 'red',
    rol: 'Emite la resolución de designación',
    acciones: [
      'Recibe el EE Designación con IFACS, INSAL e ITE aprobados',
      'Revisa el proyecto de resolución (L-PYCTO DE RESO)',
      'Firma la resolución ministerial de designación (M-RESO A LA FIRMA → N-DESIGNADO)',
    ],
  },
]

// ── Documentación requerida ───────────────────────────────────────────────────

export interface DocRequerido {
  nombre: string
  campo: string
  etapa: string
  obligatorio: boolean
  desc: string
}

export const DOCS_CPH: DocRequerido[] = [
  { nombre: 'EE Baja', campo: 'eeBaja', etapa: 'A-CARATULADO', obligatorio: false, desc: 'Expediente de la baja que originó la vacante. Solo para alta_por_baja.' },
  { nombre: 'EE Concurso', campo: 'eeConcurso', etapa: 'A-CARATULADO', obligatorio: true, desc: 'Expediente electrónico del proceso de concurso. Distinto al de la baja.' },
  { nombre: 'Disposición de llamado', campo: 'disposicion', etapa: 'A-AUTZN', obligatorio: true, desc: 'Acto administrativo que habilita la inscripción pública.' },
  { nombre: 'Sorteo de jurado', campo: 'sorteoJurado', etapa: 'B-SORTEO JUR', obligatorio: true, desc: 'Fecha y acta del sorteo del jurado evaluador.' },
  { nombre: 'Período de inscripción', campo: 'inscripcionDesde / inscripcionHasta', etapa: 'D-EXAMEN PUBLICADO', obligatorio: true, desc: 'Fechas de apertura y cierre de la inscripción.' },
  { nombre: 'Fecha de examen', campo: 'fechaExamen', etapa: 'D-EXAMEN PUBLICADO', obligatorio: true, desc: 'Fecha en que se toma el examen o se evalúan antecedentes.' },
  { nombre: 'Orden de mérito', campo: 'ordenMerito', etapa: 'E-ORDEN DE MERITO', obligatorio: true, desc: 'Listado de postulantes ordenados por puntaje.' },
  { nombre: 'IFACS', campo: 'ifacs', etapa: 'F-IFACS', obligatorio: true, desc: 'Aptitud médica del postulante. Obligatorio antes de la resolución.' },
  { nombre: 'INSAL', campo: 'insal', etapa: 'G-INSAL', obligatorio: true, desc: 'Informe de situación laboral. Verifica incompatibilidades.' },
  { nombre: 'EE Designación (TAD)', campo: 'eeDesignacion', etapa: 'H-TAD', obligatorio: true, desc: 'Expediente de designación iniciado en TAD. Tercer expediente del proceso.' },
  { nombre: 'Disposición de designación', campo: 'disposicionDesignacion', etapa: 'N-DESIGNADO', obligatorio: true, desc: 'Disposición previa a la resolución ministerial.' },
  { nombre: 'Resolución de designación', campo: 'resolucionDesignacion', etapa: 'N-DESIGNADO', obligatorio: true, desc: 'Resolución ministerial final. Crea la ocupación en el sistema.' },
]
