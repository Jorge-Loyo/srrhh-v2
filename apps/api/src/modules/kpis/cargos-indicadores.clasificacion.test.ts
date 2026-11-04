import { describe, it, expect } from 'vitest'
import {
  HOJAS,
  SUB_ESTADOS_CONCURSO_CPH,
  agregarHojas,
  clasificarCargo,
  concursoAlCorte,
  concursosAlCorte,
  construirRespuesta,
  derivarColumnas,
  elegirSituacion,
  evaluarDisponibilidad,
  fechaCivilArgentina,
  finConcurso,
  resolverPeriodos,
  sumarHojas,
  variacion,
  verificarConciliacion,
  type ConcursoFact,
  type EdRel,
  type FilaHoja,
  type HechosCargo,
  type HojaCargo,
} from './cargos-indicadores.clasificacion.js'

const base = (o: Partial<HechosCargo> = {}): HechosCargo => ({
  estado: 'vigente',
  edRel: 'le',
  sits: null,
  sitAprox: false,
  concurso: 'no',
  modo: 'corte',
  ...o,
})

describe('elegirSituacion', () => {
  it('prioridad activo > comisión > retención > otra', () => {
    expect(elegirSituacion(['activo', 'retencion de cargo'])).toBe('ocupado_activo')
    expect(elegirSituacion(['retencion de cargo', 'comision'])).toBe('ocupado_comision')
    expect(elegirSituacion(['retencion de cargo'])).toBe('ocupado_retencion')
    expect(elegirSituacion(['x'])).toBe('ocupado_otra')
    expect(elegirSituacion(['(sin dato)'])).toBe('ocupado_otra')
  })
})

describe('clasificarCargo (vivo)', () => {
  const vivo = (o: Partial<HechosCargo> = {}) => base({ modo: 'vivo', ...o })
  it('no_vigente y validación pisan ocupante y concurso', () => {
    expect(clasificarCargo(vivo({ estado: 'no_vigente', sits: ['activo'] }))).toEqual({ hoja: 'excluido', aprox: false })
    expect(clasificarCargo(vivo({ estado: 'validacion_vacante', sits: ['activo'], concurso: 'si' }))).toEqual({
      hoja: 'validacion',
      aprox: false,
    })
  })
  it('ocupado por situación de revista', () => {
    expect(clasificarCargo(vivo({ sits: ['activo'] }))).toEqual({ hoja: 'ocupado_activo', aprox: false })
    expect(clasificarCargo(vivo({ sits: ['comision'] })).hoja).toBe('ocupado_comision')
    expect(clasificarCargo(vivo({ sits: ['retencion de cargo'] })).hoja).toBe('ocupado_retencion')
    expect(clasificarCargo(vivo({ sits: ['(sin dato)'] })).hoja).toBe('ocupado_otra')
    expect(clasificarCargo(vivo({ sits: ['otra rara'] })).hoja).toBe('ocupado_otra')
  })
  it('vigente sin ocupante: concurso / vacante; desconocido en vivo cae en concurso (el estado manda)', () => {
    expect(clasificarCargo(vivo({ concurso: 'si' }))).toEqual({ hoja: 'concurso', aprox: true })
    expect(clasificarCargo(vivo({}))).toEqual({ hoja: 'vacante', aprox: true })
    expect(clasificarCargo(vivo({ concurso: 'desconocido' }))).toEqual({ hoja: 'concurso', aprox: true })
  })
  it('ocupante gana a concurso (R3 antes de R4)', () => {
    expect(clasificarCargo(vivo({ sits: ['activo'], concurso: 'si' })).hoja).toBe('ocupado_activo')
  })
  it('estado fuera del enum -> excluido sin lanzar (R1)', () => {
    expect(clasificarCargo(vivo({ estado: 'zzz' }))).toEqual({ hoja: 'excluido', aprox: true })
  })
})

