// =============================================================================
// Sorteo de jurado CPH (Etapa 2 — Autorización)
// =============================================================================
// Implementa la formación de jurado según el diagrama del reglamento CPH:
//
//   El candidato a jurado debe tener la MISMA PROFESIÓN (escalafón) que el
//   cargo a concursar y CARGO ACTIVO. Director y Subdirector quedan excluidos
//   de cualquier jurado, sin excepción, en los dos modos de abajo.
//
//   Las reglas de elegibilidad dependen del TIPO DE GESTIÓN del concurso
//   (`ConcursoCph.tipoGestion`, elegido por el usuario en Etapa 2 antes de
//   poder sortear — ver puestos.routes.ts/ConcursoCphWizard.tsx):
//
//   Concurso DESCENTRALIZADO (default si no está definido): reglas en
//   cascada según la MODALIDAD del cargo (POF = planta, POU = guardia),
//   determinada por `unificadorPuesto` del cargo (mismo criterio que
//   codigoCargo.ts):
//
//   Cargo POF (planta):
//     Regla 1: mismo hospital + cargo de conducción + misma especialidad
//     Regla 2: mismo hospital + antigüedad >= 15 años (especialidad opcional)
//     Regla 3: cualquier hospital (sistema) + conducción + misma especialidad
//
//   Cargo POU (guardia):
//     Regla 1: mismo hospital + Jefe de guardia (POU) + misma especialidad
//     Regla 2: mismo hospital + Jefe de planta (POF) + misma especialidad
//     Regla 3: mismo hospital + antigüedad >= 15 años + misma especialidad
//     Regla 4: cualquier hospital (sistema) + antigüedad >= 15 años + misma
//              especialidad
//
//   Concurso CENTRALIZADO: una única regla, sin cascada y sin prioridad de
//   hospital — el pool es directamente todo el sistema de salud:
//     Regla 1: cargo de conducción (Jefe de Sección o superior) + misma
//              especialidad, en cualquier hospital de toda la base.
//
// El sorteo es aleatorio con semilla (reproducible/auditable). Se persiste un
// acta (SorteoJurado) + los miembros (MiembroJuradoSorteado) con el detalle de
// por qué cada uno fue elegible y en qué ámbito (hospital/sistema).

import { Prisma, type ConcursoCph } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { GenerarSorteoJuradoBody } from './concursos-cph.schema.js'
import { calcConcursoCph } from './concursosCph.calc.js'

// ── RNG determinista (mulberry32) sembrado con un hash de la semilla ─────────
// No usamos Math.random() para que el sorteo sea reproducible dado la semilla
// guardada en el acta (requisito de auditoría).
function hashSemilla(seed: string): number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Fisher–Yates con RNG sembrado
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Normaliza especialidades para comparar (sin acentos, minúsculas, trim). Se
// descarta lo que está entre paréntesis: los cargos legacy guardan la
// especialidad como "Clinica Medica (Medicina Interna)" mientras el padrón de
// personas usa la forma base "Clínica Médica"; comparamos por la base para que
// hagan match. No se modifican los datos, solo la comparación.
function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, '') // quita "(...)" (subespecialidad/aclaración)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// codigoJefaturas no nulo/vacío/'0' ⇒ cargo de conducción (misma convención
// que organigrama.service.ts y cadena-mando.service.ts).
function esConduccion(codigoJefaturas: string | null): boolean {
  return !!codigoJefaturas && codigoJefaturas.trim() !== '' && codigoJefaturas.trim() !== '0'
}

function aniosDesde(fecha: Date | null, hoy: Date): number | null {
  if (!fecha) return null
  const ms = hoy.getTime() - fecha.getTime()
  if (ms < 0) return 0
  return Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000))
}

// Modalidad del cargo (guardia = POU, planta = POF), determinada por
// `unificadorPuesto` — mismo criterio que apps/api/src/shared/codigoCargo.ts
// (no hay todavía un catálogo con FK que lo resuelva de forma más robusta).
type ModalidadCargo = 'pou' | 'pof'

function modalidadDeCargo(unificadorPuesto: string | null): ModalidadCargo {
  const u = norm(unificadorPuesto)
  return u.includes('pou') || u.includes('guardia') ? 'pou' : 'pof'
}

// Reglas de elegibilidad en orden de prioridad (cascada), distintas según la
// modalidad del cargo a concursar (ver comentario de cabecera). Todas exigen
// la MISMA PROFESIÓN (escalafón) y CARGO ACTIVO — eso ya lo garantiza la
// query. Se acumula por regla hasta juntar al menos N candidatos (total de
// jurados); si una regla ya alcanza N, no se baja a la siguiente.
type ReglaJurado = 1 | 2 | 3 | 4
const REGLAS_POF: ReglaJurado[] = [1, 2, 3]
const REGLAS_POU: ReglaJurado[] = [1, 2, 3, 4]
// Concurso centralizado: una sola regla, sin cascada — ver comentario de
// cabecera del archivo.
const REGLAS_CENTRALIZADO: ReglaJurado[] = [1]

