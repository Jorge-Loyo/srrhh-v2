import { CR_POR_CODIGO_ESCALAFON_GESTIONADO } from '@srrhh/types'
import { tipoConcursoDeCargo, type TipoConcurso } from '../modules/incidencias/incidencias.gestionable.js'

// ─── Código de registro DEDUCIDO desde la carrera (escalafón) elegida ─────────
//
// El formulario de alta (/cargos/alta) no envía `codigoRegistroId`; la "Carrera"
// elegida es un Escalafon. Para que el Paso 3 cree el concurso CPH/CEETPS se
// deduce el CR de la carrera SIN duplicar reglas: de los CR que tiene el
// escalafón se toma el primero (según CR_PREFERIDOS) que `tipoConcursoDeCargo`
// clasifica en algún tipo. Si ninguno clasifica => null (sin tipo, sin concurso;
// comportamiento actual, ej. Administrativa 83 fuera de Anexo II).
// FALLBACK por código de escalafón (datos de Neon): si el escalafón NO tiene ningún
// CR cargado en `codigos_registro` (ej. 'Carrera de Enfermería'/'Técnicos' del seed),
// se usa el CR que corresponde a su código (85 => 85, 87 => 87, 22/37 => 37, ...), tabla
// en @srrhh/types (CR_POR_CODIGO_ESCALAFON_GESTIONADO), y se clasifica igual con
// `tipoConcursoDeCargo` (única fuente de la regla CPH/CEETPS).
// El 37 va antes que el 22 (duplicado CPH, ver crCph.ts).
const CR_PREFERIDOS = ['37', '22', '23', '85', '87', '83'] as const

export interface CrDeCarrera {
  id: string
  codigo: string
}

export interface CrDerivado extends CrDeCarrera {
  tipo: TipoConcurso
}

/** Código de CR que corresponde a un código de escalafón gestionado (null si no se gestiona). */
export function codigoCrDeEscalafon(codigoEscalafon: string | null | undefined): string | null {
  if (!codigoEscalafon) return null
  return CR_POR_CODIGO_ESCALAFON_GESTIONADO[codigoEscalafon.trim()] ?? null
}

/**
 * Núcleo puro: elige el CR de la carrera a partir de sus códigos de registro.
 * `crFallback` (opcional) = CR cuyo código corresponde al código del escalafón;
 * solo se usa si el escalafón no tiene ningún CR propio.
 */
export function elegirCrPorCarrera(
  codigosDeLaCarrera: CrDeCarrera[],
  literalPuesto: string | null | undefined,
  crFallback?: CrDeCarrera | null,
): CrDerivado | null {
  if (codigosDeLaCarrera.length === 0) {
    if (!crFallback) return null
    const tipo = tipoConcursoDeCargo({ codigoRegistro: crFallback.codigo, literalPuesto })
    return tipo ? { ...crFallback, tipo } : null
  }
  const orden = (c: string) => {
    const i = (CR_PREFERIDOS as readonly string[]).indexOf(c)
    return i === -1 ? CR_PREFERIDOS.length : i
  }
  const candidatos = [...codigosDeLaCarrera].sort((a, b) => orden(a.codigo) - orden(b.codigo))
  for (const cr of candidatos) {
    const tipo = tipoConcursoDeCargo({ codigoRegistro: cr.codigo, literalPuesto })
    if (tipo) return { ...cr, tipo }
  }
  return null
}

/** Subconjunto de Prisma necesario (acepta `prisma` o un `tx`). */
export interface CrPorCarreraDb {
  codigoRegistro: {
    findMany(args: {
      where: { escalafonId: string | { in: string[] } }
      select: { id: true; codigo: true; escalafonId: true }
    }): Promise<{ id: string; codigo: string; escalafonId: string }[]>
    findUnique(args: {
      where: { codigo: string }
      select: { id: true; codigo: true }
    }): Promise<{ id: string; codigo: string } | null>
  }
  escalafon: {
    findUnique(args: {
      where: { id: string }
      select: { codigo: true }
    }): Promise<{ codigo: string } | null>
  }
}

/** Resuelve el CR deducido de una carrera para un puesto (consulta mínima; fallback por código de escalafón). */
export async function resolverCrPorCarrera(
  db: CrPorCarreraDb,
  escalafonId: string,
  literalPuesto: string | null | undefined,
): Promise<CrDerivado | null> {
  const crs = await db.codigoRegistro.findMany({
    where: { escalafonId },
    select: { id: true, codigo: true, escalafonId: true },
  })
  if (crs.length > 0) return elegirCrPorCarrera(crs, literalPuesto)
  const esc = await db.escalafon.findUnique({ where: { id: escalafonId }, select: { codigo: true } })
  const codigoCr = codigoCrDeEscalafon(esc?.codigo)
  if (!codigoCr) return null
  // `codigos_registro.codigo` es único: se busca el CR por código.
  const crFallback = await db.codigoRegistro.findUnique({ where: { codigo: codigoCr }, select: { id: true, codigo: true } })
  return elegirCrPorCarrera([], literalPuesto, crFallback)
}
