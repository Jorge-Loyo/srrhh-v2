import { esConduccionPorLiteral } from '../../shared/codigoCargo.js'
import type { ModalidadPuesto, TipoPuesto } from '@prisma/client'

// S20-6: el catálogo PuestoCargo/EspecialidadPuesto pasa a ser la fuente real
// de verdad de puesto/especialidad en Cargo (FK obligatoria). El import del
// padrón ya no puede crear un Cargo sin resolver antes su puestoCargoId.
//
// Si el literal_puesto del padrón no matchea ningún PuestoCargo existente
// para ese escalafón (normalizado LOWER(TRIM())), NO se omite el cargo
// silenciosamente: se auto-crea un PuestoCargo nuevo marcado
// pendienteCurar=true, visible desde el admin de catálogo (S20-12) para que
// alguien lo revise/fusione después. Esto no bloquea el import semanal
// desatendido — decisión tomada en la planificación de S20-6.

type TxCatalogo = {
  puestoCargo: {
    findMany: (args: unknown) => Promise<{ id: string; escalafonId: string; nombre: string; modalidad: ModalidadPuesto; tipoPuesto: TipoPuesto }[]>
    create: (args: unknown) => Promise<{ id: string; nombre: string; modalidad: ModalidadPuesto; tipoPuesto: TipoPuesto }>
  }
  especialidadPuesto: {
    findMany: (args: unknown) => Promise<{ id: string; puestoCargId: string; nombre: string }[]>
    create: (args: unknown) => Promise<{ id: string }>
  }
}

export function normPuestoKey(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

export interface PuestoCargoInfo {
  id: string
  nombre: string
  modalidad: ModalidadPuesto
  tipoPuesto: TipoPuesto
}

export interface CatalogoPuestosCache {
  puestos: Map<string, PuestoCargoInfo>
  especialidades: Map<string, string>
}

// Carga el catálogo completo una sola vez — cardinalidad chica (cientos de
// filas), igual criterio que el cache de hospitales/escalafones ya existente
// en aprobarSnapshotService().
export async function cargarCatalogoPuestos(tx: TxCatalogo): Promise<CatalogoPuestosCache> {
  const [puestos, especialidades] = await Promise.all([
    tx.puestoCargo.findMany({
      select: { id: true, escalafonId: true, nombre: true, modalidad: true, tipoPuesto: true },
    }),
    tx.especialidadPuesto.findMany({
      select: { id: true, puestoCargId: true, nombre: true },
    }),
  ])
  const puestosMap = new Map<string, PuestoCargoInfo>()
  for (const p of puestos) {
    puestosMap.set(`${p.escalafonId}:${normPuestoKey(p.nombre)}`, { id: p.id, nombre: p.nombre, modalidad: p.modalidad, tipoPuesto: p.tipoPuesto })
  }
  const especialidadesMap = new Map<string, string>()
  for (const e of especialidades) {
    especialidadesMap.set(`${e.puestoCargId}:${normPuestoKey(e.nombre)}`, e.id)
  }
  return { puestos: puestosMap, especialidades: especialidadesMap }
}

// Placeholder para filas del padrón con literal_puesto vacío (caso borde no
// visto en datos reales hoy, pero Cargo.puestoCargoId es NOT NULL — no
// podemos dejar el cargo sin crear por esto, se pierde la fila del SIAL).
const SIN_ESPECIFICAR = '(sin especificar)'

// Resuelve (o auto-crea) el PuestoCargo para un literal_puesto del padrón.
// Nunca devuelve null: un literal_puesto vacío/null resuelve al puesto
// placeholder "(sin especificar)" de ese escalafón, igual marcado
// pendienteCurar=true, para no bloquear la creación del Cargo.
export async function resolverPuestoCargoId(
  tx: TxCatalogo,
  cache: CatalogoPuestosCache,
  params: { escalafonId: string; literalPuesto: string | null; unificadorPuesto: string | null },
): Promise<PuestoCargoInfo> {
  const literal = (params.literalPuesto ?? '').trim() || SIN_ESPECIFICAR

  const key = `${params.escalafonId}:${normPuestoKey(literal)}`
  const existente = cache.puestos.get(key)
  if (existente) return existente

  const unif = (params.unificadorPuesto ?? '').toUpperCase()
  const modalidad: ModalidadPuesto = unif.includes('POU') || unif.includes('GUARDIA') ? 'pou' : 'pof'
  const tipoPuesto: TipoPuesto = esConduccionPorLiteral(literal) ? 'conduccion' : 'ejecucion'

  const creado = await tx.puestoCargo.create({
    data: {
      escalafonId: params.escalafonId,
      nombre: literal.slice(0, 200),
      modalidad,
      tipoPuesto,
      pendienteCurar: true,
    },
    select: { id: true, nombre: true, modalidad: true, tipoPuesto: true },
  })
  console.warn(`[padron] Puesto sin match en catálogo: "${literal}" (escalafón ${params.escalafonId}) — PuestoCargo creado con pendienteCurar=true`)
  const info: PuestoCargoInfo = { id: creado.id, nombre: creado.nombre, modalidad: creado.modalidad, tipoPuesto: creado.tipoPuesto }
  cache.puestos.set(key, info)
  return info
}

export async function resolverEspecialidadPuestoId(
  tx: TxCatalogo,
  cache: CatalogoPuestosCache,
  puestoCargoId: string,
  especialidad: string | null,
): Promise<string | null> {
  const nombre = (especialidad ?? '').trim()
  if (!nombre) return null

  const key = `${puestoCargoId}:${normPuestoKey(nombre)}`
  const existente = cache.especialidades.get(key)
  if (existente) return existente

  const creada = await tx.especialidadPuesto.create({
    data: { puestoCargId: puestoCargoId, nombre: nombre.slice(0, 200) },
    select: { id: true },
  })
  cache.especialidades.set(key, creada.id)
  return creada.id
}
