import { createRequire } from 'node:module'
import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { SUB_ESTADO_3_SQL_PG } from '../concursos-cph/concursosCph.calc.js'
import type {
  KpisConcursosCeetpsQuery,
  KpisConcursosQuery,
  KpisDotacionQuery,
  KpisAlertasQuery,
  KpisDotacionHistoricaQuery,
  KpisBajasQuery,
  DotacionEvolucionQuery,
} from './kpis.schema.js'

// ─── S4-11: KPIs de concursos CPH para el tablero ───────────────────────────
//
// porSubEstado usa el valor persistido (fresco desde el último write, ver
// concursosCph.calc.ts) y porSubEstado3 se recalcula en vivo en SQL — mismo
// motivo que el filtro homónimo de listConcursosCphService: dos de sus ramas
// comparan contra la fecha de hoy y se desactualizan solas con el tiempo.
export async function getKpisConcursosCphService(hospitalId?: string) {
  const where: Prisma.ConcursoCphWhereInput = hospitalId ? { hospitalId } : {}
  const hospitalFilterSql = hospitalId ? Prisma.sql`WHERE hospital_id = ${hospitalId}::uuid` : Prisma.empty
  const hospitalFilterSqlAlias = hospitalId ? Prisma.sql`WHERE cc.hospital_id = ${hospitalId}::uuid` : Prisma.empty

  const [total, porEstado, porSubEstado, subEstado3Rows, hospitalRows] = await Promise.all([
    prisma.concursoCph.count({ where }),
    prisma.concursoCph.groupBy({ by: ['estado'], where, _count: { _all: true } }),
    prisma.concursoCph.groupBy({ by: ['subEstado'], where, _count: { _all: true } }),
    prisma.$queryRaw<{ subEstado3: string; total: bigint }[]>(Prisma.sql`
      SELECT (${Prisma.raw(SUB_ESTADO_3_SQL_PG)}) AS "subEstado3", count(*)::bigint AS total
      FROM concursos_cph
      ${hospitalFilterSql}
      GROUP BY 1
      ORDER BY 1
    `),
    prisma.$queryRaw<{ hospitalId: string; sigla: string; nombre: string; total: bigint }[]>(Prisma.sql`
      SELECT cc.hospital_id AS "hospitalId", h.sigla, h.nombre, count(*)::bigint AS total
      FROM concursos_cph cc
      JOIN hospitales h ON h.id = cc.hospital_id
      ${hospitalFilterSqlAlias}
      GROUP BY cc.hospital_id, h.sigla, h.nombre
      ORDER BY total DESC
    `),
  ])

  return {
    total,
    porEstado: porEstado.map((r) => ({ estado: r.estado, total: r._count._all })),
    porSubEstado: porSubEstado
      .filter((r): r is typeof r & { subEstado: string } => r.subEstado !== null)
      .map((r) => ({ subEstado: r.subEstado, total: r._count._all }))
      .sort((a, b) => a.subEstado.localeCompare(b.subEstado)),
    porSubEstado3: subEstado3Rows.map((r) => ({ subEstado3: r.subEstado3, total: Number(r.total) })),
    porHospital: hospitalRows.map((r) => ({
      hospitalId: r.hospitalId,
      sigla: r.sigla,
      nombre: r.nombre,
      total: Number(r.total),
    })),
  }
}

// ─── S5-8: KPIs de concursos CEETPS para el tablero ─────────────────────────
export async function getKpisConcursosCeetpsService(query: KpisConcursosCeetpsQuery) {
  const { hospitalId, escalafonId } = query
  const where: Prisma.ConcursoCeetpsWhereInput = {
    ...(hospitalId && { hospitalId }),
    ...(escalafonId && { escalafonId }),
  }

  const hospitalFilter = hospitalId
    ? Prisma.sql`AND cc.hospital_id = ${hospitalId}::uuid`
    : Prisma.empty
  const escalafonFilter = escalafonId
    ? Prisma.sql`AND cc.escalafon_id = ${escalafonId}::uuid`
    : Prisma.empty

  const [total, porEstado, porEscalafon, porHospital] = await Promise.all([
    prisma.concursoCeetps.count({ where }),

    prisma.concursoCeetps.groupBy({
      by: ['estado'],
      where,
      _count: { _all: true },
    }),

    prisma.$queryRaw<{ escalafonId: string; codigo: string; nombre: string; total: bigint }[]>(
      Prisma.sql`
        SELECT cc.escalafon_id AS "escalafonId", e.codigo, e.nombre, count(*)::bigint AS total
        FROM concursos_ceetps cc
        JOIN escalafones e ON e.id = cc.escalafon_id
        WHERE true ${hospitalFilter} ${escalafonFilter}
        GROUP BY cc.escalafon_id, e.codigo, e.nombre
        ORDER BY total DESC
      `
    ),

    prisma.$queryRaw<{ hospitalId: string; sigla: string; nombre: string; total: bigint }[]>(
      Prisma.sql`
        SELECT cc.hospital_id AS "hospitalId", h.sigla, h.nombre, count(*)::bigint AS total
        FROM concursos_ceetps cc
        JOIN hospitales h ON h.id = cc.hospital_id
        WHERE true ${hospitalFilter} ${escalafonFilter}
        GROUP BY cc.hospital_id, h.sigla, h.nombre
        ORDER BY total DESC
      `
    ),
  ])

  return {
    total,
    porEstado: porEstado.map((r) => ({ estado: r.estado, total: r._count._all })),
    porEscalafon: porEscalafon.map((r) => ({
      escalafonId: r.escalafonId,
      codigo: r.codigo,
      nombre: r.nombre,
      total: Number(r.total),
    })),
    porHospital: porHospital.map((r) => ({
      hospitalId: r.hospitalId,
      sigla: r.sigla,
      nombre: r.nombre,
      total: Number(r.total),
    })),
  }
}

