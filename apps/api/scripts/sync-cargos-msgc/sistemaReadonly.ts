// ─────────────────────────────────────────────────────────────────────────────
// Carga del snapshot del sistema en SOLO LECTURA (FASE 1).
//
// UNA sola transacción interactiva de Prisma cuya primera sentencia es
// `SET TRANSACTION READ ONLY`; después se verifica con `transaction_read_only` y,
// si no es `on`, se aborta. Todas las consultas son SELECT/WITH con texto fijo
// (sin valores del usuario). No se leen CUIL, persona_id ni nombres.
// ─────────────────────────────────────────────────────────────────────────────
import { TX_OPTS_LARGA } from '../../src/shared/txOpts.js'
import { TABLAS_BORRAR } from './limpieza.js'
import type { CargoSistema, ConcursoSistema, EstadoCargoSistema, OcupacionViva, SnapshotSistema, VinculosCargo } from './cruce.js'

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
       c.cargo_base_id::text AS cargo_base_id, c.cargo_retenido_id::text AS cargo_retenido_id,
       c.revision_dato, c.revision_motivo
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

/** Concursos por tipo (sin persona ni baja): estado, sub_estado, motivo, autorizacion y expedientes. */
const SQL_CONCURSOS_CPH = `
SELECT co.id::text AS concurso_id, cph.cargo_id::text AS cargo_id, cph.estado::text AS estado, cph.sub_estado AS sub_estado,
       co.motivo_concurso::text AS motivo_concurso, (co.autorizado_at IS NOT NULL) AS autorizado,
       co.expediente AS expediente, NULL::text AS expediente_2
FROM concursos_cph cph
JOIN concursos co ON co.id = cph.concurso_id`
const SQL_CONCURSOS_CEETPS = `
SELECT co.id::text AS concurso_id, ce.cargo_id::text AS cargo_id, ce.estado::text AS estado, ce.sub_estado AS sub_estado,
       co.motivo_concurso::text AS motivo_concurso, (co.autorizado_at IS NOT NULL) AS autorizado,
       co.expediente AS expediente, ce.expediente_concurso AS expediente_2, ce.expediente_concurso_2 AS expediente_3
FROM concursos_ceetps ce
JOIN concursos co ON co.id = ce.concurso_id`

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
  SQL_CONCURSOS_CPH,
  SQL_CONCURSOS_CEETPS,
  ...Object.values(SQL_VINCULOS),
  SQL_HOSPITALES,
  SQL_ORGANIGRAMA,
  SQL_CODIGOS_REGISTRO,
  SQL_PUESTOS,
  SQL_ESPECIALIDADES,
]

interface FilaConcurso {
  concurso_id: string
  cargo_id: string
  estado: string
  sub_estado: string | null
  motivo_concurso: string | null
  autorizado: boolean
  expediente: string | null
  expediente_2?: string | null
  expediente_3?: string | null
}

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
  revision_dato: boolean | null
  revision_motivo: string | null
}

async function leerSnapshot(tx: TxLectura): Promise<SnapshotSistema> {
  const cargosRaw = await tx.$queryRawUnsafe<FilaCargo[]>(SQL_CARGOS)
  const ocup = await tx.$queryRawUnsafe<{ id_sial_rol: string; cargo_id: string }[]>(SQL_OCUPACIONES)

  const filasCph = await tx.$queryRawUnsafe<FilaConcurso[]>(SQL_CONCURSOS_CPH)
  const filasCeetps = await tx.$queryRawUnsafe<FilaConcurso[]>(SQL_CONCURSOS_CEETPS)
  const aConcurso = (tipo: ConcursoSistema['tipo']) => (f: FilaConcurso): ConcursoSistema => ({
    concursoId: f.concurso_id,
    cargoId: f.cargo_id,
    tipo,
    estado: f.estado,
    subEstado: f.sub_estado,
    motivoConcurso: f.motivo_concurso,
    autorizado: Boolean(f.autorizado),
    expedientes: [f.expediente, f.expediente_2 ?? null, f.expediente_3 ?? null],
  })
  const concursos: ConcursoSistema[] = [...filasCph.map(aConcurso('cph')), ...filasCeetps.map(aConcurso('ceetps'))]

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
    revisionDato: Boolean(c.revision_dato),
    revisionMotivo: c.revision_motivo,
    vinculos: vinculos.get(c.id) ?? vacio(),
  }))
  const ocupaciones: OcupacionViva[] = ocup.map((o) => ({ idSialRol: o.id_sial_rol, cargoId: o.cargo_id }))

  return {
    cargos,
    ocupaciones,
    concursos,
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

/** Una consulta de conteo por tabla del plan de borrado (nombres fijos de TABLAS_BORRAR, sin valores del usuario). */
export const CONSULTAS_CONTEO_BORRADO: readonly string[] = TABLAS_BORRAR.map((t) => `SELECT count(*)::int AS n FROM ${t.tabla}`)

/** Conteo de filas por tabla a borrar, en transaccion READ ONLY verificada. No escribe nada. */
export async function contarTablasBorrar(prisma: PrismaLectura): Promise<Record<string, number>> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(SQL_READ_ONLY)
    const r = await tx.$queryRawUnsafe<{ v: string }[]>(SQL_VERIFICA_READ_ONLY)
    const v = r?.[0]?.v
    if (v !== 'on') {
      throw new Error(`Abortado: la transaccion no quedo en solo lectura (transaction_read_only=${String(v)})`)
    }
    const conteos: Record<string, number> = {}
    for (const [i, t] of TABLAS_BORRAR.entries()) {
      const f = await tx.$queryRawUnsafe<{ n: number }[]>(CONSULTAS_CONTEO_BORRADO[i])
      conteos[t.tabla] = Number(f[0]?.n ?? 0)
    }
    return conteos
  }, TX_OPTS_LARGA)
}
