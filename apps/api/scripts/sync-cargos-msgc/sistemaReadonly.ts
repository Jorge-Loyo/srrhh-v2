// ─────────────────────────────────────────────────────────────────────────────
// Carga del snapshot del sistema en SOLO LECTURA (FASE 1).
//
// UNA sola transacción interactiva de Prisma cuya primera sentencia es
// `SET TRANSACTION READ ONLY`; después se verifica con `transaction_read_only` y,
// si no es `on`, se aborta. Todas las consultas son SELECT/WITH con texto fijo
// (sin valores del usuario). No se leen CUIL, persona_id ni nombres.
// ─────────────────────────────────────────────────────────────────────────────
import { TX_OPTS_LARGA } from '../../src/shared/txOpts.js'
import type { CargoSistema, EstadoCargoSistema, OcupacionViva, SnapshotSistema, VinculosCargo } from './cruce.js'

/** Subconjunto de la transacción de Prisma que se usa acá (permite simularla en tests). */
export interface TxLectura {
  $executeRawUnsafe(sql: string): Promise<unknown>
  $queryRawUnsafe<T = unknown>(sql: string): Promise<T>
}

export interface PrismaLectura {
  $transaction<T>(fn: (tx: TxLectura) => Promise<T>, opts: { timeout: number; maxWait: number }): Promise<T>
}

export const SQL_READ_ONLY = 'SET TRANSACTION READ ONLY'
export const SQL_VERIFICA_READ_ONLY = "SELECT current_setting('transaction_read_only') AS v"

const SQL_CARGOS = `
SELECT c.id::text AS id, c.codigo, c.estado::text AS estado, c.sub_estado::text AS sub_estado,
       (c.deleted_at IS NOT NULL) AS eliminado, c.origen, c.tipo_origen, c.expediente, c.codigo_repa,
       h.sigla AS sigla, cr.codigo AS cr, e.codigo AS escalafon, p.nombre AS puesto, ep.nombre AS especialidad,
       c.cargo_base_id::text AS cargo_base_id, c.cargo_retenido_id::text AS cargo_retenido_id
FROM cargos c
JOIN hospitales h ON h.id = c.hospital_id
JOIN escalafones e ON e.id = c.escalafon_id
JOIN puestos_cargo p ON p.id = c.puesto_cargo_id
LEFT JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
LEFT JOIN especialidades_puesto ep ON ep.id = c.especialidad_puesto_id`

const SQL_OCUPACIONES = `SELECT id_sial_rol, cargo_id::text AS cargo_id FROM ocupaciones WHERE hasta IS NULL`

/** Conteo de vínculos por cargo: clave del snapshot -> consulta (texto fijo). */
const SQL_VINCULOS: Record<keyof VinculosCargo, string> = {
  concursos: 'SELECT cargo_id::text AS cargo_id, count(*)::int AS n FROM concursos GROUP BY cargo_id',
  concursosCph: 'SELECT cargo_id::text AS cargo_id, count(*)::int AS n FROM concursos_cph GROUP BY cargo_id',
  concursosCeetps: 'SELECT cargo_id::text AS cargo_id, count(*)::int AS n FROM concursos_ceetps GROUP BY cargo_id',
  bajas: 'SELECT cargo_id::text AS cargo_id, count(*)::int AS n FROM bajas GROUP BY cargo_id',
  padronHistorico: 'SELECT cargo_id::text AS cargo_id, count(*)::int AS n FROM padron_historico GROUP BY cargo_id',
  padronIncidencias:
    'SELECT cargo_id::text AS cargo_id, count(*)::int AS n FROM padron_incidencias WHERE cargo_id IS NOT NULL GROUP BY cargo_id',
  etiquetas: 'SELECT cargo_id::text AS cargo_id, count(*)::int AS n FROM etiquetas_cargo GROUP BY cargo_id',
  solicitudesAlta:
    'SELECT x.cargo_id::text AS cargo_id, count(*)::int AS n FROM (SELECT unnest(cargos_creados_ids) AS cargo_id FROM solicitudes_alta) x GROUP BY x.cargo_id',
}

const SQL_HOSPITALES = 'SELECT sigla FROM hospitales'
const SQL_ORGANIGRAMA = 'SELECT DISTINCT sigla FROM organigramas'
const SQL_CODIGOS_REGISTRO =
  'SELECT cr.codigo AS codigo, e.codigo AS escalafon FROM codigos_registro cr JOIN escalafones e ON e.id = cr.escalafon_id'
const SQL_PUESTOS = 'SELECT e.codigo AS escalafon, p.nombre AS nombre FROM puestos_cargo p JOIN escalafones e ON e.id = p.escalafon_id'
const SQL_ESPECIALIDADES = 'SELECT DISTINCT nombre FROM especialidades_puesto'