// ─── S6-1: KPIs de dotación para el tablero ─────────────────────────────────
//
// "vigente" = Cargo.estado = 'vigente' (dotación autorizada, sin importar si
// hoy tiene a alguien asignado). "vacante" = de esos, el subconjunto sin una
// Ocupacion con hasta IS NULL (nadie ocupándolo en este momento). "carrera" =
// Escalafon, "efector" = Hospital — terminología del padrón GCBA.
//
// cargos_vigentes es una CTE repetida en las tres queries (en vez de un JOIN
// gigante con GROUP BY GROUPING SETS) para que cada resultado sea una lista
// plana simple de consumir en el frontend, igual que porHospital/porEstado
// en getKpisConcursosCphService/getKpisConcursosCeetpsService.
export async function getKpisDotacionService(query: KpisDotacionQuery) {
  const { hospitalId } = query
  const hospitalFilter = hospitalId ? Prisma.sql`AND c.hospital_id = ${hospitalId}::uuid` : Prisma.empty

  const cargosVigentesCte = Prisma.sql`
    WITH cargos_vigentes AS (
      SELECT
        c.id,
        c.hospital_id,
        c.escalafon_id,
        EXISTS (
          SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL
        ) AS ocupado
      FROM cargos c
      WHERE c.estado = 'vigente' ${hospitalFilter}
        -- Excluir carreras que este sector NO gestiona: Residencias y Docentes
        -- (incl. "Docentes Históricos"). No entran en ningún KPI de dotación.
        AND NOT EXISTS (
          SELECT 1 FROM escalafones eex
          WHERE eex.id = c.escalafon_id
            AND (eex.nombre ILIKE '%residencia%' OR eex.nombre ILIKE '%docente%')
        )
        -- Dedup del cargo espejo de jefatura: al jefe se le crea un cargo copia
        -- (mismo puesto+repartición, mismo ocupante) SIN código de jefatura para
        -- colgarle más dotación. Es el MISMO cargo → se excluye el espejo (cuya
        -- ocupación vigente no tiene jefatura) cuando existe el cargo hermano
        -- cuya ocupación vigente SÍ tiene jefatura, para el mismo ocupante.
        AND NOT EXISTS (
          SELECT 1
          FROM ocupaciones oesp
          JOIN ocupaciones ojef ON ojef.persona_id = oesp.persona_id AND ojef.hasta IS NULL
          JOIN cargos cjef ON cjef.id = ojef.cargo_id AND cjef.estado = 'vigente' AND cjef.id <> c.id
          WHERE oesp.cargo_id = c.id
            AND oesp.hasta IS NULL
            AND (oesp.codigo_jefaturas IS NULL OR TRIM(oesp.codigo_jefaturas) IN ('', '0'))
            -- Mismo literal de puesto; NO se exige codigo_repa idéntico (el SIAL
            -- crea el fantasma con repa que difiere en 1-2 dígitos del real —
            -- casos Charabora/Hernandez/Merino oct-2026). Una persona no ocupa
            -- dos puestos del mismo literal de conducción a la vez.
            AND coalesce(cjef.literal_puesto, '') = coalesce(c.literal_puesto, '')
            AND ojef.codigo_jefaturas IS NOT NULL
            AND TRIM(ojef.codigo_jefaturas) NOT IN ('', '0')
        )
    )
  `

  const [totalRows, porCarrera, porEfector] = await Promise.all([
    prisma.$queryRaw<{ total: bigint; vacantes: bigint }[]>(Prisma.sql`
      ${cargosVigentesCte}
      SELECT count(*)::bigint AS total, count(*) FILTER (WHERE NOT ocupado)::bigint AS vacantes
      FROM cargos_vigentes
    `),

    prisma.$queryRaw<{ escalafonId: string; codigo: string; nombre: string; vigentes: bigint; vacantes: bigint }[]>(
      Prisma.sql`
        ${cargosVigentesCte}
        SELECT
          cv.escalafon_id AS "escalafonId", e.codigo, e.nombre,
          count(*)::bigint AS vigentes,
          count(*) FILTER (WHERE NOT cv.ocupado)::bigint AS vacantes
        FROM cargos_vigentes cv
        JOIN escalafones e ON e.id = cv.escalafon_id
        GROUP BY cv.escalafon_id, e.codigo, e.nombre
        ORDER BY vigentes DESC
      `
    ),

    prisma.$queryRaw<{ hospitalId: string; sigla: string; nombre: string; vigentes: bigint; vacantes: bigint }[]>(
      Prisma.sql`
        ${cargosVigentesCte}
        SELECT
          cv.hospital_id AS "hospitalId", h.sigla, h.nombre,
          count(*)::bigint AS vigentes,
          count(*) FILTER (WHERE NOT cv.ocupado)::bigint AS vacantes
        FROM cargos_vigentes cv
        JOIN hospitales h ON h.id = cv.hospital_id
        GROUP BY cv.hospital_id, h.sigla, h.nombre
        ORDER BY vigentes DESC
      `
    ),
  ])

  const { total, vacantes } = totalRows[0] ?? { total: 0n, vacantes: 0n }

  return {
    totalVigentes: Number(total),
    vacantes: Number(vacantes),
    porCarrera: porCarrera.map((r) => ({
      escalafonId: r.escalafonId,
      codigo: r.codigo,
      nombre: r.nombre,
      vigentes: Number(r.vigentes),
      vacantes: Number(r.vacantes),
    })),
    porEfector: porEfector.map((r) => ({
      hospitalId: r.hospitalId,
      sigla: r.sigla,
      nombre: r.nombre,
      vigentes: Number(r.vigentes),
      vacantes: Number(r.vacantes),
    })),
  }
}

// ─── S6-3: KPIs concursales para el tablero general ─────────────────────────
//
// Vista consolidada CPH + CEETPS (total por tipo) más el detalle de
// sub-estado y "tiempo promedio por etapa" — este último solo tiene sentido
// para CPH: es el único de los dos tipos con una escalera de sub-estados
// (18 niveles, calcConcursoCph()) donde cada nivel tiene su propia fecha de
// hito. CEETPS solo tiene un EstadoConcursoCeetps plano (sin_autorizar →
// autorizado → en_proceso → finalizado), no hay una secuencia de fechas
// intermedias que promediar.
//
// ETAPAS_CPH son los pares consecutivos de fecha-hito con fecha real en el
// modelo (se salta niveles que solo tienen un campo de texto/boolean sin
// fecha propia, como C-DISPO DE LLAMADO → disposicion o H-TAD → eeDesignacion,
// ver calcSubEstado() en concursosCph.calc.ts). El promedio de cada etapa
// solo cuenta concursos con ambas fechas cargadas y en orden cronológico
// correcto (columna_hasta >= columna_desde) — evita que datos cargados fuera
// de orden (común en carga manual) distorsionen el promedio.
const ETAPAS_CPH: { etapa: string; desde: string; hasta: string }[] = [
  { etapa: 'Carátula → Autorización', desde: 'fecha_ee_concurso', hasta: 'fecha_autorizacion' },
  { etapa: 'Autorización → Sorteo de jurado', desde: 'fecha_autorizacion', hasta: 'sorteo_jurado' },
  { etapa: 'Sorteo de jurado → Examen', desde: 'sorteo_jurado', hasta: 'fecha_examen' },
  { etapa: 'Examen → Orden de mérito', desde: 'fecha_examen', hasta: 'fecha_orden_merito' },
  { etapa: 'Orden de mérito → IFACS', desde: 'fecha_orden_merito', hasta: 'fecha_ifacs' },
  { etapa: 'IFACS → INSAL', desde: 'fecha_ifacs', hasta: 'fecha_insal' },
  { etapa: 'INSAL → Apto médico', desde: 'fecha_insal', hasta: 'fecha_apto_medico' },
  { etapa: 'Apto médico → ITE', desde: 'fecha_apto_medico', hasta: 'fecha_ite' },
  { etapa: 'ITE → Resolución de designación', desde: 'fecha_ite', hasta: 'fecha_resolucion' },
]

export async function getKpisConcursosService(query: KpisConcursosQuery) {
  const { hospitalId } = query
  const whereCph: Prisma.ConcursoCphWhereInput = hospitalId ? { hospitalId } : {}
  const whereCeetps: Prisma.ConcursoCeetpsWhereInput = hospitalId ? { hospitalId } : {}
  const hospitalFilterSql = hospitalId ? Prisma.sql`AND hospital_id = ${hospitalId}::uuid` : Prisma.empty

  const etapaSelect = Prisma.join(
    ETAPAS_CPH.map(
      (e, i) => Prisma.sql`
        AVG((${Prisma.raw(e.hasta)}::date - ${Prisma.raw(e.desde)}::date)) FILTER (
          WHERE ${Prisma.raw(e.hasta)} IS NOT NULL AND ${Prisma.raw(e.desde)} IS NOT NULL
            AND ${Prisma.raw(e.hasta)} >= ${Prisma.raw(e.desde)}
        ) AS "d${i}",
        COUNT(*) FILTER (
          WHERE ${Prisma.raw(e.hasta)} IS NOT NULL AND ${Prisma.raw(e.desde)} IS NOT NULL
            AND ${Prisma.raw(e.hasta)} >= ${Prisma.raw(e.desde)}
        ) AS "n${i}"
      `
    ),
    ',\n'
  )

  const [totalCph, totalCeetps, porSubEstadoCph, etapaRows] = await Promise.all([
    prisma.concursoCph.count({ where: whereCph }),
    prisma.concursoCeetps.count({ where: whereCeetps }),
    prisma.concursoCph.groupBy({ by: ['subEstado'], where: whereCph, _count: { _all: true } }),
    prisma.$queryRaw<Record<string, number | bigint | null>[]>(Prisma.sql`
      SELECT ${etapaSelect}
      FROM concursos_cph
      WHERE true ${hospitalFilterSql}
    `),
  ])

  const etapaRow = etapaRows[0] ?? {}
  const tiempoPromedioPorEtapa = ETAPAS_CPH.map((e, i) => ({
    etapa: e.etapa,
    diasPromedio: etapaRow[`d${i}`] !== null && etapaRow[`d${i}`] !== undefined ? parseFloat(String(etapaRow[`d${i}`])) : null,
    muestras: Number(etapaRow[`n${i}`] ?? 0),
  }))

  return {
    totalCph,
    totalCeetps,
    total: totalCph + totalCeetps,
    porSubEstadoCph: porSubEstadoCph
      .filter((r): r is typeof r & { subEstado: string } => r.subEstado !== null)
      .map((r) => ({ subEstado: r.subEstado, total: r._count._all }))
      .sort((a, b) => a.subEstado.localeCompare(b.subEstado)),
    tiempoPromedioPorEtapa,
  }
}

