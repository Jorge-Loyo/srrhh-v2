import { describe, expect, it } from 'vitest'
import { ejecutarRecodificacion, planificarRecodificacion, prefijoAcronimo, type CambioCodigo, type RepoRecodificacion } from './recodificar.js'

// Fixtures sintéticas: códigos inventados.
describe('planificarRecodificacion', () => {
  it('el acrónimo reemplaza el prefijo y conserva el número', () => {
    const p = planificarRecodificacion([
      { id: 'a', codigo: 'CPH-POF-000123', acronimo: 'CPH-P' },
      { id: 'b', codigo: 'TEC-POU-000007', acronimo: 'TEC' },
    ])
    expect(p.cambios).toEqual([
      { id: 'a', desde: 'CPH-POF-000123', hasta: 'CPH-P-000123' },
      { id: 'b', desde: 'TEC-POU-000007', hasta: 'TEC-000007' },
    ])
    expect(p.colisiones).toBe(0)
  })

  it('los reemplazantes llevan R- adelante (CPH-POU-R-000123 -> R-CPH-G-000123)', () => {
    const p = planificarRecodificacion([{ id: 'a', codigo: 'CPH-POU-R-000123', acronimo: 'CPH-G' }])
    expect(p.cambios[0].hasta).toBe('R-CPH-G-000123')
  })

  it('colisión: dos prefijos viejos que se fusionan; uno conserva el número y el otro recibe el siguiente libre', () => {
    const p = planificarRecodificacion([
      { id: 'a', codigo: 'CPH-POF-000005', acronimo: 'CPH-P' },
      { id: 'b', codigo: 'CPH-POU-000005', acronimo: 'CPH-P' },
      { id: 'c', codigo: 'CPH-POF-000009', acronimo: 'CPH-P' },
    ])
    expect(p.colisiones).toBe(1)
    const porId = Object.fromEntries(p.cambios.map((c) => [c.id, c.hasta]))
    expect(porId.a).toBe('CPH-P-000005') // conserva el de menor código
    expect(porId.b).toBe('CPH-P-000010') // siguiente libre del acrónimo
    expect(porId.c).toBe('CPH-P-000009')
    expect(new Set(Object.values(porId)).size).toBe(3)
  })

  it('colisión con un código que ya tiene el acrónimo nuevo: ese lo conserva', () => {
    const p = planificarRecodificacion([
      { id: 'nuevo', codigo: 'CPH-P-000005', acronimo: 'CPH-P' },
      { id: 'viejo', codigo: 'CPH-POF-000005', acronimo: 'CPH-P' },
    ])
    expect(p.cambios).toEqual([{ id: 'viejo', desde: 'CPH-POF-000005', hasta: 'CPH-P-000006' }])
  })

  it('un código ocupado por un cargo que se va a recodificar no bloquea al otro', () => {
    const p = planificarRecodificacion([
      { id: 'x', codigo: 'CPH-P-000005', acronimo: 'CPH-G' }, // se va a CPH-G-000005
      { id: 'y', codigo: 'CPH-POF-000005', acronimo: 'CPH-P' }, // toma CPH-P-000005
    ])
    expect(p.colisiones).toBe(0)
    expect(Object.fromEntries(p.cambios.map((c) => [c.id, c.hasta]))).toEqual({ x: 'CPH-G-000005', y: 'CPH-P-000005' })
  })

  it('es idempotente: con los códigos ya recodificados no hay cambios', () => {
    const entrada = [
      { id: 'a', codigo: 'CPH-POF-000005', acronimo: 'CPH-P' },
      { id: 'b', codigo: 'CPH-POU-000005', acronimo: 'CPH-P' },
      { id: 'c', codigo: 'CPH-POU-R-000008', acronimo: 'CPH-G' },
    ]
    const p1 = planificarRecodificacion(entrada)
    const aplicadas = entrada.map((e) => ({ ...e, codigo: p1.cambios.find((c) => c.id === e.id)?.hasta ?? e.codigo }))
    expect(planificarRecodificacion(aplicadas).cambios).toEqual([])
  })

  it('sin regla (-TTR-, formato raro o sin acrónimo) no se toca y se informa el prefijo', () => {
    const p = planificarRecodificacion([
      { id: 'a', codigo: 'CPH-TTR-000001', acronimo: 'CPH-P' },
      { id: 'b', codigo: 'ENF-11211', acronimo: 'ENF' },
      { id: 'c', codigo: 'XYZ-000002', acronimo: null },
    ])
    expect(p.cambios).toEqual([])
    expect(p.sin_regla['XYZ']).toBe(1)
  })

  it('al terminar no queda ningún prefijo viejo conocido', () => {
    const viejos = ['CPH-POF', 'CPH-POU', 'TEC-POF', 'TEC-POU']
    const entrada = viejos.map((v, i) => ({ id: `i${i}`, codigo: `${v}-00000${i + 1}`, acronimo: v.startsWith('CPH') ? 'CPH-P' : 'TEC' }))
    const p = planificarRecodificacion(entrada)
    for (const c of p.cambios) expect(viejos.some((v) => c.hasta.startsWith(v))).toBe(false)
  })

  it('prefijoAcronimo quita R- y el número', () => {
    expect(prefijoAcronimo('R-CPH-G-000123')).toBe('CPH-G')
    expect(prefijoAcronimo('ENF-11211')).toBeNull()
  })
})

