import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'

// "Vigente" — mismo criterio que BASE_FROM en dotacion.service.ts: ocupación
// sin fecha de fin y cargo vigente. Acá no hace falta el dedup del espejo de
// jefatura (no filtramos por soloJefes ni mostramos KPIs de jefatura).
const OCUPACION_VIGENTE = Prisma.sql`o.hasta IS NULL AND c.estado = 'vigente'`

// Tabla "Personal en {CeSAC/unidad}" — mismas columnas que el boceto
// (Nombre, Puesto, Escalafón), ordenado alfabético.
async function listarPersonalPor(filtro: Prisma.Sql) {
  return prisma.$queryRaw<{
    personaId: string
    nombreApellido: string
    cuil: string
    puesto: string | null
    escalafon: string
  }[]>(Prisma.sql`
    SELECT p.id AS "personaId", p.apellido_nombre AS "nombreApellido", p.cuil,
           pcd.nombre AS puesto, e.nombre AS escalafon
    FROM ocupaciones o
    JOIN personas p    ON p.id = o.persona_id
    JOIN cargos c      ON c.id = o.cargo_id
    JOIN escalafones e ON e.id = c.escalafon_id
    JOIN puestos_cargo pcd ON pcd.id = c.puesto_cargo_id
    WHERE ${OCUPACION_VIGENTE} AND ${filtro}
    ORDER BY p.apellido_nombre ASC
  `)
}

export interface Jefe {
  nombre: string
  cuil: string
  cargo: string | null
}

// S23-10: jefe de un CeSAC/unidad fija — resuelto en runtime (no es dato del
// decreto), reutilizando el MISMO patrón ya existente en
// cadena-mando.service.ts (LEFT JOIN LATERAL contra cargos/ocupaciones por
// codigo_repa, priorizando escalafón de conducción (25/60) y si no cargo con
// codigo_jefaturas activo) en vez de reimplementarlo. Requiere que el
// CeSAC/unidad tenga su propio codigoReparticion (null en algún caso — ver
// seed S23-3 — devuelve null, no es un error).
async function getJefeService(codigoRepa: string | null): Promise<Jefe | null> {
  if (!codigoRepa) return null
  const rows = await prisma.$queryRaw<Jefe[]>(Prisma.sql`
    SELECT p.apellido_nombre AS nombre, p.cuil, c2.literal_puesto AS cargo
    FROM cargos c2
    JOIN codigos_registro cr ON cr.id = c2.codigo_registro_id
      AND cr.codigo IN ('25','60','37','83','85','87')
    JOIN ocupaciones o2 ON o2.cargo_id = c2.id
      AND o2.hasta IS NULL
      AND o2.situacion_revista = 'activo'
      AND (
        cr.codigo IN ('25','60')
        OR (o2.codigo_jefaturas IS NOT NULL AND o2.codigo_jefaturas != '' AND o2.codigo_jefaturas != '0')
      )
    JOIN personas p ON p.id = o2.persona_id
    WHERE c2.codigo_repa = ${codigoRepa}
      AND c2.deleted_at IS NULL
    ORDER BY cr.codigo ASC
    LIMIT 1
  `)
  return rows[0] ?? null
}

// ─────────────────────────────────────────────────────────────────────────
// Áreas Programáticas
// ─────────────────────────────────────────────────────────────────────────

export async function listAreasProgramaticasService() {
  return prisma.$queryRaw<{
    id: string
    nombre: string
    hospitalSigla: string
    hospitalNombre: string
    cesacs: bigint
    cargosVigentes: bigint
  }[]>(Prisma.sql`
    SELECT ap.id, ap.nombre, h.sigla AS "hospitalSigla", h.nombre AS "hospitalNombre",
           count(DISTINCT cs.id) AS cesacs,
           count(*) FILTER (WHERE ${OCUPACION_VIGENTE})::bigint AS "cargosVigentes"
    FROM areas_programaticas ap
    JOIN hospitales h ON h.id = ap.hospital_id
    LEFT JOIN cesacs cs ON cs.area_programatica_id = ap.id
    LEFT JOIN cargos c ON c.cesac_id = cs.id
    LEFT JOIN ocupaciones o ON o.cargo_id = c.id
    GROUP BY ap.id, ap.nombre, h.sigla, h.nombre
    ORDER BY ap.nombre
  `).then((rows) => rows.map((r) => ({ ...r, cesacs: Number(r.cesacs), cargosVigentes: Number(r.cargosVigentes) })))
}