// ─── S6-6: Alertas activas para el tablero ──────────────────────────────────
//
// Dos alertas, ninguna cubierta por AlertasSinMovimiento(Ceetps) (S4-10/S5-9,
// que son "sin movimiento hace N días" calculadas en el frontend):
//
// - "concursos vencidos" (CPH): venció el plazo de inscripción
//   (fecha_insc_hasta < hoy) y todavía no se programó examen. Es un
//   vencimiento de fecha dura, no una simple falta de movimiento — puede
//   pasar recién abierto el concurso si alguien no actualizó a tiempo.
// - "bajas sin concurso": baja con generaConcurso=false (si fuera true,
//   createBajaService (S5-5) ya crea el concurso en la misma transacción —
//   no puede quedar huérfana) y sin ningún Concurso enganchado todavía. Son
//   vacantes que quedaron abiertas sin ningún proceso de cobertura iniciado.
const DIA_MS = 24 * 60 * 60 * 1000
function diasDesde(fecha: Date, hoy: Date): number {
  return Math.floor((hoy.getTime() - fecha.getTime()) / DIA_MS)
}

export async function getKpisAlertasService(query: KpisAlertasQuery) {
  const { hospitalId } = query
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const [concursosVencidos, bajasSinConcurso] = await Promise.all([
    prisma.concursoCph.findMany({
      where: {
        // PS16D: 'desierto' ya no es un estado — se excluye vía suspendido=false
        estado: { notIn: ['finalizado', 'suspendido'] },
        suspendido: false,
        fechaInscHasta: { lt: hoy },
        fechaExamen: null,
        ...(hospitalId && { hospitalId }),
      },
      include: { hospital: { select: { sigla: true } }, cargo: { select: { codigo: true, idSial: true } } },
      orderBy: { fechaInscHasta: 'asc' },
    }),

    prisma.baja.findMany({
      where: {
        generaConcurso: false,
        estado: 'confirmada',
        concursos: { none: {} },
        cargo: { estado: { in: ['vigente', 'validacion_vacante'] } },
        ...(hospitalId && { hospitalId }),
      },
      include: {
        hospital: { select: { sigla: true } },
        cargo: { select: { codigo: true, idSial: true } },
        persona: { select: { apellidoNombre: true } },
      },
      orderBy: { fechaBaja: 'asc' },
    }),
  ])

  return {
    concursosVencidos: concursosVencidos.map((c) => ({
      id: c.id,
      cargoCodigo: c.cargo.codigo ?? c.cargo.idSial,
      hospitalSigla: c.hospital.sigla,
      subEstado: c.subEstado,
      fechaInscHasta: c.fechaInscHasta,
      diasVencido: c.fechaInscHasta ? diasDesde(c.fechaInscHasta, hoy) : 0,
    })),
    bajasSinConcurso: bajasSinConcurso.map((b) => ({
      id: b.id,
      cargoCodigo: b.cargo.codigo ?? b.cargo.idSial,
      hospitalSigla: b.hospital.sigla,
      personaApellidoNombre: b.persona?.apellidoNombre ?? null,
      fechaBaja: b.fechaBaja,
      diasSinConcurso: diasDesde(b.fechaBaja, hoy),
    })),
  }
}

// ─── S6-5: evolución de dotación histórica ──────────────────────────────────
//
// Lee desde kpis_dotacion_snapshot — tabla materializada que se popula al
// aprobar cada snapshot (padron.service.ts). Un punto por fecha de snapshot
// completo aprobado. El grano es (fecha, codigo_registro, situacion_revista):
// una fila por estado (series NO disjuntas) + una fila reservada
// situacion_revista='(total)' por carrera = count(DISTINCT cuil) de ese código
// en cualquier estado (NO es la suma de los estados, §1.A del diseño).

// Valor reservado que marca la fila del total por carrera en
// kpis_dotacion_snapshot (nunca colisiona con un estado normalizado real).
const SITUACION_TOTAL = '(total)'

// Orden canónico de las series por situación de revista (espejo de
// ORDEN_SITUACION_REVISTA en @srrhh/types; el API no depende de ese paquete).
const ORDEN_SITUACION_REVISTA = ['activo', 'comision', 'retencion de cargo', '(sin dato)'] as const

// Ordena una lista de situaciones de revista por el orden canónico
// (ORDEN_SITUACION_REVISTA); los valores no listados van al final, alfabéticos.
// '(total)' nunca entra acá (se separa antes).
function ordenarSituaciones(situaciones: string[]): string[] {
  const orden = ORDEN_SITUACION_REVISTA as readonly string[]
  return [...situaciones].sort((a, b) => {
    const ia = orden.indexOf(a)
    const ib = orden.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.localeCompare(b)
  })
}

// Normaliza una situación de revista al catálogo cerrado (minúscula sin tilde,
// trim). Es el espejo TS de lower(unaccent(trim(...))) del SQL; se usa en la
// función pura de conteo (tests) para que la lógica de agregación sea
// verificable sin BD. NULL/vacío → '(sin dato)'.
export function normalizarSituacionRevista(valor: string | null | undefined): string {
  if (valor == null) return SITUACION_SIN_DATO
  const sinTilde = valor
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u')
    .replace(/Á/g, 'A').replace(/É/g, 'E').replace(/Í/g, 'I').replace(/Ó/g, 'O').replace(/Ú/g, 'U')
  const norm = sinTilde.trim().toLowerCase()
  return norm === '' ? SITUACION_SIN_DATO : norm
}

const SITUACION_SIN_DATO = '(sin dato)'

// Fila de estado acumulado al corte, reducida a lo que importa para el conteo
// de dotación: persona (cuil), carrera (codigo de registro) y situación.
export interface FilaEstadoDotacion {
  cuil: string
  codigo: string
  situacionRevista: string | null
}

// Agregación PURA del estado acumulado a { porCarrera: { codigo: {...} } }.
// Reproduce exactamente lo que hacen el populate/backfill/consulta individual
// en SQL, pero sin BD, para poder testearlo:
//   • total               = count(DISTINCT cuil) de la carrera (cualquier estado)
//   • porSituacion[s]      = count(DISTINCT cuil) de la carrera con AL MENOS una
//                            ocupación en el estado s (series NO disjuntas)
//   • activosYComisionados = count(DISTINCT cuil) con estado ∈ {activo, comision}
// El total NO es la suma de porSituacion (una persona multi-estado cuenta en
// cada serie pero una sola vez en total).
export function agregarDotacion(filas: FilaEstadoDotacion[]): {
  porCarrera: Record<string, { total: number; porSituacion: Record<string, number>; activosYComisionados: number }>
} {
  // Por carrera: cuiles totales, cuiles por estado, cuiles activo/comision.
  const acc = new Map<
    string,
    { total: Set<string>; porSituacion: Map<string, Set<string>>; ayc: Set<string> }
  >()
  for (const fila of filas) {
    const codigo = fila.codigo
    const sit = normalizarSituacionRevista(fila.situacionRevista)
    if (!acc.has(codigo)) {
      acc.set(codigo, { total: new Set(), porSituacion: new Map(), ayc: new Set() })
    }
    const carrera = acc.get(codigo)!
    carrera.total.add(fila.cuil)
    if (!carrera.porSituacion.has(sit)) carrera.porSituacion.set(sit, new Set())
    carrera.porSituacion.get(sit)!.add(fila.cuil)
    if (sit === 'activo' || sit === 'comision') carrera.ayc.add(fila.cuil)
  }
  const porCarrera: Record<
    string,
    { total: number; porSituacion: Record<string, number>; activosYComisionados: number }
  > = {}
  for (const [codigo, carrera] of acc) {
    const porSituacion: Record<string, number> = {}
    for (const [sit, cuiles] of carrera.porSituacion) porSituacion[sit] = cuiles.size
    porCarrera[codigo] = {
      total: carrera.total.size,
      porSituacion,
      activosYComisionados: carrera.ayc.size,
    }
  }
  return { porCarrera }
}

