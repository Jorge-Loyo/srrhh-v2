// ─────────────────────────────────────────────────────────────────────────────
// Implementación SQL (Postgres LOCAL) de los repositorios de escritura del sync.
// ÚNICO módulo, junto con limpieza.ts, con sentencias de escritura. Solo lo usa
// sincronizar.ts después de asegurarBaseLocal(DATABASE_URL).
//
// Todo es set-based (INSERT ... SELECT FROM unnest / UPDATE ... FROM unnest): una sentencia
// por lote. Los textos SQL son fijos; los valores viajan como parámetros.
// ─────────────────────────────────────────────────────────────────────────────
import { randomUUID } from 'node:crypto'
import type { ActualizacionCargo, CatalogosCrudos, NuevoCargo, NuevoConcurso, RepoCarga } from './cargar.js'
import { ejecutarLimpieza } from './limpieza.js'
import type { CambioCodigo, RepoRecodificacion } from './recodificar.js'
import type { DatosVerificacion, RepoVerificacion } from './verificar.js'

/** Subconjunto de la transacción de Prisma que se usa acá (permite simularla en tests). */
export interface TxSql {
  $executeRawUnsafe(sql: string, ...valores: unknown[]): Promise<number>
  $queryRawUnsafe<T = unknown>(sql: string, ...valores: unknown[]): Promise<T>
}

/** Todo lo que el modo escritura necesita de la base (carga + recodificación + verificación + bitácora). */
export interface RepoEscritura extends RepoCarga, RepoRecodificacion, RepoVerificacion {
  limpiar(conservarConcursoIds: string[]): Promise<Record<string, number>>
  recalcularSubEstado(): Promise<number>
  hayCorridaEscritura(): Promise<boolean>
  registrarCorrida(modo: string, excelSha256: string | null, resumen: unknown): Promise<void>
}

export const SQL_CREAR_CARGOS = `
INSERT INTO cargos (id, codigo, hospital_id, escalafon_id, codigo_registro_id, puesto_cargo_id, especialidad_puesto_id,
                    literal_puesto, estado, estado_desde, expediente, origen, revision_dato, revision_motivo, cargo_base_id, updated_at)
SELECT v.id, v.codigo, v.hospital_id, v.escalafon_id, v.cr_id, v.puesto_id, v.esp_id,
       v.literal, v.estado::"EstadoCargo", CURRENT_DATE, v.expediente, 'msgc', v.revision IS NOT NULL, v.revision, v.base_id, now()
FROM unnest($1::uuid[], $2::text[], $3::uuid[], $4::uuid[], $5::uuid[], $6::uuid[], $7::uuid[], $8::text[], $9::text[], $10::text[], $11::text[], $12::uuid[])
  AS v(id, codigo, hospital_id, escalafon_id, cr_id, puesto_id, esp_id, literal, estado, expediente, revision, base_id)`

export const SQL_ACTUALIZAR_CARGOS = `
UPDATE cargos c SET
  hospital_id = COALESCE(v.hospital_id, c.hospital_id),
  escalafon_id = COALESCE(v.escalafon_id, c.escalafon_id),
  codigo_registro_id = COALESCE(v.cr_id, c.codigo_registro_id),
  puesto_cargo_id = COALESCE(v.puesto_id, c.puesto_cargo_id),
  literal_puesto = COALESCE(v.literal, c.literal_puesto),
  especialidad_puesto_id = CASE WHEN v.set_esp THEN v.esp_id ELSE c.especialidad_puesto_id END,
  estado = COALESCE(v.estado::"EstadoCargo", c.estado),
  estado_desde = CASE WHEN v.estado IS NOT NULL AND v.estado::"EstadoCargo" <> c.estado THEN CURRENT_DATE ELSE c.estado_desde END,
  expediente = COALESCE(v.expediente, c.expediente),
  revision_dato = CASE WHEN v.revision IS NOT NULL THEN true ELSE c.revision_dato END,
  revision_motivo = COALESCE(v.revision, c.revision_motivo),
  cargo_base_id = COALESCE(v.base_id, c.cargo_base_id),
  updated_at = now()
FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::uuid[], $5::uuid[], $6::text[], $7::boolean[], $8::uuid[], $9::text[], $10::text[], $11::text[], $12::uuid[])
  AS v(id, hospital_id, escalafon_id, cr_id, puesto_id, literal, set_esp, esp_id, estado, expediente, revision, base_id)
WHERE c.id = v.id`

