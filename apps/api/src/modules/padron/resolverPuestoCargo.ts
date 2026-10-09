import { esConduccionPorLiteral } from '../../shared/codigoCargo.js'
import { normalizarTexto } from '@srrhh/normalizacion'
import { derivarEspecialidadDesdePuesto } from './derivarEspecialidadPuesto.js'
import type { ModalidadPuesto, TipoPuesto } from '@prisma/client'

// S20-6: el catálogo PuestoCargo/EspecialidadPuesto pasa a ser la fuente real
// de verdad de puesto/especialidad en Cargo (FK obligatoria). El import del
// padrón ya no puede crear un Cargo sin resolver antes su puestoCargoId.
//
// Si el literal_puesto del padrón no matchea ningún PuestoCargo existente
// para ese escalafón (normalizado LOWER(TRIM())), NO se omite el cargo
// silenciosamente: se auto-crea un PuestoCargo nuevo marcado
// pendienteCurar=true, visible desde el admin de catálogo (S20-12) para que
// alguien lo revise/fusione después. Esto no bloquea el import semanal
// desatendido — decisión tomada en la planificación de S20-6.

type TxCatalogo = {
  puestoCargo: {
    findMany: (args: unknown) => Promise<{ id: string; escalafonId: string; nombre: string; modalidad: ModalidadPuesto; tipoPuesto: TipoPuesto }[]>
    create: (args: unknown) => Promise<{ id: string; nombre: string; modalidad: ModalidadPuesto; tipoPuesto: TipoPuesto }>
  }
  especialidadPuesto: {
    findMany: (args: unknown) => Promise<{ id: string; puestoCargId: string; nombre: string }[]>
    create: (args: unknown) => Promise<{ id: string }>
  }
}

// S21: la clave de matcheo con el catálogo curado usa la MISMA normalización
// que el seed (minúscula + sin tilde, mantiene ñ — @srrhh/normalizacion). Antes
// esto solo hacía trim().toLowerCase() SIN sacar tildes, así "Médico de Planta"
// del padrón no matcheaba "medico de planta" del catálogo y auto-creaba un
// puesto duplicado pendienteCurar. Ahora matchea y no duplica.
export function normPuestoKey(s: string | null | undefined): string {
  return normalizarTexto(s)
}

// S21: modalidad derivada del unificador del padrón (misma regla que usa el
// auto-alta). POU/guardia → 'pou', el resto → 'pof'.
//
// oct-2026: además del unificador se mira el LITERAL del puesto. El SIAL a veces
// trae el unificador VACÍO para cargos de guardia (ej. "Especialista en la
// Guardia Medico" con unificador en blanco), y entonces caían a 'pof' creando/
// resolviendo un puesto POF duplicado — una guardia es POU por definición. Esta
// es la misma regla que ya aplica codigoCargo.prefijoDeCargo ("el literal del
// puesto prevalece"): si el nombre del puesto dice "guardia", es POU.
function modalidadDeUnificador(
  unificadorPuesto: string | null | undefined,
  literalPuesto?: string | null | undefined,
): ModalidadPuesto {
  const unif = (unificadorPuesto ?? '').toUpperCase()
  const lit = (literalPuesto ?? '').toUpperCase()
  if (unif.includes('POU') || unif.includes('GUARDIA') || lit.includes('GUARDIA')) return 'pou'
  return 'pof'
}

// S21: clave del cache de puestos. INCLUYE la modalidad — antes era solo
// escalafón:nombre y colapsaba los puestos homónimos de distinta modalidad
// (ej. "medico de planta" POF y POU del mismo escalafón: uno pisaba al otro en
// el Map, ~150 casos en el catálogo). Así el import resolvía cargos a la
// modalidad equivocada. Ver búsqueda con fallback a 'ambos' en resolverPuestoCargoId.
function clavePuesto(escalafonId: string, modalidad: ModalidadPuesto | 'ambos', nombre: string | null | undefined): string {
  return `${escalafonId}:${modalidad}:${normPuestoKey(nombre)}`
}

export interface PuestoCargoInfo {
  id: string
  nombre: string
  modalidad: ModalidadPuesto
  tipoPuesto: TipoPuesto
}

