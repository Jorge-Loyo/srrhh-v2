import { describe, it, expect } from 'vitest'
import { prefijoRemplazante, siguienteCodigoCargo } from '../shared/codigoCargo.js'

// =============================================================================
// Codificación -R- al crear un concurso de retención de cargo
// (SPRINT_tipo_concurso.md D2). Cuando createConcursoTx recibe
// motivoConcurso === 'retencion_de_cargo', recodifica in-place el código del
// cargo del concurso: conserva el prefijo base, le inserta -R- y toma un
// secuencial nuevo del prefijo remplazante (CPH-POF-017530 → CPH-POF-R-000NNN).
//
// Acá se testea la lógica pura de la recodificación (derivación de prefijo +
// guardas de omisión), replicada sin Prisma — mismo criterio que
// bajas.unit.test.ts. El cálculo del secuencial (siguienteCodigoCargo) usa un
// tx mockeado para no tocar BD.
// =============================================================================

// Guarda: solo recodificar si hay código y no está YA recodificado como
// remplazante (-R- / -TTR-). Idéntica al createConcursoTx.
function debeRecodificar(codigo: string | null | undefined): boolean {
  return !!codigo && !/-(R|TTR)-\d{6}$/.test(codigo)
}

// Derivación del prefijo remplazante a partir del código actual del cargo.
// Mismo criterio que retenciones.service.ts::prefijoDelCargo.
function prefijoRemplazanteDeCodigo(codigo: string): string {
  const prefijoBase = codigo.replace(/-\d{6}$/, '')
  return prefijoRemplazante(prefijoBase, 'R')
}

describe('codificación -R- de retención de cargo', () => {
  describe('guarda debeRecodificar', () => {
    it('recodifica un código CPH normal', () => {
      expect(debeRecodificar('CPH-POF-017530')).toBe(true)
      expect(debeRecodificar('CPH-POU-000042')).toBe(true)
    })

    it('NO recodifica un código ya remplazante (-R- / -TTR-)', () => {
      expect(debeRecodificar('CPH-POF-R-000001')).toBe(false)
      expect(debeRecodificar('CPH-J-POF-TTR-000001')).toBe(false)
    })

    it('NO recodifica un cargo sin código (legacy)', () => {
      expect(debeRecodificar(null)).toBe(false)
      expect(debeRecodificar(undefined)).toBe(false)
      expect(debeRecodificar('')).toBe(false)
    })
  })

  describe('derivación del prefijo', () => {
    it('CPH-POF-017530 → prefijo CPH-POF-R', () => {
      expect(prefijoRemplazanteDeCodigo('CPH-POF-017530')).toBe('CPH-POF-R')
    })

    it('conserva un prefijo de conducción (CPH-J-POF)', () => {
      expect(prefijoRemplazanteDeCodigo('CPH-J-POF-000015')).toBe('CPH-J-POF-R')
    })
  })

  describe('código final (secuencial del prefijo remplazante)', () => {
    it('genera CPH-POF-R-000NNN con el siguiente secuencial', async () => {
      // tx mock: MAX actual del prefijo CPH-POF-R es 4 → siguiente 000005.
      const tx = {
        $queryRaw: async () => [{ max_seq: 4 }],
      } as never
      const prefijo = prefijoRemplazanteDeCodigo('CPH-POF-017530')
      const codigo = await siguienteCodigoCargo(prefijo, tx)
      expect(codigo).toBe('CPH-POF-R-000005')
      expect(codigo).toMatch(/-R-\d{6}$/)
    })

    it('arranca en 000001 cuando no hay ninguno previo', async () => {
      const tx = {
        $queryRaw: async () => [{ max_seq: null }],
      } as never
      const codigo = await siguienteCodigoCargo(prefijoRemplazanteDeCodigo('CPH-POF-017548'), tx)
      expect(codigo).toBe('CPH-POF-R-000001')
    })
  })
})