export async function getKpisDotacionHistoricaService(_query: KpisDotacionHistoricaQuery) {
  const rows = await prisma.kpisDotacionSnapshot.findMany({
    orderBy: [{ fecha: 'asc' }, { codigoRegistro: 'asc' }, { situacionRevista: 'asc' }],
  })

  // Mapa codigo→literal legible para rotular las carreras. Un solo findMany; si
  // un código es huérfano (no existe en codigos_registro) o es el bucket
  // '(sin codigo)', el literal cae al propio código.
  const codigos = await prisma.codigoRegistro.findMany({ select: { codigo: true, literal: true } })
  const literalPorCodigo = new Map(codigos.map((c) => [c.codigo, c.literal ?? c.codigo]))
  const literalDe = (codigo: string) => literalPorCodigo.get(codigo) ?? codigo

  // Un punto por mes = el padrón de cierre, o sea el snapshot cuya fecha es la
  // más tardía dentro de ese mes calendario. Si en un mes hubo varias subidas
  // (ej. 04/01 y 11/01) sólo graficamos la última (11/01). Agrupamos por el
  // par año-mes y nos quedamos con la fecha máxima de cada grupo.
  const fechasCierrePorMes = new Map<string, Date>()
  for (const r of rows) {
    const mesKey = r.fecha.toISOString().slice(0, 7) // YYYY-MM
    const actual = fechasCierrePorMes.get(mesKey)
    if (!actual || r.fecha > actual) fechasCierrePorMes.set(mesKey, r.fecha)
  }
  const fechasCierre = new Set(
    [...fechasCierrePorMes.values()].map((f) => f.toISOString().slice(0, 10))
  )

  type PorCarrera = Record<string, { total: number; porSituacion: Record<string, number> }>
  type PuntoMap = Map<string, { fecha: Date; porCarrera: PorCarrera }>
  const porFecha: PuntoMap = new Map()
  const carrerasSet = new Set<string>()
  const situacionesSet = new Set<string>()

  for (const r of rows) {
    const key = r.fecha.toISOString().slice(0, 10)
    // Sólo las fechas de cierre de cada mes entran al gráfico.
    if (!fechasCierre.has(key)) continue
    if (!porFecha.has(key)) porFecha.set(key, { fecha: r.fecha, porCarrera: {} })
    const punto = porFecha.get(key)!
    if (!punto.porCarrera[r.codigoRegistro]) {
      punto.porCarrera[r.codigoRegistro] = { total: 0, porSituacion: {} }
    }
    carrerasSet.add(r.codigoRegistro)
    if (r.situacionRevista === SITUACION_TOTAL) {
      // El total viene de su fila materializada; NO se suma de los estados.
      punto.porCarrera[r.codigoRegistro].total = r.personas
    } else {
      punto.porCarrera[r.codigoRegistro].porSituacion[r.situacionRevista] = r.personas
      situacionesSet.add(r.situacionRevista)
    }
  }

  const carreras = [...carrerasSet]
    .sort()
    .map((codigo) => ({ codigo, literal: literalDe(codigo) }))
  const situaciones = ordenarSituaciones([...situacionesSet])
  const puntos = [...porFecha.values()]
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
    .map((p) => ({
      fecha: p.fecha,
      porCarrera: p.porCarrera,
    }))

  return { carreras, situaciones, puntos }
}

// ─── KPIs de bajas ───────────────────────────────────────────────────────────
//
// - bajasAValidar: cargos en estado `validacion_vacante` — detectados por el
//   padrón semanal como vacantes, pendientes de confirmación administrativa.
// - bajasConfirmadas: cargos en estado `no_vigente` — bajas ya procesadas.
// - porEscalafon: desglose de validacion_vacante por escalafón canónico.
export async function getKpisBajasService(query: KpisBajasQuery) {
  const { hospitalId } = query
  const where = hospitalId ? { hospitalId } : {}

  const [aValidar, confirmadas, porEscalafonRows] = await Promise.all([
    prisma.cargo.count({ where: { ...where, estado: 'validacion_vacante' } }),
    prisma.cargo.count({ where: { ...where, estado: 'no_vigente' } }),
    prisma.$queryRaw<{ escalafon: string; total: bigint }[]>(Prisma.sql`
      SELECT e.nombre AS escalafon, count(*)::bigint AS total
      FROM cargos c
      JOIN escalafones e ON e.id = c.escalafon_id
      WHERE c.estado = 'validacion_vacante'
        ${hospitalId ? Prisma.sql`AND c.hospital_id = ${hospitalId}::uuid` : Prisma.empty}
      GROUP BY e.nombre
      ORDER BY total DESC
    `),
  ])

  return {
    bajasAValidar: aValidar,
    bajasConfirmadas: confirmadas,
    porEscalafon: porEscalafonRows.map((r) => ({
      escalafon: r.escalafon,
      total: Number(r.total),
    })),
  }
}

// ─── Evolución de dotación por Carrera → Puesto → Especialidad ──────────────
//
// A diferencia de getKpisDotacionHistoricaService (que lee la tabla
// materializada kpis_dotacion_snapshot, solo desglosada por escalafón), estos
// dos servicios leen padron_historico —la "foto" de activos que se sube en
// cada padrón semanal— porque es la única fuente que tiene puesto y
// especialidad por persona. Reglas fijadas con el usuario:
//   • Solo situacion_revista = 'activo' (el verdadero estado ocupado;
//     minúscula sin tilde desde la normalización S22 de Dotaneitor).
//   • Carrera canónica = cargo_id → cargos → escalafones.nombre (el texto de
//     padron_historico.escalafon tiene variantes legacy).
//   • Cascada Carrera → Puesto → Especialidad (la especialidad viene vacía en
//     muchos casos; el literal_puesto es el que discrimina).
//   • Serie de stock = foto reconstruida a fin de cada mes. padron_historico
//     NO guarda la foto completa en cada carga semanal: solo registra las
//     filas que cambiaron respecto a la carga anterior (más recargas completas
//     esporádicas). Contar filas de un snapshot puntual daría el diff, no el
//     stock. Por eso se reconstruye el stock: para cada persona se toma su
//     última fila conocida con fecha < fin de mes, y se cuentan las que quedan
//     'activo'. Da la dotación real vigente al cierre de cada mes.
//   • Dedup del cargo espejo de jefatura: al jefe se le crea un cargo copia
//     (misma persona, misma repartición codigo_repa, mismo literal_puesto) para
//     colgarle más dotación; es el MISMO cargo. En padron_historico no existe
//     codigo_jefaturas, así que se colapsa contando personas distintas por
//     (persona_id, codigo_repa, literal_puesto) dentro del filtro.

const ESPECIALIDAD_VACIA = '(sin especialidad)'

const PUESTO_VACIO = '(SIN PUESTO)'

// Normaliza especialidad a una clave canónica. FUENTE: el CATÁLOGO
// (especialidades_puesto, vía el cargo), que es la MISMA que usa el resto de la
// app (filtros de Personas/Cargos) — así una fusión/renombre del catálogo (ej.
// "Pediatria (Clinica Pediatrica)" → "Pediatria") se refleja también acá, en vez
// de quedar el texto viejo que el padrón dejó en padron_historico.especialidad.
// Fallback al texto del padrón solo cuando el cargo no tiene especialidad en el
// catálogo (filas marginales). '' y 'SIN ESPECIALIDAD' → una única etiqueta.
// unaccent + upper + trim para que variantes de acento/capitalización colapsen.
function especialidadNormalizadaSql(alias: string) {
  const cargoId = Prisma.raw(`${alias}.cargo_id`)
  const texto = Prisma.raw(`${alias}.especialidad`)
  // Nombre del catálogo resuelto desde el cargo (fuente de verdad).
  const catalogo = Prisma.sql`(
    SELECT ep.nombre FROM cargos cesp
    JOIN especialidades_puesto ep ON ep.id = cesp.especialidad_puesto_id
    WHERE cesp.id = ${cargoId}
  )`
  // Equivalencias de nombres viejos del texto del padrón → nombre canónico del
  // catálogo, para los cargos que caen al fallback (sin especialidad en el
  // catálogo todavía) y así no reintroducir en el selector un nombre que ya se
  // unificó (ej. la fusión "PEDIATRIA (CLINICA PEDIATRICA)" → "PEDIATRIA").
  const textoNorm = Prisma.sql`unaccent(upper(trim(${texto})))`
  const textoCanonico = Prisma.sql`
    CASE ${textoNorm}
      WHEN 'PEDIATRIA (CLINICA PEDIATRICA)' THEN 'PEDIATRIA'
      ELSE ${textoNorm}
    END
  `
  return Prisma.sql`
    CASE
      WHEN ${catalogo} IS NOT NULL THEN unaccent(upper(trim(${catalogo})))
      WHEN ${texto} IS NULL OR trim(${texto}) = ''
        OR upper(trim(${texto})) = 'SIN ESPECIALIDAD'
      THEN ${ESPECIALIDAD_VACIA}
      ELSE ${textoCanonico}
    END
  `
}

