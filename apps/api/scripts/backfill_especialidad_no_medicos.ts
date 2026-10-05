/**
 * Backfill de especialidad para cargos NO médicos (Opción A, sesión 2026-10).
 *
 * Problema: 33.231 de 47.646 cargos vigentes no tienen `especialidad_puesto_id`
 * (la columna "Especialidad" del Excel de dotación sale vacía). De esos, el
 * `especialidad_legacy` también está vacío (solo 767 rescatables), así que no
 * hay dato crudo que rescatar — hay que DERIVARLO.
 *
 * Decisión (con el usuario): para los puestos NO médicos la especialidad está
 * DETERMINADA por el puesto (un "licenciado en enfermería" es Enfermería, un
 * "técnico en radiología" es Radiología, un "chofer de ambulancia" es su propia
 * función). Para los médicos genéricos ("médico de planta", "profesional/
 * especialista guardia médico") la especialidad NO es derivable del puesto (dos
 * médicos de planta pueden ser cardiólogo y pediatra) → se dejan SIN
 * especialidad, es honesto: ese dato viene del padrón o no existe. Los puestos
 * de conducción (jefe/director/gerente) no tienen especialidad clínica.
 *
 * Mapeo DETERMINÍSTICO por regla sobre el nombre del puesto (no tabla a mano de
 * 270 filas): se normaliza quitando sufijos de modalidad/situación y se agrupan
 * las variantes de enfermería. Así cubre los 270 puestos actuales y se
 * auto-aplica a puestos futuros. Los que caen en el set de exclusión o no se
 * pueden derivar quedan sin tocar y se listan en el reporte.
 *
 * Escribe en el catálogo real (`especialidades_puesto`) + `Cargo.especialidad
 * _puesto_id`, con `pendiente_curar=true` para que queden revisables desde el
 * admin de catálogo (igual que las auto-altas del Dotaneitor, S22-6).
 *
 * Re-ejecutable: solo toca cargos con `especialidad_puesto_id` NULL; upsert por
 * (puesto_cargo_id, nombre). No duplica.
 *
 * Uso:
 *   cd apps/api
 *   pnpm exec tsx scripts/backfill_especialidad_no_medicos.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client'
// Fuente de verdad única de la regla de derivación — compartida con el pipeline
// del padrón (resolverPuestoCargo.ts) para que backfill y padrones futuros usen
// exactamente el mismo mapeo.
import { derivarEspecialidadDesdePuesto } from '../src/modules/padron/derivarEspecialidadPuesto.js'

const prisma = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')

interface PuestoRow {
  puesto_cargo_id: string
  nombre: string
  cargos: number
}

async function main() {
  console.log(`🔬 Backfill especialidad NO médicos (Opción A)${dryRun ? ' [DRY RUN]' : ''}...`)

  // Puestos con cargos vigentes sin especialidad asignada.
  const puestos = await prisma.$queryRaw<PuestoRow[]>`
    SELECT pcd.id AS puesto_cargo_id, pcd.nombre, count(c.id)::int AS cargos
    FROM puestos_cargo pcd
    JOIN cargos c ON c.puesto_cargo_id = pcd.id
      AND c.especialidad_puesto_id IS NULL
      AND c.estado = 'vigente' AND c.deleted_at IS NULL
    GROUP BY pcd.id, pcd.nombre
    ORDER BY count(c.id) DESC
  `

  let cargosMapeados = 0
  let cargosExcluidos = 0
  let especialidadesCreadas = 0
  const porEspecialidad = new Map<string, number>()
  const excluidos: { nombre: string; cargos: number }[] = []

  for (const p of puestos) {
    const especialidad = derivarEspecialidadDesdePuesto(p.nombre)
    if (!especialidad) {
      cargosExcluidos += p.cargos
      excluidos.push({ nombre: p.nombre, cargos: p.cargos })
      continue
    }

    porEspecialidad.set(especialidad, (porEspecialidad.get(especialidad) ?? 0) + p.cargos)
    cargosMapeados += p.cargos

    if (dryRun) continue

    // Upsert de la especialidad en el catálogo (unique puesto_cargo_id + nombre).
    const esp = await prisma.especialidadPuesto.upsert({
      where: { puestoCargId_nombre: { puestoCargId: p.puesto_cargo_id, nombre: especialidad } },
      update: {},
      create: { puestoCargId: p.puesto_cargo_id, nombre: especialidad, pendienteCurar: true },
    })
    // ¿se creó recién? (prisma no lo dice directo — chequeo por si acaso no suma de más)
    especialidadesCreadas++

    // Set del especialidad_puesto_id en los cargos de ese puesto que están sin ella.
    await prisma.cargo.updateMany({
      where: {
        puestoCargoId: p.puesto_cargo_id,
        especialidadPuestoId: null,
        estado: 'vigente',
        deletedAt: null,
      },
      data: { especialidadPuestoId: esp.id },
    })
  }

  console.log('\n📊 Resultado:')
  console.log(`   Cargos mapeados a una especialidad:  ${cargosMapeados}`)
  console.log(`   Cargos excluidos (médico/conducción): ${cargosExcluidos}`)
  if (!dryRun) console.log(`   Especialidades upserteadas en catálogo: ${especialidadesCreadas}`)

  console.log('\n🔝 Top especialidades derivadas:')
  const top = [...porEspecialidad.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
  for (const [esp, n] of top) console.log(`   ${String(n).padStart(5)} · ${esp}`)

  console.log(`\n⚠️  ${excluidos.length} puesto(s) excluido(s) (sin especialidad derivable):`)
  for (const e of excluidos.slice(0, 40)) console.log(`   ${String(e.cargos).padStart(5)} · ${e.nombre}`)
  if (excluidos.length > 40) console.log(`   ... y ${excluidos.length - 40} más`)

  console.log(`\n🎉 Backfill ${dryRun ? 'simulado (dry-run)' : 'completado'}.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
