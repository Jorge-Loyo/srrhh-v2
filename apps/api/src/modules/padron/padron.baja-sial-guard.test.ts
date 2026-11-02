import { describe, it, expect } from 'vitest'
import { evaluarBajaSialRequerida } from './padron.diff.helpers.js'

// Guarda contra padrón aprobado sin la baja SIAL de la semana: la métrica es
// pura (sin Prisma/env), se testea como el resto de los helpers del diff. El
// override (que salta el bloqueo) se modela en el call site — acá se verifica
// que la función MARQUE que falta la baja SIAL para que ese bloqueo exista.
const VENTANA = 7

// Fecha UTC a medianoche (como @db.Date / fecha_archivo), para que la ventana
// se mida en días exactos sin corrimientos por hora local.
const fecha = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

describe('evaluarBajaSialRequerida', () => {
  const fechaPadron = fecha('2026-10-25')

  it('exigir=false → nunca falta (la guarda no aplica)', () => {
    const r = evaluarBajaSialRequerida(fechaPadron, [], false, VENTANA)
    expect(r.falta).toBe(false)
    expect(r.advertencia).toBeNull()
  })

  it('hay baja SIAL dentro de la ventana → falta=false', () => {
    // 3 días antes del padrón, dentro de ±7
    const r = evaluarBajaSialRequerida(fechaPadron, [fecha('2026-10-22')], true, VENTANA)
    expect(r.falta).toBe(false)
    expect(r.advertencia).toBeNull()
  })

  it('hay baja SIAL justo en el borde de la ventana (±7 días) → falta=false', () => {
    const r = evaluarBajaSialRequerida(
      fechaPadron,
      [fecha('2026-11-01')], // exactamente +7 días
      true,
      VENTANA,
    )
    expect(r.falta).toBe(false)
  })

  it('NO hay baja SIAL dentro de la ventana → falta=true con advertencia no nula', () => {
    // 10 días antes, fuera de ±7
    const r = evaluarBajaSialRequerida(fechaPadron, [fecha('2026-10-15')], true, VENTANA)
    expect(r.falta).toBe(true)
    expect(r.advertencia).not.toBeNull()
    expect(r.advertencia).toContain('2026-10-25')
  })

  it('ventana=0 exige fecha exacta: una fecha a 1 día NO satisface', () => {
    const r = evaluarBajaSialRequerida(fechaPadron, [fecha('2026-10-26')], true, 0)
    expect(r.falta).toBe(true)
    expect(r.advertencia).not.toBeNull()
  })

  it('ventana=0 exige fecha exacta: la misma fecha SÍ satisface', () => {
    const r = evaluarBajaSialRequerida(fechaPadron, [fecha('2026-10-25')], true, 0)
    expect(r.falta).toBe(false)
    expect(r.advertencia).toBeNull()
  })

  it('lista vacía de fechas con exigir=true → falta=true', () => {
    const r = evaluarBajaSialRequerida(fechaPadron, [], true, VENTANA)
    expect(r.falta).toBe(true)
    expect(r.advertencia).not.toBeNull()
  })

  it('varias fechas, una dentro de la ventana → falta=false', () => {
    const r = evaluarBajaSialRequerida(
      fechaPadron,
      [fecha('2026-09-01'), fecha('2026-10-20'), fecha('2026-12-31')],
      true,
      VENTANA,
    )
    expect(r.falta).toBe(false)
  })
})