describe('clasificarCargo (corte)', () => {
  it('no_vigente con pasaje <= corte: excluido del total, exacto salvo fecha inferida (R2a); validación exacta (R2)', () => {
    expect(clasificarCargo(base({ estado: 'no_vigente' }))).toEqual({ hoja: 'excluido', aprox: false })
    expect(clasificarCargo(base({ estado: 'no_vigente', pasoAprox: true }))).toEqual({ hoja: 'excluido', aprox: true })
    expect(clasificarCargo(base({ estado: 'validacion_vacante' }))).toEqual({ hoja: 'validacion', aprox: false })
  })
  it('R2b: sin estado_desde -> hoja del estado, aproximada', () => {
    expect(clasificarCargo(base({ estado: 'no_vigente', edRel: 'null' }))).toEqual({ hoja: 'excluido', aprox: true })
    expect(clasificarCargo(base({ estado: 'validacion_vacante', edRel: 'null' }))).toEqual({
      hoja: 'validacion',
      aprox: true,
    })
  })
  it('R2a antes de R3: no_vigente le + ocupante -> excluido; gt + ocupante -> ocupado', () => {
    expect(clasificarCargo(base({ estado: 'no_vigente', sits: ['activo'] })).hoja).toBe('excluido')
    expect(clasificarCargo(base({ estado: 'no_vigente', edRel: 'gt', sits: ['activo'] })).hoja).toBe('ocupado_activo')
  })
  it('baja después del corte sin ocupante ni concurso: no_vigente -> validación (R7); validación -> validación (R8)', () => {
    expect(clasificarCargo(base({ estado: 'no_vigente', edRel: 'gt' }))).toEqual({ hoja: 'validacion', aprox: true })
    expect(clasificarCargo(base({ estado: 'validacion_vacante', edRel: 'gt' }))).toEqual({
      hoja: 'validacion',
      aprox: true,
    })
  })
  it('concurso abierto / cerrado al corte; desconocido en corte cae en validación (conservador)', () => {
    expect(clasificarCargo(base({ concurso: 'si' }))).toEqual({ hoja: 'concurso', aprox: true })
    expect(clasificarCargo(base({ concurso: 'no' }))).toEqual({ hoja: 'vacante', aprox: true })
    expect(clasificarCargo(base({ concurso: 'desconocido' }))).toEqual({ hoja: 'validacion', aprox: true })
    expect(clasificarCargo(base({ concurso: 'desconocido', sits: ['activo'] })).hoja).toBe('ocupado_activo')
  })
  it('situación aproximada marca aprox', () => {
    expect(clasificarCargo(base({ sits: ['comision'], sitAprox: true }))).toEqual({
      hoja: 'ocupado_comision',
      aprox: true,
    })
    expect(clasificarCargo(base({ sits: ['comision'] })).aprox).toBe(false)
  })
  it('vigente reactivado después del corte -> validación (R6)', () => {
    expect(clasificarCargo(base({ edRel: 'gt' }))).toEqual({ hoja: 'validacion', aprox: true })
  })
})