export const SQL_NO_VIGENTE = `
UPDATE cargos SET estado = 'no_vigente', estado_desde = CURRENT_DATE, updated_at = now()
WHERE id = ANY($1::uuid[]) AND estado <> 'no_vigente'`

export const SQL_CONCURSOS = `
INSERT INTO concursos (id, cargo_id, hospital_id, origen, fecha_vacante, expediente, tipo_concurso, motivo_concurso)
SELECT v.id, v.cargo_id, v.hospital_id, 'msgc', CURRENT_DATE, v.expediente, v.tipo::"TipoConcurso", v.motivo::"MotivoConcurso"
FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::text[], $5::text[], $6::text[]) AS v(id, cargo_id, hospital_id, expediente, tipo, motivo)`

export const SQL_CONCURSOS_CPH = `
INSERT INTO concursos_cph (id, concurso_id, cargo_id, hospital_id, observaciones, updated_at)
SELECT v.id, v.concurso_id, v.cargo_id, v.hospital_id, v.obs, now()
FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::uuid[], $5::text[]) AS v(id, concurso_id, cargo_id, hospital_id, obs)`

export const SQL_CONCURSOS_CEETPS = `
INSERT INTO concursos_ceetps (id, concurso_id, cargo_id, hospital_id, escalafon_id, observaciones, updated_at)
SELECT v.id, v.concurso_id, v.cargo_id, v.hospital_id, v.escalafon_id, v.obs, now()
FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::uuid[], $5::uuid[], $6::text[]) AS v(id, concurso_id, cargo_id, hospital_id, escalafon_id, obs)`

export const SQL_REASIGNAR = [
  `UPDATE concursos x SET cargo_id = v.cargo_id, hospital_id = c.hospital_id
   FROM unnest($1::uuid[], $2::uuid[]) AS v(concurso_id, cargo_id), cargos c WHERE x.id = v.concurso_id AND c.id = v.cargo_id`,
  `UPDATE concursos_cph x SET cargo_id = v.cargo_id, hospital_id = c.hospital_id, updated_at = now()
   FROM unnest($1::uuid[], $2::uuid[]) AS v(concurso_id, cargo_id), cargos c WHERE x.concurso_id = v.concurso_id AND c.id = v.cargo_id`,
  `UPDATE concursos_ceetps x SET cargo_id = v.cargo_id, hospital_id = c.hospital_id, updated_at = now()
   FROM unnest($1::uuid[], $2::uuid[]) AS v(concurso_id, cargo_id), cargos c WHERE x.concurso_id = v.concurso_id AND c.id = v.cargo_id`,
] as const

/** Réplica de scripts/sql/recalcular-sub-estado-cargos.sql (misma regla; idempotente: solo toca donde difiere). */
export const SQL_SUB_ESTADO = `
UPDATE cargos c SET sub_estado = v.esperado, updated_at = now()
FROM (
  SELECT k.id,
         (CASE
            WHEN k.estado <> 'vigente' THEN NULL
            WHEN EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = k.id AND o.hasta IS NULL) THEN 'ocupado'
            WHEN EXISTS (SELECT 1 FROM concursos_cph cph JOIN concursos co ON co.id = cph.concurso_id
                          WHERE cph.cargo_id = k.id AND cph.estado::text IN ('no_iniciado','activo','suspendido')
                            AND (co.motivo_concurso IS DISTINCT FROM 'nuevo_cargo' OR co.autorizado_at IS NOT NULL))
              OR EXISTS (SELECT 1 FROM concursos_ceetps ce JOIN concursos co ON co.id = ce.concurso_id
                          WHERE ce.cargo_id = k.id AND ce.estado::text IN ('sin_autorizar','autorizado','en_proceso')
                            AND (co.motivo_concurso IS DISTINCT FROM 'nuevo_cargo' OR co.autorizado_at IS NOT NULL)) THEN 'concurso'
            ELSE 'vacante'
          END)::"SubEstadoCargo" AS esperado
  FROM (SELECT id, estado::text AS estado FROM cargos WHERE deleted_at IS NULL) k
) v
WHERE v.id = c.id AND c.sub_estado IS DISTINCT FROM v.esperado`