describe('ejecutarRecodificacion', () => {
  it('libera todos los códigos antes de asignar los nuevos (evita choques de unicidad)', async () => {
    const orden: string[] = []
    const repo: RepoRecodificacion = {
      leerCodigos: async () => [
        { id: 'x', codigo: 'CPH-P-000005' },
        { id: 'y', codigo: 'CPH-POF-000005' },
      ],
      liberarCodigos: async (ids) => void orden.push(`liberar:${ids.join(',')}`),
      asignarCodigos: async (l: CambioCodigo[]) => void orden.push(`asignar:${l.map((c) => c.hasta).join(',')}`),
    }
    const plan = await ejecutarRecodificacion(repo, new Map([['x', 'CPH-G'], ['y', 'CPH-P']]), 1)
    expect(plan.cambios).toHaveLength(2)
    expect(orden.slice(0, 2).every((o) => o.startsWith('liberar'))).toBe(true)
    expect(orden.slice(2).every((o) => o.startsWith('asignar'))).toBe(true)
  })
})

describe('marca de reemplazante: la decide el Excel', () => {
  it('Excel con R-: un cargo sin marca en el sistema pasa a R- adelante', () => {
    const p = planificarRecodificacion([{ id: 'a', codigo: 'CPH-POU-000010', acronimo: 'CPH-G', reemplazante: true }])
    expect(p.cambios[0].hasta).toBe('R-CPH-G-000010')
  })
  it('Excel sin R-: el sistema lo tenia como reemplazo (sufijo -R- o R- adelante) y la marca se quita', () => {
    const p = planificarRecodificacion([
      { id: 'a', codigo: 'CPH-POF-R-000011', acronimo: 'CPH-P', reemplazante: false },
      { id: 'b', codigo: 'R-CPH-P-000012', acronimo: 'CPH-P', reemplazante: false },
    ])
    expect(p.cambios.map((c) => c.hasta)).toEqual(['CPH-P-000011', 'CPH-P-000012'])
  })
  it('la quita de R- que choca con un cargo existente recibe el siguiente numero libre', () => {
    const p = planificarRecodificacion([
      { id: 'a', codigo: 'CPH-P-000011', acronimo: 'CPH-P', reemplazante: false },
      { id: 'b', codigo: 'R-CPH-P-000011', acronimo: 'CPH-P', reemplazante: false },
    ])
    expect(p.colisiones).toBe(1)
    expect(p.cambios).toEqual([{ id: 'b', desde: 'R-CPH-P-000011', hasta: 'CPH-P-000012' }])
  })
  it('re-ejecucion sobre la base ya cargada: 2a corrida recodifica, 3a da 0 cambios', async () => {
    let codigos = [
      { id: 'g', codigo: 'CPH-G-000001' }, // Excel R-CPH-G
      { id: 'p', codigo: 'R-CPH-P-000002' }, // Excel CPH-P
      { id: 'q', codigo: 'CPH-P-000003' }, // Excel CPH-P (sin cambio)
    ]
    const repo: RepoRecodificacion = {
      leerCodigos: async () => codigos,
      liberarCodigos: async () => undefined,
      asignarCodigos: async (l) => {
        codigos = codigos.map((c) => ({ ...c, codigo: l.find((x) => x.id === c.id)?.hasta ?? c.codigo }))
      },
    }
    const mapa = new Map<string, string | null>([['g', 'R-CPH-G'], ['p', 'CPH-P'], ['q', 'CPH-P']])
    expect((await ejecutarRecodificacion(repo, mapa)).cambios).toHaveLength(2)
    expect(codigos.map((c) => c.codigo)).toEqual(['R-CPH-G-000001', 'CPH-P-000002', 'CPH-P-000003'])
    expect((await ejecutarRecodificacion(repo, mapa)).cambios).toHaveLength(0)
  })
})
