import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const rows = await p.$queryRaw<{
  id_sial_rol: string
  literal_puesto: string | null
  efector: string | null
  codigo_registro: string | null
  jcat: string | null
  situacion_revista: string | null
  puesto_hasta: Date | null
}[]>`
  SELECT id_sial_rol, literal_puesto, efector, codigo_registro, jcat, situacion_revista, puesto_hasta
  FROM dim_puestos
  WHERE jcat = 'M26'
`
console.log(`=== dim_puestos con jcat=M26 (${rows.length} filas) ===`)
rows.forEach(r => console.log(JSON.stringify(r)))

// También ver si hay persona asociada en dim_actividad_hechos
const hechos = await p.$queryRaw<{ id_sial_rol: string; cuil: string | null; es_actual: boolean | null }[]>`
  SELECT id_sial_rol, cuil, es_actual
  FROM dim_actividad_hechos
  WHERE id_sial_rol IN (
    SELECT id_sial_rol FROM dim_puestos WHERE jcat = 'M26'
  )
`
console.log(`\n=== dim_actividad_hechos para M26 ===`)
hechos.forEach(r => console.log(JSON.stringify(r)))

// Ver la persona en dim_personas
if (hechos.length > 0) {
  const cuils = hechos.map(h => h.cuil).filter(Boolean)
  if (cuils.length > 0) {
    const personas = await p.$queryRaw<{ cuil: string; apellido_nombre: string | null }[]>`
      SELECT cuil, apellido_nombre FROM dim_personas WHERE cuil = ANY(${cuils})
    `
    console.log(`\n=== dim_personas ===`)
    personas.forEach(r => console.log(`  ${r.cuil} | ${r.apellido_nombre}`))
  }
}

await p.$disconnect()
