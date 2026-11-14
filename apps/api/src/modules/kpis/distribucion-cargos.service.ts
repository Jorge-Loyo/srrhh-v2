import { prisma } from '../../shared/prisma.js'

export interface FilaDistribucionCargos {
  escalafon: string
  ocupado: number
  vacante: number
  concurso: number
  validacion_vacante: number
  total: number
}

export interface DistribucionCargos {
  filas: FilaDistribucionCargos[]
  totales: FilaDistribucionCargos
}

export async function getDistribucionCargosService(): Promise<DistribucionCargos> {
  const rows = await prisma.$queryRaw<
    { escalafon: string; sub_estado: string | null; estado: string; count: bigint }[]
  >`
    SELECT e.nombre AS escalafon,
           c.estado,
           c.sub_estado,
           COUNT(*) AS count
    FROM cargos c
    JOIN escalafones e ON e.id = c.escalafon_id
    WHERE c.deleted_at IS NULL
      AND c.estado IN ('vigente', 'validacion_vacante')
    GROUP BY e.nombre, c.estado, c.sub_estado
    ORDER BY e.nombre, c.estado, c.sub_estado
  `

  // Agrupar por escalafón
  const map = new Map<string, FilaDistribucionCargos>()
  for (const row of rows) {
    if (!map.has(row.escalafon)) {
      map.set(row.escalafon, { escalafon: row.escalafon, ocupado: 0, vacante: 0, concurso: 0, validacion_vacante: 0, total: 0 })
    }
    const fila = map.get(row.escalafon)!
    const n = Number(row.count)
    if (row.estado === 'validacion_vacante') {
      fila.validacion_vacante += n
    } else if (row.sub_estado === 'ocupado') {
      fila.ocupado += n
    } else if (row.sub_estado === 'vacante') {
      fila.vacante += n
    } else if (row.sub_estado === 'concurso') {
      fila.concurso += n
    }
    fila.total += n
  }

  const filas = [...map.values()].sort((a, b) => b.total - a.total)

  const totales: FilaDistribucionCargos = filas.reduce(
    (acc, f) => ({
      escalafon: 'TOTAL',
      ocupado: acc.ocupado + f.ocupado,
      vacante: acc.vacante + f.vacante,
      concurso: acc.concurso + f.concurso,
      validacion_vacante: acc.validacion_vacante + f.validacion_vacante,
      total: acc.total + f.total,
    }),
    { escalafon: 'TOTAL', ocupado: 0, vacante: 0, concurso: 0, validacion_vacante: 0, total: 0 },
  )

  return { filas, totales }
}
