import { describe, it, expect } from 'vitest'
import {
  toISO,
  stripCompletado,
  esCompletado,
  esCampoFechaOcupacion,
  evaluarCampoFecha,
  categoriaBaja,
  CENTINELA_ISO,
} from './padron.diff.helpers.js'

describe('toISO', () => {
  it('null → ""', () => expect(toISO(null)).toBe(''))
  it('undefined → ""', () => expect(toISO(undefined)).toBe(''))
  it('"" → ""', () => expect(toISO('')).toBe(''))

  it('centinela "01/01/4000" (string) → ""', () => {
    expect(toISO('01/01/4000')).toBe('')
  })
  it('centinela new Date(Date.UTC(4000,0,1)) → ""', () => {
    expect(toISO(new Date(Date.UTC(4000, 0, 1)))).toBe('')
  })
  it(`centinela constante ${CENTINELA_ISO}`, () => {
    // string DD/MM/YYYY del centinela y el Date del centinela colapsan al mismo ''
    expect(toISO('01/01/4000')).toBe(toISO(new Date(Date.UTC(4000, 0, 1))))
  })

  it('"19/07/2016" vs Date.UTC(2016,6,19) → mismo ISO (sin corrimiento UTC-3)', () => {
    const desdeString = toISO('19/07/2016')
    const desdeDate = toISO(new Date(Date.UTC(2016, 6, 19)))
    expect(desdeString).toBe('2016-07-19')
    expect(desdeDate).toBe('2016-07-19')
    expect(desdeString).toBe(desdeDate)
  })

  it('rama Date usa partes UTC, NO toISOString().slice (no corre un día)', () => {
    // Un Date a medianoche UTC. En UTC-3 toISOString() devolvería el día anterior
    // si se usara hora local; acá debe dar el día exacto.
    expect(toISO(new Date(Date.UTC(2024, 0, 1)))).toBe('2024-01-01')
  })

  it('fechas distintas → ISO distinto', () => {
    expect(toISO('19/07/2016')).not.toBe(toISO('20/07/2016'))
  })

  it('string no parseable → ""', () => {
    expect(toISO('no es fecha')).toBe('')
    expect(toISO('2016-07-19')).toBe('') // formato ISO no es DD/MM/YYYY
  })
})

describe('esCompletado', () => {
  it('"" → valor ⇒ true (alta de dato)', () => {
    expect(esCompletado('', 'Pediatría')).toBe(true)
  })
  it('valor → valor ⇒ false (modificación real)', () => {
    expect(esCompletado('Clínica', 'Pediatría')).toBe(false)
  })
  it('valor → "" ⇒ false (vaciado, no completado)', () => {
    expect(esCompletado('Clínica', '')).toBe(false)
  })
  it('"" → "" ⇒ false (sin cambio)', () => {
    expect(esCompletado('', '')).toBe(false)
  })
})

describe('stripCompletado', () => {
  it('despoja el prefijo completado:', () => {
    expect(stripCompletado('completado:especialidad')).toBe('especialidad')
  })
  it('idempotente para campos no prefijados', () => {
    expect(stripCompletado('especialidad')).toBe('especialidad')
  })
  it('no toca el marcador __reabrir_ocupacion__', () => {
    expect(stripCompletado('__reabrir_ocupacion__')).toBe('__reabrir_ocupacion__')
  })
  it('despoja también campos de fecha', () => {
    expect(stripCompletado('completado:cargo_desde')).toBe('cargo_desde')
  })
})

// FEAT-001 — bloqueo del rol: fecha_bloqueo entra al diff por la rama fecha
// (igual que cargo_desde/cargo_hasta) para que se compare, se actualice y se
// limpie a NULL (desbloqueo) en cada carga del padrón.
describe('esCampoFechaOcupacion', () => {
  it('true para fecha_bloqueo, cargo_desde y cargo_hasta', () => {
    expect(esCampoFechaOcupacion('fecha_bloqueo')).toBe(true)
    expect(esCampoFechaOcupacion('cargo_desde')).toBe(true)
    expect(esCampoFechaOcupacion('cargo_hasta')).toBe(true)
  })
  it('false para campos no-fecha (situacion_de_revista)', () => {
    expect(esCampoFechaOcupacion('situacion_de_revista')).toBe(false)
  })
})

describe('evaluarCampoFecha — bloqueo', () => {
  it('(a) agrega bloqueo: "" → "02/10/2026" ⇒ completado con valorNuevo ISO', () => {
    const r = evaluarCampoFecha('', '02/10/2026')
    expect(r.cambio).toBe(true)
    expect(r.esCompletado).toBe(true)
    expect(r.valorNuevo).toBe('2026-10-02')
  })
  it('(c) desbloqueo: "02/10/2026" → "" ⇒ cambio con valorNuevo null', () => {
    const r = evaluarCampoFecha(toISO('02/10/2026'), '')
    expect(r.cambio).toBe(true)
    expect(r.esCompletado).toBe(false)
    expect(r.valorNuevo).toBeNull()
  })
  it('(d) cambio de fecha: "02/10/2026" → "24/09/2026" ⇒ cambio con la fecha nueva', () => {
    const r = evaluarCampoFecha(toISO('02/10/2026'), '24/09/2026')
    expect(r.cambio).toBe(true)
    expect(r.esCompletado).toBe(false)
    expect(r.valorNuevo).toBe('2026-09-24')
  })
  it('sin cambio: misma fecha ⇒ cambio false', () => {
    const r = evaluarCampoFecha(toISO('02/10/2026'), '02/10/2026')
    expect(r.cambio).toBe(false)
    expect(r.valorNuevo).toBe('2026-10-02')
  })
})

describe('categoriaBaja', () => {
  const ocupVigenteActiva = { hasta: null, persona: { activo: true } }

  it('vigente + hasta null + persona.activo true ⇒ null (baja nueva)', () => {
    expect(categoriaBaja('vigente', ocupVigenteActiva)).toBeNull()
  })

  it('cargo no vigente ⇒ baja_previa', () => {
    expect(categoriaBaja('validacion_vacante', ocupVigenteActiva)).toBe('baja_previa')
    expect(categoriaBaja('no_vigente', ocupVigenteActiva)).toBe('baja_previa')
  })

  it('ocupación cerrada (hasta != null) ⇒ baja_previa', () => {
    expect(
      categoriaBaja('vigente', { hasta: new Date(Date.UTC(2024, 0, 1)), persona: { activo: true } }),
    ).toBe('baja_previa')
  })

  it('persona.activo false ⇒ baja_previa', () => {
    expect(categoriaBaja('vigente', { hasta: null, persona: { activo: false } })).toBe('baja_previa')
  })

  it('sin persona ⇒ baja_previa', () => {
    expect(categoriaBaja('vigente', { hasta: null, persona: null })).toBe('baja_previa')
  })

  it('ocupación nula ⇒ baja_previa', () => {
    expect(categoriaBaja('vigente', null)).toBe('baja_previa')
    expect(categoriaBaja('vigente', undefined)).toBe('baja_previa')
  })
})
