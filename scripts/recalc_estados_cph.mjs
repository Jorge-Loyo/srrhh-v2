// recalc_estados_cph.mjs
// Recalcula estado/sub_estado/sub_estado_3 de todos los ConcursoCph
// usando la misma lógica que calcConcursoCph() del service.
//
// Uso:
//   wsl bash -c "cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy && DATABASE_URL='postgresql://srrhh_user:srrhh_pass@localhost:5432/srrhh_db' node scripts/recalc_estados_cph.mjs"
//
// Flags:
//   --dry-run   Muestra cambios sin escribir en BD
//   --id=UUID   Recalcula solo ese concurso

import { PrismaClient } from '@prisma/client'

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const SOLO_ID = args.find(a => a.startsWith('--id='))?.split('=')[1]

const prisma = new PrismaClient()

// ─── Réplica de calcConcursoCph (sin importar TS) ────────────────────────────

function calcSubEstado(r) {
  if (r.fechaDispoDesierta && r.dispoDesierta) return 'Q-DESIERTO'
  if (r.cargoSial)                             return 'O-ALTA SIAL'
  if (r.fechaResolucion && r.resolucionDesignacion) return 'N-DESIGNADO'
  if (r.resoALaFirma)                          return 'M-RESO A LA FIRMA'
  if (r.proyectoResolucion)                    return 'L-PYCTO DE RESO'
  if (r.fechaIte)                              return 'K-ITE'
  if (r.fechaAptoMedico)                       return 'J-APTO MED'
  if (r.cargaDocumentacion)                    return 'I-CARGA DOCU'
  if (r.eeDesignacion)                         return 'H-TAD'
  if (r.fechaInsal)                            return 'G-INSAL'
  if (r.fechaIfacs)                            return 'F-IFACS'
  if (r.fechaOrdenMerito)                      return 'E-ORDEN DE MERITO'
  if (r.fechaExamen)                           return 'D-EXAMEN PUBLICADO'
  if (r.disposicion)                           return 'C-DISPO DE LLAMADO'
  if (r.sorteoJurado)                          return 'B-SORTEO JUR'
  if (r.fechaAutorizacion)                     return 'A-AUTZN'
  if (r.eeConcurso && r.eeBaja)                return 'A-CARATULADO'
  if (!r.eeBaja && !r.eeConcurso)              return 'VACANTE'
  return 'NO INICIADO'
}

function calcSubEstado3(r) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  if (r.fechaDispoDesierta)                                    return 'H-DESIERTO'
  if (r.resolucionDesignacion)                                 return 'G-RESOLUCION'
  if (r.eeDesignacion)                                         return 'F-PROX. A DESIG'
  if (r.fechaExamen && hoy >= r.fechaExamen)                   return 'E-ADJUDI'
  if (r.fechaInscHasta && hoy >= r.fechaInscHasta)             return 'D-ETAPA EVAL'
  if (r.disposicion)                                           return 'C-INSCRIPCION'
  if (r.fechaAutorizacion && r.sorteoJurado)                   return 'B-AUTORIZADO'
  return 'A-VALID. VCTE'
}

function calcEstado(r) {
  const sub = calcSubEstado(r)
  if (r.suspendido)          return 'suspendido'
  if (sub === 'Q-DESIERTO')  return 'desierto'
  if (r.resolucionDesignacion) return 'finalizado'
  if (r.eeBaja && r.eeConcurso && r.fechaBaja && r.fechaEeConcurso) return 'activo'
  return 'no_iniciado'
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔧 Modo: ${DRY_RUN ? 'DRY RUN' : 'ESCRITURA'}${SOLO_ID ? ` | Solo: ${SOLO_ID}` : ''}\n`)

  const concursos = await prisma.concursoCph.findMany({
    where: SOLO_ID ? { id: SOLO_ID } : undefined,
  })

  console.log(`📊 Concursos a evaluar: ${concursos.length}\n`)

  const stats = { actualizados: 0, sinCambio: 0, errores: 0 }
  const cambios = []

  for (const cc of concursos) {
    try {
      const nuevoEstado    = calcEstado(cc)
      const nuevoSubEstado = calcSubEstado(cc)
      const nuevoSubEstado3 = calcSubEstado3(cc)

      const cambio = nuevoEstado !== cc.estado
        || nuevoSubEstado !== cc.subEstado
        || nuevoSubEstado3 !== cc.subEstado3

      if (!cambio) {
        stats.sinCambio++
        continue
      }

      cambios.push({
        id: cc.id,
        antes: { estado: cc.estado, subEstado: cc.subEstado, subEstado3: cc.subEstado3 },
        despues: { estado: nuevoEstado, subEstado: nuevoSubEstado, subEstado3: nuevoSubEstado3 },
      })

      if (!DRY_RUN) {
        await prisma.concursoCph.update({
          where: { id: cc.id },
          data: { estado: nuevoEstado, subEstado: nuevoSubEstado, subEstado3: nuevoSubEstado3 },
        })
      }

      stats.actualizados++
    } catch (err) {
      stats.errores++
      console.error(`  ❌ ${cc.id}: ${err.message}`)
    }
  }

  console.log('═══════════════════════════════════════')
  console.log('  RESULTADO RECÁLCULO ESTADOS CPH')
  console.log('═══════════════════════════════════════')
  console.log(`  Total evaluados  : ${concursos.length}`)
  console.log(`  Actualizados     : ${stats.actualizados}`)
  console.log(`  Sin cambio       : ${stats.sinCambio}`)
  console.log(`  Errores          : ${stats.errores}`)
  console.log('═══════════════════════════════════════\n')

  if (cambios.length > 0) {
    console.log(`Detalle de cambios (primeros 30):`)
    cambios.slice(0, 30).forEach(c => {
      console.log(`  ${c.id.slice(0, 8)}… | ${c.antes.estado}/${c.antes.subEstado} → ${c.despues.estado}/${c.despues.subEstado}`)
    })
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
