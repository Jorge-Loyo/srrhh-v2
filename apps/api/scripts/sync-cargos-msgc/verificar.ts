// ─────────────────────────────────────────────────────────────────────────────
// Verificación post-carga del sync de cargos con el Excel MSGC.
// Función pura sobre números ya leídos de la base (sin datos personales).
// ─────────────────────────────────────────────────────────────────────────────
import { ACRONIMOS_MSGC } from './acronimoMsgc.js'
import { CODIGO_ESCALAFON_CPH_NUEVO, NOMBRE_ESCALAFON_CPH_NUEVO } from './escalafon.js'
import { prefijoExcel, type FilaNominal } from './leerNominal.js'
import { CODIGO_REGISTRO_DOCENTES, ESCALAFON_DOCENTES_DESTINO, ESCALAFON_DOCENTES_DUPLICADO } from './escalafonesDuplicados.js'

export interface DatosVerificacion {
  /** Cargos vivos (deleted_at nulo) vigentes / en validación. */
  vigentes: number
  validacionVacante: number
  /** Prefijo de código (sin R- ni número) -> cantidad de cargos. */
  prefijosCodigo: Record<string, number>
  /** Chequeos de integridad referencial: nombre -> filas que violan (debe ser 0). */
  integridad: Record<string, number>
  /** Cargos cuyo sub_estado no coincide con la regla (debe ser 0). */
  subEstadoInconsistentes: number
  /** Escalafones con codigo 22 o 37 (debe quedar UNO: codigo 37 con el nombre nuevo). */
  escalafonesCph: { codigo: string; nombre: string }[]
  /** kpis_dotacion_snapshot: filas, meses con datos y meses con padron aprobado (los que se pueden regenerar). */
  kpisFilas: number
  kpisMeses: number
  kpisMesesEsperados: number
  /** Escalafon Docentes duplicado ('Docentes-c32a65d'): existe y cargos que le quedan (debe ser 0 cargos). */
  docentesDuplicadoExiste?: boolean
  docentesDuplicadoCargos?: number
  /** Codigo del escalafon al que pertenece el codigo de registro 07 (debe ser '7'). */
  escalafonDelCr07?: string | null
  /** Cargos vigentes + validacion_vacante vivos por acronimo del codigo (con R- adelante si es reemplazante). */
  distribucionAcronimos?: Record<string, number>
  /** Codigos de escalafon autogenerados (`<texto>-<7 hex>`) que quedan (aviso para Jorge). */
  escalafonesAutogenerados?: string[]
}

export interface Chequeo {
  nombre: string
  ok: boolean
  detalle: string
  /** 'aviso' no hace fallar la verificación. */
  severidad: 'error' | 'aviso'
}

export interface ResultadoVerificacion {
  ok: boolean
  chequeos: Chequeo[]
}

export interface RepoVerificacion {
  datosVerificacion(): Promise<DatosVerificacion>
}

const ACRONIMOS = new Set<string>(ACRONIMOS_MSGC)

/**
 * Excepciones DECIDIDAS por Jorge a la distribucion del Excel: auxiliares de enfermeria de la carrera 85 que el
 * Excel codifica TEC y el sistema deja como ENF (CR 85 no se toca; el acronimo es ENF). Por codigo_excel
 * (HBR y HGAZ sin puesto, HGNPE 'Enfermeria'). Cualquier otra diferencia es un error.
 */
export const EXCEPCIONES_ENF_CR85: readonly string[] = ['TEC-03578', 'TEC-03623', 'TEC-03624']