/** Todas las consultas que ejecuta este módulo (para el test de solo lectura). */
export const CONSULTAS_SNAPSHOT: readonly string[] = [
  SQL_CARGOS,
  SQL_OCUPACIONES,
  ...Object.values(SQL_VINCULOS),
  SQL_HOSPITALES,
  SQL_ORGANIGRAMA,
  SQL_CODIGOS_REGISTRO,
  SQL_PUESTOS,
  SQL_ESPECIALIDADES,
]

interface FilaCargo {
  id: string
  codigo: string | null
  estado: string
  sub_estado: string | null
  eliminado: boolean
  origen: string
  tipo_origen: string | null
  expediente: string | null
  codigo_repa: string | null
  sigla: string
  cr: string | null
  escalafon: string
  puesto: string
  especialidad: string | null
  cargo_base_id: string | null
  cargo_retenido_id: string | null
}

async function leerSnapshot(tx: TxLectura): Promise<SnapshotSistema> {
  const cargosRaw = await tx.$queryRawUnsafe<FilaCargo[]>(SQL_CARGOS)
  const ocup = await tx.$queryRawUnsafe<{ id_sial_rol: string; cargo_id: string }[]>(SQL_OCUPACIONES)

  const vinculos = new Map<string, VinculosCargo>()
  const vacio = (): VinculosCargo => ({
    concursos: 0, concursosCph: 0, concursosCeetps: 0, bajas: 0,
    padronHistorico: 0, padronIncidencias: 0, etiquetas: 0, solicitudesAlta: 0,
  })
  for (const k of Object.keys(SQL_VINCULOS) as (keyof VinculosCargo)[]) {
    const filas = await tx.$queryRawUnsafe<{ cargo_id: string; n: number }[]>(SQL_VINCULOS[k])
    for (const f of filas) {
      const v = vinculos.get(f.cargo_id) ?? vacio()
      v[k] = Number(f.n)
      vinculos.set(f.cargo_id, v)
    }
  }

  const hospitales = await tx.$queryRawUnsafe<{ sigla: string }[]>(SQL_HOSPITALES)
  const organigrama = await tx.$queryRawUnsafe<{ sigla: string }[]>(SQL_ORGANIGRAMA)
  const crs = await tx.$queryRawUnsafe<{ codigo: string; escalafon: string }[]>(SQL_CODIGOS_REGISTRO)
  const puestos = await tx.$queryRawUnsafe<{ escalafon: string; nombre: string }[]>(SQL_PUESTOS)
  const especialidades = await tx.$queryRawUnsafe<{ nombre: string }[]>(SQL_ESPECIALIDADES)

  const cargos: CargoSistema[] = cargosRaw.map((c) => ({
    id: c.id,
    codigo: c.codigo,
    estado: c.estado as EstadoCargoSistema,
    subEstado: c.sub_estado,
    eliminado: Boolean(c.eliminado),
    origen: c.origen,
    tipoOrigen: c.tipo_origen,
    expediente: c.expediente,
    codigoRepa: c.codigo_repa,
    sigla: c.sigla,
    cr: c.cr,
    escalafon: c.escalafon,
    puesto: c.puesto,
    especialidad: c.especialidad,
    cargoBaseId: c.cargo_base_id,
    cargoRetenidoId: c.cargo_retenido_id,
    vinculos: vinculos.get(c.id) ?? vacio(),
  }))
  const ocupaciones: OcupacionViva[] = ocup.map((o) => ({ idSialRol: o.id_sial_rol, cargoId: o.cargo_id }))

  return {
    cargos,
    ocupaciones,
    siglasHospital: hospitales.map((h) => h.sigla),
    siglasOrganigrama: organigrama.map((o) => o.sigla),
    codigosRegistro: crs,
    puestos,
    especialidades: especialidades.map((e) => e.nombre),
  }
}

/**
 * Carga el snapshot del sistema. La transacción es READ ONLY y se verifica antes de leer;
 * si la verificación falla se lanza un error y no se ejecuta ninguna consulta de datos.
 */
export async function cargarSnapshot(prisma: PrismaLectura): Promise<SnapshotSistema> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(SQL_READ_ONLY)
    const r = await tx.$queryRawUnsafe<{ v: string }[]>(SQL_VERIFICA_READ_ONLY)
    const v = r?.[0]?.v
    if (v !== 'on') {
      throw new Error(`Abortado: la transaccion no quedo en solo lectura (transaction_read_only=${String(v)})`)
    }
    console.log('transaction_read_only=on')
    return leerSnapshot(tx)
  }, TX_OPTS_LARGA)
}