describe('exclusión mutua y suma = total (propiedad)', () => {
  const estados = ['vigente', 'validacion_vacante', 'no_vigente', 'raro']
  const edRels: EdRel[] = ['null', 'le', 'gt']
  const sitsOpts: (string[] | null)[] = [
    null,
    [],
    ['activo'],
    ['comision'],
    ['retencion de cargo'],
    ['(sin dato)'],
    ['activo', 'comision'],
  ]
  const concursos: ConcursoFact[] = ['si', 'no', 'desconocido']

  it('cada combinación devuelve exactamente una hoja válida; vivo y corte coinciden en la hoja', () => {
    let n = 0
    for (const estado of estados)
      for (const edRel of edRels)
        for (const sits of sitsOpts)
          for (const concurso of concursos)
            for (const sitAprox of [false, true]) {
              const c = clasificarCargo({ estado, edRel, sits, sitAprox, concurso, modo: 'corte' })
              expect(HOJAS).toContain(c.hoja)
              // vivo siempre llega con edRel = 'le'. Vivo y corte coinciden salvo cuando
              // el concurso es 'desconocido' y lo decide la cascada (R5): vivo -> 'concurso',
              // corte -> 'validacion'. Si un ocupante o el estado resuelven antes, coinciden.
              if (edRel === 'le') {
                const v = clasificarCargo({ estado, edRel, sits, sitAprox, concurso, modo: 'vivo' })
                expect(HOJAS).toContain(v.hoja)
                if (c.hoja === 'validacion' && v.hoja === 'concurso') {
                  expect(concurso).toBe('desconocido')
                } else {
                  expect(v.hoja).toBe(c.hoja)
                }
              }
              n++
            }
    expect(n).toBe(4 * 3 * 7 * 3 * 2)
  })

  it('Σ hojas = Σ n y las identidades de la jerarquía', () => {
    const filas: FilaHoja[] = []
    let total = 0
    const carreras = ['c1', 'c2', null]
    let i = 1
    for (const estado of estados)
      for (const sits of sitsOpts)
        for (const concurso of concursos) {
          const carreraId = carreras[i % 3] ?? null
          const n = i++
          total += n
          const c = clasificarCargo({ estado, edRel: 'le', sits, sitAprox: false, concurso, modo: 'corte' })
          filas.push({ carreraId, hoja: c.hoja, aprox: c.aprox, n })
        }
    const agg = agregarHojas(filas)
    let suma = 0
    for (const hojas of agg.values()) {
      const d = derivarColumnas(hojas)
      expect(d.ocupado.n + d.vacante.n + d.concurso.n).toBe(d.vigente.n)
      // total a gestionar = validación + vigente; el excluido (no vigente) NO suma
      expect(d.vigente.n + d.validacion.n).toBe(d.total.n)
      expect(d.total.n + hojas.excluido.n).toBe(Object.values(hojas).reduce((a, h) => a + h.n, 0))
      expect(d.ocupado_activo.n + d.ocupado_comision.n + d.ocupado_retencion.n + d.ocupado_otra.n).toBe(d.ocupado.n)
      suma += d.total.n
    }
    // suma de totales a gestionar = todos los cargos menos los excluidos (no vigentes)
    const excl = filas.filter((f) => f.hoja === 'excluido').reduce((x, f) => x + f.n, 0)
    expect(suma).toBe(total - excl)
    expect(verificarConciliacion(filas, total)).toEqual({ ok: true, total: total - excl })
  })

  it('verificarConciliacion detecta una fila descartada', () => {
    const filas: FilaHoja[] = [
      { carreraId: 'a', hoja: 'vacante', aprox: true, n: 3 },
      { carreraId: 'a', hoja: 'concurso', aprox: true, n: 2 },
    ]
    expect(verificarConciliacion(filas.slice(0, 1), 5).ok).toBe(false)
    expect(verificarConciliacion(filas, 5).ok).toBe(true)
  })

  it('total 0 y una sola carrera', () => {
    expect(verificarConciliacion([], 0).ok).toBe(true)
    const agg = agregarHojas([{ carreraId: null, hoja: 'vacante', aprox: false, n: 4 }])
    expect(derivarColumnas(agg.get('')!).total.n).toBe(4)
  })
})

describe('no vigentes y período anterior (reconstrucción)', () => {
  it('hoy no vigente cuyo pasaje fue DESPUÉS del corte: sigue gestionable en el mes anterior', () => {
    expect(clasificarCargo(base({ estado: 'no_vigente', edRel: 'gt', pasoAprox: true })).hoja).toBe('validacion')
    expect(clasificarCargo(base({ estado: 'no_vigente', edRel: 'gt', sits: ['activo'] })).hoja).toBe('ocupado_activo')
    expect(clasificarCargo(base({ estado: 'no_vigente', edRel: 'gt', concurso: 'si' })).hoja).toBe('concurso')
  })
  it('no vigente desde antes del corte: excluido; nunca cae en hojas gestionables', () => {
    for (const sits of [null, ['activo']])
      for (const concurso of ['si', 'no', 'desconocido'] as ConcursoFact[]) {
        const c = clasificarCargo(base({ estado: 'no_vigente', edRel: 'le', sits, concurso }))
        expect(c.hoja).toBe('excluido')
      }
  })
  it('conciliación: gestionables + excluidos = total de la base; total devuelto = a gestionar', () => {
    const filas: FilaHoja[] = [
      { carreraId: 'a', hoja: 'vacante', aprox: false, n: 3 },
      { carreraId: 'a', hoja: 'validacion', aprox: false, n: 2 },
      { carreraId: 'a', hoja: 'excluido', aprox: false, n: 4 },
    ]
    expect(verificarConciliacion(filas, 9)).toEqual({ ok: true, total: 5 })
    expect(verificarConciliacion(filas, 5).ok).toBe(false)
  })
})
describe('SUB_ESTADOS_CONCURSO_CPH', () => {
  it('12 valores sin repetidos y sin las etapas finales', () => {
    expect(SUB_ESTADOS_CONCURSO_CPH).toHaveLength(12)
    expect(new Set(SUB_ESTADOS_CONCURSO_CPH).size).toBe(12)
    for (const x of ['o-alta sial', 'n-designado', 'h-tad', 'm-reso a la firma', 'q-desierto']) {
      expect(SUB_ESTADOS_CONCURSO_CPH).not.toContain(x)
    }
  })
})

