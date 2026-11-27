// ─────────────────────────────────────────────────────────────────────────────
// Implementación SQL (Postgres LOCAL) de los repositorios de escritura del sync.
// ÚNICO módulo, junto con limpieza.ts, con sentencias de escritura. Solo lo usa
// sincronizar.ts después de asegurarBaseLocal(DATABASE_URL).
//
// Todo es set-based (INSERT ... SELECT FROM json_to_recordset / UPDATE ... FROM json_to_recordset): una sentencia
// por lote. Los textos SQL son fijos; cada lote viaja como UN solo parámetro de texto JSON (jsonLote.ts), nunca como array.
// ─────────────────────────────────────────────────────────────────────────────
import { randomUUID } from 'node:crypto'
import type { ActualizacionCargo, CatalogosCrudos, NuevaEspecialidad, NuevoCargo, NuevoConcurso, NuevoPuesto, RepoCarga } from './cargar.js'
import type { EscalafonFila, RepoEscalafon } from './escalafon.js'
import {
  ESCALAFON_DOCENTES_DUPLICADO,
  CODIGO_REGISTRO_DOCENTES,
  SQL_ESCALAFONES_TODOS,
  SQL_ESPECIALIDADES_COINCIDENTES,
  SQL_FKS_HACIA,
  SQL_PUESTOS_COINCIDENTES,
  ident,
  type FkRef,
  type RepoEscalafonesDuplicados,
  type ResumenFusionEscalafon,
} from './escalafonesDuplicados.js'
import { jsonLote, trocear } from './jsonLote.js'
import { estadoActivoSqlDelSistema, regenerarKpisDotacion } from './kpisDotacion.js'
import { ejecutarLimpieza } from './limpieza.js'
import type { CambioCodigo, RepoRecodificacion } from './recodificar.js'
import type { DatosVerificacion, RepoVerificacion } from './verificar.js'

/** Subconjunto de la transacción de Prisma que se usa acá (permite simularla en tests). */
export interface TxSql {
  $executeRawUnsafe(sql: string, ...valores: unknown[]): Promise<number>
  $queryRawUnsafe<T = unknown>(sql: string, ...valores: unknown[]): Promise<T>
}

/** Todo lo que el modo escritura necesita de la base (carga + recodificación + verificación + bitácora). */
export interface RepoEscritura extends RepoCarga, RepoRecodificacion, RepoVerificacion, RepoEscalafon, RepoEscalafonesDuplicados {
  limpiar(conservarConcursoIds: string[]): Promise<Record<string, number>>
  recalcularSubEstado(): Promise<number>
  /** Borra y regenera kpis_dotacion_snapshot con el mecanismo del sistema (kpisDotacion.ts). Devuelve filas insertadas. */
  regenerarKpisDotacion(): Promise<number>
  hayCorridaEscritura(): Promise<boolean>
  registrarCorrida(modo: string, excelSha256: string | null, resumen: unknown): Promise<void>
}

export const SQL_CREAR_CARGOS = `
INSERT INTO cargos (id, codigo, hospital_id, escalafon_id, codigo_registro_id, puesto_cargo_id, especialidad_puesto_id,
                    literal_puesto, estado, estado_desde, expediente, origen, revision_dato, revision_motivo, cargo_base_id, updated_at)
SELECT v.id, v.codigo, v.hospital_id, v.escalafon_id, v.cr_id, v.puesto_id, v.esp_id,
       v.literal, v.estado::"EstadoCargo", CURRENT_DATE, v.expediente, 'msgc', v.revision IS NOT NULL, v.revision, v.base_id, now()
FROM json_to_recordset($1::text::json)
  AS v(id uuid, codigo text, hospital_id uuid, escalafon_id uuid, cr_id uuid, puesto_id uuid, esp_id uuid, literal text, estado text, expediente text, revision text, base_id uuid)`

