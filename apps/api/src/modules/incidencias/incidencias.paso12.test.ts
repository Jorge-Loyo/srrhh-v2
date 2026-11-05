import { describe, it, expect } from 'vitest'
import {
  construirIncidencias,
  factsPaso12DeHecho,
  type HechoPaso12Row,
} from './incidencias.paso12.js'

// Factory de fila cruda (HechoPaso12Row). Default = cargo gestionable vivo,
// ocupado, SIN ningún cambio → 0 incidencias.
const row = (over: Partial<HechoPaso12Row> = {}): HechoPaso12Row => ({
  cargo_id: 'cargo-1',
  id_sial: '001788157',
  id_sial_rol: '001788157-1',
  estado: 'vigente',
  tiene_ocupante_vigente: true,
  ausente_ultimo_padron: false,
  en_baja_sial: false,
  en_baja_sial_nueva: false,
  presente_periodo_anterior: false,
  situacion_revista_ant: null,
  situacion_revista_nue: null,
  cambio_puesto_diff: false,
  puesto_cargo_id_ant: null,
  puesto_cargo_id_nue: null,
  especialidad_puesto_id_ant: null,
  especialidad_puesto_id_nue: null,
  literal_puesto_ant: null,
  literal_puesto_nue: null,
  especialidad_ant: null,
  especialidad_nue: null,
  cuil_ant: null,
  cuil_nue: null,
  tipo_origen: null,
  cargo_retenido_id: null,
  ...over,
})

// Construye las incidencias de UN cargo a partir de su fila cruda. `esReaparicion`
// emula el conjunto aRechazarBaja del paso 4.
function incidenciasDe(r: HechoPaso12Row, esReaparicion = false) {
  const h = factsPaso12DeHecho(r, esReaparicion)
  return construirIncidencias([r], [h], 'snap-1')
}

describe('construirIncidencias (orquestador puro del paso 12)', () => {
  it('un cargo sin cambios no emite ninguna incidencia', () => {
    expect(incidenciasDe(row())).toHaveLength(0)
  })

  it('un cambio de situación de revista emite 1 fila con la foto ant/nue', () => {
    const out = incidenciasDe(
      row({ situacion_revista_ant: 'activo', situacion_revista_nue: 'retencion de cargo' }),
    )
    expect(out).toHaveLength(1)
    expect(out[0]!.tipo).toBe('cambio-situacion-revista')
    expect(out[0]!.cargoId).toBe('cargo-1')
    expect(out[0]!.idSialRol).toBe('001788157-1')
    expect(out[0]!.estadoAnterior).toEqual({ situacionRevista: 'activo' })
    expect(out[0]!.estadoNuevo).toEqual({ situacionRevista: 'retencion de cargo' })
  })

  it('marca "elegible para reemplazante" en el detalle cuando corresponde', () => {
    const out = incidenciasDe(
      row({
        situacion_revista_ant: 'activo',
        situacion_revista_nue: 'retencion de cargo',
        tipo_origen: 'R',
        cargo_retenido_id: 'cargo-base',
      }),
    )
    expect(out).toHaveLength(1)
    expect(out[0]!.detalle).toContain('elegible para reemplazante')
  })

  it('un cargo que cumple dos tipos a la vez (3 y 5) emite 2 filas', () => {
    const out = incidenciasDe(
      row({
        presente_periodo_anterior: true,
        ausente_ultimo_padron: true,
        tiene_ocupante_vigente: false,
        cambio_puesto_diff: true,
      }),
    )
    const tipos = out.map((i) => i.tipo).sort()
    expect(tipos).toEqual(['cambios-del-puesto', 'cayo-del-padron'])
  })

  it('cambios del puesto: detalle distingue puesto vs especialidad', () => {
    const porPuesto = incidenciasDe(row({ puesto_cargo_id_ant: 'p1', puesto_cargo_id_nue: 'p2' }))
    expect(porPuesto).toHaveLength(1)
    expect(porPuesto[0]!.tipo).toBe('cambios-del-puesto')
    expect(porPuesto[0]!.detalle).toBe('cambio puesto')

    const porEsp = incidenciasDe(
      row({ especialidad_puesto_id_ant: 'e1', especialidad_puesto_id_nue: 'e2' }),
    )
    expect(porEsp[0]!.detalle).toBe('cambio especialidad')
  })

  it('nueva baja (6a) emite estadoAnterior Json null', () => {
    const out = incidenciasDe(
      row({ en_baja_sial_nueva: true, estado: 'vigente', tiene_ocupante_vigente: true }),
    )
    expect(out).toHaveLength(1)
    expect(out[0]!.tipo).toBe('otras:nueva-baja')
  })

  it('cambio de persona (6b) lleva los dos CUILs', () => {
    const out = incidenciasDe(
      row({ tiene_ocupante_vigente: true, cuil_ant: '20111111113', cuil_nue: '27222222228' }),
    )
    expect(out).toHaveLength(1)
    expect(out[0]!.tipo).toBe('otras:cambio-persona')
    expect(out[0]!.estadoAnterior).toEqual({ cuil: '20111111113' })
    expect(out[0]!.estadoNuevo).toEqual({ cuil: '27222222228' })
  })

  it('reapareció (6c) se emite cuando el cargo está en aRechazarBaja', () => {
    const out = incidenciasDe(row(), true)
    expect(out).toHaveLength(1)
    expect(out[0]!.tipo).toBe('otras:reaparecio')
  })

  it('cada fila lleva snapshotId y un id único', () => {
    const out = incidenciasDe(
      row({
        presente_periodo_anterior: true,
        ausente_ultimo_padron: true,
        tiene_ocupante_vigente: false,
        cambio_puesto_diff: true,
      }),
    )
    expect(out.every((i) => i.snapshotId === 'snap-1')).toBe(true)
    expect(new Set(out.map((i) => i.id)).size).toBe(out.length)
  })

  it('procesa varios cargos en una sola pasada', () => {
    const rows = [
      row({ cargo_id: 'a', situacion_revista_ant: 'activo', situacion_revista_nue: 'comision' }),
      row({ cargo_id: 'b' }), // sin cambios
    ]
    const hechos = rows.map((r) => factsPaso12DeHecho(r, false))
    const out = construirIncidencias(rows, hechos, 'snap-1')
    expect(out).toHaveLength(1)
    expect(out[0]!.cargoId).toBe('a')
  })
})