// Candidato normalizado a jurado (una persona con su ocupación activa relevante).
interface Candidato {
  personaId: string
  apellidoNombre: string
  cuil: string
  hospitalId: string | null
  hospitalNombre: string | null
  puesto: string | null
  especialidad: string | null
  esMismoHospital: boolean
  cumpleEspecialidad: boolean
  esConduccion: boolean
  antiguedadAnios: number | null
  // Regla de mayor prioridad que cumple (null = no cumple ninguna → descartado).
  regla: ReglaJurado | null
}

interface MiembroElegido extends Candidato {
  rol: 'titular' | 'suplente'
  orden: number
  ambito: 'hospital' | 'sistema'
  reglaAplicada: ReglaJurado
}

// Trae los candidatos elegibles: personas con ocupación activa (hasta=null) en
// un cargo del MISMO escalafón que el cargo a concursar. Excluye a la persona
// que se está por designar / que salió de baja en este concurso (si aplica).
async function obtenerCandidatos(params: {
  escalafonId: string
  hospitalIdConcurso: string
  // null cuando el concurso es centralizado — ahí no aplica la distinción
  // POF/POU, hay una sola regla (ver clasificar()).
  modalidadConcurso: ModalidadCargo | null
  // Especialidad del concurso + hasta 2 adicionales que también cuentan como
  // "cumple especialidad" — amplía el pool de jurados elegibles.
  especialidadesConcurso: (string | null)[]
  antiguedadMinimaAnios: number
  excluirPersonaIds: string[]
}): Promise<Candidato[]> {
  const hoy = new Date()
  const especNormSet = new Set(
    params.especialidadesConcurso.map((e) => norm(e)).filter((e) => e !== ''),
  )

  // Determina la regla de mayor prioridad que cumple un candidato (o null).
  // La especialidad es obligatoria en TODAS las reglas salvo Regla 2 de un
  // cargo POF (mismo hospital + antigüedad, especialidad opcional ahí).
  const clasificar = (
    esMismoHospital: boolean,
    conduccion: boolean,
    esGuardiaCandidato: boolean,
    cumpleAntiguedad: boolean,
    cumpleEsp: boolean,
  ): ReglaJurado | null => {
    // Concurso centralizado: regla única, sin prioridad de hospital — el
    // pool es directamente todo el sistema de salud.
    if (params.modalidadConcurso === null) {
      if (conduccion && cumpleEsp) return 1 // conducción + especialidad, cualquier hospital
      return null
    }
    if (params.modalidadConcurso === 'pof') {
      if (esMismoHospital && conduccion && cumpleEsp) return 1 // hospital + conducción + especialidad
      if (esMismoHospital && cumpleAntiguedad) return 2 // hospital + antigüedad (especialidad opcional)
      if (conduccion && cumpleEsp) return 3 // sistema + conducción + especialidad
      return null
    }
    // Cargo POU (guardia)
    if (esMismoHospital && conduccion && esGuardiaCandidato && cumpleEsp) return 1 // jefe de guardia (POU), mismo hospital
    if (esMismoHospital && conduccion && !esGuardiaCandidato && cumpleEsp) return 2 // jefe de planta (POF), mismo hospital
    if (esMismoHospital && cumpleAntiguedad && cumpleEsp) return 3 // antigüedad, mismo hospital
    if (cumpleAntiguedad && cumpleEsp) return 4 // antigüedad, cualquier hospital (sistema)
    return null
  }

  // Ocupaciones activas cuyo cargo pertenece al escalafón requerido.
  const ocupaciones = await prisma.ocupacion.findMany({
    where: {
      hasta: null,
      cargo: { escalafonId: params.escalafonId },
      persona: {
        activo: true,
        ...(params.excluirPersonaIds.length ? { id: { notIn: params.excluirPersonaIds } } : {}),
      },
    },
    select: {
      codigoJefaturas: true,
      persona: {
        select: {
          id: true,
          apellidoNombre: true,
          cuil: true,
          antiguedadDesde: true,
          especialidadCph: true,
          especialidadPrincipal: true,
        },
      },
      cargo: {
        select: {
          hospitalId: true,
          literalPuesto: true,
          unificadorPuesto: true,
          hospital: { select: { nombre: true, sigla: true } },
        },
      },
    },
  })

  // Una persona puede tener más de una ocupación activa — nos quedamos con la
  // "mejor" para el jurado: preferimos misma unidad organizativa y conducción.
  const porPersona = new Map<string, Candidato>()

  for (const o of ocupaciones) {
    // Director y Subdirector no pueden integrar ningún jurado — se descarta
    // esta ocupación como fuente de candidato aunque la persona sí sea
    // elegible por otro cargo activo que tenga (caso poco común pero posible).
    if (norm(o.cargo.literalPuesto).includes('director')) continue

    const p = o.persona
    const especialidadPersona = p.especialidadCph ?? p.especialidadPrincipal
    const conduccion = esConduccion(o.codigoJefaturas)
    const esGuardiaCandidato = modalidadDeCargo(o.cargo.unificadorPuesto) === 'pou'
    const antiguedad = aniosDesde(p.antiguedadDesde, hoy)
    const cumpleAntiguedad = antiguedad != null && antiguedad >= params.antiguedadMinimaAnios
    const esMismoHospital = o.cargo.hospitalId === params.hospitalIdConcurso
    const cumpleEspecialidad = especNormSet.size > 0 && especNormSet.has(norm(especialidadPersona))

    const cand: Candidato = {
      personaId: p.id,
      apellidoNombre: p.apellidoNombre,
      cuil: p.cuil,
      hospitalId: o.cargo.hospitalId,
      hospitalNombre: o.cargo.hospital?.nombre ?? o.cargo.hospital?.sigla ?? null,
      puesto: o.cargo.literalPuesto,
      especialidad: especialidadPersona,
      esMismoHospital,
      cumpleEspecialidad,
      esConduccion: conduccion,
      antiguedadAnios: antiguedad,
      regla: clasificar(
        esMismoHospital,
        conduccion,
        esGuardiaCandidato,
        cumpleAntiguedad,
        cumpleEspecialidad,
      ),
    }

    const previo = porPersona.get(p.id)
    if (!previo) {
      porPersona.set(p.id, cand)
      continue
    }
    // Una persona puede tener varias ocupaciones activas — nos quedamos con la
    // que la ubique en la regla de MAYOR prioridad (número de regla más bajo).
    const rank = (c: Candidato) => c.regla ?? 99
    if (rank(cand) < rank(previo)) porPersona.set(p.id, cand)
  }

  // Solo los que cumplen alguna regla (la profesión ya está garantizada por el
  // filtro de escalafón).
  return [...porPersona.values()].filter(
    (c): c is Candidato & { regla: ReglaJurado } => c.regla != null,
  )
}

