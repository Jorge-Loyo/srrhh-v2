// FASE 3 (paso 12 de aprobarSnapshotService, design §D/§E): generación y
// persistencia de las incidencias del ciclo de vida del cargo (tipos
// 3/4/5/6a/6b/6c). Dos partes, misma separación HECHOS/PURO que el resto del
// módulo incidencias:
//   (a) `leerHechosPaso12(tx, ...)` — acceso a HECHOS con la MISMA transacción
//       del aprobar (nunca `prisma`): subuniverso gestionable (predicado
//       reusado de baja-sin-concurso), "anterior" del histórico denso con el
//       filtro ESTRICTO fecha_asignada < fecha(S) (§C.6), señales del diff, baja
//       SIAL y el conjunto aRechazarBaja del paso 4.
//   (b) `construirIncidencias(hechos, snapshotId)` — orquestador PURO (DB-free,
//       testeable): evalúa los 6 clasificadores puros y emite una fila por cada
//       no-null. NO toca BD.
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { sqlCargoGestionable } from './incidencias.baja-sin-concurso.js'
import {
  clasificarCayoDelPadron,
  clasificarCambioSituacionRevista,
  clasificarCambiosDelPuesto,
  clasificarNuevaBaja,
  clasificarCambioPersona,
  clasificarReaparecio,
  esElegibleReemplazante,
  detalleCambioPuesto,
  normalizarSituacionRevista,
  type HechosIncidencia,
} from './incidencias.clasificacion.js'

// Interfaz mínima de la transacción que necesita el paso 12 (solo $queryRaw).
// Evita acoplar el módulo al tipo PrismaTx de padron.service.ts.
export interface TxQuery {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>
}

// Fila cruda de la query de HECHOS (snake_case, como la devuelve Postgres).
export interface HechoPaso12Row {
  cargo_id: string
  id_sial: string | null
  id_sial_rol: string | null
  estado: string
  tiene_ocupante_vigente: boolean
  ausente_ultimo_padron: boolean
  en_baja_sial: boolean
  en_baja_sial_nueva: boolean
  presente_periodo_anterior: boolean
  situacion_revista_ant: string | null
  situacion_revista_nue: string | null
  cambio_puesto_diff: boolean
  literal_puesto_ant: string | null
  literal_puesto_nue: string | null
  especialidad_ant: string | null
  especialidad_nue: string | null
  cuil_ant: string | null
  cuil_nue: string | null
  tipo_origen: string | null
  cargo_retenido_id: string | null
}

// Fila lista para createMany en padron_incidencias.
export interface PadronIncidenciaInsert {
  id: string
  snapshotId: string
  cargoId: string | null
  idSial: string | null
  idSialRol: string | null
  tipo: string
  // Acepta el sentinel Prisma.JsonNull para escribir NULL en la columna Json.
  estadoAnterior: Prisma.InputJsonValue | typeof Prisma.JsonNull
  estadoNuevo: Prisma.InputJsonValue | typeof Prisma.JsonNull
  detalle: string | null
}

// Mapea la fila cruda a los HECHOS puros (espejo de factsDeHecho). `esReaparicion`
// NO sale de la SQL: lo aporta el conjunto aRechazarBaja del paso 4.
export function factsPaso12DeHecho(row: HechoPaso12Row, esReaparicion: boolean): HechosIncidencia {
  return {
    estado: row.estado,
    tieneOcupanteVigente: row.tiene_ocupante_vigente,
    ausenteUltimoPadron: row.ausente_ultimo_padron,
    enBajaSial: row.en_baja_sial,
    enBajaSialNueva: row.en_baja_sial_nueva,
    presentePeriodoAnterior: row.presente_periodo_anterior,
    situacionRevistaAnt: row.situacion_revista_ant,
    situacionRevistaNue: row.situacion_revista_nue,
    cambioPuestoDiff: row.cambio_puesto_diff,
    literalPuestoAnt: row.literal_puesto_ant,
    literalPuestoNue: row.literal_puesto_nue,
    especialidadAnt: row.especialidad_ant,
    especialidadNue: row.especialidad_nue,
    cuilAnt: row.cuil_ant,
    cuilNue: row.cuil_nue,
    tipoOrigen: row.tipo_origen,
    cargoRetenidoId: row.cargo_retenido_id,
    esReaparicion,
  }
}

