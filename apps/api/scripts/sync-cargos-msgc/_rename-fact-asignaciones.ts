import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

await p.$executeRaw`ALTER TABLE fact_asignaciones RENAME TO dim_actividad_hechos`
await p.$executeRaw`ALTER INDEX fact_asignaciones_codigo_cargo_idx RENAME TO dim_actividad_hechos_codigo_cargo_idx`
await p.$executeRaw`ALTER INDEX fact_asignaciones_cuil_idx RENAME TO dim_actividad_hechos_cuil_idx`
await p.$executeRaw`ALTER INDEX fact_asignaciones_es_actual_idx RENAME TO dim_actividad_hechos_es_actual_idx`
await p.$executeRaw`ALTER INDEX fact_asignaciones_id_sial_rol_idx RENAME TO dim_actividad_hechos_id_sial_rol_idx`
console.log('Renombrado OK')

await p.$disconnect()