// Arma el pool de sorteo aplicando la CASCADA de reglas (el orden depende de
// la modalidad del cargo — ver REGLAS_POF/REGLAS_POU): acumula candidatos de
// la primera regla; si no llega a `total`, agrega la siguiente, y así. En
// cuanto una regla completa `total`, corta (no baja a la siguiente). Devuelve
// el pool acumulado y la última regla utilizada.
function armarPoolCascada(
  candidatos: Candidato[],
  total: number,
  reglasOrden: ReglaJurado[],
): { pool: Candidato[]; reglaUsada: ReglaJurado; porRegla: Record<ReglaJurado, number> } {
  const porRegla = Object.fromEntries(
    reglasOrden.map((r) => [r, candidatos.filter((c) => c.regla === r).length]),
  ) as Record<ReglaJurado, number>
  const pool: Candidato[] = []
  let reglaUsada: ReglaJurado = reglasOrden[0]!
  for (const regla of reglasOrden) {
    reglaUsada = regla
    // Se agrega el nivel COMPLETO (no se corta a mitad de regla) para que la
    // priorización por especialidad dentro de cada regla — que hace
    // sortearJurado — tenga todos los candidatos del nivel disponibles.
    pool.push(...candidatos.filter((c) => c.regla === regla))
    if (pool.length >= total) break
  }
  return { pool, reglaUsada, porRegla }
}