export interface CatalogoPuestosCache {
  puestos: Map<string, PuestoCargoInfo>
  especialidades: Map<string, string>
}

// Carga el catálogo completo una sola vez — cardinalidad chica (cientos de
// filas), igual criterio que el cache de hospitales/escalafones ya existente
// en aprobarSnapshotService().
export async function cargarCatalogoPuestos(tx: TxCatalogo): Promise<CatalogoPuestosCache> {
  const [puestos, especialidades] = await Promise.all([
    tx.puestoCargo.findMany({
      select: { id: true, escalafonId: true, nombre: true, modalidad: true, tipoPuesto: true },
    }),
    tx.especialidadPuesto.findMany({
      select: { id: true, puestoCargId: true, nombre: true },
    }),
  ])
  const puestosMap = new Map<string, PuestoCargoInfo>()
  for (const p of puestos) {
    // Clave con modalidad REAL del puesto ('pof' | 'pou' | 'ambos') — así los
    // homónimos de distinta modalidad conviven en el Map sin pisarse.
    puestosMap.set(clavePuesto(p.escalafonId, p.modalidad, p.nombre), { id: p.id, nombre: p.nombre, modalidad: p.modalidad, tipoPuesto: p.tipoPuesto })
  }
  const especialidadesMap = new Map<string, string>()
  for (const e of especialidades) {
    especialidadesMap.set(`${e.puestoCargId}:${normPuestoKey(e.nombre)}`, e.id)
  }
  return { puestos: puestosMap, especialidades: especialidadesMap }
}

// Placeholder para filas del padrón con literal_puesto vacío (caso borde no
// visto en datos reales hoy, pero Cargo.puestoCargoId es NOT NULL — no
// podemos dejar el cargo sin crear por esto, se pierde la fila del SIAL).
const SIN_ESPECIFICAR = '(sin especificar)'

// Canonización del LITERAL del puesto (decisión de negocio, oct-2026): el SIAL
// a veces trae un literal GENÉRICO que no debe existir como puesto propio porque
// siempre es, en realidad, su variante de planta o de guardia. El puesto
// genérico "farmaceutico" (sin "de planta"/"de guardia") es uno de esos: se
// resuelve a "farmaceutico de guardia" cuando la modalidad es POU, y a
// "farmaceutico de planta" cuando es POF. Así el import no vuelve a crear el
// puesto genérico (que se desactivó) ni cuelga cargos de él.
// Recibe el literal normalizado (minúscula sin tilde) y la modalidad ya resuelta.
function canonicalizarLiteralPuesto(literalNorm: string, modalidad: ModalidadPuesto): string {
  if (literalNorm === 'farmaceutico') {
    return modalidad === 'pou' ? 'farmaceutico de guardia' : 'farmaceutico de planta'
  }
  return literalNorm
}

