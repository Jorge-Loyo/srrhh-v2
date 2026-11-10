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
