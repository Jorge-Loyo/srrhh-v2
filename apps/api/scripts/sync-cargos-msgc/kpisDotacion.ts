// ─────────────────────────────────────────────────────────────────────────────
// Regeneración de kpis_dotacion_snapshot al final de la carga (decisión de Jorge, 12-nov: "se borran y
// generan nuevos").
//
// NO se inventa un cálculo: se reutiliza el mecanismo que ya llena la tabla en el sistema, el MOTOR UNIFICADO
// de scripts/backfill_kpis_dotacion.sql cuya fuente de verdad es `estadoActivoAcumuladoSql`
// (apps/api/src/modules/kpis/kpis.service.ts). Es el mismo CTE que usa el populate al aprobar un padrón
// (`repopularKpiDotacionMes`, padron.service.ts) y la consulta individual de KPIs. El CTE se importa del
// sistema (no se copia); acá solo vive la agregación final (por carrera y situación de revista + fila '(total)'),
// idéntica a la del backfill.
//
// QUÉ SE REGENERA: un punto por mes con padrón APROBADO (el corte es el último snapshot aprobado del mes), tal
// como arma el backfill a partir de padron_snapshots + padron_historico + padron_diff + ocupaciones. Esas tablas
// se CONSERVAN en la limpieza, así que la serie histórica se regenera completa; lo único que cambia respecto de
// la serie vieja es el código de registro del cargo (cargos.codigo_registro_id) que ahora sale de la carga.
// Para el corte más reciente además se exige ocupación viva hoy (regla del mecanismo: "mes en curso").
// Si no hubiera snapshots aprobados la serie queda vacía (el mecanismo no tiene de dónde calcularla).
// ─────────────────────────────────────────────────────────────────────────────

export const SQL_KPIS_BORRAR = 'DELETE FROM kpis_dotacion_snapshot'

/**
 * INSERT ... SELECT de la serie completa. `estadoSql` es el texto de `estadoActivoAcumuladoSql()` SIN filtro de mes
 * (devuelve una fila por rol vigente a cada corte, con la columna `corte`); no lleva parámetros.
 */
export function sqlKpisInsertar(estadoSql: string): string {
  if (!/^\s*WITH\b/i.test(estadoSql)) throw new Error('kpisDotacion: el estado activo acumulado debe ser un WITH ... SELECT')
  return `
INSERT INTO kpis_dotacion_snapshot (fecha, codigo_registro, situacion_revista, personas)
WITH estado AS (${estadoSql}),
norm AS (
  SELECT
    estado.corte,
    p.cuil,
    coalesce(cr.codigo, '(sin codigo)') AS codigo,
    coalesce(lower(unaccent(trim(estado.situacion_revista))), '(sin dato)') AS sit
  FROM estado
  JOIN cargos c ON c.id = estado.cargo_id
  LEFT JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
  JOIN personas p ON p.id = estado.persona_id
  WHERE p.cuil IS NOT NULL
)
SELECT corte AS fecha, codigo, sit AS situacion_revista, count(DISTINCT cuil)::int AS personas
  FROM norm GROUP BY corte, codigo, sit
UNION ALL
SELECT corte AS fecha, codigo, '(total)' AS situacion_revista, count(DISTINCT cuil)::int AS personas
  FROM norm GROUP BY corte, codigo`
}

/** Subconjunto de la transacción que usa la regeneración (permite simularla en tests). */
export interface TxKpis {
  $executeRawUnsafe(sql: string, ...valores: unknown[]): Promise<number>
}

/** Texto SQL de `estadoActivoAcumuladoSql()` del sistema (import dinámico: solo se carga al escribir). */
export async function estadoActivoSqlDelSistema(): Promise<string> {
  const { estadoActivoAcumuladoSql } = await import('../../src/modules/kpis/kpis.service.js')
  const q = estadoActivoAcumuladoSql()
  if (q.values.length > 0) throw new Error('kpisDotacion: estadoActivoAcumuladoSql() sin filtro de mes no deberia tener parametros')
  return q.text
}

/** Borra y regenera la serie. Devuelve las filas insertadas. Llamar dentro de una transacción de la base LOCAL. */
export async function regenerarKpisDotacion(tx: TxKpis, obtenerEstadoSql: () => Promise<string> = estadoActivoSqlDelSistema): Promise<number> {
  const insertar = sqlKpisInsertar(await obtenerEstadoSql())
  await tx.$executeRawUnsafe(SQL_KPIS_BORRAR)
  return Number(await tx.$executeRawUnsafe(insertar))
}
