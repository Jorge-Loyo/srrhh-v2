import { Prisma, PrismaClient } from '@prisma/client'

// ─── Prefijos según REGLAS_NEGOCIO.MD sección 3 ──────────────────────────────
//
// El prefijo se deriva de: nombre del escalafón + unificador_puesto + agrupador.
// Los valores vienen del Dotaneitor (columnas ESCALAFON, UNIFICADOR DE PUESTOS,
// AGRUPADOR del Excel procesado).
//
// Tabla de mapeo:
//   Médicos / CPH de Guardia                        → CPH-POU
//   Médicos / CPH de Planta                         → CPH-POF
//   Médicos / Jefaturas / agrupador contiene "Jefe" → CPH-J-POU o CPH-J-POF
//   Médicos / Director                              → CPH-D
//   Médicos / Sub Director                          → CPH-SD
//   Nueva Carrera de Enfermería                     → ENF
//   CEETPS / POU                                    → TEC-POU
//   CEETPS / POF                                    → TEC-POF
//   Escalafón General / Jefe EG                     → EG-J
//   Escalafón General / Director EG                 → EG-D
//   Escalafón General / Gerencial                   → EG-G
//   Escalafón General (resto)                       → EG
//   Autoridades Superiores / Ministro               → AS-MIN
//   Autoridades Superiores / Subsecretaría          → AS-SS
//   Autoridades Superiores / Dir. General           → AS-DG
//   Autoridades Superiores / Dir. General Adjunta   → AS-DGA
//   Régimen Gerencial                               → RG-CG
//   Suplentes de Guardia                            → SG
//   Residentes                                      → RES
//   Docentes                                        → DOC
//   Plantas Transitorias Módulo Operativo            → MO
//   Fallback (escalafón desconocido)                → CARGO

// Saca acentos además de mayusculizar — detectado en vivo tras el
// `prisma migrate reset` de Sprint 20: el escalafón hand-seedeado "TEC"
// (nombre real "Carrera de Técnicos de la Salud") no matcheaba
// `esc.includes('TEC')` porque "TÉCNICOS" con acento no contiene la
// substring ASCII "TEC". Antes se compensaba a mano listando variantes
// acentuadas/sin acentuar por separado (ver 'MÉDICO'/'MEDICO' más abajo,
// que se dejan igual — son inofensivos ahora que también matchean por esto).
function normStr(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()
}

// S20-8: cuando el llamador ya resolvió el PuestoCargo del catálogo (import
// del padrón, alta manual — ver resolverPuestoCargo.ts), se puede pasar acá
// para decidir POU/POF por el enum ModalidadPuesto en vez de `.includes()`
// sobre unificadorPuesto. tipoPuesto/nombre siguen sin poder reemplazar del
// todo la distinción Director/SubDirector/Jefe de CPH (el enum solo separa
// ejecución/conducción, no esos sub-tipos) — para esos casos se sigue
// mirando el nombre del puesto (ya no el agrupador de texto libre del Excel).
export interface PuestoCargoResuelto {
  nombre: string
  tipoPuesto: 'ejecucion' | 'conduccion'
  modalidad: 'pof' | 'pou' | 'ambos'
}