const sinNulosFin = <T>(xs: (T | null | undefined)[]): (T | null)[] => xs.map((x) => x ?? null)

/** Repositorio sobre una transacción de Prisma ya abierta contra una base LOCAL. */
export function crearRepoEscritura(tx: TxSql, databaseUrl: string): RepoEscritura {
  return {
    async catalogos(): Promise<CatalogosCrudos> {
      const [hospitales, codigosRegistro, puestos, especialidades] = await Promise.all([
        tx.$queryRawUnsafe<{ id: string; sigla: string }[]>('SELECT id::text AS id, sigla FROM hospitales'),
        tx.$queryRawUnsafe<{ id: string; codigo: string; escalafonId: string }[]>('SELECT id::text AS id, codigo, escalafon_id::text AS "escalafonId" FROM codigos_registro'),
        tx.$queryRawUnsafe<{ id: string; escalafonId: string; nombre: string; modalidad: string }[]>('SELECT id::text AS id, escalafon_id::text AS "escalafonId", nombre, modalidad::text AS modalidad FROM puestos_cargo'),
        tx.$queryRawUnsafe<{ id: string; puestoId: string; nombre: string }[]>('SELECT id::text AS id, puesto_cargo_id::text AS "puestoId", nombre FROM especialidades_puesto'),
      ])
      return { hospitales, codigosRegistro, puestos, especialidades }
    },
    async maximosCodigo() {
      const filas = await tx.$queryRawUnsafe<{ prefijo: string; n: number }[]>(
        `SELECT regexp_replace(codigo, '-[0-9]{6}$', '') AS prefijo, max(substring(codigo from '[0-9]{6}$')::int)::int AS n
         FROM cargos WHERE codigo ~ '-[0-9]{6}$' GROUP BY 1`,
      )
      return new Map(filas.map((f) => [f.prefijo, Number(f.n)]))
    },
    async crearHospital(sigla: string) {
      const id = randomUUID()
      await tx.$executeRawUnsafe('INSERT INTO hospitales (id, sigla, nombre, activo, updated_at) VALUES ($1::uuid, $2, $2, true, now())', id, sigla)
      return id
    },
    async crearCargos(l: NuevoCargo[]) {
      if (!l.length) return
      await tx.$executeRawUnsafe(
        SQL_CREAR_CARGOS,
        l.map((x) => x.id), l.map((x) => x.codigo), l.map((x) => x.hospitalId), l.map((x) => x.escalafonId),
        sinNulosFin(l.map((x) => x.codigoRegistroId)), l.map((x) => x.puestoCargoId), sinNulosFin(l.map((x) => x.especialidadPuestoId)),
        l.map((x) => x.literalPuesto), l.map((x) => x.estado), sinNulosFin(l.map((x) => x.expediente)),
        sinNulosFin(l.map((x) => x.revisionMotivo)), sinNulosFin(l.map((x) => x.cargoBaseId)),
      )
    },
    async actualizarCargos(l: ActualizacionCargo[]) {
      if (!l.length) return
      await tx.$executeRawUnsafe(
        SQL_ACTUALIZAR_CARGOS,
        l.map((x) => x.id), sinNulosFin(l.map((x) => x.hospitalId)), sinNulosFin(l.map((x) => x.escalafonId)),
        sinNulosFin(l.map((x) => x.codigoRegistroId)), sinNulosFin(l.map((x) => x.puestoCargoId)), sinNulosFin(l.map((x) => x.literalPuesto)),
        l.map((x) => x.especialidadPuestoId !== undefined), sinNulosFin(l.map((x) => x.especialidadPuestoId)),
        sinNulosFin(l.map((x) => x.estado)), sinNulosFin(l.map((x) => x.expediente)),
        sinNulosFin(l.map((x) => x.revisionMotivo)), sinNulosFin(l.map((x) => x.cargoBaseId)),
      )
    },
    async pasarNoVigente(ids: string[]) {
      return ids.length ? Number(await tx.$executeRawUnsafe(SQL_NO_VIGENTE, ids)) : 0
    },
    async crearConcursos(l: NuevoConcurso[]) {
      if (!l.length) return
      await tx.$executeRawUnsafe(
        SQL_CONCURSOS,
        l.map((x) => x.concursoId), l.map((x) => x.cargoId), l.map((x) => x.hospitalId), sinNulosFin(l.map((x) => x.expediente)),
        l.map((x) => x.tipo), sinNulosFin(l.map((x) => x.motivoConcurso)),
      )
      const cph = l.filter((x) => x.tipo === 'cph')
      if (cph.length) {
        await tx.$executeRawUnsafe(SQL_CONCURSOS_CPH, cph.map((x) => x.detalleId), cph.map((x) => x.concursoId), cph.map((x) => x.cargoId), cph.map((x) => x.hospitalId), cph.map((x) => x.observaciones))
      }
      const ce = l.filter((x) => x.tipo === 'ceetps')
      if (ce.length) {
        await tx.$executeRawUnsafe(SQL_CONCURSOS_CEETPS, ce.map((x) => x.detalleId), ce.map((x) => x.concursoId), ce.map((x) => x.cargoId), ce.map((x) => x.hospitalId), ce.map((x) => x.escalafonId), ce.map((x) => x.observaciones))
      }
    },
    async reasignarConcursos(l) {
      if (!l.length) return
      for (const sql of SQL_REASIGNAR) await tx.$executeRawUnsafe(sql, l.map((x) => x.concursoId), l.map((x) => x.cargoId))
    },
    async asignarEtiqueta(nombre: string, cargoIds: string[]) {
      if (!cargoIds.length) return
      await tx.$executeRawUnsafe('INSERT INTO etiquetas (id, nombre, activo) VALUES ($1::uuid, $2, true) ON CONFLICT (nombre) DO NOTHING', randomUUID(), nombre)
      await tx.$executeRawUnsafe(
        'INSERT INTO etiquetas_cargo (etiqueta_id, cargo_id) SELECT e.id, x FROM etiquetas e, unnest($2::uuid[]) AS x WHERE e.nombre = $1 ON CONFLICT DO NOTHING',
        nombre, cargoIds,
      )
    },
    async leerCodigos() {
      return tx.$queryRawUnsafe<{ id: string; codigo: string }[]>('SELECT id::text AS id, codigo FROM cargos WHERE codigo IS NOT NULL')
    },
    async liberarCodigos(ids: string[]) {
      if (!ids.length) return
      await tx.$executeRawUnsafe('UPDATE cargos SET codigo_legacy = COALESCE(codigo_legacy, codigo), codigo = NULL, updated_at = now() WHERE id = ANY($1::uuid[])', ids)
    },
    async asignarCodigos(l: CambioCodigo[]) {
      if (!l.length) return
      await tx.$executeRawUnsafe(
        'UPDATE cargos c SET codigo = v.hasta FROM unnest($1::uuid[], $2::text[]) AS v(id, hasta) WHERE c.id = v.id',
        l.map((x) => x.id), l.map((x) => x.hasta),
      )
    },
    async limpiar(conservarConcursoIds: string[]) {
      return ejecutarLimpieza(tx, { databaseUrl, conservarConcursoIds })
    },
    async recalcularSubEstado() {
      return Number(await tx.$executeRawUnsafe(SQL_SUB_ESTADO))
    },
    async hayCorridaEscritura() {
      const f = await tx.$queryRawUnsafe<{ n: number }[]>("SELECT count(*)::int AS n FROM sync_corridas WHERE modo = 'escritura'")
      return Number(f[0]?.n ?? 0) > 0
    },
    async registrarCorrida(modo: string, excelSha256: string | null, resumen: unknown) {
      await tx.$executeRawUnsafe('INSERT INTO sync_corridas (id, modo, excel_sha256, resumen) VALUES ($1::uuid, $2, $3, $4::jsonb)', randomUUID(), modo, excelSha256, JSON.stringify(resumen))
    },
    async datosVerificacion(): Promise<DatosVerificacion> {
      const estados = await tx.$queryRawUnsafe<{ estado: string; n: number }[]>(
        "SELECT estado::text AS estado, count(*)::int AS n FROM cargos WHERE deleted_at IS NULL AND estado IN ('vigente','validacion_vacante') GROUP BY 1",
      )
      const prefijos = await tx.$queryRawUnsafe<{ prefijo: string; n: number }[]>(
        `SELECT regexp_replace(regexp_replace(codigo, '-[0-9]+$', ''), '^R-', '') AS prefijo, count(*)::int AS n
         FROM cargos WHERE codigo IS NOT NULL GROUP BY 1`,
      )
      const integridad: Record<string, number> = {}
      for (const [nombre, sql] of Object.entries(CONSULTAS_INTEGRIDAD)) {
        const f = await tx.$queryRawUnsafe<{ n: number }[]>(sql)
        integridad[nombre] = Number(f[0]?.n ?? 0)
      }
      const sub = await tx.$queryRawUnsafe<{ n: number }[]>(SQL_SUB_ESTADO_INCONSISTENTES)
      return {
        vigentes: Number(estados.find((e) => e.estado === 'vigente')?.n ?? 0),
        validacionVacante: Number(estados.find((e) => e.estado === 'validacion_vacante')?.n ?? 0),
        prefijosCodigo: Object.fromEntries(prefijos.map((p) => [p.prefijo, Number(p.n)])),
        integridad,
        subEstadoInconsistentes: Number(sub[0]?.n ?? 0),
      }
    },
  }
}