// Normaliza literal_puesto a una clave canónica: unaccent(upper(trim(...))). El
// mismo puesto viene con distintas capitalizaciones y acentos en el padrón
// ("MEDICO DE PLANTA" vs "Medico de Planta", "ENFERMERÍA" vs "ENFERMERIA"), lo
// que duplicaba las opciones del selector. La clave normalizada es la que se usa
// como valor del filtro; el front la muestra con capitalización legible.
function puestoNormalizadoSql(alias: string) {
  const col = Prisma.raw(`${alias}.literal_puesto`)
  return Prisma.sql`
    CASE
      WHEN ${col} IS NULL OR trim(${col}) = '' THEN ${PUESTO_VACIO}
      ELSE unaccent(upper(trim(${col})))
    END
  `
}

// SQL de sigla normalizada (solo trim; las siglas ya vienen consistentes).
function siglaNormalizadaSql(alias: string) {
  return Prisma.sql`trim(${Prisma.raw(`${alias}.hospital_sigla`)})`
}

// El puesto es jefatura/conducción según su literal: Jefe / Director /
// Subdirector / Vicedirector. Es la definición operativa correcta ("un jefe por
// literal de puesto"), a diferencia de codigo_jefaturas —que marca a qué
// jefatura reporta la persona, no si el cargo ES una jefatura—.
function cargoEsJefaturaSql(alias: string) {
  const lit = Prisma.raw(`unaccent(upper(trim(${alias}.literal_puesto)))`)
  return Prisma.sql`(
    ${lit} LIKE 'JEFE %' OR ${lit} LIKE 'JEFE DE %' OR ${lit} = 'JEFE'
    OR ${lit} LIKE 'DIRECTOR%'
    OR ${lit} LIKE 'SUBDIRECTOR%'
    OR ${lit} LIKE 'VICEDIRECTOR%'
  )`
}

type DimensionesEvolucion = {
  siglas?: string[]
  carreras?: string[]
  puestos?: string[]
  especialidades?: string[]
  gruposEspecialidad?: string[]
  // Situación de revista del grupo/indicador (punto 2): se aplica dentro del AND
  // del grupo, antes de contar. Vacío/ausente = todas.
  situaciones?: string[]
}

// S25: grupo/especialidad "padre" de la especialidad del cargo
// (especialidades_puesto.grupo). Se resuelve desde el cargo de la fila. NULL si
// la especialidad del cargo no tiene grupo asignado. Genérico: sirve para
// cualquier conjunto de grupos que se agregue a futuro, no solo bioquímica.
function grupoEspecialidadSql(alias: string) {
  const cargoId = Prisma.raw(`${alias}.cargo_id`)
  return Prisma.sql`(
    SELECT ep.grupo FROM cargos cg
    JOIN especialidades_puesto ep ON ep.id = cg.especialidad_puesto_id
    WHERE cg.id = ${cargoId}
  )`
}

// Condiciones de UN grupo: AND entre dimensiones (OR interno por dimensión vía
// IN). Devuelve [] si el grupo no aporta nada. Parametrizado por alias para
// reusarlo en facetado (ph) y serie (ult).
function condicionesGrupoEvolucion(alias: string, g: DimensionesEvolucion): Prisma.Sql[] {
  const conds: Prisma.Sql[] = []
  if (g.siglas?.length) {
    conds.push(Prisma.sql`${siglaNormalizadaSql(alias)} IN (${Prisma.join(g.siglas)})`)
  }
  // La carrera ahora es el CÓDIGO de registro (codigos_registro.codigo, alias
  // cr), no el nombre de escalafón. cr se joinea (LEFT) en todas las queries
  // que usan esto. Los cargos sin código caen en el bucket '(sin codigo)'.
  if (g.carreras?.length) {
    conds.push(Prisma.sql`coalesce(cr.codigo, '(sin codigo)') IN (${Prisma.join(g.carreras)})`)
  }
  if (g.puestos?.length) {
    conds.push(Prisma.sql`(${puestoNormalizadoSql(alias)}) IN (${Prisma.join(g.puestos)})`)
  }
  if (g.especialidades?.length) {
    conds.push(Prisma.sql`(${especialidadNormalizadaSql(alias)}) IN (${Prisma.join(g.especialidades)})`)
  }
  if (g.gruposEspecialidad?.length) {
    conds.push(Prisma.sql`(${grupoEspecialidadSql(alias)}) IN (${Prisma.join(g.gruposEspecialidad)})`)
  }
  // Situación de revista (punto 2): misma normalización que el resto del motor
  // (lower(unaccent(trim(...)))). Dentro del AND del grupo → no altera
  // count(DISTINCT cuil) ni el desglose; solo acota qué filas entran.
  if (g.situaciones?.length) {
    conds.push(
      Prisma.sql`lower(unaccent(trim(${Prisma.raw(alias)}.situacion_revista))) IN (${Prisma.join(g.situaciones)})`,
    )
  }
  return conds
}

// Combina los filtros con UNIONES (OR): cada grupo (los recibidos + el "grupo en
// edición" de las dimensiones sueltas) es un AND de dimensiones; entre grupos
// hay OR. `jefatura` se aplica con AND global sobre toda la unión (es un atributo
// transversal del cargo, no parte del perfil). Espejo de buildConditions de
// /dotacion. `omitirDimension` sirve al facetado (opciones sin el propio filtro).
function construirFiltros(
  alias: string,
  f: {
    siglas?: string[]
    carreras?: string[]
    puestos?: string[]
    especialidades?: string[]
    gruposEspecialidad?: string[]
    situaciones?: string[]
    jefatura?: FiltroJefaturaVal
    grupos?: DimensionesEvolucion[]
  },
  omitirDimension?: keyof DimensionesEvolucion,
  // La situación de revista acota la SERIE/export (default true) pero NUNCA el
  // facetado de opciones (se pasa false): elegir un estado no debe recortar los
  // valores disponibles de Efector/Carrera/Puesto/Especialidad. Mismo criterio
  // que mesDesde/mesHasta, que el facetado tampoco aplica.
  aplicarSituacion = true,
) {
  const grupoEnEdicion: DimensionesEvolucion = {
    siglas: f.siglas,
    carreras: f.carreras,
    puestos: f.puestos,
    especialidades: f.especialidades,
    gruposEspecialidad: f.gruposEspecialidad,
    situaciones: aplicarSituacion ? f.situaciones : undefined,
  }
  if (omitirDimension) grupoEnEdicion[omitirDimension] = undefined

  const todosGrupos: DimensionesEvolucion[] = [...(f.grupos ?? []), grupoEnEdicion]
  const orClauses = todosGrupos
    .map((g) => {
      const conds = condicionesGrupoEvolucion(alias, g)
      return conds.length ? Prisma.sql`(${Prisma.join(conds, ' AND ')})` : null
    })
    .filter((c): c is Prisma.Sql => c !== null)

  const partes: Prisma.Sql[] = []
  if (orClauses.length > 0) partes.push(Prisma.sql`AND (${Prisma.join(orClauses, ' OR ')})`)
  if (f.jefatura === 'solo') partes.push(Prisma.sql`AND ${cargoEsJefaturaSql(alias)}`)
  if (f.jefatura === 'sin') partes.push(Prisma.sql`AND NOT ${cargoEsJefaturaSql(alias)}`)

  return partes.length ? Prisma.sql`${Prisma.join(partes, ' ')}` : Prisma.empty
}

type FiltroJefaturaVal = 'todos' | 'solo' | 'sin'

type FiltrosEvolucion = {
  siglas?: string[]
  carreras?: string[]
  puestos?: string[]
  especialidades?: string[]
  gruposEspecialidad?: string[]
  situaciones?: string[]
  jefatura?: FiltroJefaturaVal
  grupos?: DimensionesEvolucion[]
}