export const SQL_CREAR_PUESTOS_PENDIENTES = `
INSERT INTO puestos_cargo (id, escalafon_id, modalidad, nombre, activo, tipo_puesto, pendiente_curar)
SELECT v.id, v.escalafon_id, v.modalidad::"ModalidadPuesto", v.nombre, true, v.tipo::"TipoPuesto", true
FROM json_to_recordset($1::text::json) AS v(id uuid, escalafon_id uuid, modalidad text, nombre text, tipo text)
ON CONFLICT (escalafon_id, modalidad, nombre) DO NOTHING`
export const SQL_CREAR_ESPECIALIDADES_PENDIENTES = `
INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo, pendiente_curar)
SELECT v.id, v.puesto_id, v.nombre, true, true
FROM json_to_recordset($1::text::json) AS v(id uuid, puesto_id uuid, nombre text)
ON CONFLICT (puesto_cargo_id, nombre) DO NOTHING`
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
FROM json_to_recordset($1::text::json)
  AS v(id uuid, hospital_id uuid, escalafon_id uuid, cr_id uuid, puesto_id uuid, literal text, set_esp boolean, esp_id uuid, estado text, expediente text, revision text, base_id uuid)
WHERE c.id = v.id`

/** Lista de ids (uuid) desde UN parámetro de texto JSON `["id", ...]`; `$1` por defecto. */
const sqlIdsJson = (n: number) => `SELECT (jsonb_array_elements_text($${n}::text::jsonb))::uuid`
const SQL_IDS_JSON = sqlIdsJson(1)

export const SQL_NO_VIGENTE = `
UPDATE cargos SET estado = 'no_vigente', estado_desde = CURRENT_DATE, updated_at = now()
WHERE id IN (${SQL_IDS_JSON}) AND estado <> 'no_vigente'`

export const SQL_CONCURSOS = `
INSERT INTO concursos (id, cargo_id, hospital_id, origen, fecha_vacante, expediente, tipo_concurso, motivo_concurso)
SELECT v.id, v.cargo_id, v.hospital_id, 'msgc', CURRENT_DATE, v.expediente, v.tipo::"TipoConcurso", v.motivo::"MotivoConcurso"
FROM json_to_recordset($1::text::json) AS v(id uuid, cargo_id uuid, hospital_id uuid, expediente text, tipo text, motivo text)`

export const SQL_CONCURSOS_CPH = `
INSERT INTO concursos_cph (id, concurso_id, cargo_id, hospital_id, observaciones, updated_at)
SELECT v.id, v.concurso_id, v.cargo_id, v.hospital_id, v.obs, now()
FROM json_to_recordset($1::text::json) AS v(id uuid, concurso_id uuid, cargo_id uuid, hospital_id uuid, obs text)`

export const SQL_CONCURSOS_CEETPS = `
INSERT INTO concursos_ceetps (id, concurso_id, cargo_id, hospital_id, escalafon_id, observaciones, updated_at)
SELECT v.id, v.concurso_id, v.cargo_id, v.hospital_id, v.escalafon_id, v.obs, now()
FROM json_to_recordset($1::text::json) AS v(id uuid, concurso_id uuid, cargo_id uuid, hospital_id uuid, escalafon_id uuid, obs text)`

export const SQL_REASIGNAR = [
  `UPDATE concursos x SET cargo_id = v.cargo_id, hospital_id = c.hospital_id
   FROM json_to_recordset($1::text::json) AS v(concurso_id uuid, cargo_id uuid), cargos c WHERE x.id = v.concurso_id AND c.id = v.cargo_id`,
  `UPDATE concursos_cph x SET cargo_id = v.cargo_id, hospital_id = c.hospital_id, updated_at = now()
   FROM json_to_recordset($1::text::json) AS v(concurso_id uuid, cargo_id uuid), cargos c WHERE x.concurso_id = v.concurso_id AND c.id = v.cargo_id`,
  `UPDATE concursos_ceetps x SET cargo_id = v.cargo_id, hospital_id = c.hospital_id, updated_at = now()
   FROM json_to_recordset($1::text::json) AS v(concurso_id uuid, cargo_id uuid), cargos c WHERE x.concurso_id = v.concurso_id AND c.id = v.cargo_id`,
] as const

export const SQL_ETIQUETAR = `
INSERT INTO etiquetas_cargo (etiqueta_id, cargo_id)
SELECT e.id, x.id FROM etiquetas e, (${sqlIdsJson(2)} AS id) x WHERE e.nombre = $1 ON CONFLICT DO NOTHING`

export const SQL_LIBERAR_CODIGOS = `
UPDATE cargos SET codigo_legacy = COALESCE(codigo_legacy, codigo), codigo = NULL, updated_at = now()
WHERE id IN (${SQL_IDS_JSON})`

export const SQL_ASIGNAR_CODIGOS = `
UPDATE cargos c SET codigo = v.hasta FROM json_to_recordset($1::text::json) AS v(id uuid, hasta text) WHERE c.id = v.id`

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


/** Repositorio sobre una transacción de Prisma ya abierta contra una base LOCAL. */
export function crearRepoEscritura(
  tx: TxSql,
  databaseUrl: string,
  /** Origen del CTE de estado activo acumulado (se inyecta en los tests; por defecto, el del sistema). */
  obtenerEstadoActivoSql: () => Promise<string> = estadoActivoSqlDelSistema,
): RepoEscritura {
  return {
    async escalafonesCph(): Promise<EscalafonFila[]> {
      return tx.$queryRawUnsafe<EscalafonFila[]>("SELECT id::text AS id, codigo, nombre FROM escalafones WHERE codigo IN ('22', '37')")
    },
    async actualizarEscalafon(id: string, codigo: string, nombre: string) {
      await tx.$executeRawUnsafe('UPDATE escalafones SET codigo = $2, nombre = $3, updated_at = now() WHERE id = $1::uuid', id, codigo, nombre)
    },
    async escalafonesTodos(): Promise<EscalafonFila[]> {
      return tx.$queryRawUnsafe<EscalafonFila[]>(SQL_ESCALAFONES_TODOS)
    },
    async referenciasEscalafon(id: string) {
      let n = 0
      for (const f of await tx.$queryRawUnsafe<FkRef[]>(SQL_FKS_HACIA, 'escalafones')) {
        const r = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${ident(f.tabla)} WHERE ${ident(f.col)} = $1::uuid`, id)
        n += Number(r[0]?.n ?? 0)
      }
      return n
    },
    async eliminarEscalafon(id: string) {
      await tx.$executeRawUnsafe('DELETE FROM escalafones WHERE id = $1::uuid', id)
    },
    async fusionarEscalafon(origen: string, destino: string): Promise<ResumenFusionEscalafon> {
      const fkEscalafon = await tx.$queryRawUnsafe<FkRef[]>(SQL_FKS_HACIA, 'escalafones')
      const fkPuesto = (await tx.$queryRawUnsafe<FkRef[]>(SQL_FKS_HACIA, 'puestos_cargo')).filter((f) => f.tabla !== 'especialidades_puesto')
      const fkEspecialidad = await tx.$queryRawUnsafe<FkRef[]>(SQL_FKS_HACIA, 'especialidades_puesto')
      const res: ResumenFusionEscalafon = { puestos_fusionados: 0, puestos_movidos: 0, especialidades_fusionadas: 0, filas_movidas: {} }
      const sumar = (k: string, n: number) => {
        if (n > 0) res.filas_movidas[k] = (res.filas_movidas[k] ?? 0) + n
      }
      const reapuntar = async (fks: FkRef[], de: string, a: string, prefijo: string) => {
        for (const f of fks) {
          const n = Number(await tx.$executeRawUnsafe(`UPDATE ${ident(f.tabla)} SET ${ident(f.col)} = $2::uuid WHERE ${ident(f.col)} = $1::uuid`, de, a))
          sumar(`${prefijo}${f.tabla}.${f.col}`, n)
        }
      }
      // 1) Puestos que ya existen en el destino: se fusionan (sus especialidades y cargos se reapuntan al puesto del destino).
      for (const p of await tx.$queryRawUnsafe<{ origen: string; destino: string }[]>(SQL_PUESTOS_COINCIDENTES, origen, destino)) {
        for (const e of await tx.$queryRawUnsafe<{ origen: string; destino: string }[]>(SQL_ESPECIALIDADES_COINCIDENTES, p.origen, p.destino)) {
          await reapuntar(fkEspecialidad, e.origen, e.destino, 'especialidad:')
          await tx.$executeRawUnsafe('DELETE FROM especialidades_puesto WHERE id = $1::uuid', e.origen)
          res.especialidades_fusionadas++
        }
        sumar('especialidades_puesto.puesto_cargo_id', Number(await tx.$executeRawUnsafe('UPDATE especialidades_puesto SET puesto_cargo_id = $2::uuid WHERE puesto_cargo_id = $1::uuid', p.origen, p.destino)))
        await reapuntar(fkPuesto, p.origen, p.destino, 'puesto:')
        await tx.$executeRawUnsafe('DELETE FROM puestos_cargo WHERE id = $1::uuid', p.origen)
        res.puestos_fusionados++
      }
      // 2) El resto de lo que cuelga del escalafon (puestos que no existian en el destino, codigos de registro, cargos, ...).
      res.puestos_movidos = Number(await tx.$executeRawUnsafe('UPDATE puestos_cargo SET escalafon_id = $2::uuid WHERE escalafon_id = $1::uuid', origen, destino))
      await reapuntar(fkEscalafon.filter((f) => f.tabla !== 'puestos_cargo'), origen, destino, '')
      return res
    },
    async regenerarKpisDotacion() {
      return regenerarKpisDotacion(tx, obtenerEstadoActivoSql)
    },
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
    async crearPuestosPendientes(l: NuevoPuesto[]) {
      for (const t of trocear(l)) {
        await tx.$executeRawUnsafe(
          SQL_CREAR_PUESTOS_PENDIENTES,
          jsonLote(t.map((x) => ({ id: x.id, escalafon_id: x.escalafonId, modalidad: x.modalidad, nombre: x.nombre, tipo: x.tipoPuesto }))),
        )
      }
    },
    async crearEspecialidadesPendientes(l: NuevaEspecialidad[]) {
      for (const t of trocear(l)) {
        await tx.$executeRawUnsafe(SQL_CREAR_ESPECIALIDADES_PENDIENTES, jsonLote(t.map((x) => ({ id: x.id, puesto_id: x.puestoCargoId, nombre: x.nombre }))))
      }
    },
    async crearCargos(l: NuevoCargo[]) {
      for (const t of trocear(l)) {
        await tx.$executeRawUnsafe(
          SQL_CREAR_CARGOS,
          jsonLote(t.map((x) => ({
            id: x.id, codigo: x.codigo, hospital_id: x.hospitalId, escalafon_id: x.escalafonId, cr_id: x.codigoRegistroId,
            puesto_id: x.puestoCargoId, esp_id: x.especialidadPuestoId, literal: x.literalPuesto, estado: x.estado,
            expediente: x.expediente, revision: x.revisionMotivo, base_id: x.cargoBaseId,
          }))),
        )
      }
    },
    async actualizarCargos(l: ActualizacionCargo[]) {
      for (const t of trocear(l)) {
        await tx.$executeRawUnsafe(
          SQL_ACTUALIZAR_CARGOS,
          jsonLote(t.map((x) => ({
            id: x.id, hospital_id: x.hospitalId, escalafon_id: x.escalafonId, cr_id: x.codigoRegistroId, puesto_id: x.puestoCargoId,
            literal: x.literalPuesto, set_esp: x.especialidadPuestoId !== undefined, esp_id: x.especialidadPuestoId,
            estado: x.estado, expediente: x.expediente, revision: x.revisionMotivo, base_id: x.cargoBaseId,
          }))),
        )
      }
    },
    async pasarNoVigente(ids: string[]) {
      let n = 0
      for (const t of trocear(ids)) n += Number(await tx.$executeRawUnsafe(SQL_NO_VIGENTE, jsonLote(t)))
      return n
    },
    async crearConcursos(l: NuevoConcurso[]) {
      for (const t of trocear(l)) {
        await tx.$executeRawUnsafe(
          SQL_CONCURSOS,
          jsonLote(t.map((x) => ({
            id: x.concursoId, cargo_id: x.cargoId, hospital_id: x.hospitalId, expediente: x.expediente, tipo: x.tipo, motivo: x.motivoConcurso,
          }))),
        )
        const cph = t.filter((x) => x.tipo === 'cph')
        if (cph.length) {
          await tx.$executeRawUnsafe(
            SQL_CONCURSOS_CPH,
            jsonLote(cph.map((x) => ({ id: x.detalleId, concurso_id: x.concursoId, cargo_id: x.cargoId, hospital_id: x.hospitalId, obs: x.observaciones }))),
          )
        }
        const ce = t.filter((x) => x.tipo === 'ceetps')
        if (ce.length) {
          await tx.$executeRawUnsafe(
            SQL_CONCURSOS_CEETPS,
            jsonLote(ce.map((x) => ({
              id: x.detalleId, concurso_id: x.concursoId, cargo_id: x.cargoId, hospital_id: x.hospitalId, escalafon_id: x.escalafonId, obs: x.observaciones,
            }))),
          )
        }
      }
    },
    async reasignarConcursos(l) {
      for (const t of trocear(l)) {
        const lote = jsonLote(t.map((x) => ({ concurso_id: x.concursoId, cargo_id: x.cargoId })))
        for (const sql of SQL_REASIGNAR) await tx.$executeRawUnsafe(sql, lote)
      }
    },
    async asignarEtiqueta(nombre: string, cargoIds: string[]) {
      if (!cargoIds.length) return
      await tx.$executeRawUnsafe('INSERT INTO etiquetas (id, nombre, activo) VALUES ($1::uuid, $2, true) ON CONFLICT (nombre) DO NOTHING', randomUUID(), nombre)
      for (const t of trocear(cargoIds)) await tx.$executeRawUnsafe(SQL_ETIQUETAR, nombre, jsonLote(t))
    },
    async leerCodigos() {
      return tx.$queryRawUnsafe<{ id: string; codigo: string }[]>('SELECT id::text AS id, codigo FROM cargos WHERE codigo IS NOT NULL')
    },
    async liberarCodigos(ids: string[]) {
      for (const t of trocear(ids)) await tx.$executeRawUnsafe(SQL_LIBERAR_CODIGOS, jsonLote(t))
    },
    async asignarCodigos(l: CambioCodigo[]) {
      for (const t of trocear(l)) await tx.$executeRawUnsafe(SQL_ASIGNAR_CODIGOS, jsonLote(t.map((x) => ({ id: x.id, hasta: x.hasta }))))
    },
    async limpiar(conservarConcursoIds: string[]) {
      return ejecutarLimpieza(tx, { databaseUrl, conservarConcursoIds })
    },
    async recalcularSubEstado() {
      return Number(await tx.$executeRawUnsafe(SQL_SUB_ESTADO))
    },
    async hayCorridaEscritura() {
      const f = await tx.$queryRawUnsafe<{ n: number }[]>("SELECT count(*)::int AS n FROM dim_sync_corridas WHERE modo = 'escritura'")
      return Number(f[0]?.n ?? 0) > 0
    },
    async registrarCorrida(modo: string, excelSha256: string | null, resumen: unknown) {
      await tx.$executeRawUnsafe('INSERT INTO dim_sync_corridas (id, modo, excel_sha256, resumen) VALUES ($1::uuid, $2, $3, $4::jsonb)', randomUUID(), modo, excelSha256, JSON.stringify(resumen))
    },
    async datosVerificacion(): Promise<DatosVerificacion> {
      const estados = await tx.$queryRawUnsafe<{ estado: string; n: number }[]>(
        "SELECT estado::text AS estado, count(*)::int AS n FROM cargos WHERE deleted_at IS NULL AND estado IN ('vigente','validacion_vacante') GROUP BY 1",
      )
      const prefijos = await tx.$queryRawUnsafe<{ prefijo: string; n: number }[]>(
        `SELECT regexp_replace(regexp_replace(codigo, '-[0-9]+$', ''), '^R-', '') AS prefijo, count(*)::int AS n
         FROM cargos WHERE codigo IS NOT NULL GROUP BY 1`,
      )
      const acrs = await tx.$queryRawUnsafe<{ acronimo: string | null; n: number }[]>(SQL_DISTRIBUCION_ACRONIMOS)
      const integridad: Record<string, number> = {}
      for (const [nombre, sql] of Object.entries(CONSULTAS_INTEGRIDAD)) {
        const f = await tx.$queryRawUnsafe<{ n: number }[]>(sql)
        integridad[nombre] = Number(f[0]?.n ?? 0)
      }
      const sub = await tx.$queryRawUnsafe<{ n: number }[]>(SQL_SUB_ESTADO_INCONSISTENTES)
      const esc = await tx.$queryRawUnsafe<{ codigo: string; nombre: string }[]>("SELECT codigo, nombre FROM escalafones WHERE codigo IN ('22', '37')")
      const kpis = await tx.$queryRawUnsafe<{ filas: number; meses: number; esperados: number }[]>(SQL_KPIS_VERIFICACION)
      const dup = await tx.$queryRawUnsafe<{ existe: boolean; cargos: number }[]>(SQL_DOCENTES_DUPLICADO, ESCALAFON_DOCENTES_DUPLICADO)
      const cr07 = await tx.$queryRawUnsafe<{ escalafon: string }[]>(SQL_CR_DOCENTES, CODIGO_REGISTRO_DOCENTES)
      const autogenerados = await tx.$queryRawUnsafe<{ codigo: string }[]>(SQL_ESCALAFONES_AUTOGENERADOS)
      return {
        vigentes: Number(estados.find((e) => e.estado === 'vigente')?.n ?? 0),
        validacionVacante: Number(estados.find((e) => e.estado === 'validacion_vacante')?.n ?? 0),
        prefijosCodigo: Object.fromEntries(prefijos.map((p) => [p.prefijo, Number(p.n)])),
        distribucionAcronimos: Object.fromEntries(acrs.map((a) => [a.acronimo ?? 'sin-codigo', Number(a.n)])),
        integridad,
        subEstadoInconsistentes: Number(sub[0]?.n ?? 0),
        escalafonesCph: esc.map((e) => ({ codigo: e.codigo, nombre: e.nombre })),
        kpisFilas: Number(kpis[0]?.filas ?? 0),
        kpisMeses: Number(kpis[0]?.meses ?? 0),
        kpisMesesEsperados: Number(kpis[0]?.esperados ?? 0),
        docentesDuplicadoExiste: Boolean(dup[0]?.existe),
        docentesDuplicadoCargos: Number(dup[0]?.cargos ?? 0),
        escalafonDelCr07: cr07[0]?.escalafon ?? null,
        escalafonesAutogenerados: autogenerados.map((a) => a.codigo),
      }
    },
  }
}