/** Distribucion esperada por acronimo (R- adelante solo si el codigo_excel lo trae), con las excepciones de Jorge aplicadas. */
export function distribucionEsperada(filas: Pick<FilaNominal, 'codigo_excel' | 'acronimo'>[]): Record<string, number> {
  const excepciones = new Set(EXCEPCIONES_ENF_CR85)
  const out: Record<string, number> = {}
  for (const f of filas) {
    const k = excepciones.has(f.codigo_excel) ? (prefijoExcel(f).startsWith('R-') ? 'R-ENF' : 'ENF') : prefijoExcel(f)
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

/** Diferencias entre la distribucion esperada y la real ("ACR: Excel n, local m"), ordenadas. */
export function diferenciasDistribucion(esperada: Record<string, number>, real: Record<string, number>): string[] {
  const claves = [...new Set([...Object.keys(esperada), ...Object.keys(real)])].sort()
  return claves.filter((k) => (esperada[k] ?? 0) !== (real[k] ?? 0)).map((k) => `${k}: Excel ${esperada[k] ?? 0}, local ${real[k] ?? 0}`)
}

/** Prefijos que ya no deben existir tras la recodificación (los viejos que el Excel reemplaza). */
export const PREFIJOS_VIEJOS = ['CPH-POF', 'CPH-POU', 'TEC-POF', 'TEC-POU', 'RES', 'RG-CG', 'CT', 'PT', 'PG', 'RME'] as const

/**
 * Evalúa los datos leídos. `totalExcel` = filas del Excel; `cambiosSegundaCorrida` = operaciones
 * que haría una segunda corrida con el mismo Excel (null = no se calculó).
 */
export function evaluarVerificacion(d: DatosVerificacion, totalExcel: number, cambiosSegundaCorrida: number | null, distribucionExcel?: Record<string, number>): ResultadoVerificacion {
  const chequeos: Chequeo[] = []
  const suma = d.vigentes + d.validacionVacante
  chequeos.push({
    nombre: 'cierre vigente + validacion_vacante = filas del Excel',
    ok: suma === totalExcel,
    detalle: `vigentes ${d.vigentes} + validacion_vacante ${d.validacionVacante} = ${suma}; Excel ${totalExcel}`,
    severidad: 'error',
  })
  if (distribucionExcel !== undefined) {
    const dif = diferenciasDistribucion(distribucionExcel, d.distribucionAcronimos ?? {})
    chequeos.push({
      nombre: 'distribucion por acronimo (con R-) igual a la del Excel',
      ok: dif.length === 0,
      detalle: dif.length ? dif.join('; ') : `${Object.keys(distribucionExcel).length} acronimos iguales (excepciones de Jorge: aux. enfermeria CR 85 -> ENF, ${EXCEPCIONES_ENF_CR85.length} filas)`,
      severidad: 'error',
    })
  }
  const viejos = Object.entries(d.prefijosCodigo).filter(([p, n]) => n > 0 && !ACRONIMOS.has(p))
  const explicitos = viejos.filter(([p]) => (PREFIJOS_VIEJOS as readonly string[]).includes(p) || /^AS-/.test(p))
  chequeos.push({
    nombre: 'cero prefijos viejos',
    ok: explicitos.length === 0,
    detalle: explicitos.length ? explicitos.map(([p, n]) => `${p}: ${n}`).join(', ') : 'ninguno',
    severidad: 'error',
  })
  const otros = viejos.filter(([p]) => !explicitos.some(([e]) => e === p))
  chequeos.push({
    nombre: 'prefijos fuera de los acronimos del Excel (sin regla, p. ej. -TTR-)',
    ok: otros.length === 0,
    detalle: otros.length ? otros.map(([p, n]) => `${p}: ${n}`).join(', ') : 'ninguno',
    severidad: 'aviso',
  })
  for (const [nombre, n] of Object.entries(d.integridad).sort(([a], [b]) => a.localeCompare(b))) {
    chequeos.push({ nombre: `integridad: ${nombre}`, ok: n === 0, detalle: `${n} filas`, severidad: 'error' })
  }
  chequeos.push({
    nombre: 'sub_estado recalculado',
    ok: d.subEstadoInconsistentes === 0,
    detalle: `${d.subEstadoInconsistentes} cargos inconsistentes`,
    severidad: 'error',
  })
  const esc = d.escalafonesCph
  const escOk = esc.length === 1 && esc[0].codigo === CODIGO_ESCALAFON_CPH_NUEVO && esc[0].nombre === NOMBRE_ESCALAFON_CPH_NUEVO
  chequeos.push({
    nombre: `escalafon CPH: codigo ${CODIGO_ESCALAFON_CPH_NUEVO} y nombre "${NOMBRE_ESCALAFON_CPH_NUEVO}"`,
    ok: escOk,
    detalle: esc.length === 0 ? 'no hay escalafon 22 ni 37' : esc.map((e) => `${e.codigo} "${e.nombre}"`).join('; '),
    severidad: 'error',
  })
  chequeos.push({
    nombre: 'kpis_dotacion_snapshot regenerado',
    ok: d.kpisMesesEsperados === 0 || d.kpisFilas > 0,
    detalle: `${d.kpisFilas} filas en ${d.kpisMeses} meses (meses con padron aprobado: ${d.kpisMesesEsperados})`,
    severidad: 'error',
  })
  if (d.kpisMesesEsperados > 0 && d.kpisFilas > 0 && d.kpisMeses !== d.kpisMesesEsperados) {
    chequeos.push({
      nombre: 'kpis_dotacion_snapshot cubre todos los meses con padron aprobado',
      ok: false,
      detalle: `${d.kpisMeses} meses con datos; meses con padron aprobado ${d.kpisMesesEsperados}`,
      severidad: 'aviso',
    })
  }
  if (d.docentesDuplicadoExiste !== undefined) {
    chequeos.push({
      nombre: `escalafon Docentes duplicado (${ESCALAFON_DOCENTES_DUPLICADO}) fusionado en ${ESCALAFON_DOCENTES_DESTINO}`,
      ok: (d.docentesDuplicadoCargos ?? 0) === 0 && d.escalafonDelCr07 === ESCALAFON_DOCENTES_DESTINO,
      detalle: `duplicado ${d.docentesDuplicadoExiste ? 'existe' : 'eliminado'}, ${d.docentesDuplicadoCargos ?? 0} cargos en el duplicado; CR ${CODIGO_REGISTRO_DOCENTES} en escalafon ${d.escalafonDelCr07 ?? 'ninguno'}`,
      severidad: 'error',
    })
  }
  if (d.escalafonesAutogenerados !== undefined) {
    chequeos.push({
      nombre: 'escalafones con codigo autogenerado que quedan (para Jorge)',
      ok: d.escalafonesAutogenerados.length === 0,
      detalle: d.escalafonesAutogenerados.length ? d.escalafonesAutogenerados.join(', ') : 'ninguno',
      severidad: 'aviso',
    })
  }
  if (cambiosSegundaCorrida !== null) {
    chequeos.push({
      nombre: 'segunda corrida sin cambios',
      ok: cambiosSegundaCorrida === 0,
      detalle: `${cambiosSegundaCorrida} operaciones pendientes`,
      severidad: 'error',
    })
  }
  return { ok: chequeos.every((c) => c.ok || c.severidad === 'aviso'), chequeos }
}

/** Texto plano del resultado (sin datos personales). */
export function textoVerificacion(r: ResultadoVerificacion): string {
  return r.chequeos.map((c) => `${c.ok ? 'OK ' : c.severidad === 'aviso' ? 'AVISO' : 'FALLA'} ${c.nombre}: ${c.detalle}`).join('\n')
}
