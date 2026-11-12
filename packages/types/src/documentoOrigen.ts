// Documento de origen de un concurso (Etapa 1 de los wizards).
//
// Función pura: según el motivo que originó el concurso decide la etiqueta y de
// qué dato sale el documento. NO modifica eeBaja (el cálculo de estado/sub-estado
// sigue usando eeBaja/eeConcurso tal cual).
//
//  - nuevo_cargo  → documento de la CREACIÓN del cargo: el expediente (o decreto,
//    se guarda en el mismo campo) con el que se dio el alta. El concurso
//    automático del Paso 3 lo hereda en concurso.expediente; si no está, se usa
//    cargo.expediente (misma fuente: SolicitudAlta.expediente).
//  - resto        → expediente de la baja (eeBaja), igual que antes.

export type TipoDocumentoOrigen = 'baja' | 'creacion' | 'otro'
export type FuenteDocumentoOrigen =
  | 'concurso.expediente'
  | 'cargo.expediente'
  | 'decreto'
  | 'eeBaja'
  | 'sin_dato'

export interface DocumentoOrigenInput {
  motivoConcurso?: string | null
  /** Expediente de baja ya resuelto (cphData.eeBaja ?? baja.eeBaja). */
  eeBaja?: string | null
  /** concurso.expediente (heredado del alta en el Paso 3). */
  expedienteConcurso?: string | null
  /** cargo.expediente (expediente o decreto del alta). */
  expedienteCargo?: string | null
}

export interface DocumentoOrigen {
  tipo: TipoDocumentoOrigen
  etiqueta: string
  valor: string
  fuente: FuenteDocumentoOrigen
  /** true si es un cargo nuevo (cambia título/subtítulo y oculta campos de baja). */
  esCreacion: boolean
}

const limpio = (s: string | null | undefined): string => (s ?? '').trim()

// El alta guarda "expediente o decreto" en un único campo (ej. "DEC-541/MSGC/26").
const esDecreto = (s: string): boolean => /^\s*(dec(reto)?\b|dec[-\s.\d])/i.test(s)

export function documentoOrigenDeConcurso(input: DocumentoOrigenInput): DocumentoOrigen {
  if (input.motivoConcurso === 'nuevo_cargo') {
    const delConcurso = limpio(input.expedienteConcurso)
    const delCargo = limpio(input.expedienteCargo)
    const valor = delConcurso || delCargo
    const fuente: FuenteDocumentoOrigen = !valor
      ? 'sin_dato'
      : esDecreto(valor)
        ? 'decreto'
        : delConcurso
          ? 'concurso.expediente'
          : 'cargo.expediente'
    return {
      tipo: 'creacion',
      etiqueta: 'Documento de origen (Creación)',
      valor,
      fuente,
      esCreacion: true,
    }
  }
  const valorBaja = limpio(input.eeBaja)
  if (input.motivoConcurso) {
    return {
      tipo: 'baja',
      etiqueta: 'Documento de origen (Baja)',
      valor: valorBaja,
      fuente: valorBaja ? 'eeBaja' : 'sin_dato',
      esCreacion: false,
    }
  }
  // Sin motivo tipificado (concursos importados/legacy): hoy solo existe eeBaja.
  return {
    tipo: valorBaja ? 'baja' : 'otro',
    etiqueta: valorBaja ? 'Documento de origen (Baja)' : 'Documento de origen',
    valor: valorBaja,
    fuente: valorBaja ? 'eeBaja' : 'sin_dato',
    esCreacion: false,
  }
}