// Sortea `total` miembros del pool RESPETANDO LA PRIORIDAD por regla: primero
// se llena con candidatos de la primera regla de `reglasOrden`, luego la
// siguiente, etc.; solo se baja de regla para completar los cupos faltantes.
// Dentro de cada regla se prioriza a los que cumplen la especialidad del
// concurso, y entre iguales el orden es aleatorio (sembrado, auditable). Los
// primeros `cantTitulares` son titulares.
function sortearJurado(
  pool: Candidato[],
  cantTitulares: number,
  cantSuplentes: number,
  rng: () => number,
  reglasOrden: ReglaJurado[],
): MiembroElegido[] {
  const total = cantTitulares + cantSuplentes
  // Orden de selección: por regla (según `reglasOrden`); dentro de la regla,
  // especialidad primero; entre los que empatan, aleatorio sembrado.
  const priorizado: Candidato[] = []
  for (const regla of reglasOrden) {
    const delNivel = pool.filter((c) => c.regla === regla)
    const conEsp = shuffle(
      delNivel.filter((c) => c.cumpleEspecialidad),
      rng,
    )
    const sinEsp = shuffle(
      delNivel.filter((c) => !c.cumpleEspecialidad),
      rng,
    )
    priorizado.push(...conEsp, ...sinEsp)
  }
  const sorteados = priorizado.slice(0, total)
  return sorteados.map((c, i) => {
    const esTitular = i < cantTitulares
    const rol: 'titular' | 'suplente' = esTitular ? 'titular' : 'suplente'
    const orden = esTitular ? i + 1 : i - cantTitulares + 1
    return {
      ...c,
      rol,
      orden,
      ambito: c.esMismoHospital ? 'hospital' : 'sistema',
      reglaAplicada: (c.regla ?? reglasOrden[reglasOrden.length - 1]!) as ReglaJurado,
    }
  })
}

