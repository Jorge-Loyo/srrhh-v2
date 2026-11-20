import { Prisma, PrismaClient } from '@prisma/client'
import { acronimoMsgc } from './acronimoMsgc.js'
import { nomenclaturaCodigoCargo } from './nomenclaturaCodigo.js'

// ─── Prefijos = acrónimos del Excel MSGC (hoja Criterios) ────────────────────
//
// Con NOMENCLATURA_CODIGO_CARGO=msgc el prefijo del código de un cargo NUEVO es el acrónimo MSGC (shared/acronimoMsgc.ts):
//   CPH-P, CPH-G, CPH-J-POF, CPH-J-POU, CPH-D, CPH-SD, ENF, ENF-J, TEC, TEC-J, EG, EG-J,
//   SGAII, AS, GER, DOC, SG, PEP, PGAB, RB, RPB, RES-J, RM.
// Reemplazantes: `R-` ADELANTE (R-CPH-G-000123); retención temporal `TTR-` adelante.
// Escalafones sin acrónimo (PT, CT, RES genérico, fallback CARGO) conservan el prefijo histórico.
//
// INTERRUPTOR (NOMENCLATURA_CODIGO_CARGO, shared/nomenclaturaCodigo.ts): este generador (`msgc`) NO debe
// activarse en producción antes que la base recodificada (CPH-POF/POU -> CPH-P/CPH-G, etc.). El default es
// `legacy` (generador anterior, ver prefijoDeCargoLegacy): con `jorge` desplegado y la base actual, nada cambia.
// La base nueva requiere NOMENCLATURA_CODIGO_CARGO=msgc. Ver Doc/Desarrollo/DEPLOY_PRODUCCION.md §8.
//
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

export interface ParamsPrefijoCargo {
  escalafon: string | null
  /** Literal del puesto (texto libre del cargo). Reemplaza agrupador/unificadorPuesto. */
  literalPuesto?: string | null
  puestoCargo?: PuestoCargoResuelto | null
  // Jefe de Departamento/División/Sección/Unidad de CPH: el catálogo no
  // distingue Planta/Guardia para estos 4 puestos (modalidad='ambos'). Heurística
  // confirmada contra los 2512 cargos existentes: con especialidad asignada →
  // Planta, sin especialidad → Guardia. Solo se usa como último fallback.
  tieneEspecialidad?: boolean
  // Código de registro (carrera) del cargo, si el llamador lo conoce ('37', '87',
  // '85', '83', '24', ...). Tiene prioridad sobre el inferido del nombre del escalafón.
  codigoRegistro?: string | null
  // El cargo es una línea del árbol (organigrama). Por defecto se asume que una
  // conducción (puesto de conducción / jefe / director) sí lo es; derivarCargosConduccion
  // lo pasa explícito. Un jefe sin línea de árbol es cargo de ejecución (CPH-P / CPH-G).
  tieneLineaArbol?: boolean
}

/**
 * Prefijo del código de un cargo NUEVO. Elige el generador según NOMENCLATURA_CODIGO_CARGO
 * (shared/nomenclaturaCodigo.ts): `legacy` (default; CPH-POF/POU, TEC-POF/POU, RG-CG, AS-MIN, ...) o
 * `msgc` (acrónimos del Excel MSGC). Todos los llamadores pasan por acá.
 */
export function prefijoDeCargo(params: ParamsPrefijoCargo): string {
  return nomenclaturaCodigoCargo() === 'msgc' ? prefijoDeCargoMsgc(params) : prefijoDeCargoLegacy(params)
}

