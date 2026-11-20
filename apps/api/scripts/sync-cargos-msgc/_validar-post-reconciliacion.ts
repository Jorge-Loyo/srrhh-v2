/* eslint-disable no-console */
// Validación post-reconciliación
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// 1. Conteos generales
const [totales] = await prisma.$queryRaw<{ vigentes: bigint; no_vigente: bigint; validacion: bigint }[]>`
  SELECT
    count(*) FILTER (WHERE estado = 'vigente') AS vigentes,
    count(*) FILTER (WHERE estado = 'no_vigente') AS no_vigente,
    count(*) FILTER (WHERE estado = 'validacion_vacante') AS validacion
  FROM cargos WHERE deleted_at IS NULL
`
console.log('\n── Totales cargos ──────────────────────────────────────────────')
console.log(`vigentes=${totales.vigentes}  no_vigente=${totales.no_vigente}  validacion=${totales.validacion}`)

// 2. Cargos vigentes con >1 ocupación activa — ¿cuántas ocupaciones tienen?
const distribucion = await prisma.$queryRaw<{ cant_ocup: bigint; cargos: bigint }[]>`
  SELECT count(*) AS cant_ocup, count(cargo_id) AS cargos
  FROM (
    SELECT o.cargo_id, count(*) AS cnt
    FROM ocupaciones o
    JOIN cargos c ON c.id = o.cargo_id
    WHERE o.hasta IS NULL AND c.deleted_at IS NULL AND c.estado = 'vigente'
    GROUP BY o.cargo_id HAVING count(*) > 1
  ) sub
  GROUP BY cnt
  ORDER BY cnt
`
console.log('\n── Distribución de duplicados ──────────────────────────────────')
for (const d of distribucion) console.log(`  ${d.cant_ocup} ocupaciones: ${d.cargos} cargos`)

// 3. Muestra de los duplicados — ¿tienen sial_rol en el Excel o son todos huérfanos?
const muestra = await prisma.$queryRaw<{
  cargo_id: string; codigo: string | null; cnt: bigint;
  sial_roles: string; situaciones: string
}[]>`
  SELECT c.id::text AS cargo_id, c.codigo, count(*) AS cnt,
    string_agg(o.id_sial_rol, ' | ' ORDER BY o.id_sial_rol) AS sial_roles,
    string_agg(o.situacion_revista, ' | ' ORDER BY o.id_sial_rol) AS situaciones
  FROM ocupaciones o
  JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL AND c.deleted_at IS NULL AND c.estado = 'vigente'
  GROUP BY c.id, c.codigo HAVING count(*) > 1
  LIMIT 20
`
console.log('\n── Muestra de cargos con >1 ocupación activa ───────────────────')
for (const m of muestra) {
  console.log(`  ${m.codigo ?? '(sin código)'} [${m.cnt}]: ${m.sial_roles}`)
  console.log(`    situaciones: ${m.situaciones}`)
}

// 4. ¿Cuántos de los duplicados tienen AMBOS sial_rol en el Excel?
const ambosEnExcel = await prisma.$queryRaw<{ cantidad: bigint }[]>`
  WITH dup AS (
    SELECT o.cargo_id, array_agg(o.id_sial_rol) AS roles
    FROM ocupaciones o
    JOIN cargos c ON c.id = o.cargo_id
    WHERE o.hasta IS NULL AND c.deleted_at IS NULL AND c.estado = 'vigente'
    GROUP BY o.cargo_id HAVING count(*) > 1
  )
  SELECT count(*) AS cantidad FROM dup
`
console.log(`\nTotal cargos vigentes con >1 ocupación: ${ambosEnExcel[0].cantidad}`)

// 5. ¿Cuántas ocupaciones activas en total?
const [ocTotal] = await prisma.$queryRaw<{ total: bigint; en_vigentes: bigint }[]>`
  SELECT
    count(*) AS total,
    count(*) FILTER (WHERE c.estado = 'vigente') AS en_vigentes
  FROM ocupaciones o
  JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL AND c.deleted_at IS NULL
`
console.log(`\nOcupaciones activas: total=${ocTotal.total}  en vigentes=${ocTotal.en_vigentes}`)

await prisma.$disconnect()
