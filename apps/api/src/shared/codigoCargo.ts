import { Prisma, PrismaClient } from '@prisma/client'
import { acronimoMsgc } from './acronimoMsgc.js'

// ─── Prefijos = acrónimos del Excel MSGC (hoja Criterios) ────────────────────
//
// El prefijo del código de un cargo NUEVO es el acrónimo MSGC (shared/acronimoMsgc.ts):
//   CPH-P, CPH-G, CPH-J-POF, CPH-J-POU, CPH-D, CPH-SD, ENF, ENF-J, TEC, TEC-J, EG, EG-J,
//   SGAII, AS, GER, DOC, SG, PEP, PGAB, RB, RPB, RES-J, RM.
// Reemplazantes: `R-` ADELANTE (R-CPH-G-000123); retención temporal `TTR-` adelante.
// Escalafones sin acrónimo (PT, CT, RES genérico, fallback CARGO) conservan el prefijo histórico.
//
// ADVERTENCIA DE DESPLIEGUE: este generador NO debe llegar a producción antes que los datos
// recodificados (CPH-POF/POU -> CPH-P/CPH-G, etc.); se despliega junto con la base nueva.
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

export function prefijoDeCargo(params: {
  escalafon: string | null
  unificadorPuesto: string | null
  agrupador: string | null
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
}): string {
  const esc  = normStr(params.escalafon)
  const unif = normStr(params.unificadorPuesto)
  const agr  = normStr(params.agrupador)
  const pc   = params.puestoCargo

  // POU (guardia) vs POF (planta). "guardia" en el NOMBRE del puesto o en el
  // unificador manda SIEMPRE, aunque el catálogo tenga el puesto mal cargado
  // como modalidad 'pof' (bug histórico del import).
  const nombrePc = normStr(pc?.nombre)
  const esGuardiaPorNombre = nombrePc.includes('GUARDIA') || unif.includes('GUARDIA')
  const esPou = esGuardiaPorNombre || (pc ? pc.modalidad === 'pou' : unif.includes('POU'))

  // Nombre canónico del catálogo cuando está disponible — más confiable que
  // el agrupador de texto libre del Excel para distinguir Director/Jefe.
  const nombrePuesto = pc ? normStr(pc.nombre) : agr
  const esConduccion = pc ? pc.tipoPuesto === 'conduccion' : (unif.includes('JEFATURA') || agr.includes('JEFE') || agr.includes('DIRECTOR'))

  const cr = params.codigoRegistro?.trim() ? params.codigoRegistro.trim().toUpperCase() : crDesdeEscalafon(esc)

  if (cr !== null) {
    const literalPuesto = pc ? pc.nombre : (params.agrupador ?? '')
    let acron: string | null = null
    if (cr === '37' || cr === '22') {
      // CPH: la jerarquía sale del nombre del puesto; Planta/Guardia de la modalidad.
      const esDirector = esConduccion && nombrePuesto.includes('DIRECTOR')
      const esSub = esDirector && nombrePuesto.includes('SUB')
      const esJefe = !esDirector && (esConduccion || unif.includes('JEFATURA') || agr.includes('JEFE'))
      let planta: string = esPou ? 'Guardia' : 'Planta'
      // Fallback: jefatura con catálogo sin resolver (modalidad='ambos', sin "guardia" en el
      // nombre) — heurística de especialidad. Sin ningún dato, Planta (CPH-J-POF).
      if (esJefe && !esGuardiaPorNombre && pc?.modalidad === 'ambos' && params.tieneEspecialidad !== undefined) {
        planta = params.tieneEspecialidad ? 'Planta' : 'Guardia'
      }
      acron = acronimoMsgc({
        cr,
        literalPuesto,
        plantaGuardia: planta,
        nivelConduccion: esSub ? 'SDHOS' : esDirector ? 'DHOS' : esJefe ? 'SECC' : '',
        tieneLineaArbol: params.tieneLineaArbol ?? (esDirector || esJefe),
      })
    } else {
      const conduccionExtendida =
        esConduccion || agr.includes('JEFE') || unif.includes('JEFE') || unif.includes('JEFATURA')
        || agr.includes('GERENCIAL') || unif.includes('GERENCIAL')
      acron = acronimoMsgc({
        cr,
        literalPuesto,
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
export function prefijoRemplazante(prefijoCargo: string, tipo: 'R' | 'TTR'): string {
  return `${tipo}-${prefijoCargo}`
}
