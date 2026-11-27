// Pasos del concurso CEETPS (Etapa 3), en orden fijo: admisibilidad → examen
// escrito → análisis curricular → entrevista. Para avanzar hay que aprobar el
// paso anterior; aprobar = alcanzar el puntaje mínimo que fija el jurado (sin
// mínimo configurado, cualquier puntaje cargado aprueba).
//
// Cada flag es null mientras no se pueda decidir (paso anterior no aprobado o
// dato sin cargar). Se calcula al leer, nunca se guarda: así editar un paso
// anterior nunca deja resultados viejos colgados en los siguientes.

export interface DatosPasos {
  admitido: boolean | null
  presentoExamen: boolean
  notaExamen: number | null
  puntajeCv: number | null
  puntajeEntrevista: number | null
}

export interface MinimosPasos {
  examen: number | null
  cv: number | null
  entrevista: number | null
}

export interface ResultadoPasos {
  pasaAdmision: boolean | null
  pasaExamen: boolean | null
  pasaCv: boolean | null
  pasaEntrevista: boolean | null
  finalista: boolean
}

function aprueba(anterior: boolean | null, puntaje: number | null, minimo: number | null) {
  if (anterior !== true || puntaje == null) return null
  return minimo == null || puntaje >= minimo
}

export function evaluarPasos(i: DatosPasos, minimos: MinimosPasos): ResultadoPasos {
  const pasaAdmision = i.admitido ?? null
  const pasaExamen = aprueba(pasaAdmision, i.presentoExamen ? i.notaExamen : null, minimos.examen)
  const pasaCv = aprueba(pasaExamen, i.puntajeCv, minimos.cv)
  const pasaEntrevista = aprueba(pasaCv, i.puntajeEntrevista, minimos.entrevista)
  return { pasaAdmision, pasaExamen, pasaCv, pasaEntrevista, finalista: pasaEntrevista === true }
}

// ── Orden de mérito final (posición automática) ──────────────────────────────
// Entre los finalistas, gana quien tiene la mejor nota de ENTREVISTA; si empatan,
// la de EXAMEN; si siguen empatados, el análisis CURRICULAR (siempre el puntaje
// más alto primero). Si empatan en las tres, se ordenan por apellido y nombre y
// quedan marcados como empate. La posición se calcula al leer, nunca se guarda.

export interface DatosOrden {
  id: string
  apellido: string
  nombre: string
  finalista: boolean
  puntajeEntrevista: number | null
  notaExamen: number | null
  puntajeCv: number | null
}

export interface PosicionOrden {
  posicion: number
  empate: boolean
}

const n = (v: number | null) => v ?? -Infinity

export function calcularPosiciones(items: DatosOrden[]): Map<string, PosicionOrden> {
  const finalistas = items
    .filter((i) => i.finalista)
    .sort(
      (a, b) =>
        n(b.puntajeEntrevista) - n(a.puntajeEntrevista) ||
        n(b.notaExamen) - n(a.notaExamen) ||
        n(b.puntajeCv) - n(a.puntajeCv) ||
        a.apellido.localeCompare(b.apellido, 'es') ||
        a.nombre.localeCompare(b.nombre, 'es'),
    )
  const mismaNota = (a: DatosOrden, b: DatosOrden) =>
    n(a.puntajeEntrevista) === n(b.puntajeEntrevista) &&
    n(a.notaExamen) === n(b.notaExamen) &&
    n(a.puntajeCv) === n(b.puntajeCv)
  const out = new Map<string, PosicionOrden>()
  finalistas.forEach((f, idx) => {
    const empate =
      (idx > 0 && mismaNota(f, finalistas[idx - 1]!)) ||
      (idx < finalistas.length - 1 && mismaNota(f, finalistas[idx + 1]!))
    out.set(f.id, { posicion: idx + 1, empate })
  })
  return out
}