/** Chequeos de integridad referencial: cada consulta cuenta las filas que violan la regla (debe dar 0). */
export const CONSULTAS_INTEGRIDAD: Readonly<Record<string, string>> = {
  'concursos cph sin detalle': "SELECT count(*)::int AS n FROM concursos c WHERE c.tipo_concurso = 'cph' AND NOT EXISTS (SELECT 1 FROM concursos_cph x WHERE x.concurso_id = c.id)",
  'concursos ceetps sin detalle': "SELECT count(*)::int AS n FROM concursos c WHERE c.tipo_concurso = 'ceetps' AND NOT EXISTS (SELECT 1 FROM concursos_ceetps x WHERE x.concurso_id = c.id)",
  'detalle de concurso en otro cargo que el concurso base':
    'SELECT count(*)::int AS n FROM (SELECT x.concurso_id FROM concursos_cph x JOIN concursos c ON c.id = x.concurso_id WHERE x.cargo_id <> c.cargo_id UNION ALL SELECT x.concurso_id FROM concursos_ceetps x JOIN concursos c ON c.id = x.concurso_id WHERE x.cargo_id <> c.cargo_id) t',
  'cargo base de si mismo': 'SELECT count(*)::int AS n FROM cargos WHERE cargo_base_id = id',
  'cargos sin hospital, escalafon o puesto': 'SELECT count(*)::int AS n FROM cargos WHERE hospital_id IS NULL OR escalafon_id IS NULL OR puesto_cargo_id IS NULL',
  'ocupaciones vivas sobre cargos inexistentes': 'SELECT count(*)::int AS n FROM ocupaciones o WHERE o.hasta IS NULL AND NOT EXISTS (SELECT 1 FROM cargos c WHERE c.id = o.cargo_id)',
}

/** Cargos vivos cuyo sub_estado no coincide con la regla (mismos 5 casos de recalcular-sub-estado-cargos.sql). */
export const SQL_SUB_ESTADO_INCONSISTENTES = `
SELECT count(*)::int AS n FROM cargos c
WHERE c.deleted_at IS NULL AND (
  (c.estado <> 'vigente' AND c.sub_estado IS NOT NULL)
  OR (c.estado = 'vigente' AND c.sub_estado IS NULL)
  OR (c.estado = 'vigente' AND c.sub_estado = 'ocupado' AND NOT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL))
  OR (c.estado = 'vigente' AND c.sub_estado IN ('vacante','concurso') AND EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL))
)`