describe('concursoAlCorte / finConcurso', () => {
  const F = '2026-10-31'
  const c = (ini: string | null, fin: string | null, cierreSinFecha = false) => ({ ini, fin, cierreSinFecha })
  it('tabla de casos (espejo de V9)', () => {
    expect(concursoAlCorte(c('2026-09-01', null), F)).toBe('si')
    expect(concursoAlCorte(c('2026-11-02', null), F)).toBe('no')
    expect(concursoAlCorte(c(null, null), F)).toBe('desconocido')
    expect(concursoAlCorte(c('2026-08-01', '2026-10-01'), F)).toBe('no')
    expect(concursoAlCorte(c('2026-08-01', '2026-11-05'), F)).toBe('si')
    expect(concursoAlCorte(c(null, '2026-11-05'), F)).toBe('desconocido')
    expect(concursoAlCorte(c('2026-08-01', null, true), F)).toBe('desconocido')
    expect(concursoAlCorte(c('2026-11-03', null, true), F)).toBe('no')
    expect(concursoAlCorte(c('2026-09-01', '2026-11-10'), F)).toBe('si') // o-alta sial, alta después
    expect(concursoAlCorte(c('2026-09-01', '2026-10-05'), F)).toBe('no') // alta cerrada antes
    expect(concursoAlCorte(c('2026-08-01', '2026-11-03', true), F)).toBe('si') // CEETPS con alta después
  })
  it('varios concursos: si > desconocido > no; sin concursos -> no', () => {
    expect(concursosAlCorte([c('2026-11-02', null), c(null, null), c('2026-09-01', null)], F)).toBe('si')
    expect(concursosAlCorte([c('2026-11-02', null), c(null, null)], F)).toBe('desconocido')
    expect(concursosAlCorte([c('2026-11-02', null)], F)).toBe('no')
    expect(concursosAlCorte([], F)).toBe('no')
  })
  it('con F = hoy: h-tad sin fin -> si; CEETPS cerrado sin ocupación -> desconocido', () => {
    expect(concursoAlCorte(c('2026-05-01', null), '2026-11-05')).toBe('si')
    expect(concursoAlCorte(c('2026-05-01', null, true), '2026-11-05')).toBe('desconocido')
  })
  it('modo vivo: CEETPS autorizado/en_proceso sin fecha de autorización (en curso) cuenta como si', () => {
    const enCurso = { ini: null, fin: null, cierreSinFecha: false, enCurso: true }
    // Sin modo vivo (corte): el estado no manda, sigue 'desconocido'
    expect(concursoAlCorte(enCurso, F)).toBe('desconocido')
    // En modo vivo: el estado del concurso manda, cuenta como 'si' aunque no tenga ini
    expect(concursoAlCorte(enCurso, F, true)).toBe('si')
    // Con ini también da 'si' en vivo
    expect(concursoAlCorte({ ini: '2026-09-01', fin: null, cierreSinFecha: false, enCurso: true }, F, true)).toBe('si')
    // En vivo, un concurso ya cerrado (fin <= F) no cuenta aunque enCurso sea true
    expect(concursoAlCorte({ ini: '2026-08-01', fin: '2026-10-01', cierreSinFecha: false, enCurso: true }, F, true)).toBe(
      'no',
    )
    // En vivo, varios concursos: el en curso gana
    expect(concursosAlCorte([c('2026-11-02', null), enCurso], F, true)).toBe('si')
  })
  it('finConcurso: mínimo e ignora nulos', () => {
    expect(finConcurso({})).toBeNull()
    expect(finConcurso({ desierto: '2026-03-01' })).toBe('2026-03-01')
    expect(finConcurso({ ocupacionPosterior: '2026-04-01' })).toBe('2026-04-01')
    expect(finConcurso({ concursoSiguiente: '2026-05-01' })).toBe('2026-05-01')
    expect(
      finConcurso({ desierto: '2026-06-01', ocupacionPosterior: '2026-04-01', concursoSiguiente: '2026-05-01' }),
    ).toBe('2026-04-01')
  })
  it('regresión de sesgo: el sub_estado de hoy no cambia la hoja (solo las fechas)', () => {
    const fin = finConcurso({ ocupacionPosterior: '2026-11-10' })
    const conc = concursoAlCorte({ ini: '2026-09-01', fin, cierreSinFecha: false }, F)
    expect(conc).toBe('si')
    expect(clasificarCargo(base({ concurso: conc })).hoja).toBe('concurso')
    const finViejo = finConcurso({ concursoSiguiente: '2026-09-15' })
    expect(concursoAlCorte({ ini: '2026-08-01', fin: finViejo, cierreSinFecha: false }, F)).toBe('no')
  })
})