// Opciones FACETADAS: para cada dimensión devuelve los valores válidos dado el
// resto de los filtros ya elegidos (excluyendo la propia dimensión, para que el
// usuario pueda ampliar su selección dentro de esa misma dimensión). Todo sobre
// padron_historico de activos, con los valores normalizados.
export async function getDotacionEvolucionOpcionesService(filtros: FiltrosEvolucion = {}) {
  const BASE = Prisma.sql`
    FROM padron_historico ph
    JOIN cargos c ON c.id = ph.cargo_id
    JOIN escalafones e ON e.id = c.escalafon_id
    -- LEFT JOIN: cargos.codigo_registro_id es nullable → los cargos sin código
    -- caen en el bucket '(sin codigo)' en vez de descartarse silenciosamente.
    LEFT JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
    WHERE ph.hospital_sigla IS NOT NULL AND trim(ph.hospital_sigla) <> ''
  `

  // Cada dimensión aplica todos los filtros MENOS el suyo (del grupo en edición).
  // Los grupos de unión fijados sí restringen (es coherente con el facetado).
  const distinct = <T extends Record<string, string>>(
    selectExpr: Prisma.Sql,
    omitir: keyof DimensionesEvolucion,
  ) =>
    prisma.$queryRaw<T[]>(Prisma.sql`
      SELECT DISTINCT ${selectExpr} AS valor
      ${BASE}
      ${construirFiltros('ph', filtros, omitir, false)}
      ORDER BY 1
    `)

  // S25: grupos de especialidad disponibles. Se descartan los NULL (especialidad
  // sin grupo). Si queda vacío, el front oculta el combo "Grupos".
  const distinctGrupos = () =>
    prisma.$queryRaw<{ valor: string }[]>(Prisma.sql`
      SELECT DISTINCT (${grupoEspecialidadSql('ph')}) AS valor
      ${BASE}
      ${construirFiltros('ph', filtros, 'gruposEspecialidad', false)}
      ORDER BY 1
    `)

  // Carreras: código + literal legible (objeto, no lista plana). Coalesce al
  // bucket '(sin codigo)' para los cargos sin código de registro; el literal
  // cae al propio código si no hay literal.
  const distinctCarreras = () =>
    prisma.$queryRaw<{ codigo: string; literal: string }[]>(Prisma.sql`
      SELECT DISTINCT
        coalesce(cr.codigo, '(sin codigo)') AS codigo,
        coalesce(cr.literal, cr.codigo, '(sin codigo)') AS literal
      ${BASE}
      ${construirFiltros('ph', filtros, 'carreras', false)}
      ORDER BY 1
    `)

  const [siglas, carreras, puestos, especialidades, gruposEspecialidad, meses] = await Promise.all([
    distinct<{ valor: string }>(siglaNormalizadaSql('ph'), 'siglas'),
    distinctCarreras(),
    distinct<{ valor: string }>(puestoNormalizadoSql('ph'), 'puestos'),
    distinct<{ valor: string }>(especialidadNormalizadaSql('ph'), 'especialidades'),
    distinctGrupos(),
    // Meses disponibles (no dependen de los filtros; es el eje temporal completo).
    prisma.$queryRaw<{ valor: string }[]>(Prisma.sql`
      SELECT DISTINCT to_char(date_trunc('month', fecha_asignada), 'YYYY-MM') AS valor
      FROM padron_historico
      ORDER BY 1
    `),
  ])

  return {
    siglas: siglas.map((r) => r.valor),
    carreras: carreras.map((r) => ({ codigo: r.codigo, literal: r.literal })),
    puestos: puestos.map((r) => r.valor),
    especialidades: especialidades.map((r) => r.valor),
    // Filtra NULL/vacío: solo grupos reales.
    gruposEspecialidad: gruposEspecialidad.map((r) => r.valor).filter((v) => v != null && v !== ''),
    meses: meses.map((r) => r.valor),
  }
}

// SQL reutilizable: por cada mes, la fecha del snapshot COMPLETO (mayor volumen
// y por encima del umbral). Los meses que solo tienen cargas parciales quedan
// fuera — no hay foto real del padrón ese mes. Es la "foto de la última semana
// con datos completos" (Opción A). Acota por rango mesDesde/mesHasta.
// Cortes mensuales = fecha de cierre de cada mes (el padrón aprobado de fecha
// más tardía dentro del mes). El padrón NO se sube completo cada semana: la
// primera carga trae toda la foto y las siguientes son incrementales (altas,
// bajas y modificaciones). Por eso NO sirve elegir "el snapshot más grande del
// mes" — hay que reconstruir el estado activo ACUMULADO a cada corte, igual que
// kpis_dotacion_snapshot (ver scripts/backfill_kpis_dotacion.sql).
function cortesMensualesSql(mesDesde?: string, mesHasta?: string) {
  const mesDesdeFilter = mesDesde
    ? Prisma.sql`AND date_trunc('month', fecha_asignada) >= to_date(${mesDesde}, 'YYYY-MM')`
    : Prisma.empty
  const mesHastaFilter = mesHasta
    ? Prisma.sql`AND date_trunc('month', fecha_asignada) <= to_date(${mesHasta}, 'YYYY-MM')`
    : Prisma.empty
  return Prisma.sql`
    SELECT DISTINCT
      date_trunc('month', fecha_asignada) AS mes,
      max(fecha_asignada) OVER (PARTITION BY date_trunc('month', fecha_asignada)) AS corte
    FROM padron_snapshots
    WHERE estado = 'aprobado' ${mesDesdeFilter} ${mesHastaFilter}
  `
}

// Estado activo acumulado a cada corte: para cada id_sial_rol vigente en el
// corte, su fila de padron_historico más reciente con fecha_asignada <= corte
// (trae puesto/especialidad/sigla/cargo vigentes en ese momento). Un rol está
// vigente si apareció alguna vez <= corte y no fue dado de baja (padron_diff
// 'eliminado') sin un alta posterior <= corte. Mismo criterio que el backfill
// de kpis_dotacion_snapshot, pero conservando las dimensiones de padron_historico.
export function estadoActivoAcumuladoSql(mesDesde?: string, mesHasta?: string) {
  return Prisma.sql`
    WITH cortes AS (${cortesMensualesSql(mesDesde, mesHasta)}),
    -- El corte más reciente es el "mes en curso": debe reflejar el estado REAL
    -- actual, no la foto congelada del último padrón. Para ese mes se exige
    -- además que el rol tenga ocupación VIGENTE hoy (ocupaciones.hasta IS NULL);
    -- así una baja posterior a la fecha del padrón (ej. ocupación cerrada el
    -- 05/10 cuando el padrón es del 04/10) no cuenta como activa en vivo. Los
    -- meses anteriores quedan como su foto histórica de cierre.
    corte_actual AS (SELECT max(corte) AS corte FROM cortes),
    bajas AS (
      SELECT d.id_sial_rol, ps.fecha_asignada AS fecha_baja
      FROM padron_diff d
      JOIN padron_snapshots ps ON ps.id = d.snapshot_id
      WHERE d.tipo = 'eliminado'
    ),
    -- Última fila conocida de cada rol a cada corte (la foto vigente del rol
    -- en ese mes). En vez de cruzar cada corte con TODO el histórico anterior y
    -- hacer DISTINCT ON (producto cartesiano cortes × padron_historico — O(10 ×
    -- 140k) con sort externo, tardaba minutos), se calcula para cada fila su
    -- intervalo de vigencia con LEAD: la fila rige desde su fecha_asignada hasta
    -- la fecha de la SIGUIENTE fila del mismo rol. Luego se une con cortes por
    -- rango (una sola pasada, ~1s). Resultado idéntico a tomar la fila más
    -- reciente <= corte. Requiere el índice (id_sial_rol, fecha_asignada).
    hist AS (
      SELECT
        ph.id_sial_rol,
        ph.persona_id,
        ph.cargo_id,
        ph.literal_puesto,
        ph.especialidad,
        ph.hospital_sigla,
        ph.situacion_revista,
        ph.fecha_asignada,
        lead(ph.fecha_asignada) OVER (PARTITION BY ph.id_sial_rol ORDER BY ph.fecha_asignada) AS prox_fecha
      FROM padron_historico ph
    ),
    vigente AS (
      SELECT
        c.corte,
        c.mes,
        h.id_sial_rol,
        h.persona_id,
        h.cargo_id,
        h.literal_puesto,
        h.especialidad,
        h.hospital_sigla,
        h.situacion_revista
      FROM cortes c
      JOIN hist h ON h.fecha_asignada <= c.corte AND (h.prox_fecha IS NULL OR h.prox_fecha > c.corte)
    )
    SELECT v.*
    FROM vigente v
    -- Excluye roles dados de baja (padron_diff tipo 'eliminado') hasta el corte,
    -- salvo que reaparezcan en una foto POSTERIOR a la baja (reactivación).
    -- padron_diff.id_sial_rol usa el MISMO formato largo que padron_historico
    -- ('{idSial}-{seq}-{cuil}-{rol}'); antes se comparaba contra un id_sial
    -- truncado a las 2 primeras partes y NUNCA matcheaba, por lo que las bajas
    -- no se aplicaban y la persona contaba como activa para siempre (bug: una
    -- baja y la foto del MISMO snapshot dejaban el rol activo — ver Psicopedagogo
    -- de Planta, oct-2026).
    WHERE NOT EXISTS (
      SELECT 1 FROM bajas b
      WHERE b.id_sial_rol = v.id_sial_rol
        AND b.fecha_baja <= v.corte
        AND NOT EXISTS (
          SELECT 1 FROM padron_historico ph3
          WHERE ph3.id_sial_rol = v.id_sial_rol
            AND ph3.fecha_asignada > b.fecha_baja
            AND ph3.fecha_asignada <= v.corte
        )
    )
    -- Mes en curso "en vivo": en el corte más reciente, excluir roles cuya
    -- ocupación ya está cerrada en la BD (hasta IS NOT NULL). Para los meses
    -- anteriores no aplica (su foto de cierre es histórica e inmutable).
    AND (
      v.corte <> (SELECT corte FROM corte_actual)
      OR EXISTS (
        SELECT 1 FROM ocupaciones o
        WHERE o.id_sial_rol = v.id_sial_rol AND o.hasta IS NULL
      )
    )
  `
}

