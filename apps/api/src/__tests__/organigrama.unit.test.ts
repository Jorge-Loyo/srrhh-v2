import { describe, it, expect } from 'vitest'

// ─── Funciones puras extraídas de organigrama.service.ts ──────────────────────
// Se replican acá para testearlas sin importar el módulo completo (arrastra
// Prisma). Si cambian en el service, actualizar acá también.
//
// Contexto: soporte al Excel "Árbol Salud" ORIGINAL (sin curar a mano), que no
// trae las columnas UNIVERSO TOTALIZADOR / REGIMEN EMPLEO y sí trae filas
// TIPO=AREA que no deben cargarse. Ver comentario extenso en
// organigrama.service.ts para el análisis completo (2026-09-14).

function normalizarHeader(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, '_')
}

function esFilaArea(tipo: string | null | undefined): boolean {
  return normalizarHeader(tipo ?? '') === 'area'
}

const HOSPITAL_TIPO_A_UNIVERSO: Record<string, string> = {
  'hospitales de agudos': 'HOSPITALES DE AGUDOS',
  'hospitales monovalentes': 'HOSPITALES MONOVALENTES',
  'hospitales de salud mental': 'HOSPITALES SALUD MENTAL',
  'hospitales de ninos': 'HOSPITALES DE NIÑOS',
}

function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

function inferirUniversoTotalizador(
  sigla: string,
  tipo: string,
  hospitalTipoPorSigla: Map<string, string | null>
): string {
  const hospitalTipo = hospitalTipoPorSigla.get(sigla)
  if (hospitalTipo) {
    const universo = HOSPITAL_TIPO_A_UNIVERSO[normalizarTexto(hospitalTipo)]
    if (universo) return universo
  }
  if (sigla === 'SSAPAC' && tipo.trim().toUpperCase() !== 'SSEC/DIREJE') return 'ATENCION PRIMARIA'
  return 'NIVEL CENTRAL'
}

describe('esFilaArea', () => {
  it('detecta TIPO=AREA sin importar mayúsculas/espacios', () => {
    expect(esFilaArea('AREA')).toBe(true)
    expect(esFilaArea('area')).toBe(true)
    expect(esFilaArea(' Area ')).toBe(true)
  })

  it('no confunde otros tipos parecidos', () => {
    expect(esFilaArea('SDHOS')).toBe(false)
    expect(esFilaArea('DHOS')).toBe(false)
    expect(esFilaArea(null)).toBe(false)
    expect(esFilaArea(undefined)).toBe(false)
    expect(esFilaArea('')).toBe(false)
  })
})

describe('inferirUniversoTotalizador', () => {
  const hospitalesPorSigla = new Map<string, string | null>([
    ['HGACA', 'Hospitales de Agudos'],
    ['HBU', 'Hospitales Monovalentes'],
    ['HEPTA', 'Hospitales de Salud Mental'],
    ['HGNPE', 'Hospitales de Niños'],
    ['SSAPAC', 'SS Atención Primaria / Cesacs y Áreas Programáticas'],
    ['MSGC', 'Unidad de Ministro'],
  ])

  it('usa hospitales.tipo cuando la sigla es un hospital real', () => {
    expect(inferirUniversoTotalizador('HGACA', 'DHOS', hospitalesPorSigla)).toBe('HOSPITALES DE AGUDOS')
    expect(inferirUniversoTotalizador('HBU', 'DHOS', hospitalesPorSigla)).toBe('HOSPITALES MONOVALENTES')
    expect(inferirUniversoTotalizador('HEPTA', 'DHOS', hospitalesPorSigla)).toBe('HOSPITALES SALUD MENTAL')
    expect(inferirUniversoTotalizador('HGNPE', 'DHOS', hospitalesPorSigla)).toBe('HOSPITALES DE NIÑOS')
  })

  it('asigna ATENCION PRIMARIA a los descendientes de SSAPAC, no al nodo de la propia subsecretaría', () => {
    expect(inferirUniversoTotalizador('SSAPAC', 'SSEC/DIREJE', hospitalesPorSigla)).toBe('NIVEL CENTRAL')
    expect(inferirUniversoTotalizador('SSAPAC', 'DEPT', hospitalesPorSigla)).toBe('ATENCION PRIMARIA')
    expect(inferirUniversoTotalizador('SSAPAC', 'UNID', hospitalesPorSigla)).toBe('ATENCION PRIMARIA')
  })

  it('por defecto asigna NIVEL CENTRAL cuando la sigla no es hospital ni SSAPAC', () => {
    expect(inferirUniversoTotalizador('MSGC', 'Ministerio', hospitalesPorSigla)).toBe('NIVEL CENTRAL')
    expect(inferirUniversoTotalizador('SIGLA_DESCONOCIDA', 'DG', hospitalesPorSigla)).toBe('NIVEL CENTRAL')
  })
})

// Replica del tope de items en el mensaje de "pendientes" de
// reemplazarOrganigramaService — si `organigramas` está vacía (ambiente
// nuevo), TODAS las filas del archivo original caerían como pendientes; sin
// tope el mensaje de error sería una lista de miles de items.
function armarMensajePendientes(cantidad: number, historialVacio: boolean): string {
  const TOPE_DETALLE = 25
  const resto = cantidad > TOPE_DETALLE ? ` ... y ${cantidad - TOPE_DETALLE} más.` : ''
  const sugerenciaVacio = historialVacio
    ? ' La tabla "organigramas" está vacía — si es una carga inicial, cargá primero el histórico ya clasificado (script import-organigrama.ts o un Excel ya curado con REGIMEN EMPLEO) antes de usar este endpoint para altas puntuales.'
    : ''
  return `${cantidad} repartición(es)...${resto} ...${sugerenciaVacio}`
}

describe('mensaje de pendientes (tope y aviso de historial vacío)', () => {
  it('no trunca cuando hay pocos pendientes', () => {
    const msg = armarMensajePendientes(3, false)
    expect(msg).not.toContain('más.')
  })

  it('trunca y avisa el resto cuando hay muchos pendientes', () => {
    const msg = armarMensajePendientes(4305, true)
    expect(msg).toContain('4305 repartición')
    expect(msg).toContain('... y 4280 más.')
    expect(msg).toContain('La tabla "organigramas" está vacía')
  })
})
