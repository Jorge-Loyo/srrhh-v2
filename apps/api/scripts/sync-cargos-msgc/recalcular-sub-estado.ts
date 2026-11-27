/* eslint-disable no-console */
// Recalcula cargos.sub_estado según la regla canónica:
//   estado <> 'vigente'                          → NULL
//   vigente + ocupación activa (hasta IS NULL)   → 'ocupado'
//   vigente + concurso activo (CPH o CEETPS)     → 'concurso'
//   vigente sin ocupante ni concurso activo      → 'vacante'
//
// Uso:
//   npx tsx scripts/sync-cargos-msgc/recalcular-sub-estado.ts           # dry-run
//   npx tsx scripts/sync-cargos-msgc/recalcular-sub-estado.ts --ejecutar
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const dryRun = !process.argv.includes('--ejecutar')

// Diagnóstico: transiciones que se harían
const transiciones = await p.$queryRaw<{ actual: string; esperado: string; filas: number }[]>`
  SELECT
    coalesce(c.sub_estado::text, 'null') AS actual,
    coalesce(
      CASE
        WHEN c.estado <> 'vigente' THEN NULL
        WHEN EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL) THEN 'ocupado'
        WHEN EXISTS (
          SELECT 1 FROM concursos_cph cph
          JOIN concursos co ON co.id = cph.concurso_id
          WHERE cph.cargo_id = c.id
            AND cph.estado::text IN ('no_iniciado','activo','suspendido')
            AND (co.motivo_concurso IS DISTINCT FROM 'nuevo_cargo' OR co.autorizado_at IS NOT NULL)
        ) OR EXISTS (
          SELECT 1 FROM concursos_ceetps ce
          JOIN concursos co ON co.id = ce.concurso_id
          WHERE ce.cargo_id = c.id
            AND ce.estado::text IN ('sin_autorizar','autorizado','en_proceso')
            AND (co.motivo_concurso IS DISTINCT FROM 'nuevo_cargo' OR co.autorizado_at IS NOT NULL)
        ) THEN 'concurso'
        ELSE 'vacante'
      END,
    'null') AS esperado,
    count(*)::int AS filas
  FROM cargos c
  WHERE c.deleted_at IS NULL
    AND c.sub_estado::text IS DISTINCT FROM
      coalesce(
        CASE
          WHEN c.estado <> 'vigente' THEN NULL
          WHEN EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL) THEN 'ocupado'
          WHEN EXISTS (
            SELECT 1 FROM concursos_cph cph
            JOIN concursos co ON co.id = cph.concurso_id
            WHERE cph.cargo_id = c.id
              AND cph.estado::text IN ('no_iniciado','activo','suspendido')
              AND (co.motivo_concurso IS DISTINCT FROM 'nuevo_cargo' OR co.autorizado_at IS NOT NULL)
          ) OR EXISTS (
            SELECT 1 FROM concursos_ceetps ce
            JOIN concursos co ON co.id = ce.concurso_id
            WHERE ce.cargo_id = c.id
              AND ce.estado::text IN ('sin_autorizar','autorizado','en_proceso')
              AND (co.motivo_concurso IS DISTINCT FROM 'nuevo_cargo' OR co.autorizado_at IS NOT NULL)
          ) THEN 'concurso'
          ELSE 'vacante'
        END,
      'null')
  GROUP BY 1, 2
  ORDER BY 3 DESC
`

console.log('Transiciones a aplicar (actual → esperado: filas):')
let total = 0
for (const t of transiciones) {
  console.log(`  ${t.actual} → ${t.esperado}: ${t.filas}`)
  total += t.filas
}
console.log(`  TOTAL: ${total} cargos a recalcular`)

if (dryRun) {
  console.log('\nModo simulación — no se escribió nada. Usar --ejecutar para aplicar.')
  await p.$disconnect()
  process.exit(0)
}

// Ejecutar el UPDATE
console.log('\nEjecutando recálculo...')
const actualizados = await p.$executeRaw`
  UPDATE cargos c
  SET sub_estado = (
    CASE
      WHEN c.estado <> 'vigente' THEN NULL
      WHEN EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL) THEN 'ocupado'
      WHEN EXISTS (
        SELECT 1 FROM concursos_cph cph
        JOIN concursos co ON co.id = cph.concurso_id
        WHERE cph.cargo_id = c.id
          AND cph.estado::text IN ('no_iniciado','activo','suspendido')
          AND (co.motivo_concurso IS DISTINCT FROM 'nuevo_cargo' OR co.autorizado_at IS NOT NULL)
      ) OR EXISTS (
        SELECT 1 FROM concursos_ceetps ce
        JOIN concursos co ON co.id = ce.concurso_id
        WHERE ce.cargo_id = c.id
          AND ce.estado::text IN ('sin_autorizar','autorizado','en_proceso')
          AND (co.motivo_concurso IS DISTINCT FROM 'nuevo_cargo' OR co.autorizado_at IS NOT NULL)
      ) THEN 'concurso'
      ELSE 'vacante'
    END
  )::"SubEstadoCargo",
  updated_at = now()
  WHERE c.deleted_at IS NULL
    AND c.sub_estado::text IS DISTINCT FROM coalesce(
      CASE
        WHEN c.estado <> 'vigente' THEN NULL
        WHEN EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL) THEN 'ocupado'
        WHEN EXISTS (
          SELECT 1 FROM concursos_cph cph
          JOIN concursos co ON co.id = cph.concurso_id
          WHERE cph.cargo_id = c.id
            AND cph.estado::text IN ('no_iniciado','activo','suspendido')
            AND (co.motivo_concurso IS DISTINCT FROM 'nuevo_cargo' OR co.autorizado_at IS NOT NULL)
        ) OR EXISTS (
          SELECT 1 FROM concursos_ceetps ce
          JOIN concursos co ON co.id = ce.concurso_id
          WHERE ce.cargo_id = c.id
            AND ce.estado::text IN ('sin_autorizar','autorizado','en_proceso')
            AND (co.motivo_concurso IS DISTINCT FROM 'nuevo_cargo' OR co.autorizado_at IS NOT NULL)
        ) THEN 'concurso'
        ELSE 'vacante'
      END,
    'null')
`
console.log(`✓ ${actualizados} cargos actualizados`)

// Verificación final
const resultado = await p.$queryRaw<{ sub_estado: string | null; cantidad: number }[]>`
  SELECT coalesce(sub_estado::text, 'NULL') AS sub_estado, count(*)::int AS cantidad
  FROM cargos WHERE deleted_at IS NULL
  GROUP BY 1 ORDER BY 2 DESC
`
console.log('\nDistribución final de sub_estado:')
for (const r of resultado) console.log(`  ${r.sub_estado}: ${r.cantidad}`)

await p.$disconnect()