export function prefijoDeCargo(params: {
  escalafon: string | null
  unificadorPuesto: string | null
  agrupador: string | null
  puestoCargo?: PuestoCargoResuelto | null
}): string {
  const esc  = normStr(params.escalafon)
  const unif = normStr(params.unificadorPuesto)
  const agr  = normStr(params.agrupador)
  const pc   = params.puestoCargo
  const esPou = pc ? pc.modalidad === 'pou' : (unif.includes('POU') || unif.includes('GUARDIA'))
  // Nombre canónico del catálogo cuando está disponible — más confiable que
  // el agrupador de texto libre del Excel para distinguir Director/Jefe.
  const nombrePuesto = pc ? normStr(pc.nombre) : agr
  const esConduccion = pc ? pc.tipoPuesto === 'conduccion' : (unif.includes('JEFATURA') || agr.includes('JEFE') || agr.includes('DIRECTOR'))

  // ── CPH (Médicos) ──────────────────────────────────────────────────────────
  // "Nueva Carrera Prof. Hosp" (escalafón estable código 22, ver migración
  // 20260902000001_escalafon_normalizacion) es el nombre canónico real de
  // CPH desde Sprint 20 — se agrega ese patrón explícito (detectado
  // verificando en vivo tras el `prisma migrate reset` de Sprint 20: caía al
  // fallback 'CARGO' en vez de 'CPH-*').
  if (esc.includes('MÉDICO') || esc.includes('MEDICO') || esc === 'CPH'
    || esc.includes('CARRERA PROFESIONAL HOSPITALARIA')
    || esc.includes('PROF. HOSP') || esc.includes('PROFESIONAL HOSP')) {
    if (esConduccion && nombrePuesto.includes('DIRECTOR') && nombrePuesto.includes('SUB')) return 'CPH-SD'
    if (esConduccion && nombrePuesto.includes('DIRECTOR'))                                  return 'CPH-D'
    if (esConduccion || unif.includes('JEFATURA') || agr.includes('JEFE')) {
      // Jefe de guardia vs jefe de planta — se determina por la modalidad
      return esPou ? 'CPH-J-POU' : 'CPH-J-POF'
    }
    return esPou ? 'CPH-POU' : 'CPH-POF'
  }

  // ── Enfermería ─────────────────────────────────────────────────────────────
  if (esc.includes('ENFERMER') || esc.includes('ENF')
    || esc.includes('CARRERA ENFERMERÍA') || esc.includes('CARRERA ENFERMERIA')) return 'ENF'

  // ── CEETPS / Técnicos ──────────────────────────────────────────────────────
  if (esc.includes('CEETPS') || esc.includes('TEC')) {
    // Jefatura de un área/depto técnico → prefijo distinguible (como CPH-J-*),
    // para que el filtro "Solo jefes" la reconozca por el código aunque esté
    // vacante (el JCAT que la distinguiría vive en la ocupación, que no existe
    // en un cargo vacante). Agregado en S24 al derivar jefaturas técnicas.
    if (esConduccion) return esPou ? 'TEC-J-POU' : 'TEC-J-POF'
    return esPou ? 'TEC-POU' : 'TEC-POF'
  }

  // ── Escalafón General ──────────────────────────────────────────────────────
  // "Nueva Carrera Administrativa" (escalafón estable código 83) es el
  // nombre canónico real de EG desde Sprint 20 — confirmado contra
  // dotacion-rrhh/Doc/REGLAS_NEGOCIO.MD §13.1 ("83 | Escalafón General" /
  // "83 | Servicios"), detectado en vivo tras el `prisma migrate reset`.
  if (esc.includes('GENERAL') || esc === 'EG' || esc.includes('ADMINISTRATIVA')) {
    if (agr.includes('GERENCIAL') || unif.includes('GERENCIAL')) return 'EG-G'
    if (agr.includes('DIRECTOR') || unif.includes('DIRECTOR'))   return 'EG-D'
    if (agr.includes('JEFE') || unif.includes('JEFE'))           return 'EG-J'
    return 'EG'
  }

  // ── Autoridades Superiores ─────────────────────────────────────────────────
  if (esc.includes('AUTORIDAD') || esc === 'AS') {
    if (agr.includes('MINISTRO') || unif.includes('MINISTRO'))           return 'AS-MIN'
    if (agr.includes('SUBSECRETAR') || unif.includes('SUBSECRETAR'))     return 'AS-SS'
    if (agr.includes('ADJUNTA') || unif.includes('ADJUNTA'))             return 'AS-DGA'
    if (agr.includes('DIRECTOR GENERAL') || unif.includes('DIR. GENERAL')) return 'AS-DG'
    return 'AS-DG'
  }

  // ── Régimen Gerencial ──────────────────────────────────────────────────────
  if (esc.includes('GERENCIAL') || esc === 'RG') return 'RG-CG'

  // ── Suplentes / Residentes / Docentes ──────────────────────────────────────
  if (esc.includes('SUPLENTE') || esc === 'SG')  return 'SG'
  // "RESIDEN" cubre tanto "Residente" como "Residencias" (escalafón estable
  // código 24) — detectado en vivo tras el reset de Sprint 20.
  if (esc.includes('RESIDEN') || esc === 'RES') return 'RES'
  if (esc.includes('DOCENTE') || esc === 'DOC')   return 'DOC'

  // ── Escalafones especiales GCABA ───────────────────────────────────────────
  if (esc.includes('TRANSITORIA') && esc.includes('PLANTA')) return 'PT'
  if (esc.includes('TRANSITORIO') || esc.includes('CUERPO')) return 'CT'
  if (esc.includes('GABINETE'))                              return 'PG'
  if (esc.includes('MODULO') || esc === 'MO' || esc === '16T') return 'MO'
  if (esc.includes('SALUD') && esc.includes('GUARDIA'))      return 'SG'

  return 'CARGO'
}