// Serie mensual de stock, motor unificado: una línea por situación de revista
// (NO disjuntas) + total + "activos y comisionados", todo count(DISTINCT cuil).
// OR dentro de cada dimensión (IN), AND entre dimensiones. Un punto por mes =
// foto reconstruida al cierre de cada mes (los meses sin foto completa no se
// grafican). Ya NO hay filtro duro 'activo' ni regla de estado representante:
// una persona cuenta en cada estado donde tiene ocupación vigente, y una sola
// vez en el total.
type PuntoSerieEvolucion = {
  mes: string
  total: number
  porSituacion: Record<string, number>
  activosYComisionados: number
}

// Espejo local de SerieIndicadorEvolucion de @srrhh/types (el módulo no importa
// ese paquete; mantiene sus shapes en paralelo, igual que ORDEN_SITUACION_REVISTA).
type SerieIndicadorEvolucion = {
  id: string
  label: string
  situaciones: string[]
  puntos: PuntoSerieEvolucion[]
}

// Motor de serie de UN perfil: ejecuta la reconstrucción del estado acumulado
// (idéntica a la del modo single histórico) y reagrupa en un punto por mes.
// Reutilizado tanto por el perfil "en edición" (modo single, punto 2) como por
// cada indicador comparable (punto 3). La lógica SQL NO cambió respecto del
// código previo.
async function serieEvolucionDeUnPerfil(
  filtros: FiltrosEvolucion,
  mesDesde?: string,
  mesHasta?: string,
): Promise<{ situaciones: string[]; puntos: PuntoSerieEvolucion[] }> {
  // `base` = estado acumulado al corte de cada mes, ya filtrado por las
  // dimensiones elegidas, con el cuil (unidad de conteo) y la situación
  // normalizada. count(DISTINCT cuil) absorbe el espejo de jefatura y las
  // suplencias de guardia (misma persona) sin necesidad del dedup por
  // representante que usa el export.
  const rows = await prisma.$queryRaw<
    { mes: string; situacion: string; personas: bigint; total: bigint; activosYComisionados: bigint }[]
  >(Prisma.sql`
    WITH ult AS (${estadoActivoAcumuladoSql(mesDesde, mesHasta)}),
    base AS (
      SELECT
        ult.mes,
        p.cuil,
        lower(unaccent(trim(ult.situacion_revista))) AS sit
      FROM ult
      JOIN cargos c ON c.id = ult.cargo_id
      LEFT JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
      JOIN personas p ON p.id = ult.persona_id
      WHERE p.cuil IS NOT NULL
        ${construirFiltros('ult', filtros)}
    ),
    meses AS (SELECT DISTINCT mes FROM ult),
    -- Estados presentes en los datos filtrados (para armar la grilla mes×estado
    -- y garantizar el eje temporal completo por estado, con 0 donde no hay nadie).
    estados AS (
      SELECT DISTINCT coalesce(sit, '(sin dato)') AS sit FROM base
    ),
    -- Series por estado: count(DISTINCT cuil) por (mes, estado). NO disjuntas.
    por_estado AS (
      SELECT mes, coalesce(sit, '(sin dato)') AS sit, count(DISTINCT cuil)::bigint AS personas
      FROM base
      GROUP BY mes, coalesce(sit, '(sin dato)')
    ),
    -- Total por mes: count(DISTINCT cuil) sin desglosar por estado (NO es la
    -- suma de las series).
    total_mes AS (
      SELECT mes, count(DISTINCT cuil)::bigint AS total
      FROM base
      GROUP BY mes
    ),
    -- Unión 'activo' ∪ 'comision' pedida en el mensaje #6: count(DISTINCT cuil)
    -- de quien tiene algún cargo activo O en comisión (NO la suma de ambas
    -- series).
    ayc_mes AS (
      SELECT mes, count(DISTINCT cuil)::bigint AS ayc
      FROM base
      WHERE coalesce(sit, '(sin dato)') IN ('activo', 'comision')
      GROUP BY mes
    )
    SELECT
      to_char(m.mes, 'YYYY-MM') AS mes,
      s.sit AS situacion,
      COALESCE(pe.personas, 0)::bigint AS personas,
      COALESCE(tm.total, 0)::bigint AS total,
      COALESCE(am.ayc, 0)::bigint AS "activosYComisionados"
    FROM meses m
    CROSS JOIN estados s
    LEFT JOIN por_estado pe ON pe.mes = m.mes AND pe.sit = s.sit
    LEFT JOIN total_mes tm ON tm.mes = m.mes
    LEFT JOIN ayc_mes am ON am.mes = m.mes
    ORDER BY m.mes, s.sit
  `)

  // Reagrupar las filas (mes × estado) en un punto por mes.
  const situacionesSet = new Set<string>()
  const porMes = new Map<
    string,
    { mes: string; total: number; porSituacion: Record<string, number>; activosYComisionados: number }
  >()
  for (const r of rows) {
    if (!porMes.has(r.mes)) {
      porMes.set(r.mes, {
        mes: r.mes,
        total: Number(r.total),
        porSituacion: {},
        activosYComisionados: Number(r.activosYComisionados),
      })
    }
    porMes.get(r.mes)!.porSituacion[r.situacion] = Number(r.personas)
    situacionesSet.add(r.situacion)
  }

  const puntos = [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes))

  return { situaciones: ordenarSituaciones([...situacionesSet]), puntos }
}