export async function getAreaProgramaticaByIdService(id: string) {
  const ap = await prisma.areaProgramatica.findUnique({
    where: { id },
    include: { hospital: true },
  })
  if (!ap) throw AppError.notFound('Área Programática no encontrada')

  const cesacs = await prisma.$queryRaw<{
    id: string
    numero: number
    direccion: string | null
    barrio: string | null
    nivel: string
    codigoReparticion: string | null
    cargosVigentes: bigint
  }[]>(Prisma.sql`
    SELECT cs.id, cs.numero, cs.direccion, cs.barrio, cs.nivel,
           cs.codigo_reparticion AS "codigoReparticion",
           count(*) FILTER (WHERE ${OCUPACION_VIGENTE})::bigint AS "cargosVigentes"
    FROM cesacs cs
    LEFT JOIN cargos c ON c.cesac_id = cs.id
    LEFT JOIN ocupaciones o ON o.cargo_id = c.id
    WHERE cs.area_programatica_id = ${id}::uuid
    GROUP BY cs.id, cs.numero, cs.direccion, cs.barrio, cs.nivel, cs.codigo_reparticion
    ORDER BY cs.numero
  `)

  const cargosVigentes = cesacs.reduce((acc, c) => acc + Number(c.cargosVigentes), 0)

  // S23-11: columna "Jefe" en la tabla de CeSACs de la AP — mismo
  // getJefeService que el detalle de CeSAC, resuelto en paralelo por fila.
  const jefes = await Promise.all(cesacs.map((c) => getJefeService(c.codigoReparticion)))

  return {
    id: ap.id,
    nombre: ap.nombre,
    hospital: { id: ap.hospital.id, sigla: ap.hospital.sigla, nombre: ap.hospital.nombre },
    cargosVigentes,
    cesacs: cesacs.map((c, i) => ({
      id: c.id,
      numero: c.numero,
      direccion: c.direccion,
      barrio: c.barrio,
      nivel: c.nivel,
      cargosVigentes: Number(c.cargosVigentes),
      jefe: jefes[i],
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// CeSACs
// ─────────────────────────────────────────────────────────────────────────

export async function getCesacByIdService(id: string) {
  const cesac = await prisma.cesac.findUnique({
    where: { id },
    include: { areaProgramatica: { include: { hospital: true } } },
  })
  if (!cesac) throw AppError.notFound('CeSAC no encontrado')

  const [personal, jefe] = await Promise.all([
    listarPersonalPor(Prisma.sql`c.cesac_id = ${id}::uuid`),
    getJefeService(cesac.codigoReparticion),
  ])

  return {
    id: cesac.id,
    numero: cesac.numero,
    direccion: cesac.direccion,
    barrio: cesac.barrio,
    nivel: cesac.nivel,
    areaProgramatica: {
      id: cesac.areaProgramatica.id,
      nombre: cesac.areaProgramatica.nombre,
      hospital: {
        id: cesac.areaProgramatica.hospital.id,
        sigla: cesac.areaProgramatica.hospital.sigla,
        nombre: cesac.areaProgramatica.hospital.nombre,
      },
    },
    cargosVigentes: personal.length,
    jefe,
    personal,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Unidades fijas (CEMAR / Centro Odontológico Infantil / Red de Odontología)
// ─────────────────────────────────────────────────────────────────────────

export async function listUnidadesFijasService() {
  return prisma.$queryRaw<{
    id: string
    nombre: string
    tipo: string
    nivelOrganico: string
    cargosVigentes: bigint
  }[]>(Prisma.sql`
    SELECT u.id, u.nombre, u.tipo, u.nivel_organico AS "nivelOrganico",
           count(*) FILTER (WHERE ${OCUPACION_VIGENTE})::bigint AS "cargosVigentes"
    FROM unidades_fijas_apayc u
    LEFT JOIN cargos c ON c.unidad_fija_id = u.id
    LEFT JOIN ocupaciones o ON o.cargo_id = c.id
    GROUP BY u.id, u.nombre, u.tipo, u.nivel_organico
    ORDER BY u.nombre
  `).then((rows) => rows.map((r) => ({ ...r, cargosVigentes: Number(r.cargosVigentes) })))
}

export async function getUnidadFijaByIdService(id: string) {
  const unidad = await prisma.unidadFijaApayC.findUnique({ where: { id } })
  if (!unidad) throw AppError.notFound('Unidad fija no encontrada')

  const [personal, jefe] = await Promise.all([
    listarPersonalPor(Prisma.sql`c.unidad_fija_id = ${id}::uuid`),
    getJefeService(unidad.codigoReparticion),
  ])

  return {
    id: unidad.id,
    nombre: unidad.nombre,
    tipo: unidad.tipo,
    nivelOrganico: unidad.nivelOrganico,
    cargosVigentes: personal.length,
    jefe,
    personal,
  }
}