// ── Servicio principal: genera y persiste el sorteo ──────────────────────────
export async function generarSorteoJuradoService(
  concursoCphId: string,
  body: GenerarSorteoJuradoBody,
  usuarioId: string | null,
) {
  const concurso = await prisma.concursoCph.findUnique({
    where: { id: concursoCphId },
    include: {
      concurso: {
        include: { cargo: { include: { hospital: true, escalafon: true } }, persona: true },
      },
      hospital: true,
    },
  })
  if (!concurso) throw AppError.notFound('Concurso CPH no encontrado')
  if (concurso.estado === 'finalizado') throw AppError.conflict('El concurso ya está finalizado')

  // No se puede re-sortear si ya hay un acta confirmada.
  const confirmado = await prisma.sorteoJurado.findFirst({
    where: { concursoCphId, confirmado: true },
    select: { id: true },
  })
  if (confirmado) {
    throw AppError.conflict(
      'El sorteo de jurado ya fue confirmado. Cancelá la confirmación para volver a sortear.',
    )
  }

  const cargo = concurso.concurso?.cargo
  if (!cargo)
    throw AppError.conflict(
      'El concurso no tiene un cargo asociado para determinar la profesión del jurado',
    )
  // El frontend ya bloquea "Generar sorteo" sin Tipo de gestión definido
  // (ver ConcursoCphWizard.tsx) — se valida también acá porque de esto
  // depende qué reglas de elegibilidad se aplican.
  if (!concurso.tipoGestion) {
    throw AppError.conflict(
      'El concurso no tiene definido el Tipo de gestión — es requerido antes de sortear el jurado.',
    )
  }
  const esCentralizado = concurso.tipoGestion === 'centralizado'

  const especialidadConcurso = concurso.especialidadSolicitada ?? cargo.especialidadLegacy ?? null
  const especialidadesAdicionales = body.especialidadesAdicionales ?? []
  const especialidadesConcurso = [especialidadConcurso, ...especialidadesAdicionales]
  // Centralizado: regla única, sin distinción POF/POU. Descentralizado:
  // cascada según la modalidad del cargo (comportamiento ya existente).
  const modalidadConcurso: ModalidadCargo | null = esCentralizado
    ? null
    : modalidadDeCargo(cargo.unificadorPuesto)
  const reglasOrden = esCentralizado
    ? REGLAS_CENTRALIZADO
    : modalidadConcurso === 'pou'
      ? REGLAS_POU
      : REGLAS_POF

  // Excluir a la persona que salió de baja (origen del concurso) y a la ya
  // designada, si existieran — no deberían ser jurado de su propio concurso.
  const excluir = [concurso.concurso?.persona?.id, concurso.personaDesignadaId].filter(
    (x): x is string => !!x,
  )

  const candidatos = await obtenerCandidatos({
    escalafonId: cargo.escalafonId,
    hospitalIdConcurso: concurso.hospitalId,
    modalidadConcurso,
    especialidadesConcurso,
    antiguedadMinimaAnios: body.antiguedadMinimaAnios,
    excluirPersonaIds: excluir,
  })

  const total = body.cantTitulares + body.cantSuplentes

  if (candidatos.length === 0) {
    throw AppError.conflict(
      'No se encontraron candidatos elegibles para el jurado (misma profesión, cargo activo y alguna de las reglas de conducción/antigüedad).',
    )
  }

  // Cascada de reglas (el orden depende de si el cargo es POF o POU):
  // acumular por regla hasta juntar al menos `total`.
  const { pool, reglaUsada, porRegla } = armarPoolCascada(candidatos, total, reglasOrden)

  const semilla = body.semilla ?? Math.random().toString(36).slice(2, 14)
  const rng = mulberry32(hashSemilla(semilla))

  const miembros = sortearJurado(
    pool,
    body.cantTitulares,
    body.cantSuplentes,
    rng,
    reglasOrden,
  )
  const titulares = miembros.filter((m) => m.rol === 'titular')
  const suplentes = miembros.filter((m) => m.rol === 'suplente')

  // Ámbito global del acta.
  const hayHospital = miembros.some((m) => m.ambito === 'hospital')
  const haySistema = miembros.some((m) => m.ambito === 'sistema')
  const ambito = hayHospital && haySistema ? 'mixto' : haySistema ? 'sistema' : 'hospital'

  // Advertencias: cupos incompletos por candidatos insuficientes.
  const avisos: string[] = []
  if (pool.length < total) {
    avisos.push(
      `Solo se encontraron ${pool.length} candidatos elegibles para ${total} jurados requeridos (${body.cantTitulares} titulares + ${body.cantSuplentes} suplentes).`,
    )
  }
  if (titulares.length < body.cantTitulares) {
    avisos.push(`Titulares incompletos: ${titulares.length} de ${body.cantTitulares}.`)
  }
  if (suplentes.length < body.cantSuplentes) {
    avisos.push(`Suplentes incompletos: ${suplentes.length} de ${body.cantSuplentes}.`)
  }

  const observaciones =
    [body.observaciones?.trim(), avisos.join(' ')].filter(Boolean).join(' — ') || null

  const criterios = {
    cantTitulares: body.cantTitulares,
    cantSuplentes: body.cantSuplentes,
    antiguedadMinimaAnios: body.antiguedadMinimaAnios,
    escalafonId: cargo.escalafonId,
    escalafonNombre: cargo.escalafon?.nombre ?? null,
    hospitalId: concurso.hospitalId,
    hospitalNombre: concurso.hospital?.nombre ?? concurso.hospital?.sigla ?? null,
    especialidadConcurso,
    especialidadesAdicionales,
    expedienteEspecialidades: body.expedienteEspecialidades ?? null,
    tipoGestion: concurso.tipoGestion,
    modalidadConcurso,
    totalCandidatos: pool.length,
    candidatosMismoHospital: pool.filter((c) => c.esMismoHospital).length,
    // Trazabilidad de la cascada de reglas usada.
    reglaUsada,
    candidatosPorRegla: porRegla,
  }

  // La fecha del sorteo es HOY (el día en que se genera), no se elige.
  const fechaSorteo = new Date()

  const acta = await prisma.$transaction(async (tx) => {
    // Re-sortear: descartar borradores anteriores NO confirmados (los miembros
    // se borran en cascada). Los confirmados ya se bloquearon arriba.
    const borradores = await tx.sorteoJurado.findMany({
      where: { concursoCphId, confirmado: false },
      select: { id: true },
    })
    if (borradores.length > 0) {
      await tx.sorteoJurado.deleteMany({ where: { id: { in: borradores.map((b) => b.id) } } })
    }

    const nuevo = await tx.sorteoJurado.create({
      data: {
        concursoCphId,
        fechaSorteo,
        semilla,
        criterios,
        ambito,
        observaciones,
        generadoPorId: usuarioId,
        miembros: {
          create: miembros.map((m) => ({
            personaId: m.personaId,
            rol: m.rol,
            orden: m.orden,
            apellidoNombre: m.apellidoNombre,
            cuil: m.cuil,
            hospitalId: m.hospitalId,
            hospitalNombre: m.hospitalNombre,
            puesto: m.puesto,
            especialidad: m.especialidad,
            ambito: m.ambito,
            reglaAplicada: m.reglaAplicada,
            cumpleEspecialidad: m.cumpleEspecialidad,
            esConduccion: m.esConduccion,
            antiguedadAnios: m.antiguedadAnios,
          })),
        },
      },
      include: { miembros: { orderBy: [{ rol: 'asc' }, { orden: 'asc' }] } },
    })

    // IMPORTANTE: generar el sorteo NO avanza el sub-estado. La fecha de sorteo
    // (y por ende el sub-estado "B — Sorteo de jurado") se registra recién al
    // CONFIRMAR el jurado. Mientras es borrador, el concurso sigue en su
    // sub-estado previo (A — Autorización).
    return nuevo
  })

  return acta
}

