export type Color = 'blue' | 'yellow' | 'green' | 'red' | 'gray' | 'purple' | 'orange'

export interface EtapaFlujo {
  id: string
  label: string
  color: Color
  descripcion: string
  campos: { campo: string; desc: string }[]
  reglas: string[]
  origen?: string[]
}

// ── Etapas del sub-estado CPH (A → G) ────────────────────────────────────────

export const ETAPAS_CPH: EtapaFlujo[] = [
  {
    id: 'origen',
    label: 'Origen del concurso',
    color: 'gray',
    descripcion:
      'Un concurso CPH nace de dos situaciones: un cargo nuevo (alta POF/POU aprobada por el director) o una baja con genera_concurso = true (la persona deja el cargo y se habilita el proceso de selección).',
    campos: [
      { campo: 'motivoConcurso', desc: '"nuevo_cargo" si viene de alta aprobada, "alta_por_baja" si viene de baja con genera_concurso = true' },
      { campo: 'cargoId', desc: 'Cargo CPH (POF, POU o Jefatura) que origina el concurso' },
      { campo: 'hospitalId', desc: 'Hospital al que pertenece el cargo' },
    ],
    reglas: [
      'Solo cargos CPH (escalafón código 22 o 37) pueden iniciar un concurso CPH.',
      'Para "nuevo_cargo": el director aprueba el alta desde Autorizaciones → el sistema ofrece iniciar el concurso.',
      'Para "alta_por_baja": la baja se registra con genera_concurso = true → el cargo queda vigente + vacante → se inicia el concurso.',
      'Un cargo en estado no_vigente o validacion_vacante NO puede iniciar concurso.',
      'No puede haber dos concursos activos para el mismo cargo simultáneamente.',
    ],
    origen: [
      'Alta de cargo aprobada por director (motivoConcurso = nuevo_cargo)',
      'Baja registrada con genera_concurso = true (motivoConcurso = alta_por_baja)',
    ],
  },
  {
    id: 'a',
    label: 'A — Validación vacante',
    color: 'orange',
    descripcion:
      'Estado inicial del concurso. El área de RRHH verifica que el cargo esté efectivamente vacante y que la documentación de baja (o el acto de alta) sea correcta antes de autorizar el llamado.',
    campos: [
      { campo: 'eeBaja', desc: 'Expediente electrónico de la baja que originó la vacante (solo para alta_por_baja)' },
      { campo: 'subEstado', desc: '"A-VALID.VCTE"' },
    ],
    reglas: [
      'El concurso queda en este sub-estado hasta que RRHH valide la documentación.',
      'Para nuevo_cargo: se valida el acto administrativo de alta.',
      'Para alta_por_baja: se valida el expediente de baja (eeBaja) y que ocupacion.hasta esté seteado.',
      'Si la documentación es incorrecta, el concurso puede ser rechazado y el cargo vuelve a vigente + vacante sin concurso.',
    ],
  },
  {
    id: 'b',
    label: 'B — Autorizado',
    color: 'blue',
    descripcion:
      'El concurso fue autorizado por la autoridad competente. Se registra la fecha de autorización y se sortea el jurado.',
    campos: [
      { campo: 'fechaAutorizacion', desc: 'Fecha en que la autoridad aprueba el llamado a concurso' },
      { campo: 'eeConcurso', desc: 'Expediente electrónico del concurso (distinto al de la baja)' },
      { campo: 'disposicion', desc: 'Número de disposición de llamado a concurso' },
      { campo: 'subEstado', desc: '"B-AUTORIZADO"' },
    ],
    reglas: [
      'La fecha de autorización es el punto de partida para los plazos legales.',
      'El EE Concurso es diferente al EE Baja — son dos expedientes distintos.',
      'La disposición de llamado es el acto administrativo que habilita la inscripción.',
      'El jurado se sortea en esta etapa (campo sorteoJurado).',
    ],
  },
  {
    id: 'c',
    label: 'C — Inscripción',
    color: 'yellow',
    descripcion:
      'Período de inscripción abierto. Los postulantes presentan sus antecedentes. Se registran las fechas de apertura y cierre.',
    campos: [
      { campo: 'inscripcionDesde', desc: 'Fecha de apertura del período de inscripción' },
      { campo: 'inscripcionHasta', desc: 'Fecha de cierre del período de inscripción' },
      { campo: 'subEstado', desc: '"C-INSCRIPCION"' },
    ],
    reglas: [
      'El período de inscripción debe estar publicado en el Boletín Oficial.',
      'Los postulantes presentan CV, títulos y antecedentes en el hospital.',
      'Al cerrar la inscripción, el área de concursos evalúa los antecedentes.',
      'Si no hay postulantes: el concurso puede declararse desierto (→ rellamado).',
    ],
  },
  {
    id: 'd',
    label: 'D — Etapa evaluación',
    color: 'purple',
    descripcion:
      'El jurado evalúa los antecedentes y toma el examen. Se confecciona el orden de mérito.',
    campos: [
      { campo: 'fechaExamen', desc: 'Fecha del examen o evaluación de antecedentes' },
      { campo: 'ordenMerito', desc: 'Texto libre con el orden de mérito resultante' },
      { campo: 'subEstado', desc: '"D-ETAPA EVAL"' },
    ],
    reglas: [
      'El jurado evalúa: antecedentes curriculares + examen escrito/oral.',
      'El orden de mérito es vinculante — el primero en la lista tiene derecho preferente.',
      'Si el primero renuncia o no acepta, se ofrece al siguiente en el orden.',
      'El orden de mérito tiene vigencia de 2 años para cubrir vacantes similares.',
    ],
  },
  {
    id: 'e',
    label: 'E — Adjudicado',
    color: 'green',
    descripcion:
      'Se adjudica el cargo al ganador del concurso. El jurado eleva el acta de adjudicación.',
    campos: [
      { campo: 'subEstado', desc: '"E-ADJUDI"' },
      { campo: 'especialidadSolicitada', desc: 'Especialidad del cargo que se adjudica' },
    ],
    reglas: [
      'La adjudicación es el acto formal del jurado — no es la designación todavía.',
      'El ganador debe aceptar formalmente la adjudicación.',
      'Si rechaza: se ofrece al siguiente en el orden de mérito.',
      'Si todos rechazan: el concurso se declara desierto.',
    ],
  },
  {
    id: 'f',
    label: 'F — Próximo a designar',
    color: 'blue',
    descripcion:
      'El expediente de designación está en trámite. Se aguarda la resolución ministerial.',
    campos: [
      { campo: 'eeDesignacion', desc: 'Expediente electrónico de designación' },
      { campo: 'ifacs', desc: 'Aptitud médica (IFACS) — obligatorio antes de la resolución' },
      { campo: 'insal', desc: 'INSAL — informe de situación laboral' },
      { campo: 'subEstado', desc: '"F-PROX.A DESIG"' },
    ],
    reglas: [
      'El IFACS (aptitud médica) es obligatorio — sin él no puede emitirse la resolución.',
      'El INSAL verifica que la persona no tenga incompatibilidades.',
      'El EE Designación es el tercer expediente del proceso (Baja → Concurso → Designación).',
      'Esta etapa puede demorar semanas por los trámites administrativos.',
    ],
  },
  {
    id: 'g',
    label: 'G — Resolución',
    color: 'green',
    descripcion:
      'Se emite la resolución de designación. El concurso cierra y el cargo pasa a ocupado.',
    campos: [
      { campo: 'disposicionDesignacion', desc: 'Número de disposición de designación' },
      { campo: 'resolucionDesignacion', desc: 'Número de resolución ministerial de designación' },
      { campo: 'subEstado', desc: '"G-RESOLUCION"' },
    ],
    reglas: [
      'La resolución es el acto administrativo final que designa a la persona.',
      'Al registrar la resolución, el sistema crea la ocupación (persona_id + cargo_id + hasta = NULL).',
      'El concurso pasa a estado "finalizado" y el cargo a vigente + ocupado.',
      'La persona queda con situacion_revista = Activo.',
    ],
  },
  {
    id: 'desierto',
    label: 'Desierto / Rellamado',
    color: 'red',
    descripcion:
      'El concurso se declara desierto cuando no hay postulantes, todos rechazan la adjudicación, o el jurado no puede evaluar. Se inicia un rellamado con el mismo expediente.',
    campos: [
      { campo: 'suspendido', desc: 'true si el concurso está suspendido temporalmente' },
      { campo: 'observaciones', desc: 'Motivo del desierto o suspensión' },
    ],
    reglas: [
      'El rellamado usa el mismo EE Concurso — no se abre uno nuevo.',
      'El concurso vuelve al sub-estado B-AUTORIZADO o C-INSCRIPCION según el caso.',
      'Un concurso puede tener múltiples rellamados.',
      'Si se suspende: suspendido = true, el cargo sigue vacante.',
      'Causas frecuentes: sin postulantes, postulantes no aptos, renuncia del ganador.',
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
  { desde: 'Origen', hacia: 'A — Validación', condicion: 'Alta aprobada o baja con genera_concurso = true' },
  { desde: 'A — Validación', hacia: 'B — Autorizado', condicion: 'RRHH valida documentación' },
  { desde: 'A — Validación', hacia: 'Cancelado', condicion: 'Documentación incorrecta / cargo no vacante', dashed: true },
  { desde: 'B — Autorizado', hacia: 'C — Inscripción', condicion: 'Disposición de llamado emitida' },
  { desde: 'C — Inscripción', hacia: 'D — Evaluación', condicion: 'Cierre del período de inscripción' },
  { desde: 'C — Inscripción', hacia: 'Desierto', condicion: 'Sin postulantes al cierre', dashed: true },
  { desde: 'D — Evaluación', hacia: 'E — Adjudicado', condicion: 'Jurado confecciona orden de mérito' },
  { desde: 'D — Evaluación', hacia: 'Desierto', condicion: 'Sin postulantes aptos', dashed: true },
  { desde: 'E — Adjudicado', hacia: 'F — Próx. a designar', condicion: 'Ganador acepta la adjudicación' },
  { desde: 'E — Adjudicado', hacia: 'Desierto', condicion: 'Todos rechazan la adjudicación', dashed: true },
  { desde: 'F — Próx. a designar', hacia: 'G — Resolución', condicion: 'IFACS + INSAL aprobados, EE Designación completo' },
  { desde: 'G — Resolución', hacia: 'Finalizado', condicion: 'Resolución emitida → cargo pasa a ocupado' },
  { desde: 'Desierto', hacia: 'B — Autorizado', condicion: 'Rellamado — mismo EE Concurso', dashed: true },
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
    rol: 'Gestiona el proceso completo desde la validación hasta la resolución',
    acciones: [
      'Valida la documentación de baja o alta (etapa A)',
      'Registra el EE Concurso, disposición y fecha de autorización (etapa B)',
      'Carga las fechas de inscripción (etapa C)',
      'Registra el examen y el orden de mérito (etapa D)',
      'Registra la adjudicación (etapa E)',
      'Carga el EE Designación, IFACS e INSAL (etapa F)',
      'Registra la resolución de designación (etapa G)',
    ],
  },
  {
    nombre: 'Jurado',
    color: 'orange',
    rol: 'Evalúa a los postulantes y confecciona el orden de mérito',
    acciones: [
      'Se sortea en la etapa B (sorteoJurado)',
      'Evalúa antecedentes curriculares',
      'Toma el examen escrito/oral',
      'Confecciona y firma el acta de orden de mérito',
      'Eleva el acta de adjudicación',
    ],
  },
  {
    nombre: 'Postulante',
    color: 'green',
    rol: 'Se inscribe y participa del proceso de selección',
    acciones: [
      'Presenta CV, títulos y antecedentes durante el período de inscripción',
      'Rinde el examen en la fecha indicada',
      'Acepta o rechaza la adjudicación',
      'Tramita el IFACS (aptitud médica) si es adjudicado',
    ],
  },
  {
    nombre: 'Ministerio (MSGC)',
    color: 'red',
    rol: 'Emite la resolución de designación',
    acciones: [
      'Recibe el EE Designación con IFACS e INSAL aprobados',
      'Emite la resolución ministerial de designación',
      'La resolución es el acto administrativo final que crea la ocupación',
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
  { nombre: 'EE Baja', campo: 'eeBaja', etapa: 'A', obligatorio: false, desc: 'Expediente de la baja que originó la vacante. Solo para alta_por_baja.' },
  { nombre: 'EE Concurso', campo: 'eeConcurso', etapa: 'B', obligatorio: true, desc: 'Expediente electrónico del proceso de concurso. Distinto al de la baja.' },
  { nombre: 'Disposición de llamado', campo: 'disposicion', etapa: 'B', obligatorio: true, desc: 'Acto administrativo que habilita la inscripción pública.' },
  { nombre: 'Sorteo de jurado', campo: 'sorteoJurado', etapa: 'B', obligatorio: true, desc: 'Fecha y acta del sorteo del jurado evaluador.' },
  { nombre: 'Período de inscripción', campo: 'inscripcionDesde / inscripcionHasta', etapa: 'C', obligatorio: true, desc: 'Fechas de apertura y cierre de la inscripción.' },
  { nombre: 'Fecha de examen', campo: 'fechaExamen', etapa: 'D', obligatorio: true, desc: 'Fecha en que se toma el examen o se evalúan antecedentes.' },
  { nombre: 'Orden de mérito', campo: 'ordenMerito', etapa: 'D', obligatorio: true, desc: 'Listado de postulantes ordenados por puntaje.' },
  { nombre: 'EE Designación', campo: 'eeDesignacion', etapa: 'F', obligatorio: true, desc: 'Expediente de designación del ganador. Tercer expediente del proceso.' },
  { nombre: 'IFACS', campo: 'ifacs', etapa: 'F', obligatorio: true, desc: 'Aptitud médica del postulante. Obligatorio antes de la resolución.' },
  { nombre: 'INSAL', campo: 'insal', etapa: 'F', obligatorio: true, desc: 'Informe de situación laboral. Verifica incompatibilidades.' },
  { nombre: 'Disposición de designación', campo: 'disposicionDesignacion', etapa: 'G', obligatorio: true, desc: 'Disposición previa a la resolución ministerial.' },
  { nombre: 'Resolución de designación', campo: 'resolucionDesignacion', etapa: 'G', obligatorio: true, desc: 'Resolución ministerial final. Crea la ocupación en el sistema.' },
]
