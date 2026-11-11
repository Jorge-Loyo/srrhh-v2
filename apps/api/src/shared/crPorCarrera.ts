import { tipoConcursoDeCargo, type TipoConcurso } from '../modules/incidencias/incidencias.gestionable.js'

// ─── Código de registro DEDUCIDO desde la carrera (escalafón) elegida ─────────
//
// El formulario de alta (/cargos/alta) no envía `codigoRegistroId`; la "Carrera"
// elegida es un Escalafon. Para que el Paso 3 cree el concurso CPH/CEETPS se
// deduce el CR de la carrera SIN duplicar reglas: de los CR que tiene el
// escalafón se toma el primero (según CR_PREFERIDOS) que `tipoConcursoDeCargo`
// clasifica en algún tipo. Si ninguno clasifica => null (sin tipo, sin concurso;
// comportamiento actual, ej. Administrativa 83 fuera de Anexo II).
// El 37 va antes que el 22 (duplicado CPH, ver crCph.ts).
const CR_PREFERIDOS = ['37', '22', '23', '85', '87', '83'] as const

export interface CrDeCarrera {
  id: string
  codigo: string
}

export interface CrDerivado extends CrDeCarrera {
  tipo: TipoConcurso
}

/** Núcleo puro: elige el CR de la carrera a partir de sus códigos de registro. */
export function elegirCrPorCarrera(
  codigosDeLaCarrera: CrDeCarrera[],
  literalPuesto: string | null | undefined,
): CrDerivado | null {
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
  }
}

/** Resuelve (con una consulta) el CR deducido de una carrera para un puesto. */
export async function resolverCrPorCarrera(
  db: CrPorCarreraDb,
  escalafonId: string,
  literalPuesto: string | null | undefined,
): Promise<CrDerivado | null> {
  const crs = await db.codigoRegistro.findMany({
    where: { escalafonId },
    select: { id: true, codigo: true, escalafonId: true },
  })
  return elegirCrPorCarrera(crs, literalPuesto)
}
