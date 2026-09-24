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
            AND coalesce(cjef.codigo_repa, '')    = coalesce(c.codigo_repa, '')
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
// completo aprobado. El escalafón es el nombre canónico de escalafones.nombre.
export async function getKpisDotacionHistoricaService(_query: KpisDotacionHistoricaQuery) {
  const rows = await prisma.kpisDotacionSnapshot.findMany({
    orderBy: [{ fecha: 'asc' }, { escalafon: 'asc' }],
  })

  type PuntoMap = Map<string, { fecha: Date; porEscalafon: Record<string, number> }>
  const porFecha: PuntoMap = new Map()
  const escalafonesSet = new Set<string>()

  for (const r of rows) {
    const key = r.fecha.toISOString().slice(0, 10)
    if (!porFecha.has(key)) porFecha.set(key, { fecha: r.fecha, porEscalafon: {} })
    porFecha.get(key)!.porEscalafon[r.escalafon] = r.personas
    escalafonesSet.add(r.escalafon)
  }

  const escalafones = [...escalafonesSet].sort()
  const puntos = [...porFecha.values()].map((p) => ({
    fecha: p.fecha,
    total: Object.values(p.porEscalafon).reduce((s, v) => s + v, 0),
    porEscalafon: p.porEscalafon,
  }))

  return { escalafones, puntos }
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
//   • Solo situacion_revista = 'Activo' (el verdadero estado ocupado).
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
//     'Activo'. Da la dotación real vigente al cierre de cada mes.
//   • Dedup del cargo espejo de jefatura: al jefe se le crea un cargo copia
//     (misma persona, misma repartición codigo_repa, mismo literal_puesto) para
//     colgarle más dotación; es el MISMO cargo. En padron_historico no existe
//     codigo_jefaturas, así que se colapsa contando personas distintas por
//     (persona_id, codigo_repa, literal_puesto) dentro del filtro.

const ESPECIALIDAD_VACIA = '(sin especialidad)'

const PUESTO_VACIO = '(SIN PUESTO)'

// Umbral para considerar que un snapshot es una "foto completa" del padrón (y no
// una carga incremental/parcial). Las fotos completas rondan 28k–48k filas; las
// parciales, cientos. Solo los meses con al menos una foto completa se grafican,
// y de cada mes se toma esa foto (la de mayor volumen) — sin arrastrar semanas.
const UMBRAL_SNAPSHOT_COMPLETO = 10000

// Normaliza especialidad a una clave canónica. '' y 'SIN ESPECIALIDAD' → una
// única etiqueta. Se aplica unaccent + upper + trim para que variantes que solo
// difieren en acentos o capitalización colapsen en una sola opción del selector
// (ej. "ENFERMERÍA" vs "ENFERMERIA"). Requiere la extensión unaccent.
function especialidadNormalizadaSql(alias: string) {
  const col = Prisma.raw(`${alias}.especialidad`)
  return Prisma.sql`
    CASE
      WHEN ${col} IS NULL OR trim(${col}) = ''
        OR upper(trim(${col})) = 'SIN ESPECIALIDAD'
      THEN ${ESPECIALIDAD_VACIA}
      ELSE unaccent(upper(trim(${col})))
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

// Construye las cláusulas AND de los filtros multivaluados (OR dentro de cada
// dimensión vía IN, AND entre dimensiones) + jefatura. Se parametriza por alias
// para reusarlo en el facetado (ph) y en la serie (ult).
function construirFiltros(
  alias: string,
  f: {
    siglas?: string[]
    carreras?: string[]
    puestos?: string[]
    especialidades?: string[]
    jefatura?: FiltroJefaturaVal
  }
) {
  const partes: Prisma.Sql[] = []

  if (f.siglas?.length) {
    partes.push(Prisma.sql`AND ${siglaNormalizadaSql(alias)} IN (${Prisma.join(f.siglas)})`)
  }
  // La carrera canónica vive en escalafones.nombre (alias e), no en el alias de
  // padron_historico; e siempre está joineado en las queries que usan esto.
  if (f.carreras?.length) {
    partes.push(Prisma.sql`AND e.nombre IN (${Prisma.join(f.carreras)})`)
  }
  if (f.puestos?.length) {
    partes.push(Prisma.sql`AND (${puestoNormalizadoSql(alias)}) IN (${Prisma.join(f.puestos)})`)
  }
  if (f.especialidades?.length) {
    partes.push(
      Prisma.sql`AND (${especialidadNormalizadaSql(alias)}) IN (${Prisma.join(f.especialidades)})`
    )
  }
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
  jefatura?: FiltroJefaturaVal
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
    WHERE ph.situacion_revista = 'Activo'
      AND ph.hospital_sigla IS NOT NULL AND trim(ph.hospital_sigla) <> ''
  `

  // Cada dimensión aplica todos los filtros MENOS el suyo.
  const distinct = <T extends Record<string, string>>(
    selectExpr: Prisma.Sql,
    filtrosSinPropia: FiltrosEvolucion
  ) =>
    prisma.$queryRaw<T[]>(Prisma.sql`
      SELECT DISTINCT ${selectExpr} AS valor
      ${BASE}
      ${construirFiltros('ph', filtrosSinPropia)}
      ORDER BY 1
    `)

  const [siglas, carreras, puestos, especialidades, meses] = await Promise.all([
    distinct<{ valor: string }>(siglaNormalizadaSql('ph'), { ...filtros, siglas: undefined }),
    distinct<{ valor: string }>(Prisma.sql`e.nombre`, { ...filtros, carreras: undefined }),
    distinct<{ valor: string }>(puestoNormalizadoSql('ph'), { ...filtros, puestos: undefined }),
    distinct<{ valor: string }>(especialidadNormalizadaSql('ph'), {
      ...filtros,
      especialidades: undefined,
    }),
    // Meses disponibles (no dependen de los filtros; es el eje temporal completo).
    prisma.$queryRaw<{ valor: string }[]>(Prisma.sql`
      SELECT DISTINCT to_char(date_trunc('month', fecha_asignada), 'YYYY-MM') AS valor
      FROM padron_historico
      ORDER BY 1
    `),
  ])

  return {
    siglas: siglas.map((r) => r.valor),
    carreras: carreras.map((r) => r.valor),
    puestos: puestos.map((r) => r.valor),
    especialidades: especialidades.map((r) => r.valor),
    meses: meses.map((r) => r.valor),
  }
}

// SQL reutilizable: por cada mes, la fecha del snapshot COMPLETO (mayor volumen
// y por encima del umbral). Los meses que solo tienen cargas parciales quedan
// fuera — no hay foto real del padrón ese mes. Es la "foto de la última semana
// con datos completos" (Opción A). Acota por rango mesDesde/mesHasta.
function snapshotCompletoPorMesSql(mesDesde?: string, mesHasta?: string) {
  const mesDesdeFilter = mesDesde
    ? Prisma.sql`AND date_trunc('month', fecha_asignada) >= to_date(${mesDesde}, 'YYYY-MM')`
    : Prisma.empty
  const mesHastaFilter = mesHasta
    ? Prisma.sql`AND date_trunc('month', fecha_asignada) <= to_date(${mesHasta}, 'YYYY-MM')`
    : Prisma.empty
  return Prisma.sql`
    WITH tam AS (
      SELECT fecha_asignada, date_trunc('month', fecha_asignada) AS mes, count(*)::int AS filas
      FROM padron_historico
      WHERE true ${mesDesdeFilter} ${mesHastaFilter}
      GROUP BY 1, 2
    ),
    elegido AS (
      SELECT mes, fecha_asignada, filas,
        row_number() OVER (PARTITION BY mes ORDER BY filas DESC, fecha_asignada DESC) AS rn
      FROM tam
      WHERE filas >= ${UMBRAL_SNAPSHOT_COMPLETO}
    )
    SELECT mes, fecha_asignada FROM elegido WHERE rn = 1
  `
}

// Serie mensual de stock (una sola línea = suma de todo lo seleccionado).
// OR dentro de cada dimensión (IN), AND entre dimensiones. Un punto por mes =
// personas activas deduplicadas en el snapshot COMPLETO de ese mes (Opción A:
// la foto real del padrón; los meses sin foto completa no se grafican).
export async function getDotacionEvolucionService(query: DotacionEvolucionQuery) {
  const { siglas, carreras, puestos, especialidades, jefatura, mesDesde, mesHasta } = query
  const filtros: FiltrosEvolucion = { siglas, carreras, puestos, especialidades, jefatura }

  const rows = await prisma.$queryRaw<{ mes: string; cantidad: bigint }[]>(Prisma.sql`
    WITH snap AS (${snapshotCompletoPorMesSql(mesDesde, mesHasta)}),
    -- Filas del snapshot completo de cada mes (sin arrastre de otras semanas).
    ult AS (
      SELECT
        s.mes,
        ph.persona_id,
        ph.cargo_id,
        ph.literal_puesto,
        ph.especialidad,
        ph.hospital_sigla,
        ph.situacion_revista
      FROM snap s
      JOIN padron_historico ph ON ph.fecha_asignada = s.fecha_asignada
    )
    SELECT
      to_char(ult.mes, 'YYYY-MM') AS mes,
      -- Dedup espejo jefatura: personas distintas por repartición + puesto
      -- (puesto normalizado para no separar variantes de capitalización).
      count(DISTINCT (ult.persona_id, coalesce(c.codigo_repa, ''), ${puestoNormalizadoSql('ult')}))::bigint AS cantidad
    FROM ult
    JOIN cargos c ON c.id = ult.cargo_id
    JOIN escalafones e ON e.id = c.escalafon_id
    WHERE ult.situacion_revista = 'Activo'
      ${construirFiltros('ult', filtros)}
    GROUP BY ult.mes
    ORDER BY ult.mes
  `)

  return {
    siglas: siglas ?? [],
    carreras: carreras ?? [],
    puestos: puestos ?? [],
    especialidades: especialidades ?? [],
    jefatura,
    mesDesde: mesDesde ?? null,
    mesHasta: mesHasta ?? null,
    puntos: rows.map((r) => ({ mes: r.mes, cantidad: Number(r.cantidad) })),
  }
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
  const { siglas, carreras, puestos, especialidades, jefatura, mesDesde, mesHasta } = query
  const filtros: FiltrosEvolucion = { siglas, carreras, puestos, especialidades, jefatura }

  const rows = await prisma.$queryRaw<
    {
      cuil: string | null
      apellidoNombre: string | null
      efectorSigla: string | null
      carrera: string
      literalPuesto: string | null
      especialidad: string | null
      situacionRevista: string | null
      idSialRol: string
      esJefe: boolean
      mesFoto: string
    }[]
  >(Prisma.sql`
    WITH snap AS (${snapshotCompletoPorMesSql(mesDesde, mesHasta)}),
    -- Se toma el snapshot completo MÁS RECIENTE del rango (misma foto que el
    -- último punto graficado). Sin arrastre de otras semanas.
    mes_objetivo AS (
      SELECT mes, fecha_asignada FROM snap ORDER BY mes DESC LIMIT 1
    ),
    ult AS (
      SELECT ph.*
      FROM mes_objetivo mo
      JOIN padron_historico ph ON ph.fecha_asignada = mo.fecha_asignada
    ),
    -- Dedup espejo jefatura: un registro por persona + repartición + puesto.
    dedup AS (
      SELECT
        ult.*,
        row_number() OVER (
          PARTITION BY ult.persona_id, coalesce((SELECT codigo_repa FROM cargos WHERE id = ult.cargo_id), ''),
                       ${puestoNormalizadoSql('ult')}
          ORDER BY ult.id
        ) AS drn
      FROM ult
      WHERE ult.situacion_revista = 'Activo'
    )
    SELECT
      d.cuil,
      p.apellido_nombre AS "apellidoNombre",
      d.hospital_sigla AS "efectorSigla",
      e.nombre AS carrera,
      d.literal_puesto AS "literalPuesto",
      d.especialidad,
      d.situacion_revista AS "situacionRevista",
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
    JOIN escalafones e ON e.id = c.escalafon_id
    LEFT JOIN personas p ON p.id = d.persona_id
    WHERE d.drn = 1
      ${construirFiltros('d', filtros)}
    ORDER BY e.nombre, d.literal_puesto, p.apellido_nombre
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

  const sheet = XLSX.utils.json_to_sheet(data)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Dotación')
  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  const mesFoto = rows[0]?.mesFoto ?? mesHasta ?? 'actual'
  return { buffer, mesFoto, total: rows.length }
}