// ─── (a) HECHOS (con tx) ─────────────────────────────────────────────────────
// Subuniverso gestionable: cargos vivos (deleted_at NULL) con el predicado
// gestionable reusado (plenos + 83 Anexo II), UNIDOS a su ocupación viva
// (hasta IS NULL) cuando existe. El "anterior" es la última foto de
// padron_historico ESTRICTAMENTE anterior a la fecha de S (§C.6: PROHIBIDO MAX
// sin el `< S`, porque la fila densa de S ya fue escrita por el paso 7).
export async function leerHechosPaso12(
  tx: TxQuery,
  snapshotId: string,
  fechaSnapshot: Date,
  idsRechazarBaja: Set<string>,
): Promise<{ hechos: HechosIncidencia[]; rows: HechoPaso12Row[] }> {
  const gestionable = sqlCargoGestionable('c')
  const fecha = fechaSnapshot
  const rows = await tx.$queryRaw<HechoPaso12Row[]>`
WITH ult_padron AS (
  SELECT id FROM padron_snapshots
  WHERE estado::text = 'aprobado'
  ORDER BY fecha_asignada DESC
  LIMIT 1
),
ult_baja AS (
  SELECT id FROM baja_sial_snapshots
  WHERE estado::text IN ('pendiente', 'aprobado')
  ORDER BY fecha_archivo DESC
  LIMIT 1
),
-- Subuniverso gestionable (plenos + 83 Anexo II), reusando el predicado SQL de
-- baja-sin-concurso (NO redefinir el universo). Mismo subuniverso que el
-- histórico denso de Fase 2.
cand AS (
  SELECT c.id, c.id_sial, c.estado::text AS estado,
         c.puesto_cargo_id, c.especialidad_puesto_id,
         c.literal_puesto, c.especialidad_legacy,
         c.tipo_origen, c.cargo_retenido_id
  FROM cargos c
  WHERE c.deleted_at IS NULL
    AND ${gestionable}
),
-- Ocupación VIVA (hasta IS NULL) del cargo = estado NUEVO tras paso 11.
occ_viva AS (
  SELECT DISTINCT ON (o.cargo_id)
         o.cargo_id, o.id_sial_rol, o.situacion_revista AS sit_rev_nue, o.cuil AS cuil_nue
  FROM ocupaciones o
  JOIN cand ON cand.id = o.cargo_id
  WHERE o.hasta IS NULL
  ORDER BY o.cargo_id, o.desde DESC NULLS LAST
),
-- "Anterior" del histórico denso POR ROL: última foto ESTRICTAMENTE anterior a
-- S por id_sial_rol (seccion C.6). Alimenta la situación de revista anterior
-- (tipo 4), que se compara rol a rol. El filtro fecha_asignada < fecha(S) es
-- OBLIGATORIO.
hist_ant AS (
  SELECT DISTINCT ON (ph.id_sial_rol)
         ph.id_sial_rol, ph.cargo_id,
         ph.situacion_revista AS sit_rev_ant,
         ph.literal_puesto AS literal_puesto_ant, ph.especialidad AS especialidad_ant
  FROM padron_historico ph
  JOIN cand ON cand.id = ph.cargo_id
  WHERE ph.fecha_asignada < ${fecha}
  ORDER BY ph.id_sial_rol, ph.fecha_asignada DESC
),
-- "Anterior" del histórico denso POR CARGO: última foto ESTRICTAMENTE anterior
-- a S por cargo_id (seccion C.6, E.6b). El CUIL del período anterior se busca
-- por cargo_id (NO por id_sial_rol): id_sial_rol embebe el CUIL (calcularDiff
-- arma idSial + rol + CUIL), así que al cambiar la persona el rol vivo es NUEVO
-- y por id_sial_rol no habría anterior. La clave correcta para cambio de
-- persona es cargo_id.
hist_ant_cargo AS (
  SELECT DISTINCT ON (ph.cargo_id)
         ph.cargo_id, ph.cuil AS cuil_ant
  FROM padron_historico ph
  JOIN cand ON cand.id = ph.cargo_id
  WHERE ph.fecha_asignada < ${fecha}
  ORDER BY ph.cargo_id, ph.fecha_asignada DESC
),
-- ¿El cargo estaba presente el período anterior? (alguna foto densa < S).
presente_ant AS (
  SELECT DISTINCT ph.cargo_id
  FROM padron_historico ph
  JOIN cand ON cand.id = ph.cargo_id
  WHERE ph.fecha_asignada < ${fecha}
),
-- Señal del diff del snapshot para cambio de puesto/especialidad (§E.5).
diff_puesto AS (
  SELECT DISTINCT o.cargo_id
  FROM padron_diff d
  JOIN ocupaciones o ON o.id_sial_rol = d.id_sial_rol
  JOIN cand ON cand.id = o.cargo_id
  WHERE d.snapshot_id = ${snapshotId}::uuid
    AND d.tipo::text = 'modificado'
    AND d.campo IN (
      'literal_puesto','especialidad',
      'completado:literal_puesto','completado:especialidad',
      '__especialidad_puesto_id__')
),
-- Ausente del último padrón aprobado (diff eliminado del último snapshot).
elim_ult AS (
  SELECT o.cargo_id
  FROM padron_diff d
  JOIN ult_padron u ON u.id = d.snapshot_id
  JOIN ocupaciones o ON o.id_sial_rol = d.id_sial_rol
  JOIN cand ON cand.id = o.cargo_id
  WHERE d.tipo::text = 'eliminado'
  UNION
  SELECT cand.id
  FROM padron_diff d
  JOIN ult_padron u ON u.id = d.snapshot_id
  JOIN cand ON cand.id_sial = d.id_sial_rol
  WHERE d.tipo::text = 'eliminado'
),
-- Baja SIAL (cualquier registro del último snapshot SIAL por id_sial).
bs AS (
  SELECT DISTINCT cand.id AS cargo_id
  FROM baja_sial_registros r
  JOIN ult_baja u ON u.id = r.snapshot_id
  JOIN cand ON cand.id_sial = r.cargo
),
-- Nueva baja SIAL (diff tipo='nuevo' del último snapshot SIAL por id_sial).
bs_nueva AS (
  SELECT DISTINCT cand.id AS cargo_id
  FROM baja_sial_diffs d
  JOIN ult_baja u ON u.id = d.snapshot_id
  JOIN cand ON cand.id_sial = d.cargo
  WHERE d.tipo::text = 'nuevo'
)
SELECT
  cand.id AS cargo_id,
  cand.id_sial,
  occ_viva.id_sial_rol,
  cand.estado,
  (occ_viva.cargo_id IS NOT NULL) AS tiene_ocupante_vigente,
  (elim_ult.cargo_id IS NOT NULL) AS ausente_ultimo_padron,
  (bs.cargo_id IS NOT NULL) AS en_baja_sial,
  (bs_nueva.cargo_id IS NOT NULL) AS en_baja_sial_nueva,
  (presente_ant.cargo_id IS NOT NULL) AS presente_periodo_anterior,
  hist_ant.sit_rev_ant AS situacion_revista_ant,
  occ_viva.sit_rev_nue AS situacion_revista_nue,
  (diff_puesto.cargo_id IS NOT NULL) AS cambio_puesto_diff,
  hist_ant.literal_puesto_ant,
  cand.literal_puesto AS literal_puesto_nue,
  hist_ant.especialidad_ant,
  cand.especialidad_legacy AS especialidad_nue,
  hist_ant_cargo.cuil_ant,
  occ_viva.cuil_nue,
  cand.tipo_origen,
  cand.cargo_retenido_id
FROM cand
LEFT JOIN occ_viva        ON occ_viva.cargo_id = cand.id
LEFT JOIN hist_ant        ON hist_ant.id_sial_rol = occ_viva.id_sial_rol
LEFT JOIN hist_ant_cargo  ON hist_ant_cargo.cargo_id = cand.id
LEFT JOIN presente_ant    ON presente_ant.cargo_id = cand.id
LEFT JOIN diff_puesto     ON diff_puesto.cargo_id = cand.id
LEFT JOIN elim_ult        ON elim_ult.cargo_id = cand.id
LEFT JOIN bs              ON bs.cargo_id = cand.id
LEFT JOIN bs_nueva        ON bs_nueva.cargo_id = cand.id`
  const hechos = rows.map((r) => factsPaso12DeHecho(r, idsRechazarBaja.has(r.cargo_id)))
  return { hechos, rows }
}