// Resuelve (o auto-crea) el PuestoCargo para un literal_puesto del padrón.
// Nunca devuelve null: un literal_puesto vacío/null resuelve al puesto
// placeholder "(sin especificar)" de ese escalafón, igual marcado
// pendienteCurar=true, para no bloquear la creación del Cargo.
export async function resolverPuestoCargoId(
  tx: TxCatalogo,
  cache: CatalogoPuestosCache,
  params: { escalafonId: string; literalPuesto: string | null; unificadorPuesto: string | null },
): Promise<PuestoCargoInfo> {
  const literalRaw = (params.literalPuesto ?? '').trim() || SIN_ESPECIFICAR

  // Modalidad derivada del padrón. La búsqueda en el cache es por (escalafón,
  // modalidad, nombre) con FALLBACK a 'ambos': un cargo POF/POU puede
  // corresponder a un puesto catalogado como 'ambos' (Residencias,
  // Administrativa, etc.). Prioriza el match de modalidad exacta.
  const modalidad: ModalidadPuesto = modalidadDeUnificador(params.unificadorPuesto, literalRaw)

  // Canoniza el literal genérico a su variante planta/guardia según modalidad
  // (ej. "farmaceutico" -> "farmaceutico de planta"|"...de guardia"), para no
  // recrear el puesto genérico desactivado. Se aplica sobre el literal
  // normalizado y se usa de acá en adelante para buscar/crear/guardar el puesto.
  const literal = canonicalizarLiteralPuesto(normalizarTexto(literalRaw), modalidad) || literalRaw
  // S21: el nombre se guarda CURADO (minúscula + sin tilde), igual que el
  // catálogo del seed — la curación es exactamente eso. Así el puesto
  // auto-creado por el padrón queda en el mismo formato y no aparece
  // "Médico" y "medico" como dos puestos.
  const nombreCurado = normalizarTexto(literal).slice(0, 200) || SIN_ESPECIFICAR

  const existente =
    cache.puestos.get(clavePuesto(params.escalafonId, modalidad, literal)) ??
    cache.puestos.get(clavePuesto(params.escalafonId, 'ambos', literal))
  if (existente) return existente

  const tipoPuesto: TipoPuesto = esConduccionPorLiteral(literal) ? 'conduccion' : 'ejecucion'

  const creado = await tx.puestoCargo.create({
    data: {
      escalafonId: params.escalafonId,
      nombre: nombreCurado,
      modalidad,
      tipoPuesto,
      pendienteCurar: true,
    },
    select: { id: true, nombre: true, modalidad: true, tipoPuesto: true },
  })
  console.warn(`[padron] Puesto sin match en catálogo: "${literal}" (escalafón ${params.escalafonId}, modalidad ${modalidad}) — PuestoCargo creado (curado="${nombreCurado}") con pendienteCurar=true`)
  const info: PuestoCargoInfo = { id: creado.id, nombre: creado.nombre, modalidad: creado.modalidad, tipoPuesto: creado.tipoPuesto }
  cache.puestos.set(clavePuesto(params.escalafonId, creado.modalidad, creado.nombre), info)
  return info
}

// S21: resuelve (o auto-crea CURADA) la especialidad del puesto. Decisión de
// negocio (Jorge): el proceso de dotación ALIMENTA el catálogo — si el padrón
// trae una especialidad que no existe para ese puesto, se agrega curada
// (minúscula + sin tilde), así el mapeo se va limpiando y completando import a
// import. El matcheo usa la misma normalización, por lo que "Cardiología" del
// padrón matchea "cardiologia" del catálogo y NO duplica.
//
// 2026-10 (Alcance B): el padrón NO trae especialidad para los puestos no
// médicos (enfermeros, técnicos, administrativos...), así que `especialidad`
// llega vacía y antes el cargo quedaba sin especialidad. Para esos puestos la
// especialidad está DETERMINADA por el puesto mismo, así que si el padrón no la
// trae se DERIVA del nombre del puesto (misma regla que el backfill, módulo
// compartido). Para médicos genéricos y conducción la derivación devuelve null
// y el cargo queda sin especialidad (correcto: no es derivable). Así cada
// padrón futuro ya trae la especialidad poblada sin correr el backfill a mano.
// Equivalencias de FUSIÓN de especialidades (decisión de negocio): el SIAL
// sigue trayendo nombres de variantes que ya se fusionaron a una canónica, y
// NO debe deshacerse esa fusión import a import. Se mapea la variante (clave
// normalizada minúscula sin tilde) a la canónica (también normalizada). El
// catálogo tiene la canónica con mayúscula ('Pediatria', 'Psicologia'); el
// match por normalización la encuentra, así que acá va en minúscula.
//   - "pediatria (clinica pediatrica)" → "pediatria"
//   - variantes de psicología clínica/médica/infantil → "psicologia"
// OJO: NO incluye las especialidades pediátricas legítimamente distintas
// (anestesiología pediátrica, cirugía infantil pediátrica, etc.) — esas se
// conservan. Solo la variante exacta que se fusionó.
export const EQUIVALENCIAS_ESPECIALIDAD: Record<string, string> = {
  // Fusiones de negocio (pediatría / psicología).
  'pediatria (clinica pediatrica)': 'pediatria',
  'psicologia clinica': 'psicologia',
  'psicologia medica': 'psicologia',
  'psicologia infantil': 'psicologia',
  'psicologia clinica infanto juvenil': 'psicologia',
  'psicologia infanto juvenil': 'psicologia',
  'psicologo': 'psicologia',
  // Variantes de nombre (profesión vs sustantivo / formato) que YA existen en el
  // catálogo con otro nombre — mapear para no crear duplicados import a import.
  'antropologia': 'antropologo',
  'biologia': 'biologo',
  'cirugia toraxica': 'cirugia toracica',
  'estomatologia': 'clinica estomatologica',
  'interdisciplinaria cuidados paliativos': 'interdisciplinaria cuidados paliativos medicos',
  'bioquimica clinica (area inmunologia)': 'bioquimica clinica-area inmunologia',
  'bioquimica clinica (endocrinologia)': 'bioquimica clinica-area endocrinologia',
  'bioquimica clinica (hematologia)': 'bioquimica clinica-area hematologia',
  'bioquimica clinica (emergentologia)': 'bioquimica clinica- area emergentologia',
  'bioquimica clinica sin especialidad': 'bioquimica clinica',
}