/** Generador con acrónimos MSGC (FEAT-004). Solo con NOMENCLATURA_CODIGO_CARGO=msgc (base ya recodificada). */
export function prefijoDeCargoMsgc(params: ParamsPrefijoCargo): string {
  const esc = normStr(params.escalafon)
  const lit = normStr(params.literalPuesto)
  const pc  = params.puestoCargo

  const nombrePc = normStr(pc?.nombre)
  const esGuardiaPorNombre = nombrePc.includes('GUARDIA') || lit.includes('GUARDIA')
  const esPou = esGuardiaPorNombre || (pc ? pc.modalidad === 'pou' : lit.includes('POU'))

  const nombrePuesto = pc ? normStr(pc.nombre) : lit
  const esConduccion = pc ? pc.tipoPuesto === 'conduccion' : (lit.includes('JEFATURA') || lit.includes('JEFE') || lit.includes('DIRECTOR'))

  const cr = params.codigoRegistro?.trim() ? params.codigoRegistro.trim().toUpperCase() : crDesdeEscalafon(esc)

  if (cr !== null) {
    const litPuesto = pc ? pc.nombre : (params.literalPuesto ?? '')
    let acron: string | null = null
    if (cr === '37' || cr === '22') {
      const esDirector = esConduccion && nombrePuesto.includes('DIRECTOR')
      const esSub = esDirector && nombrePuesto.includes('SUB')
      const esJefe = !esDirector && (esConduccion || lit.includes('JEFATURA') || lit.includes('JEFE'))
      let planta: string = esPou ? 'Guardia' : 'Planta'
      if (esJefe && !esGuardiaPorNombre && pc?.modalidad === 'ambos' && params.tieneEspecialidad !== undefined) {
        planta = params.tieneEspecialidad ? 'Planta' : 'Guardia'
      }
      acron = acronimoMsgc({
        cr,
        literalPuesto: litPuesto,
        plantaGuardia: planta,
        nivelConduccion: esSub ? 'SDHOS' : esDirector ? 'DHOS' : esJefe ? 'SECC' : '',
        tieneLineaArbol: params.tieneLineaArbol ?? (esDirector || esJefe),
      })
    } else {
      const conduccionExtendida = esConduccion || lit.includes('JEFE') || lit.includes('JEFATURA') || lit.includes('GERENCIAL')
      acron = acronimoMsgc({
        cr,
        literalPuesto: litPuesto,
        plantaGuardia: null,
        nivelConduccion: '',
        tieneLineaArbol: params.tieneLineaArbol ?? conduccionExtendida,
      })
    }
    if (acron !== null) return acron
  }
  return prefijoLegacy(esc)
}

// Código de registro (carrera) inferido del nombre del escalafón, para los llamadores que
// no tienen el CR a mano. null = escalafón sin acrónimo MSGC (se usa prefijoLegacy).
function crDesdeEscalafon(esc: string): string | null {
  if (esc.includes('MEDICO') || esc === 'CPH' || esc.includes('CARRERA PROFESIONAL HOSPITALARIA')
    || esc.includes('PROF. HOSP') || esc.includes('PROFESIONAL HOSP')) return '37'
  if (esc.includes('ENFERMER') || esc.includes('ENF')) return '87'
  if (esc.includes('CEETPS') || esc.includes('TEC')) return '85'
  if (esc.includes('GENERAL') || esc === 'EG' || esc.includes('ADMINISTRATIVA')) return '83'
  if (esc.includes('AUTORIDAD') || esc === 'AS') return '25'
  if (esc.includes('GERENCIAL') || esc === 'RG') return '60'
  if (esc.includes('SUPLENTE') || esc === 'SG') return '23'
  if (esc.includes('RESIDEN') || esc === 'RES') return '24'
  if (esc.includes('DOCENTE') || esc === 'DOC') return '07'
  if (esc.includes('GABINETE')) return '17'
  if (esc.includes('MODULAR EXTRAORDINARIO') || esc === 'RME' || esc === '17B') return '17B'
  if (esc.includes('MODULO') || esc === 'MO' || esc === '16T') return '16T'
  if (esc.includes('SALUD') && esc.includes('GUARDIA')) return '23'
  return null
}

// Escalafones SIN acrónimo en el Excel MSGC (plantas transitorias, cuerpo, residentes sin
// literal Básica/Post-básica, etc.): se conserva el prefijo histórico. Ver fase2/consumidores-prefijos.md.
function prefijoLegacy(esc: string): string {
  if (esc.includes('RESIDEN') || esc === 'RES') return 'RES'
  if (esc.includes('TRANSITORIA') && esc.includes('PLANTA')) return 'PT'
  if (esc.includes('TRANSITORIO') || esc.includes('CUERPO')) return 'CT'
  return 'CARGO'
}

