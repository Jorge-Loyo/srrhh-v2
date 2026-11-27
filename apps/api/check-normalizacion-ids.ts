import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// Estructura actual de HIS-*
const his = await p.$queryRaw<any[]>`
  SELECT
    REGEXP_REPLACE(codigo, '-[^-]+$', '') AS prefijo,
    COUNT(*)                              AS q,
    MIN(codigo)                           AS ejemplo_min,
    MAX(codigo)                           AS ejemplo_max
  FROM cargos
  WHERE codigo LIKE 'HIS-%' AND codigo IS NOT NULL
  GROUP BY prefijo
  ORDER BY prefijo
`
console.log('\n── Prefijos HIS- actuales ──')
for (const r of his)
  console.log(`  ${r.prefijo.padEnd(20)} q: ${String(r.q).padStart(5)}  |  ${r.ejemplo_min}  →  ${r.ejemplo_max}`)

// Todos los prefijos con 5 dígitos que necesitan migrar a 6
const cincoDigitos = await p.$queryRaw<any[]>`
  SELECT
    REGEXP_REPLACE(codigo, '[0-9]+$', '') AS prefijo,
    COUNT(*)                              AS q,
    MIN(codigo)                           AS ejemplo
  FROM cargos
  WHERE codigo IS NOT NULL
    AND codigo NOT LIKE 'HIS-%'
    AND LENGTH(REGEXP_REPLACE(codigo, '[^0-9]', '', 'g')) = 5
  GROUP BY prefijo
  ORDER BY prefijo
`
console.log('\n── Prefijos con 5 dígitos (necesitan → 6) ──')
for (const r of cincoDigitos)
  console.log(`  ${r.prefijo.padEnd(20)} q: ${String(r.q).padStart(5)}  |  ej: ${r.ejemplo}`)

// Total afectado
const total = await p.$queryRaw<any[]>`
  SELECT
    COUNT(*) FILTER (WHERE codigo NOT LIKE 'HIS-%' AND LENGTH(REGEXP_REPLACE(codigo, '[^0-9]', '', 'g')) = 5) AS cinco_digitos,
    COUNT(*) FILTER (WHERE codigo NOT LIKE 'HIS-%' AND LENGTH(REGEXP_REPLACE(codigo, '[^0-9]', '', 'g')) < 5) AS menos_cinco,
    COUNT(*) FILTER (WHERE codigo LIKE 'HIS-%')                                                                AS his_total,
    COUNT(*)                                                                                                   AS total
  FROM cargos
  WHERE codigo IS NOT NULL
`
console.log('\n── Resumen ──')
console.log(total[0])

await p.$disconnect()
