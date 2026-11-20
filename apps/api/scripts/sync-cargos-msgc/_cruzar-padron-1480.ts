/* eslint-disable no-console */
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const mapaExcel = JSON.parse(
  fs.readFileSync(path.resolve('scripts/sync-cargos-msgc/_excel_mapa.json'), 'utf8')
) as { codigo: string; sial_rol_corto: string; bloque: string; estado: string }[]

const ocupActivas = await prisma.$queryRaw<{ codigo: string; id_sial_rol: string }[]>`
  SELECT c.codigo, o.id_sial_rol FROM ocupaciones o JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL AND c.deleted_at IS NULL AND c.codigo IS NOT NULL AND c.estado = 'vigente'
`
const ocupActivasSial = new Set(ocupActivas.map(o => o.id_sial_rol.split('-').slice(0, 2).join('-')))

const cargoPorCodigo = new Map(
  (await prisma.$queryRaw<{ codigo: string; estado: string }[]>`
    SELECT codigo, estado FROM cargos WHERE deleted_at IS NULL AND codigo IS NOT NULL
  `).map(c => [c.codigo, c])
)

const sinOcup = mapaExcel.filter(f => {
  if (f.bloque !== 'Dotación' || !f.sial_rol_corto) return false
  const c = cargoPorCodigo.get(f.codigo)
  if (!c || c.estado !== 'vigente') return false
  return !ocupActivasSial.has(f.sial_rol_corto)
})

console.log(`Sin ocupación activa: ${sinOcup.length}`)

const sialRoles = sinOcup.map(f => f.sial_rol_corto)

// Buscar en el último snapshot (ocupaciones activas del padrón)
const [ultimoSnapshot] = await prisma.$queryRaw<{ id: string; fecha: Date }[]>`
  SELECT id::text, fecha_asignada AS fecha FROM padron_snapshots
  WHERE estado = 'aprobado' ORDER BY fecha_asignada DESC LIMIT 1
`
console.log(`Último snapshot: ${ultimoSnapshot.fecha.toISOString().slice(0,10)}`)

// padron_historico del último snapshot
const enPadron = await prisma.$queryRaw<{
  id_sial_rol: string; cuil: string | null; situacion_revista: string | null
  literal_puesto: string | null; escalafon: string | null
}[]>`
  SELECT id_sial_rol, cuil, situacion_revista, literal_puesto, escalafon
  FROM padron_historico
  WHERE snapshot_id = ${ultimoSnapshot.id}::uuid
    AND split_part(id_sial_rol, '-', 1) || '-' || split_part(id_sial_rol, '-', 2) = ANY(${sialRoles}::text[])
`
console.log(`Con match en padron_historico último: ${enPadron.length}`)

// También buscar en ocupaciones activas del sistema (todas, no solo vigentes)
const enOcupaciones = await prisma.$queryRaw<{ id_sial_rol: string; hasta: Date | null }[]>`
  SELECT id_sial_rol, hasta FROM ocupaciones
  WHERE split_part(id_sial_rol, '-', 1) || '-' || split_part(id_sial_rol, '-', 2) = ANY(${sialRoles}::text[])
`
console.log(`Con match en ocupaciones (activas+cerradas): ${enOcupaciones.length}`)

// Buscar en dim_puestos activos
const enDim = await prisma.$queryRaw<{ id_sial_rol: string; cuil: string | null }[]>`
  SELECT id_sial_rol, cuil FROM dim_puestos
  WHERE split_part(id_sial_rol, '-', 1) || '-' || split_part(id_sial_rol, '-', 2) = ANY(${sialRoles}::text[])
    AND puesto_hasta IS NULL
`
console.log(`Con match en dim_puestos activo: ${enDim.length}`)

// Los que no están en ningún lado
const enPadronSials = new Set(enPadron.map(r => r.id_sial_rol.split('-').slice(0,2).join('-')))
const enDimSials = new Set(enDim.map(r => r.id_sial_rol.split('-').slice(0,2).join('-')))
const sinNada = sinOcup.filter(f => !enPadronSials.has(f.sial_rol_corto) && !enDimSials.has(f.sial_rol_corto))
console.log(`Sin datos en ninguna fuente: ${sinNada.length}`)
for (const f of sinNada.slice(0, 10))
  console.log(`  ${f.sial_rol_corto} → ${f.codigo}`)

await prisma.$disconnect()