describe('evaluarDisponibilidad', () => {
  const x = { primerDatos: '2026-01-31', cargaInicial: '2026-02-10', override: null }
  it('casos', () => {
    expect(evaluarDisponibilidad('2026-10-31', x)).toEqual({ disponible: true, motivo: null })
    expect(evaluarDisponibilidad('2026-01-15', x).motivo).toBe('anterior al primer padrón aprobado (2026-01-31)')
    expect(evaluarDisponibilidad('2026-02-05', x).motivo).toBe('anterior a la carga inicial de cargos (2026-02-10)')
    expect(evaluarDisponibilidad('2026-02-10', x).disponible).toBe(true)
    expect(evaluarDisponibilidad('2026-10-31', { ...x, primerDatos: null }).motivo).toBe('sin padrones aprobados')
  })
  it('override: la carga inicial ya no bloquea, pero primerDatos sí', () => {
    const y = { primerDatos: '2026-01-31', cargaInicial: '2026-11-05', override: '2026-11-05' }
    expect(evaluarDisponibilidad('2026-10-31', y).disponible).toBe(true)
    expect(evaluarDisponibilidad('2026-10-31', { ...y, override: null }).motivo).toBe(
      'anterior a la carga inicial de cargos (2026-11-05)',
    )
    expect(evaluarDisponibilidad('2026-01-10', y).disponible).toBe(false)
  })
})

describe('variacion', () => {
  it('casos', () => {
    expect(variacion(10, 8)).toEqual({ abs: 2, pct: 25, tendencia: 'sube' })
    expect(variacion(8, 10)).toEqual({ abs: -2, pct: -20, tendencia: 'baja' })
    expect(variacion(5, 0)).toEqual({ abs: 5, pct: null, tendencia: 'sube' })
    expect(variacion(0, 0)).toEqual({ abs: 0, pct: 0, tendencia: 'igual' })
    expect(variacion(3, null)).toEqual({ abs: null, pct: null, tendencia: null })
    expect(variacion(null, 3)).toEqual({ abs: null, pct: null, tendencia: null })
  })
})

describe('resolverPeriodos', () => {
  it('sin mes: actual vivo y anterior reconstruido al fin del mes previo', () => {
    const r = resolverPeriodos(undefined, '2026-11-05')
    expect(r.actual).toEqual({ mes: '2026-11', desde: '2026-11-01', fechaCorte: '2026-11-05', modo: 'vivo' })
    expect(r.anterior).toEqual({ mes: '2026-10', desde: '2026-10-01', fechaCorte: '2026-10-31', modo: 'reconstruido' })
    expect(resolverPeriodos('2026-11', '2026-11-05').actual.modo).toBe('vivo')
  })
  it('enero y febrero bisiesto', () => {
    expect(resolverPeriodos(undefined, '2027-01-10').anterior).toEqual({
      mes: '2026-12',
      desde: '2026-12-01',
      fechaCorte: '2026-12-31',
      modo: 'reconstruido',
    })
    expect(resolverPeriodos(undefined, '2028-03-02').anterior.fechaCorte).toBe('2028-02-29')
  })
  it('mes pasado: ambos reconstruidos', () => {
    const r = resolverPeriodos('2026-09', '2026-11-05')
    expect(r.actual).toEqual({ mes: '2026-09', desde: '2026-09-01', fechaCorte: '2026-09-30', modo: 'reconstruido' })
    expect(r.anterior.desde).toBe('2026-08-01')
    expect(r.anterior.fechaCorte).toBe('2026-08-31')
  })
  it('mes futuro -> error 400', () => {
    expect(() => resolverPeriodos('2026-12', '2026-11-05')).toThrow('El mes no puede ser futuro')
  })
  it('fecha civil argentina cerca de medianoche UTC', () => {
    expect(fechaCivilArgentina(new Date('2026-11-01T01:30:00Z'))).toBe('2026-10-31')
    expect(fechaCivilArgentina(new Date('2026-11-01T03:30:00Z'))).toBe('2026-11-01')
  })
})