// ─── (b) Orquestador PURO ────────────────────────────────────────────────────
// Por cada hecho evalúa los 6 clasificadores y emite una fila por cada no-null.
// Un cargo puede emitir 0, 1 o varias filas (los tipos NO son excluyentes).
export function construirIncidencias(
  rows: HechoPaso12Row[],
  hechos: HechosIncidencia[],
  snapshotId: string,
): PadronIncidenciaInsert[] {
  const out: PadronIncidenciaInsert[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const h = hechos[i]!
    const base = {
      snapshotId,
      cargoId: row.cargo_id,
      idSial: row.id_sial,
      idSialRol: row.id_sial_rol,
    }

    if (clasificarCayoDelPadron(h)) {
      out.push({
        ...base,
        id: randomUUID(),
        tipo: 'cayo-del-padron',
        estadoAnterior: { presente: h.presentePeriodoAnterior },
        estadoNuevo: { estado: h.estado, ausenteUltimoPadron: h.ausenteUltimoPadron },
        detalle: 'Cargo que estaba presente el período anterior y cayó del padrón sin baja SIAL',
      })
    }

    if (clasificarCambioSituacionRevista(h)) {
      const elegible = esElegibleReemplazante(h)
      out.push({
        ...base,
        id: randomUUID(),
        tipo: 'cambio-situacion-revista',
        estadoAnterior: { situacionRevista: h.situacionRevistaAnt },
        estadoNuevo: { situacionRevista: h.situacionRevistaNue },
        detalle: elegible
          ? `Cambio de situación de revista (${normalizarSituacionRevista(h.situacionRevistaAnt)} → ${normalizarSituacionRevista(h.situacionRevistaNue)}) — elegible para reemplazante`
          : `Cambio de situación de revista (${normalizarSituacionRevista(h.situacionRevistaAnt)} → ${normalizarSituacionRevista(h.situacionRevistaNue)})`,
      })
    }

    if (clasificarCambiosDelPuesto(h)) {
      out.push({
        ...base,
        id: randomUUID(),
        tipo: 'cambios-del-puesto',
        estadoAnterior: {
          literalPuesto: row.literal_puesto_ant,
          especialidad: row.especialidad_ant,
        },
        estadoNuevo: {
          literalPuesto: row.literal_puesto_nue,
          especialidad: row.especialidad_nue,
        },
        detalle: detalleCambioPuesto(h),
      })
    }

    if (clasificarNuevaBaja(h)) {
      out.push({
        ...base,
        id: randomUUID(),
        tipo: 'otras:nueva-baja',
        estadoAnterior: Prisma.JsonNull,
        estadoNuevo: { estado: h.estado, enBajaSialNueva: h.enBajaSialNueva },
        detalle:
          'Baja SIAL detectada antes de que el padrón baje el cargo (ventana baja SIAL → padrón)',
      })
    }

    if (clasificarCambioPersona(h)) {
      out.push({
        ...base,
        id: randomUUID(),
        tipo: 'otras:cambio-persona',
        estadoAnterior: { cuil: h.cuilAnt },
        estadoNuevo: { cuil: h.cuilNue },
        detalle: 'El cargo sigue ocupado pero por otra persona (CUIL distinto)',
      })
    }

    if (clasificarReaparecio(h)) {
      out.push({
        ...base,
        id: randomUUID(),
        tipo: 'otras:reaparecio',
        estadoAnterior: { estado: 'validacion_vacante' },
        estadoNuevo: { estado: 'vigente' },
        detalle:
          'Cargo que estaba en validación de vacante y reapareció en el padrón (vuelve a vigente)',
      })
    }
  }
  return out
}
