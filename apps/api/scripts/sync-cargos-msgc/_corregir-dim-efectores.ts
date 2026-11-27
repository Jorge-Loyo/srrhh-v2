import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// ─── 1. Unificar SSAME → SSSAME en dim_puestos y dim_cargos ──────────────────
const p1 = await p.$executeRaw`UPDATE dim_puestos SET efector = 'SSSAME' WHERE efector = 'SSAME'`
const p2 = await p.$executeRaw`UPDATE dim_cargos  SET efector = 'SSSAME' WHERE efector = 'SSAME'`
console.log(`SSAME → SSSAME: dim_puestos=${p1}, dim_cargos=${p2}`)

// ─── 2. Unificar UAIEAIT → EAIT en dim_puestos y dim_cargos ──────────────────
const p3 = await p.$executeRaw`UPDATE dim_puestos SET efector = 'EAIT' WHERE efector = 'UAIEAIT'`
const p4 = await p.$executeRaw`UPDATE dim_cargos  SET efector = 'EAIT' WHERE efector = 'UAIEAIT'`
console.log(`UAIEAIT → EAIT: dim_puestos=${p3}, dim_cargos=${p4}`)

// ─── 3. Poblar nombres faltantes en dim_efectores ────────────────────────────
const n1 = await p.$executeRaw`UPDATE dim_efectores SET nombre = 'SSSAME' WHERE sigla = 'SSSAME' AND nombre IS NULL`
const n2 = await p.$executeRaw`UPDATE dim_efectores SET nombre = 'EAIT'   WHERE sigla = 'EAIT'   AND nombre IS NULL`
console.log(`Nombres poblados: SSSAME=${n1}, EAIT=${n2}`)

// ─── 4. Marcar UAIEAIT como inactivo (alias incorrecto, ya migrado) ───────────
const n3 = await p.$executeRaw`UPDATE dim_efectores SET activo = false WHERE sigla = 'UAIEAIT'`
console.log(`UAIEAIT marcado inactivo: ${n3}`)

// ─── 5. Corregir en_hospitales de inactivos ───────────────────────────────────
// Los inactivos que no tienen cargos ni puestos activos no deberían tener en_hospitales=true
// Solo corregimos UAIEAIT y SSSAME-duplicado; los otros 15 inactivos los dejamos como están
// (son efectores reales que existieron, su en_hospitales refleja que están en la tabla hospitales)

// ─── 6. Verificación final ────────────────────────────────────────────────────
const check = await p.$queryRaw<{ efector: string; cnt: bigint; tabla: string }[]>`
  SELECT efector, COUNT(*) as cnt, 'dim_puestos' as tabla FROM dim_puestos
  WHERE efector IN ('SSAME','UAIEAIT','EAIT','SSSAME') GROUP BY efector
  UNION ALL
  SELECT efector, COUNT(*) as cnt, 'dim_cargos' FROM dim_cargos
  WHERE efector IN ('SSAME','UAIEAIT','EAIT','SSSAME') GROUP BY efector
  ORDER BY tabla, efector
`
console.log('\nVerificación post-corrección:')
check.forEach(r => console.log(`  ${r.tabla}: ${r.efector}=${r.cnt}`))

const efectores = await p.$queryRaw<{ sigla: string; nombre: string | null; activo: boolean }[]>`
  SELECT sigla, nombre, activo FROM dim_efectores
  WHERE sigla IN ('SSAME','UAIEAIT','EAIT','SSSAME') ORDER BY sigla
`
console.log('\ndim_efectores:')
efectores.forEach(r => console.log(`  ${r.sigla.padEnd(12)} activo=${r.activo} nombre=${r.nombre}`))

await p.$disconnect()