// ─── Generador ANTERIOR (nomenclatura legacy) ────────────────────────────────
//
// Es el generador previo a FEAT-004, sin cambios de lógica (ignora `codigoRegistro` y `tieneLineaArbol`).
// Es el default (NOMENCLATURA_CODIGO_CARGO=legacy): produce los prefijos que tiene hoy la base de
// producción (CPH-POF/POU, TEC-POF/POU, RG-CG, AS-MIN/SS/DG/DGA, RES, PT, CT, PG, RME, MO).
// Retirar cuando la base nueva (recodificada) esté en producción y se haya pasado a `msgc`.
export function prefijoDeCargoLegacy(params: ParamsPrefijoCargo): string {
  const esc = normStr(params.escalafon)
  const lit = normStr(params.literalPuesto)
  const pc  = params.puestoCargo
  const nombrePc = normStr(pc?.nombre)
  const esGuardiaPorNombre = nombrePc.includes('GUARDIA') || lit.includes('GUARDIA')
  const esPou = esGuardiaPorNombre || (pc ? pc.modalidad === 'pou' : lit.includes('POU'))
  const nombrePuesto = pc ? normStr(pc.nombre) : lit
  const esConduccion = pc ? pc.tipoPuesto === 'conduccion' : (lit.includes('JEFATURA') || lit.includes('JEFE') || lit.includes('DIRECTOR'))

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
    if (esConduccion || lit.includes('JEFATURA') || lit.includes('JEFE')) {
      if (esPou) return 'CPH-J-POU'
      if (!esGuardiaPorNombre && pc?.modalidad === 'ambos' && params.tieneEspecialidad !== undefined) {
        return params.tieneEspecialidad ? 'CPH-J-POF' : 'CPH-J-POU'
      }
      return 'CPH-J-POF'
    }
    return esPou ? 'CPH-POU' : 'CPH-POF'
  }

  // ── Enfermería ─────────────────────────────────────────────────────────────
  if (esc.includes('ENFERMER') || esc.includes('ENF')
    || esc.includes('CARRERA ENFERMERÍA') || esc.includes('CARRERA ENFERMERIA')) return 'ENF'

  // ── CEETPS / Técnicos ──────────────────────────────────────────────────────
  if (esc.includes('CEETPS') || esc.includes('TEC')) {
    if (esConduccion) return esPou ? 'TEC-J-POU' : 'TEC-J-POF'
    return esPou ? 'TEC-POU' : 'TEC-POF'
  }

  // ── Escalafón General ──────────────────────────────────────────────────────
  // "Nueva Carrera Administrativa" (escalafón estable código 83) es el
  // nombre canónico real de EG desde Sprint 20 — confirmado contra
  // dotacion-rrhh/Doc/REGLAS_NEGOCIO.MD §13.1 ("83 | Escalafón General" /
  // "83 | Servicios"), detectado en vivo tras el `prisma migrate reset`.
  if (esc.includes('GENERAL') || esc === 'EG' || esc.includes('ADMINISTRATIVA')) {
    if (lit.includes('GERENCIAL'))                                        return 'EG-G'
    if (lit.includes('DIRECTOR'))                                         return 'EG-D'
    if (lit.includes('JEFE'))                                             return 'EG-J'
    return 'EG'
  }

  // ── Autoridades Superiores ─────────────────────────────────────────────────
  if (esc.includes('AUTORIDAD') || esc === 'AS') {
    if (lit.includes('MINISTRO'))                                         return 'AS-MIN'
    if (lit.includes('SUBSECRETAR'))                                      return 'AS-SS'
    if (lit.includes('ADJUNTA'))                                          return 'AS-DGA'
    if (lit.includes('DIRECTOR GENERAL') || lit.includes('DIR. GENERAL')) return 'AS-DG'
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
  // Régimen Modular Extraordinario PG (código de registro 17B). Antes caía al
  // fallback 'CARGO' porque "MODULAR" no matchea "MODULO"; su nomenclatura
  // propia es RME. Va antes de la rama MODULO para no confundirse con ella.
  if (esc.includes('MODULAR EXTRAORDINARIO') || esc === 'RME' || esc === '17B') return 'RME'
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

// Acrónimos MSGC de conducción + prefijos históricos (se conservan para detectar cargos aún no recodificados).
export const PREFIJOS_CONDUCCION = new Set([
  // MSGC
  'CPH-J-POF', 'CPH-J-POU', 'CPH-D', 'CPH-SD', 'ENF-J', 'TEC-J', 'EG-J', 'GER', 'AS', 'RES-J',
  // históricos
  'TEC-J-POF', 'TEC-J-POU', 'EG-D', 'EG-G', 'RG-CG', 'AS-MIN', 'AS-SS', 'AS-DG', 'AS-DGA',
])

// Prueba el prefijo del código de más largo a más corto (ej. "CPH-J-POF-000015"
// prueba "CPH-J-POF", "CPH-J", "CPH"). Ignora el `R-` / `TTR-` adelante de los remplazantes
// y el `-R` / `-TTR` sufijo histórico.
export function esConduccionPorPrefijo(codigo: string | null | undefined): boolean {
  if (!codigo) return false
  const partes = codigo.replace(/^(R|TTR)-/, '').split('-')
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

// CPH-P   → R-CPH-P     (reemplazante)
// CPH-J-POF → TTR-CPH-J-POF (retención temporal)
//   (msgc: `R-CPH-P`, `TTR-CPH-J-POF`, prefijo ADELANTE; legacy: `CPH-POF-R`, `CPH-J-POF-TTR`, sufijo)
export function prefijoRemplazante(prefijoCargo: string, tipo: 'R' | 'TTR'): string {
  return nomenclaturaCodigoCargo() === 'msgc' ? `${tipo}-${prefijoCargo}` : `${prefijoCargo}-${tipo}`
}