// Recalcula estado/subEstado/subEstado3 del concurso con una fecha de sorteo
// dada (o null) y persiste, dentro de la transacción `tx`. Centraliza el
// mapeo de campos hacia calcConcursoCph — reutilizado por confirmar/cancelar.
async function recalcularConSorteo(
  tx: Prisma.TransactionClient,
  concurso: ConcursoCph,
  sorteoJurado: Date | null,
) {
  const calc = calcConcursoCph({
    suspendido: concurso.suspendido,
    eeBaja: concurso.eeBaja,
    fechaBaja: concurso.fechaBaja,
    eeConcurso: concurso.eeConcurso,
    fechaEeConcurso: concurso.fechaEeConcurso,
    fechaAutorizacion: concurso.fechaAutorizacion,
    sorteoJurado,
    disposicion: concurso.disposicion,
    fechaInscDesde: concurso.fechaInscDesde,
    fechaInscHasta: concurso.fechaInscHasta,
    inscripcionCerrada: concurso.inscripcionCerrada,
    ordenMeritoConfirmado: concurso.ordenMeritoConfirmado,
    fechaExamen: concurso.fechaExamen,
    fechaOrdenMerito: concurso.fechaOrdenMerito,
    fechaIfacs: concurso.fechaIfacs,
    fechaInsal: concurso.fechaInsal,
    eeDesignacion: concurso.eeDesignacion,
    cargaDocumentacion: concurso.cargaDocumentacion,
    fechaAptoMedico: concurso.fechaAptoMedico,
    fechaIte: concurso.fechaIte,
    proyectoResolucion: concurso.proyectoResolucion,
    resoALaFirma: concurso.resoALaFirma,
    resolucionDesignacion: concurso.resolucionDesignacion,
    fechaResolucion: concurso.fechaResolucion,
    cargoSial: concurso.cargoSial,
    dispoDesierta: concurso.dispoDesierta,
    fechaDispoDesierta: concurso.fechaDispoDesierta,
  })
  await tx.concursoCph.update({
    where: { id: concurso.id },
    data: {
      sorteoJurado,
      estado: calc.estado,
      subEstado: calc.subEstado,
      subEstado3: calc.subEstado3,
    },
  })
}

// Devuelve el último sorteo (acta vigente) de un concurso con sus miembros.
export async function getJuradoVigenteService(concursoCphId: string) {
  const concurso = await prisma.concursoCph.findUnique({
    where: { id: concursoCphId },
    select: { id: true },
  })
  if (!concurso) throw AppError.notFound('Concurso CPH no encontrado')

  return prisma.sorteoJurado.findFirst({
    where: { concursoCphId },
    orderBy: [{ fechaSorteo: 'desc' }, { createdAt: 'desc' }],
    include: { miembros: { orderBy: [{ rol: 'asc' }, { orden: 'asc' }] } },
  })
}