/** Cargos vigentes + validacion_vacante por acronimo del codigo (R- adelante incluido), como el diff por acronimo de Jorge. */
export const SQL_DISTRIBUCION_ACRONIMOS = `
SELECT regexp_replace(codigo, '-[0-9]+$', '') AS acronimo, count(*)::int AS n
FROM cargos WHERE estado IN ('vigente','validacion_vacante') AND deleted_at IS NULL GROUP BY 1`

/** Escalafon Docentes duplicado ('Docentes-c32a65d'): si existe y cuantos cargos tiene. */
export const SQL_DOCENTES_DUPLICADO = `
SELECT EXISTS (SELECT 1 FROM escalafones WHERE codigo = $1) AS existe,
       (SELECT count(*)::int FROM cargos c JOIN escalafones e ON e.id = c.escalafon_id WHERE e.codigo = $1) AS cargos`
export const SQL_CR_DOCENTES = 'SELECT e.codigo AS escalafon FROM codigos_registro cr JOIN escalafones e ON e.id = cr.escalafon_id WHERE cr.codigo = $1'
export const SQL_ESCALAFONES_AUTOGENERADOS = "SELECT codigo FROM escalafones WHERE codigo ~ '-[0-9a-f]{7}$' ORDER BY codigo"
/** kpis_dotacion_snapshot: filas, meses con datos y meses con padrón aprobado (los que el mecanismo debe cubrir). */
export const SQL_KPIS_VERIFICACION = `
SELECT (SELECT count(*)::int FROM kpis_dotacion_snapshot) AS filas,
       (SELECT count(DISTINCT date_trunc('month', fecha))::int FROM kpis_dotacion_snapshot) AS meses,
       (SELECT count(DISTINCT date_trunc('month', fecha_asignada))::int FROM padron_snapshots WHERE estado = 'aprobado') AS esperados`

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
