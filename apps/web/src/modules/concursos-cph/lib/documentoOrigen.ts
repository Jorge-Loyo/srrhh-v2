// La función vive en @srrhh/types (compartida con la API, que expone
// `documentoOrigen` en el GET del concurso). Re-export para los imports locales.
export { documentoOrigenDeConcurso } from '@srrhh/types'
export type {
  DocumentoOrigen,
  DocumentoOrigenInput,
  FuenteDocumentoOrigen,
  TipoDocumentoOrigen,
} from '@srrhh/types'