describe('construirRespuesta', () => {
  const carreras = [
    { id: 'u2', codigo: '37', literal: 'Nueva Carrera' },
    { id: 'u1', codigo: '5', literal: 'Otra' },
  ]
  const per = (modo: 'vivo' | 'reconstruido', disponible = true) => ({
    mes: '2026-11',
    desde: '2026-11-01',
    fechaCorte: '2026-11-05',
    modo,
    disponible,
    motivoNoDisponible: disponible ? null : 'x',
  })
  const filasA: FilaHoja[] = [
    { carreraId: 'u2', hoja: 'ocupado_activo', aprox: false, n: 10 },
    { carreraId: 'u2', hoja: 'vacante', aprox: true, n: 2 },
    { carreraId: 'u1', hoja: 'validacion', aprox: false, n: 1 },
    { carreraId: 'u1', hoja: 'excluido', aprox: false, n: 3 }, // no vigente: fuera del total
    { carreraId: null, hoja: 'concurso', aprox: true, n: 1 },
  ]
  const filasP: FilaHoja[] = [
    { carreraId: 'u2', hoja: 'ocupado_activo', aprox: false, n: 8 },
    { carreraId: 'u2', hoja: 'concurso', aprox: true, n: 1 },
  ]
  const armar = (extra: Partial<Parameters<typeof construirRespuesta>[0]> = {}) =>
    construirRespuesta({
      actual: { periodo: per('vivo'), pasaron: [{ carreraId: 'u2', n: 4, aprox: 1 }, { carreraId: 'u1', n: 1, aprox: 0 }], filas: filasA, personas: [{ codigo: '37', personas: 9 }, { codigo: 'zz', personas: 4 }], personasFecha: '2026-11-01' },
      anterior: { periodo: per('reconstruido'), pasaron: [{ carreraId: 'u2', n: 2, aprox: 2 }], filas: filasP, personas: [{ codigo: '37', personas: 7 }], personasFecha: '2026-10-01' },
      carreras,
      carreraFiltrada: false,
      hospitalFiltrado: false,
      conciliacion: { ok: true, totalActual: 14, totalAnterior: 9 },
      noVigenteSinFecha: 6,
      ...extra,
    })

  it('orden numérico, sin código al final; total = suma de carreras', () => {
    const r = armar()
    expect(r.filas.map((f) => f.codigo)).toEqual(['5', '37', '(sin codigo)'])
    expect(r.filas[1]!.etiqueta).toBe('37 — Nueva Carrera')
    const sumaActual = r.filas.reduce((a, f) => a + (f.celdas.total.actual ?? 0), 0)
    expect(r.total.celdas.total.actual).toBe(sumaActual)
    expect(r.total.celdas.total.actual).toBe(14)
    expect(r.total.celdas.total.anterior).toBe(9)
    expect(r.total.celdas.total.variacionAbs).toBe(5)
  })
  it('carrera presente en un solo período recibe 0 (no n/d); aprox <= valor', () => {
    const r = armar()
    const c5 = r.filas[0]!.celdas.total
    expect(c5.anterior).toBe(0)
    for (const f of [...r.filas, r.total]) {
      for (const c of Object.values(f.celdas)) {
        if (c.actual !== null) expect(c.actualAprox).toBeLessThanOrEqual(c.actual)
        if (c.anterior !== null) expect(c.anteriorAprox).toBeLessThanOrEqual(c.anterior)
      }
    }
  })
  it('columnas: no existe la columna indeterminado; personas_ref solo en tabla ocupado', () => {
    const r = armar()
    for (const t of r.tablas) expect(t.columnas.map((c) => c.id as string)).not.toContain('indeterminado')
    expect(r.tablas.find((t) => t.id === 'estado')!.columnas.map((c) => c.id)).toEqual(['total', 'validacion', 'vigente'])
    expect(r.tablas.find((t) => t.id === 'ocupado')!.columnas.map((c) => c.id)).toContain('personas_ref')
    expect(r.tablas.find((t) => t.id === 'vigente')!.columnas.map((c) => c.id)).not.toContain('personas_ref')
  })
  it('personas_ref: cruza por código, descarta códigos ajenos, total n/d con varias carreras', () => {
    const r = armar()
    expect(r.filas[1]!.celdas.personas_ref.actual).toBe(9)
    expect(r.filas[0]!.celdas.personas_ref.actual).toBe(0)
    expect(r.total.celdas.personas_ref.actual).toBeNull()
    const f = armar({ carreraFiltrada: true })
    expect(f.total.celdas.personas_ref.actual).toBe(9)
    const h = armar({ hospitalFiltrado: true })
    expect(h.filas[1]!.celdas.personas_ref.actual).toBeNull()
  })
  it('período no disponible: todas sus celdas null', () => {
    const r = armar({ anterior: { periodo: per('reconstruido', false), pasaron: null, filas: null, personas: null, personasFecha: null } })
    for (const f of [...r.filas, r.total]) {
      for (const c of Object.values(f.celdas)) {
        expect(c.anterior).toBeNull()
        expect(c.variacionAbs).toBeNull()
      }
    }
    expect(r.total.celdas.total.actual).toBe(14)
  })
  it('no vigentes: ni columna de estado ni suma del total; el excluido no entra en total a gestionar', () => {
    const r = armar()
    for (const t of r.tablas) expect(t.columnas.map((c) => c.id as string)).not.toContain('no_vigente')
    for (const f of [...r.filas, r.total]) expect(Object.keys(f.celdas)).not.toContain('no_vigente')
    expect(r.tablas.find((t) => t.id === 'estado')!.columnas[0]!.etiqueta).toBe('Total a gestionar')
    const u1 = r.filas.find((f) => f.carreraId === 'u1')!
    expect(u1.celdas.total.actual).toBe(1) // 1 validación; los 3 excluidos quedan fuera
    for (const f of [...r.filas, r.total]) {
      for (const k of ['actual', 'anterior'] as const) {
        const c = f.celdas
        if (c.total[k] === null) continue
        expect((c.vigente[k] ?? 0) + (c.validacion[k] ?? 0)).toBe(c.total[k])
        expect((c.ocupado[k] ?? 0) + (c.vacante[k] ?? 0) + (c.concurso[k] ?? 0)).toBe(c.vigente[k])
      }
    }
  })
  it('pasaronNoVigente: por carrera y total, fuera del total, con ~ y variación', () => {
    const r = armar()
    const u2 = r.filas.find((f) => f.carreraId === 'u2')!.pasaronNoVigente
    expect(u2).toMatchObject({ actual: 4, actualAprox: 1, anterior: 2, anteriorAprox: 2, variacionAbs: 2, tendencia: 'sube' })
    const u1 = r.filas.find((f) => f.carreraId === 'u1')!.pasaronNoVigente
    expect(u1).toMatchObject({ actual: 1, anterior: 0 }) // período disponible sin pasajes = 0, no n/d
    expect(r.total.pasaronNoVigente).toMatchObject({ actual: 5, anterior: 2, variacionAbs: 3 })
    expect(r.total.celdas.total.actual).toBe(14) // no suma pasaronNoVigente
    expect(r.noVigenteSinFecha).toBe(6)
  })
  it('pasaronNoVigente: período no disponible -> n/d (nunca 0 inventado)', () => {
    const r = armar({ anterior: { periodo: per('reconstruido', false), pasaron: null, filas: null, personas: null, personasFecha: null } })
    for (const f of [...r.filas, r.total]) {
      expect(f.pasaronNoVigente.anterior).toBeNull()
      expect(f.pasaronNoVigente.variacionAbs).toBeNull()
    }
    expect(r.total.pasaronNoVigente.actual).toBe(5)
  })
  it('sumarHojas conserva n y aprox', () => {
    const a = agregarHojas(filasA).get('u2')!
    const s = sumarHojas(a, a)
    expect(s.vacante).toEqual({ n: 4, aprox: 4 })
  })
  it('HojaCargo cubre las hojas esperadas (sin indeterminado)', () => {
    const h: HojaCargo[] = [...HOJAS]
    expect(h).toHaveLength(8)
    expect((h as string[])).not.toContain('indeterminado')
  })
})