// Aplica el mapeo de fusión sobre un nombre ya normalizado (minúscula sin
// tilde). Si no es una variante fusionada, devuelve el nombre tal cual.
export function canonicalizarEspecialidad(nombreNorm: string): string {
  return EQUIVALENCIAS_ESPECIALIDAD[nombreNorm] ?? nombreNorm
}

// Valores que el SIAL trae en la columna especialidad pero que NO son una
// especialidad real: placeholders de "sin dato". Decisión de negocio (Jorge,
// oct-2026): "SIN ESPECIALIDAD" NO debe crearse como especialidad del catálogo
// ni pisar la especialidad vigente — se trata EXACTAMENTE igual que un valor
// vacío, para que aplique la cascada (fallback por puesto -> conservar anterior).
// Sin esto el import creaba una especialidad basura "sin especialidad" por
// puesto y la asignaba a los cargos de guardia médica (bug detectado oct-2026).
const ESPECIALIDAD_NO_REAL = new Set<string>([
  'sin especialidad',
  '(sin especificar)',
  's/e',
  's / e',
])

// Normaliza el valor de especialidad del SIAL a null cuando es un placeholder de
// "sin dato" (ver ESPECIALIDAD_NO_REAL), o lo devuelve tal cual si es real.
export function especialidadSialReal(especialidad: string | null | undefined): string | null {
  if (especialidad == null) return null
  const norm = normalizarTexto(especialidad)
  if (!norm || ESPECIALIDAD_NO_REAL.has(norm)) return null
  return especialidad
}

export async function resolverEspecialidadPuestoId(
  tx: TxCatalogo,
  cache: CatalogoPuestosCache,
  puestoCargoId: string,
  especialidad: string | null,
  nombrePuesto?: string | null,
): Promise<string | null> {
  // 1. Especialidad del padrón (médicos). Si vino, manda. Se canonicaliza para
  //    no reintroducir variantes ya fusionadas (ver EQUIVALENCIAS_ESPECIALIDAD).
  //    Antes se descarta "SIN ESPECIALIDAD" y placeholders equivalentes: no son
  //    una especialidad real, se tratan como vacío para que aplique el fallback
  //    por puesto y, si no es derivable, el caller conserve la anterior.
  const especialidadReal = especialidadSialReal(especialidad)
  let nombreCurado = canonicalizarEspecialidad(normalizarTexto(especialidadReal).slice(0, 200))

  // 2. Fallback (no médicos): si el padrón no trajo especialidad, derivarla del
  //    nombre del puesto. derivarEspecialidadDesdePuesto ya devuelve minúscula
  //    sin tilde; se vuelve a curar por las dudas para unificar el formato.
  if (!nombreCurado && nombrePuesto) {
    const derivada = derivarEspecialidadDesdePuesto(nombrePuesto)
    if (derivada) nombreCurado = normalizarTexto(derivada).slice(0, 200)
  }

  if (!nombreCurado) return null

  const key = `${puestoCargoId}:${normPuestoKey(nombreCurado)}`
  const existente = cache.especialidades.get(key)
  if (existente) return existente

  const creada = await tx.especialidadPuesto.create({
    data: { puestoCargId: puestoCargoId, nombre: nombreCurado },
    select: { id: true },
  })
  cache.especialidades.set(key, creada.id)
  return creada.id
}