// ─── Secuencial atómico por prefijo ──────────────────────────────────────────
//
// Busca el máximo número ya usado para ese prefijo en la tabla cargos y
// devuelve el siguiente. Se ejecuta dentro de la transacción del llamador
// para garantizar unicidad incluso con concurrencia.
//
// Formato: {prefijo}-{seq 6 dígitos con ceros a la izquierda}
// Ejemplo: CPH-POU-000001, EG-000042

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export async function siguienteCodigoCargo(
  prefijo: string,
  tx: TxClient,
): Promise<string> {
  const siguiente = (await maxSecuencialCargo(prefijo, tx)) + 1
  return `${prefijo}-${String(siguiente).padStart(6, '0')}`
}

// Igual query que siguienteCodigoCargo pero devuelve solo el número — para
// asignar un lote entero de códigos de un mismo prefijo en memoria (un MAX
// por prefijo distinto, no uno por cargo). Ver aprobarSnapshotService en
// padron.service.ts: con un padrón real de decenas de miles de cargos
// nuevos, llamar siguienteCodigoCargo() cargo por cargo (un SELECT MAX
// completo contra toda la tabla por cada uno) degradaba de ~35s a varios
// minutos — encontrado verificando Sprint 2 con un Excel real de 47k filas
// (2026-08-28). siguienteCodigoCargo() se deja igual para cargos.service.ts
// (S5-10, alta manual, tope 50 por vez — a esa escala el costo es
// irrelevante y no vale la pena tocar ese call site).
export async function maxSecuencialCargo(prefijo: string, tx: TxClient): Promise<number> {
  const rows = await tx.$queryRaw<{ max_seq: number | null }[]>(
    Prisma.sql`
      SELECT MAX(CAST(SUBSTRING(codigo FROM '([0-9]{6})$') AS INTEGER)) AS max_seq
      FROM cargos
      WHERE codigo LIKE ${prefijo + '-%'}
        AND codigo ~ ${'^' + prefijo.replace(/-/g, '\\-') + '-[0-9]{6}$'}
    `
  )
  return rows[0]?.max_seq ?? 0
}

// ─── S18-3: detección ejecución vs conducción + prefijo de remplazante ──────

export const PREFIJOS_CONDUCCION = new Set([
  'CPH-J-POF', 'CPH-J-POU', 'CPH-D', 'CPH-SD',
  'TEC-J-POF', 'TEC-J-POU',
  'EG-J', 'EG-D', 'EG-G', 'RG-CG',
  'AS-MIN', 'AS-SS', 'AS-DG', 'AS-DGA',
])

// Prueba el prefijo del código de más largo a más corto (ej. "CPH-J-POF-000015"
// prueba "CPH-J-POF", "CPH-J", "CPH") porque el secuencial final varía en
// cantidad de segmentos según el prefijo base.
export function esConduccionPorPrefijo(codigo: string | null | undefined): boolean {
  if (!codigo) return false
  const partes = codigo.split('-')
  for (let i = partes.length - 1; i >= 1; i--) {
    const candidato = partes.slice(0, i).join('-')
    if (PREFIJOS_CONDUCCION.has(candidato)) return true
  }
  return false
}

// Fallback para cargos legacy sin código: infiere conducción por el literal
// del puesto.
export function esConduccionPorLiteral(literalPuesto: string | null | undefined): boolean {
  const lit = normStr(literalPuesto)
  return lit.includes('JEFE') || lit.includes('DIRECTOR') ||
         lit.includes('SUB DIRECTOR') || lit.includes('GERENTE')
}

// CPH-POF     → CPH-POF-R
// CPH-J-POF   → CPH-J-POF-TTR
export function prefijoRemplazante(prefijoCargo: string, tipo: 'R' | 'TTR'): string {
  return `${prefijoCargo}-${tipo}`
}
