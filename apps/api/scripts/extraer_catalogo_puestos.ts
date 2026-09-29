// S20-4: extrae y cura el catálogo real de PuestoCargo/EspecialidadPuesto a
// partir de los cargos existentes en la base — se corre ANTES de un
// `prisma migrate reset` para no perder el catálogo real acumulado. Escribe
// prisma/catalogo-puestos-curado.json, que `prisma/seed.ts` carga después
// del reset (keyed por escalafon.codigo estable, no por id — ver nota en
// prisma/migrations/20260901_puestos_cargo/migration.sql).
//
// Uso: pnpm --filter @srrhh/api exec tsx --env-file=.env ../../apps/api/scripts/extraer_catalogo_puestos.ts
// (o directamente `npx tsx --env-file=.env scripts/extraer_catalogo_puestos.ts` desde apps/api)
import { PrismaClient } from '@prisma/client'
import { writeFileSync } from 'node:fs'
import { esConduccionPorLiteral } from '../src/shared/codigoCargo.js'

const prisma = new PrismaClient()

function normKey(s: string) {
  return s.trim().toLowerCase()
}

async function main() {
  // 1) Catálogo ya curado a mano — se preserva tal cual (modalidad/
  // tipoPuesto ya revisados), keyed por escalafon.codigo (estable).
  const puestosExistentes = await prisma.puestoCargo.findMany({
    select: {
      nombre: true, modalidad: true, tipoPuesto: true,
      escalafon: { select: { codigo: true } },
      especialidades: { select: { nombre: true } },
    },
  })

  type PuestoCurado = {
    escalafonCodigo: string
    nombre: string
    modalidad: 'pof' | 'pou' | 'ambos'
    tipoPuesto: 'ejecucion' | 'conduccion'
    especialidades: string[]
  }

  const curado = new Map<string, PuestoCurado>()
  for (const p of puestosExistentes) {
    const key = `${p.escalafon.codigo}:${normKey(p.nombre)}`
    curado.set(key, {
      escalafonCodigo: p.escalafon.codigo,
      nombre: p.nombre,
      modalidad: p.modalidad,
      tipoPuesto: p.tipoPuesto,
      especialidades: p.especialidades.map((e) => e.nombre),
    })
  }

  // 2) Solo escalafones con código ESTABLE (numérico real de SIAL, o los
  // sembrados a mano ENF/TEC/CPH/16T) — se excluyen los escalafones basura
  // auto-creados por el padrón con sufijo random (consolidación de
  // Escalafon queda fuera de alcance de Sprint 20).
  const escalafones = await prisma.escalafon.findMany({ select: { id: true, codigo: true, nombre: true } })
  const escalafonesEstables = new Set(
    escalafones.filter((e) => !/-[0-9a-f]{7}$/.test(e.codigo)).map((e) => e.codigo)
  )

  // 3) Extraer de los cargos reales todo lo que el catálogo actual no cubre.
  const cargos = await prisma.cargo.findMany({
    where: { literalPuesto: { not: null } },
    select: {
      literalPuesto: true, especialidadLegacy: true, unificadorPuesto: true,
      escalafon: { select: { codigo: true } },
    },
  })

  interface Grupo {
    escalafonCodigo: string
    nombre: string
    unificadores: Map<string, number>
    especialidades: Set<string>
  }
  const grupos = new Map<string, Grupo>()
  for (const c of cargos) {
    if (!c.literalPuesto || !escalafonesEstables.has(c.escalafon.codigo)) continue
    const key = `${c.escalafon.codigo}:${normKey(c.literalPuesto)}`
    let g = grupos.get(key)
    if (!g) {
      g = { escalafonCodigo: c.escalafon.codigo, nombre: c.literalPuesto.trim(), unificadores: new Map(), especialidades: new Set() }
      grupos.set(key, g)
    }
    if (c.unificadorPuesto) {
      const u = c.unificadorPuesto.trim()
      g.unificadores.set(u, (g.unificadores.get(u) ?? 0) + 1)
    }
    if (c.especialidadLegacy) g.especialidades.add(c.especialidadLegacy.trim())
  }

  let nuevos = 0
  for (const [key, g] of grupos) {
    if (curado.has(key)) {
      const existente = curado.get(key)!
      for (const esp of g.especialidades) {
        if (!existente.especialidades.some((e) => normKey(e) === normKey(esp))) {
          existente.especialidades.push(esp)
        }
      }
      continue
    }
    const unifMasFrecuente = [...g.unificadores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
    const unifUpper = unifMasFrecuente.toUpperCase()
    const modalidad: 'pof' | 'pou' = unifUpper.includes('POU') || unifUpper.includes('GUARDIA') ? 'pou' : 'pof'
    const tipoPuesto: 'ejecucion' | 'conduccion' = esConduccionPorLiteral(g.nombre) ? 'conduccion' : 'ejecucion'
    curado.set(key, {
      escalafonCodigo: g.escalafonCodigo,
      nombre: g.nombre,
      modalidad,
      tipoPuesto,
      especialidades: [...g.especialidades],
    })
    nuevos++
  }

  const resultado = [...curado.values()]
  writeFileSync(
    new URL('../../../prisma/catalogo-puestos-curado.json', import.meta.url),
    JSON.stringify(resultado, null, 2),
  )
  console.log(`Catálogo curado: ${resultado.length} puestos (${resultado.length - nuevos} ya existían, ${nuevos} extraídos de cargos reales)`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