// Serie mensual de stock, motor unificado: una línea por situación de revista
// (NO disjuntas) + total + "activos y comisionados", todo count(DISTINCT cuil).
// OR dentro de cada dimensión (IN), AND entre dimensiones. Un punto por mes =
// foto reconstruida al cierre de cada mes (los meses sin foto completa no se
// grafican).
//
// Dos modos (punto 3):
//  - SIN indicadores: una sola serie del perfil "en edición" (acotada por
//    `situaciones` del perfil, punto 2). Forma de retorno histórica.
//  - CON indicadores: cada perfil se ejecuta SECUENCIALMENTE (no Promise.all,
//    para no abrir N conexiones concurrentes al pool ni competir por el plan
//    pesado) y se devuelve como una SerieIndicadorEvolucion. En ese caso
//    `situaciones`/`puntos` del nivel superior van vacíos (el perfil en edición
//    no se grafica) y las series viven en `indicadores`.
export async function getDotacionEvolucionService(query: DotacionEvolucionQuery) {
  const { siglas, carreras, puestos, especialidades, gruposEspecialidad, jefatura, mesDesde, mesHasta, grupos, situaciones, indicadores } =
    query
  const filtros: FiltrosEvolucion = {
    siglas,
    carreras,
    puestos,
    especialidades,
    gruposEspecialidad,
    situaciones,
    jefatura,
    grupos,
  }

  // Campos eco que acompañan ambos modos (idénticos al return histórico).
  const eco = {
    siglas: siglas ?? [],
    carreras: carreras ?? [],
    puestos: puestos ?? [],
    especialidades: especialidades ?? [],
    jefatura,
    mesDesde: mesDesde ?? null,
    mesHasta: mesHasta ?? null,
  }

  if (indicadores?.length) {
    // Modo multi-indicador: una serie por perfil, en secuencia.
    const series: SerieIndicadorEvolucion[] = []
    for (const perfil of indicadores) {
      const filtrosPerfil: FiltrosEvolucion = {
        siglas: perfil.siglas,
        carreras: perfil.carreras,
        puestos: perfil.puestos,
        especialidades: perfil.especialidades,
        gruposEspecialidad: perfil.gruposEspecialidad,
        situaciones: perfil.situaciones,
        jefatura,
      }
      const { situaciones: sits, puntos } = await serieEvolucionDeUnPerfil(filtrosPerfil, mesDesde, mesHasta)
      series.push({
        id: perfil.id ?? '',
        label: perfil.labels?.join(' · ') ?? '',
        situaciones: sits,
        puntos,
      })
    }
    return { ...eco, situaciones: [], puntos: [], indicadores: series }
  }

  // Modo single (perfil en edición), ahora acotado por `situaciones` (punto 2).
  const { situaciones: sits, puntos } = await serieEvolucionDeUnPerfil(filtros, mesDesde, mesHasta)
  return { ...eco, situaciones: sits, puntos }
}

// ─── Export a Excel del detalle que respalda el gráfico ─────────────────────
// Devuelve las personas que componen la última foto del rango elegido (mismos
// filtros que la serie), con las columnas del padrón semanal + "Es jefe". Un
// registro por cargo activo (deduplicado el espejo de jefatura por persona +
// repartición + puesto). Formato .xlsx.

// xlsx es CJS — mismo patrón que el resto del proyecto (createRequire en ESM).
const requireXlsx = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const XLSX = requireXlsx('xlsx') as any

export async function exportDotacionEvolucionService(query: DotacionEvolucionQuery) {
  // El export IGNORA `indicadores` (es el detalle del perfil en edición) pero SÍ
  // respeta `situaciones` → el Excel se acota igual que el gráfico (construirFiltros
  // con aplicarSituacion default true).
  const { siglas, carreras, puestos, especialidades, gruposEspecialidad, jefatura, mesDesde, mesHasta, grupos, situaciones } =
    query
  const filtros: FiltrosEvolucion = {
    siglas,
    carreras,
    puestos,
    especialidades,
    gruposEspecialidad,
    situaciones,
    jefatura,
    grupos,
  }

  const rows = await prisma.$queryRaw<
    {
      cuil: string | null
      apellidoNombre: string | null
      efectorSigla: string | null
      carreraCodigo: string
      carrera: string
      literalPuesto: string | null
      especialidad: string | null
      situacionRevista: string | null
      idSialRol: string
      esJefe: boolean
      mesFoto: string
    }[]
  >(Prisma.sql`
    WITH acum AS (${estadoActivoAcumuladoSql(mesDesde, mesHasta)}),
    -- Estado acumulado del ÚLTIMO corte del rango = misma foto que el último
    -- punto graficado. join a personas para traer cuil/apellido-nombre.
    mes_objetivo AS (
      SELECT max(mes) AS mes FROM acum
    ),
    ult AS (
      SELECT
        a.*,
        pe.cuil AS cuil,
        pe.apellido_nombre AS apellido_nombre
      FROM acum a
      JOIN mes_objetivo mo ON a.mes = mo.mes
      LEFT JOIN personas pe ON pe.id = a.persona_id
    ),
    -- Dedup espejo jefatura: un registro por persona + repartición + puesto.
    -- Mismo criterio de orden que la serie: el representante NUNCA es una
    -- suplencia de guardia (SG-*) si hay un cargo fijo en la misma partición.
    -- Ya NO se filtra por situacion_revista = 'activo' (motor unificado): el
    -- detalle lista todos los estados; la columna conserva el valor normalizado.
    dedup AS (
      SELECT
        ult.*,
        row_number() OVER (
          PARTITION BY ult.persona_id, coalesce((SELECT codigo_repa FROM cargos WHERE id = ult.cargo_id), ''),
                       ${puestoNormalizadoSql('ult')}
          ORDER BY (coalesce((SELECT codigo FROM cargos WHERE id = ult.cargo_id), '') LIKE 'SG-%') ASC,
                   ult.id_sial_rol
        ) AS drn
      FROM ult
    )
    SELECT
      d.cuil,
      d.apellido_nombre AS "apellidoNombre",
      d.hospital_sigla AS "efectorSigla",
      -- Carrera = código de registro (con su literal legible). LEFT JOIN porque
      -- cargos.codigo_registro_id es nullable → bucket '(sin codigo)'.
      coalesce(cr.codigo, '(sin codigo)') AS "carreraCodigo",
      coalesce(cr.literal, cr.codigo, '(sin codigo)') AS carrera,
      d.literal_puesto AS "literalPuesto",
      d.especialidad,
      lower(unaccent(trim(d.situacion_revista))) AS "situacionRevista",
      -- id_sial_rol viene como '{idSial}-{cuil}-{seq}'; se corta la parte del CUIL
      -- en adelante para dejar solo el ID SIAL del rol (ej. '001091388-3').
      CASE
        WHEN d.cuil IS NOT NULL AND d.cuil <> ''
        THEN split_part(d.id_sial_rol, '-' || d.cuil, 1)
        ELSE d.id_sial_rol
      END AS "idSialRol",
      ${cargoEsJefaturaSql('d')} AS "esJefe",
      to_char((SELECT mes FROM mes_objetivo), 'YYYY-MM') AS "mesFoto"
    FROM dedup d
    JOIN cargos c ON c.id = d.cargo_id
    LEFT JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
    WHERE d.drn = 1
      ${construirFiltros('d', filtros)}
    ORDER BY coalesce(cr.codigo, '(sin codigo)'), d.literal_puesto, d.apellido_nombre
  `)

  // Filas del Excel con encabezados legibles (formato del padrón semanal).
  const data = rows.map((r) => ({
    CUIL: r.cuil ?? '',
    'Apellido y Nombre': r.apellidoNombre ?? '',
    Efector: r.efectorSigla ?? '',
    Carrera: r.carrera,
    'Literal Puesto': r.literalPuesto ?? '',
    Especialidad: r.especialidad ?? '',
    'Situación de Revista': r.situacionRevista ?? '',
    'ID SIAL Rol': r.idSialRol,
    'Es Jefe': r.esJefe ? 'Sí' : 'No',
  }))

  // El Excel es el detalle auditable: UNA fila por cargo representante, así que
  // su recuento de filas es un superconjunto de la serie (una persona con 2
  // cargos en reparticiones distintas = 2 filas, 1 persona). Para que no se lea
  // como contradicción con el gráfico, el resumen separa "Personas únicas"
  // (count(DISTINCT cuil) = total de la serie) de "Filas de detalle (cargos)".
  const personasUnicas = new Set(
    rows.map((r) => r.cuil).filter((c): c is string => c != null && c !== ''),
  ).size
  const mesFoto = rows[0]?.mesFoto ?? mesHasta ?? 'actual'

  const resumen = [
    { Indicador: 'Mes de la foto', Valor: mesFoto },
    { Indicador: 'Personas únicas', Valor: personasUnicas },
    { Indicador: 'Filas de detalle (cargos)', Valor: rows.length },
  ]

  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(resumen), 'Resumen')
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(data), 'Dotación')
  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  return { buffer, mesFoto, total: rows.length, personasUnicas }
}
