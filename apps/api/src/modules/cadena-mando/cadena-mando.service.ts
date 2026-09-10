import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'

export interface NodoCadena {
  nivel: number
  codigoReparticion: string
  descRep: string | null
  tipo: string
  conductor: string | null
  cargoLiteral: string | null
  codigoCargo: string | null
}

export async function getCadenaMandoService(
  params: { personaId: string } | { codigoRepa: string }
): Promise<NodoCadena[]> {
  let codigoRepa: string

  if ('personaId' in params) {
    const ocup = await prisma.ocupacion.findFirst({
      where: { personaId: params.personaId, hasta: null },
      select: { cargo: { select: { codigoRepa: true } } },
      orderBy: { createdAt: 'desc' },
    })
    if (!ocup?.cargo.codigoRepa) {
      throw AppError.notFound('La persona no tiene ocupación activa con repartición asignada')
    }
    codigoRepa = ocup.cargo.codigoRepa
  } else {
    codigoRepa = params.codigoRepa
  }

  const nodoInicial = await prisma.organigrama.findUnique({ where: { codigoReparticion: codigoRepa } })
  if (!nodoInicial) throw AppError.notFound(`No se encontró nodo de organigrama para repartición: ${codigoRepa}`)

  const rows = await prisma.$queryRaw<Array<{
    nivel: number
    codigo_reparticion: string
    desc_rep: string | null
    tipo: string
    conductor: string | null
    cargo_literal: string | null
    codigo_cargo: string | null
  }>>`
    WITH RECURSIVE cadena AS (
      SELECT codigo_reparticion, desc_rep, tipo, padre, 0 AS nivel
      FROM organigramas
      WHERE codigo_reparticion = ${codigoRepa}

      UNION ALL

      SELECT o.codigo_reparticion, o.desc_rep, o.tipo, o.padre, c.nivel + 1
      FROM organigramas o
      JOIN cadena c ON c.padre = o.codigo_reparticion
      WHERE c.padre IS NOT NULL AND c.padre != ''
    )
    SELECT
      cadena.nivel,
      cadena.codigo_reparticion,
      cadena.desc_rep,
      cadena.tipo,
      p.apellido_nombre   AS conductor,
      c2.literal_puesto   AS cargo_literal,
      c2.codigo           AS codigo_cargo
    FROM cadena
    LEFT JOIN LATERAL (
      SELECT c2.id, c2.literal_puesto, c2.codigo, c2.codigo_repa
      FROM cargos c2
      JOIN codigos_registro cr ON cr.id = c2.codigo_registro_id
        AND cr.codigo IN ('25','60','37','83','85','87')
      JOIN ocupaciones o2 ON o2.cargo_id = c2.id
        AND o2.hasta IS NULL
        AND o2.situacion_revista = 'Activo'
        AND (
          cr.codigo IN ('25','60')
          OR (o2.codigo_jefaturas IS NOT NULL AND o2.codigo_jefaturas != '' AND o2.codigo_jefaturas != '0')
        )
      WHERE c2.codigo_repa = cadena.codigo_reparticion
        AND c2.deleted_at IS NULL
      ORDER BY cr.codigo ASC
      LIMIT 1
    ) c2 ON true
    LEFT JOIN ocupaciones o2 ON o2.cargo_id = c2.id AND o2.hasta IS NULL
    LEFT JOIN personas p ON p.id = o2.persona_id
    ORDER BY cadena.nivel
  `

  return rows.map((r) => ({
    nivel: Number(r.nivel),
    codigoReparticion: r.codigo_reparticion,
    descRep: r.desc_rep,
    tipo: r.tipo,
    conductor: r.conductor,
    cargoLiteral: r.cargo_literal,
    codigoCargo: r.codigo_cargo,
  }))
}
