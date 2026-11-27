/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Último snapshot aprobado
const snapshots = await prisma.$queryRaw<{
  id: string; fecha_asignada: Date; estado: string; total_registros: number; created_at: Date
}[]>`
  SELECT id::text, fecha_asignada, estado::text, total_registros, created_at
  FROM padron_snapshots
  ORDER BY fecha_asignada DESC
  LIMIT 5
`
console.log('\n── Últimos snapshots ────────────────────────────────────')
for (const s of snapshots)
  console.log(`  ${s.fecha_asignada.toISOString().slice(0,10)}  estado=${s.estado}  registros=${s.total_registros}  id=${s.id.slice(0,8)}...`)

// Del último aprobado, ver si tiene los sial_rol que nos faltan
const ultimo = snapshots.find(s => s.estado === 'aprobado') ?? snapshots[0]
console.log(`\nUsando snapshot: ${ultimo.fecha_asignada.toISOString().slice(0,10)} (${ultimo.estado})`)

const [conteo] = await prisma.$queryRaw<{ total: bigint }[]>`
  SELECT count(*) AS total FROM padron_historico WHERE snapshot_id = ${ultimo.id}::uuid
`
console.log(`Registros en padron_historico: ${conteo.total}`)

// Muestra de columnas disponibles
const muestra = await prisma.$queryRaw<Record<string, unknown>[]>`
  SELECT id_sial_rol, cuil, escalafon, hospital_sigla, literal_puesto, especialidad, situacion_revista
  FROM padron_historico
  WHERE snapshot_id = ${ultimo.id}::uuid
  LIMIT 3
`
console.log('\nMuestra:')
for (const m of muestra) console.log(' ', JSON.stringify(m))

await prisma.$disconnect()
