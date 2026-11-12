// Acceso a los HECHOS que necesita `calcularSubEstado` (subEstado.ts) dentro
// de una transacción Prisma, para no repetir las dos queries en cada servicio.
//
// "Concurso activo" tiene UNA sola definición: concursoActivo.regla.ts (estados
// activos por tipo + condición de autorización del concurso base). Esta query
// Prisma, el paso 11 del padrón, la CTE `conc` de Incidencias y el script
// scripts/sql/recalcular-sub-estado-cargos.sql la consumen o están atados a ella
// por test de paridad (concursoActivo.regla.test.ts).
import { prisma } from '../../shared/prisma.js'
import { calcularSubEstado } from './subEstado.js'
import {
  ESTADOS_CPH_TERMINALES,
  ESTADOS_CEETPS_TERMINALES,
  WHERE_CONCURSO_AUTORIZADO_PARA_CONTAR,
} from './concursoActivo.regla.js'
import type { SubEstadoCargo } from '@srrhh/types'

// Mismo tipo de transacción que usan los servicios (createConcursoTx, etc.).
export type SubEstadoTx = Omit<
  Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

/** ¿El cargo tiene al menos una ocupación viva (hasta IS NULL)? */
export async function tieneOcupanteVigente(tx: SubEstadoTx, cargoId: string): Promise<boolean> {
  const n = await tx.ocupacion.count({ where: { cargoId, hasta: null } })
  return n > 0
}

/** ¿El cargo tiene algún concurso CPH o CEETPS activo que cuente (estado no terminal y, si es de cargo nuevo, autorizado)? */
export async function tieneConcursoActivo(tx: SubEstadoTx, cargoId: string): Promise<boolean> {
  const [cph, ceetps] = await Promise.all([
    tx.concursoCph.count({
      where: {
        cargoId,
        estado: { notIn: [...ESTADOS_CPH_TERMINALES] },
        concurso: WHERE_CONCURSO_AUTORIZADO_PARA_CONTAR,
      },
    }),
    tx.concursoCeetps.count({
      where: {
        cargoId,
        estado: { notIn: [...ESTADOS_CEETPS_TERMINALES] },
        concurso: WHERE_CONCURSO_AUTORIZADO_PARA_CONTAR,
      },
    }),
  ])
  return cph > 0 || ceetps > 0
}

/**
 * Recalcula el sub_estado del cargo (vigente) leyendo ocupante y concurso
 * dentro de la MISMA transacción, y devuelve el valor según `calcularSubEstado`.
 * Para estados distintos de 'vigente' no hace falta consultar nada: es null.
 */
export async function recalcularSubEstado(
  tx: SubEstadoTx,
  cargoId: string,
  estado: string,
): Promise<SubEstadoCargo | null> {
  if (estado !== 'vigente') return calcularSubEstado({ estado, tieneOcupanteVigente: false, tieneConcursoActivo: false })
  const [ocupante, concurso] = await Promise.all([
    tieneOcupanteVigente(tx, cargoId),
    tieneConcursoActivo(tx, cargoId),
  ])
  return calcularSubEstado({ estado, tieneOcupanteVigente: ocupante, tieneConcursoActivo: concurso })
}

/**
 * Recalcula y persiste `cargos.sub_estado` del cargo dentro de `tx`, leyendo su
 * estado actual. Centraliza el patrón usado tras abrir/cerrar/autorizar un concurso.
 */
export async function recalcularSubEstadoCargo(tx: SubEstadoTx, cargoId: string): Promise<void> {
  const cargo = await tx.cargo.findUnique({ where: { id: cargoId }, select: { estado: true } })
  if (!cargo) return
  const subEstado = await recalcularSubEstado(tx, cargoId, cargo.estado)
  await tx.cargo.update({ where: { id: cargoId }, data: { subEstado } })
}

/**
 * Versión por LOTE de `recalcularSubEstadoCargo`: recalcula y persiste el
 * sub_estado de varios cargos con un número FIJO de consultas (no una tanda por
 * cargo): 1 lectura de cargos, 3 de hechos (ocupaciones vivas y concursos
 * CPH/CEETPS activos) y 1 `updateMany` por valor distinto de sub_estado.
 * Misma regla que el helper individual (calcularSubEstado + hechos idénticos).
 */
export async function recalcularSubEstadoCargos(tx: SubEstadoTx, cargoIds: string[]): Promise<void> {
  if (cargoIds.length === 0) return
  const cargos = await tx.cargo.findMany({
    where: { id: { in: cargoIds } },
    select: { id: true, estado: true },
  })
  const vigentes = cargos.filter((c) => c.estado === 'vigente').map((c) => c.id)
  const conOcupante = new Set<string>()
  const conConcurso = new Set<string>()
  if (vigentes.length > 0) {
    const [ocupaciones, cph, ceetps] = await Promise.all([
      tx.ocupacion.findMany({ where: { cargoId: { in: vigentes }, hasta: null }, select: { cargoId: true } }),
      tx.concursoCph.findMany({
        where: {
          cargoId: { in: vigentes },
          estado: { notIn: [...ESTADOS_CPH_TERMINALES] },
          concurso: WHERE_CONCURSO_AUTORIZADO_PARA_CONTAR,
        },
        select: { cargoId: true },
      }),
      tx.concursoCeetps.findMany({
        where: {
          cargoId: { in: vigentes },
          estado: { notIn: [...ESTADOS_CEETPS_TERMINALES] },
          concurso: WHERE_CONCURSO_AUTORIZADO_PARA_CONTAR,
        },
        select: { cargoId: true },
      }),
    ])
    for (const o of ocupaciones) conOcupante.add(o.cargoId)
    for (const c of [...cph, ...ceetps]) conConcurso.add(c.cargoId)
  }
  const porValor = new Map<SubEstadoCargo | null, string[]>()
  for (const c of cargos) {
    const v = calcularSubEstado({
      estado: c.estado,
      tieneOcupanteVigente: conOcupante.has(c.id),
      tieneConcursoActivo: conConcurso.has(c.id),
    })
    const ids = porValor.get(v)
    if (ids) ids.push(c.id)
    else porValor.set(v, [c.id])
  }
  for (const [subEstado, ids] of porValor) {
    await tx.cargo.updateMany({ where: { id: { in: ids } }, data: { subEstado } })
  }
}
