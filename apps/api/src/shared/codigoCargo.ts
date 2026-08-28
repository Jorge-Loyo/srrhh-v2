import { Prisma } from '@prisma/client'
import { prisma } from './prisma.js'

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
//   Fallback (escalafón desconocido)                → CARGO

function normStr(s: string | null | undefined): string {
  return (s ?? '').trim().toUpperCase()
}

export function prefijoDeCargo(params: {
  escalafon: string | null
  unificadorPuesto: string | null
  agrupador: string | null
}): string {
  const esc  = normStr(params.escalafon)
  const unif = normStr(params.unificadorPuesto)
  const agr  = normStr(params.agrupador)

  // ── CPH (Médicos) ──────────────────────────────────────────────────────────
  if (esc.includes('MÉDICO') || esc.includes('MEDICO') || esc === 'CPH') {
    if (agr.includes('DIRECTOR') && agr.includes('SUB')) return 'CPH-SD'
    if (agr.includes('DIRECTOR'))                         return 'CPH-D'
    if (unif.includes('JEFATURA') || agr.includes('JEFE')) {
      // Jefe de guardia vs jefe de planta — se determina por el unificador
      if (unif.includes('POU') || unif.includes('GUARDIA')) return 'CPH-J-POU'
      return 'CPH-J-POF'
    }
    if (unif.includes('POU') || unif.includes('GUARDIA')) return 'CPH-POU'
    return 'CPH-POF'
  }

  // ── Enfermería ─────────────────────────────────────────────────────────────
  if (esc.includes('ENFERMER') || esc.includes('ENF')) return 'ENF'

  // ── CEETPS / Técnicos ──────────────────────────────────────────────────────
  if (esc.includes('CEETPS') || esc.includes('TEC')) {
    if (unif.includes('POU') || unif.includes('GUARDIA')) return 'TEC-POU'
    return 'TEC-POF'
  }

  // ── Escalafón General ──────────────────────────────────────────────────────
  if (esc.includes('GENERAL') || esc === 'EG') {
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
  if (esc.includes('RESIDENTE') || esc === 'RES') return 'RES'
  if (esc.includes('DOCENTE') || esc === 'DOC')   return 'DOC'

  // ── Escalafones especiales GCABA ───────────────────────────────────────────
  if (esc.includes('TRANSITORIA') && esc.includes('PLANTA')) return 'PT'
  if (esc.includes('TRANSITORIO') || esc.includes('CUERPO')) return 'CT'
  if (esc.includes('GABINETE'))                              return 'PG'

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

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

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