// Confirma el acta vigente (borrador → confirmado). Una vez confirmada queda
// de solo lectura: no se puede re-sortear ni cancelar sin revertir antes.
export async function confirmarSorteoService(concursoCphId: string, usuarioId: string | null) {
  const acta = await prisma.sorteoJurado.findFirst({
    where: { concursoCphId },
    orderBy: [{ fechaSorteo: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, confirmado: true, fechaSorteo: true },
  })
  if (!acta) throw AppError.notFound('No hay un sorteo de jurado para confirmar')
  if (acta.confirmado) throw AppError.conflict('El sorteo de jurado ya estaba confirmado')

  await prisma.$transaction(async (tx) => {
    await tx.sorteoJurado.update({
      where: { id: acta.id },
      data: { confirmado: true, confirmadoAt: new Date(), confirmadoPorId: usuarioId },
    })
    // Confirmar es lo que registra la fecha de sorteo en el concurso y avanza
    // el sub-estado a "B — Sorteo de jurado".
    const c = await tx.concursoCph.findUnique({ where: { id: concursoCphId } })
    if (c) await recalcularConSorteo(tx, c, acta.fechaSorteo)
  })

  return prisma.sorteoJurado.findFirst({
    where: { concursoCphId },
    orderBy: [{ fechaSorteo: 'desc' }, { createdAt: 'desc' }],
    include: { miembros: { orderBy: [{ rol: 'asc' }, { orden: 'asc' }] } },
  })
}

// Revierte la confirmación del acta vigente (confirmado → borrador). Permite
// volver a re-sortear o cancelar. No borra el acta ni los miembros.
export async function revertirConfirmacionSorteoService(concursoCphId: string) {
  const acta = await prisma.sorteoJurado.findFirst({
    where: { concursoCphId },
    orderBy: [{ fechaSorteo: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, confirmado: true },
  })
  if (!acta) throw AppError.notFound('No hay un sorteo de jurado para revertir')
  if (!acta.confirmado) throw AppError.conflict('El sorteo de jurado no está confirmado')

  await prisma.$transaction(async (tx) => {
    await tx.sorteoJurado.update({
      where: { id: acta.id },
      data: { confirmado: false, confirmadoAt: null, confirmadoPorId: null },
    })
    // Revertir la confirmación quita la fecha de sorteo del concurso y retrocede
    // el sub-estado desde "B — Sorteo de jurado".
    const c = await tx.concursoCph.findUnique({ where: { id: concursoCphId } })
    if (c) await recalcularConSorteo(tx, c, null)
  })

  return prisma.sorteoJurado.findFirst({
    where: { concursoCphId },
    orderBy: [{ fechaSorteo: 'desc' }, { createdAt: 'desc' }],
    include: { miembros: { orderBy: [{ rol: 'asc' }, { orden: 'asc' }] } },
  })
}

// Cancela (descarta) el sorteo vigente si aún NO está confirmado. Borra el acta
// y sus miembros (cascade) y limpia la fecha de sorteo del concurso.
export async function cancelarSorteoService(concursoCphId: string) {
  const acta = await prisma.sorteoJurado.findFirst({
    where: { concursoCphId },
    orderBy: [{ fechaSorteo: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, confirmado: true },
  })
  if (!acta) throw AppError.notFound('No hay un sorteo de jurado para cancelar')
  if (acta.confirmado)
    throw AppError.conflict('El sorteo de jurado ya fue confirmado y no puede cancelarse')

  await prisma.$transaction(async (tx) => {
    await tx.sorteoJurado.delete({ where: { id: acta.id } })

    // Si no quedan más sorteos, limpiar la fecha del concurso y recalcular
    // estado/subEstado (retrocede desde B-SORTEO JUR).
    const quedan = await tx.sorteoJurado.count({ where: { concursoCphId } })
    if (quedan === 0) {
      const c = await tx.concursoCph.findUnique({ where: { id: concursoCphId } })
      if (c) {
        const calc = calcConcursoCph({
          suspendido: c.suspendido,
          eeBaja: c.eeBaja,
          fechaBaja: c.fechaBaja,
          eeConcurso: c.eeConcurso,
          fechaEeConcurso: c.fechaEeConcurso,
          fechaAutorizacion: c.fechaAutorizacion,
          sorteoJurado: null,
          disposicion: c.disposicion,
          fechaInscDesde: c.fechaInscDesde,
          fechaInscHasta: c.fechaInscHasta,
          inscripcionCerrada: c.inscripcionCerrada,
          ordenMeritoConfirmado: c.ordenMeritoConfirmado,
          fechaExamen: c.fechaExamen,
          fechaOrdenMerito: c.fechaOrdenMerito,
          fechaIfacs: c.fechaIfacs,
          fechaInsal: c.fechaInsal,
          eeDesignacion: c.eeDesignacion,
          cargaDocumentacion: c.cargaDocumentacion,
          fechaAptoMedico: c.fechaAptoMedico,
          fechaIte: c.fechaIte,
          proyectoResolucion: c.proyectoResolucion,
          resoALaFirma: c.resoALaFirma,
          resolucionDesignacion: c.resolucionDesignacion,
          fechaResolucion: c.fechaResolucion,
          cargoSial: c.cargoSial,
          dispoDesierta: c.dispoDesierta,
          fechaDispoDesierta: c.fechaDispoDesierta,
        })
        await tx.concursoCph.update({
          where: { id: concursoCphId },
          data: {
            sorteoJurado: null,
            estado: calc.estado,
            subEstado: calc.subEstado,
            subEstado3: calc.subEstado3,
          },
        })
      }
    }
  })

  return { ok: true }
}

// ── Jurados confirmados (para reutilizar) ───────────────────────────────────
// Lista TODAS las actas de sorteo CONFIRMADAS, con un flag `vigente` (true si
// `fechaSorteo` está dentro de los últimos 6 meses). Los vigentes pueden
// reutilizarse en concursos compatibles; los vencidos se muestran igual para
// consulta/histórico. Incluye el concurso de origen y sus miembros.
export async function listJuradosVigentesService() {
  const hoy = new Date()
  const limiteVigencia = new Date(hoy)
  limiteVigencia.setMonth(limiteVigencia.getMonth() - 6)

  const actas = await prisma.sorteoJurado.findMany({
    where: { confirmado: true },
    orderBy: [{ fechaSorteo: 'desc' }],
    include: {
      miembros: { orderBy: [{ rol: 'asc' }, { orden: 'asc' }] },
      concursoCph: {
        select: {
          id: true,
          especialidadSolicitada: true,
          concurso: {
            select: {
              cargo: {
                select: {
                  codigo: true,
                  literalPuesto: true,
                  especialidadLegacy: true,
                  escalafonId: true,
                  hospital: { select: { sigla: true, nombre: true } },
                },
              },
            },
          },
        },
      },
    },
  })

  // Fecha de vencimiento = fechaSorteo + 6 meses; vigente si aún no venció.
  return actas.map((a) => {
    const venc = new Date(a.fechaSorteo)
    venc.setMonth(venc.getMonth() + 6)
    return { ...a, fechaVencimiento: venc, vigente: a.fechaSorteo >= limiteVigencia }
  })
}

// ── Reutilizar un jurado vigente en otro concurso ───────────────────────────
// Copia los miembros de un acta de jurado confirmada y vigente (origen) a una
// nueva acta BORRADOR para el concurso destino. Valida compatibilidad: mismo
// escalafón y misma especialidad que el concurso destino (las 3 reglas del
// sorteo ya se cumplieron al generar el acta origen). Queda como borrador para
// que el usuario la confirme igual que un sorteo nuevo.
export async function asignarJuradoExistenteService(
  concursoCphId: string,
  sorteoJuradoOrigenId: string,
  usuarioId: string | null,
) {
  const destino = await prisma.concursoCph.findUnique({
    where: { id: concursoCphId },
    include: {
      concurso: { include: { cargo: { include: { escalafon: true } } } },
      hospital: true,
    },
  })
  if (!destino) throw AppError.notFound('Concurso CPH no encontrado')
  if (destino.estado === 'finalizado') throw AppError.conflict('El concurso ya está finalizado')

  const yaConfirmado = await prisma.sorteoJurado.findFirst({
    where: { concursoCphId, confirmado: true },
    select: { id: true },
  })
  if (yaConfirmado) {
    throw AppError.conflict(
      'El sorteo de jurado ya fue confirmado. Cancelá la confirmación para reutilizar otro jurado.',
    )
  }

  const origen = await prisma.sorteoJurado.findUnique({
    where: { id: sorteoJuradoOrigenId },
    include: { miembros: { orderBy: [{ rol: 'asc' }, { orden: 'asc' }] } },
  })
  if (!origen) throw AppError.notFound('Jurado de origen no encontrado')
  if (!origen.confirmado) throw AppError.conflict('Solo se pueden reutilizar jurados confirmados')

  // Vigencia: fechaSorteo dentro de los últimos 6 meses.
  const limite = new Date()
  limite.setMonth(limite.getMonth() - 6)
  if (origen.fechaSorteo < limite)
    throw AppError.conflict('El jurado de origen ya no está vigente (más de 6 meses)')

  // Compatibilidad: mismo escalafón y misma especialidad que el concurso destino.
  const cargo = destino.concurso?.cargo
  if (!cargo) throw AppError.conflict('El concurso destino no tiene cargo asociado')
  const criteriosOrigen = origen.criterios as {
    escalafonId?: string
    especialidadConcurso?: string | null
  }
  const especialidadDestino = destino.especialidadSolicitada ?? cargo.especialidadLegacy ?? null

  if (criteriosOrigen.escalafonId && criteriosOrigen.escalafonId !== cargo.escalafonId) {
    throw AppError.conflict('El jurado de origen no es compatible: escalafón distinto')
  }
  if (norm(criteriosOrigen.especialidadConcurso) !== norm(especialidadDestino)) {
    throw AppError.conflict('El jurado de origen no es compatible: especialidad distinta')
  }

  const fechaSorteo = new Date()
  const criterios = {
    ...(origen.criterios as object),
    reutilizadoDe: sorteoJuradoOrigenId,
    reutilizadoDeConcursoId: origen.concursoCphId,
  }

  const acta = await prisma.$transaction(async (tx) => {
    // Descartar borradores previos no confirmados del destino.
    await tx.sorteoJurado.deleteMany({ where: { concursoCphId, confirmado: false } })

    return tx.sorteoJurado.create({
      data: {
        concursoCphId,
        fechaSorteo,
        semilla: origen.semilla,
        criterios,
        ambito: origen.ambito,
        observaciones: `Jurado reutilizado del concurso ${origen.concursoCphId}`,
        generadoPorId: usuarioId,
        miembros: {
          create: origen.miembros.map((m) => ({
            personaId: m.personaId,
            rol: m.rol,
            orden: m.orden,
            apellidoNombre: m.apellidoNombre,
            cuil: m.cuil,
            hospitalId: m.hospitalId,
            hospitalNombre: m.hospitalNombre,
            puesto: m.puesto,
            especialidad: m.especialidad,
            ambito: m.ambito,
            reglaAplicada: m.reglaAplicada,
            cumpleEspecialidad: m.cumpleEspecialidad,
            esConduccion: m.esConduccion,
            antiguedadAnios: m.antiguedadAnios,
          })),
        },
      },
      include: { miembros: { orderBy: [{ rol: 'asc' }, { orden: 'asc' }] } },
    })
  })

  return acta
}
