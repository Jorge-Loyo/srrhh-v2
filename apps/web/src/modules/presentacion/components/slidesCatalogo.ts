import type { ComponentType } from 'react'
import type { Periodo } from '../data/periodo'
import { Slide04Dotacion } from '../slides/Slide04Dotacion'
import { Slide05CphPlanta } from '../slides/Slide05CphPlanta'
import { Slide06CphGuardia } from '../slides/Slide06CphGuardia'
import { Slide07CphGuardiaEfector } from '../slides/Slide07CphGuardiaEfector'
import { Slide08SuplentesGuardia } from '../slides/Slide08SuplentesGuardia'
import { Slide09CargosEstructura } from '../slides/Slide09CargosEstructura'
import { Slide10Enfermeria } from '../slides/Slide10Enfermeria'
import { Slide11Tecnicos } from '../slides/Slide11Tecnicos'
import { Slide12EscalafonGeneral } from '../slides/Slide12EscalafonGeneral'
import { Slide13Residentes } from '../slides/Slide13Residentes'
import { Slide14OtrosEscalafones } from '../slides/Slide14OtrosEscalafones'
import { Slide15Comparativa } from '../slides/Slide15Comparativa'
import { buildSlide04Data } from '../data/slide04.mock'
import { buildSlide05Data } from '../data/slide05.mock'
import { buildSlide06Data } from '../data/slide06.mock'
import { buildSlide07Data } from '../data/slide07.mock'
import { buildSlide08Data } from '../data/slide08.mock'
import { buildSlide09Data } from '../data/slide09.mock'
import { buildSlide10Data } from '../data/slide10.mock'
import { buildSlide11Data } from '../data/slide11.mock'
import { buildSlide12Data } from '../data/slide12.mock'
import { buildSlide13Data } from '../data/slide13.mock'
import { buildSlide14Data } from '../data/slide14.mock'
import { buildSlide15Data } from '../data/slide15.mock'

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo centralizado de slides (4–11) de la presentación.
//
// Única fuente de verdad del "qué slides hay y cómo se instancian". Lo recorren
// tanto el selector de botones en Reportes como el modo "todas" en el viewer y
// en PresentacionPage, para no duplicar listas de slides en varios lugares.
//
// Nota de tipado: cada slide tiene su propio SlideNNData y cada builder su
// propio tipo de retorno, pero el par build/Component es coherente por
// construcción (cada fila empareja el builder con su componente). Para poder
// guardarlos juntos en un único array se usa `any` acotado en `data` — el único
// punto de fricción de tipos. La alternativa (unión discriminada de 8 tipos)
// agrega complejidad sin valor para mocks que se reemplazarán por fetch.
// ─────────────────────────────────────────────────────────────────────────────

export interface SlideCatalogoItem {
  /** Número de slide mostrado en el footer y en los botones (4–11). */
  numero: number
  /** Título legible para los botones del selector (sin el número). */
  titulo: string
  /** Construye los datos del slide para un período dado. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (periodo: Periodo) => any
  /** Componente de slide. Recibe `data` (del build) y `numero`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Component: ComponentType<{ data: any; numero: number }>
}

export const SLIDES_CATALOGO: SlideCatalogoItem[] = [
  { numero: 4, titulo: 'Dotación', build: buildSlide04Data, Component: Slide04Dotacion },
  { numero: 5, titulo: 'CPH Planta', build: buildSlide05Data, Component: Slide05CphPlanta },
  { numero: 6, titulo: 'CPH Guardia', build: buildSlide06Data, Component: Slide06CphGuardia },
  { numero: 7, titulo: 'CPH Guardia por Efector', build: buildSlide07Data, Component: Slide07CphGuardiaEfector },
  { numero: 8, titulo: 'Suplentes Guardia', build: buildSlide08Data, Component: Slide08SuplentesGuardia },
  { numero: 9, titulo: 'Cargos Estructura', build: buildSlide09Data, Component: Slide09CargosEstructura },
  { numero: 10, titulo: 'Enfermería', build: buildSlide10Data, Component: Slide10Enfermeria },
  { numero: 11, titulo: 'Técnicos', build: buildSlide11Data, Component: Slide11Tecnicos },
  { numero: 12, titulo: 'Escalafón General', build: buildSlide12Data, Component: Slide12EscalafonGeneral },
  { numero: 13, titulo: 'Residentes', build: buildSlide13Data, Component: Slide13Residentes },
  { numero: 14, titulo: 'Otros Escalafones', build: buildSlide14Data, Component: Slide14OtrosEscalafones },
  { numero: 15, titulo: 'Comparativa Cuatrimestres', build: buildSlide15Data, Component: Slide15Comparativa },
]
