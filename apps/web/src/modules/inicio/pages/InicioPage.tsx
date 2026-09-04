import { useMemo, useState } from 'react'
import { HUB_PLANILLAS, HUB_ENLACES, HUB_PRESENTACIONES, type HubCategoria, type HubItem } from '../data/hubLinks'

// Sinónimos del buscador — portados tal cual del legacy landing.html.
const SINONIMOS: Record<string, string> = {
  ale: 'alexis',
  juanma: 'juan manuel',
  anita: 'ana',
  lucas: 'goplyco',
  entregable: 'informe',
}

interface Columna {
  key: string
  titulo: string
  subtitulo: string
  icono: string
  categorias: HubCategoria[]
  colorTitulo: string
  colorFondo: string
  colorBorde: string
  colorSubtitulo: string
}

const COLUMNAS: Columna[] = [
  {
    key: 'planillas',
    titulo: 'Planillas de Datos',
    subtitulo: 'Hojas de cálculo, bases de datos y reportes numéricos en Excel o Google Sheets.',
    icono: '📊',
    categorias: HUB_PLANILLAS,
    colorTitulo: 'text-white',
    colorFondo: 'bg-[#227849]',
    colorSubtitulo: 'text-white/70',
  },
  {
    key: 'enlaces',
    titulo: 'Enlaces Directos',
    subtitulo: 'URLs a plataformas externas, sitios web y recursos directos.',
    icono: '🔗',
    categorias: HUB_ENLACES,
    colorTitulo: 'text-white',
    colorFondo: 'bg-[#163548]',
    colorSubtitulo: 'text-white/70',
  },
  {
    key: 'presentaciones',
    titulo: 'Presentaciones y Power BI',
    subtitulo: 'Diapositivas, material visual en PPT o Google Slides. Power BI.',
    icono: '📽️',
    categorias: HUB_PRESENTACIONES,
    colorTitulo: 'text-black',
    colorFondo: 'bg-[#f5bf00]',
    colorSubtitulo: 'text-black/70',
  },
]

interface ItemBuscable extends HubItem {
  columnaKey: string
  colorTitulo: string
}

function aplicarSinonimo(texto: string): string {
  return SINONIMOS[texto] ?? texto
}

export function InicioPage() {
  const [busqueda, setBusqueda] = useState('')

  // Índice plano de todos los items, para el buscador — se arma una sola vez.
  const itemsBuscables = useMemo<ItemBuscable[]>(() => {
    return COLUMNAS.flatMap((col) =>
      col.categorias.flatMap((cat) =>
        cat.items.map((item) => ({ ...item, columnaKey: col.key, colorTitulo: col.colorTitulo }))
      )
    )
  }, [])

  const terminoNormalizado = aplicarSinonimo(busqueda.toLowerCase().trim())
  const buscando = terminoNormalizado !== ''

  const resultados = useMemo(() => {
    if (!buscando) return []
    return itemsBuscables.filter(
      (item) =>
        item.nombre.toLowerCase().includes(terminoNormalizado) ||
        item.acceso.toLowerCase().includes(terminoNormalizado)
    )
  }, [buscando, terminoNormalizado, itemsBuscables])

  return (
    <div className="space-y-6">
      <header className="text-center">
        <p className="text-gray-400 text-xs font-bold tracking-[0.2em] mb-2 uppercase">
          Gerencia Operativa de Planificación y Control de Recursos Humanos
        </p>
        <h1 className="font-primary text-2xl font-bold text-gray-900">Hub de Accesos</h1>
      </header>

      {/* Buscador inteligente */}
      <div className="max-w-2xl mx-auto">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-gray-400">
            🔍
          </span>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre de recurso, planilla, enlace o responsable"
            className="w-full pl-11 pr-11 py-3 bg-white text-gray-800 placeholder-gray-400 text-sm font-medium rounded-full border border-gray-300 focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 shadow-sm transition-all"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              title="Borrar búsqueda"
              className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-gray-700 transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {buscando ? (
        <div className="max-w-5xl mx-auto">
          <p
            className={`inline-block px-4 py-1.5 rounded-full text-xs mb-4 font-bold uppercase tracking-wider ${
              resultados.length === 0 ? 'text-gray-400 bg-gray-100' : 'text-success bg-success/10'
            }`}
          >
            {resultados.length === 0
              ? `No se encontraron resultados para: ${busqueda}`
              : `Resultados encontrados: ${resultados.length}`}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {resultados.map((item) => (
              <a
                key={`${item.columnaKey}-${item.nombre}-${item.url}`}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center justify-center p-3 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all border border-gray-100 hover:border-gray-300 group"
              >
                <span
                  className="text-[10px] font-bold text-gray-700 w-full text-center truncate mb-1 group-hover:text-black"
                  title={item.nombre}
                >
                  {item.nombre}
                </span>
                {item.acceso && (
                  <div className="flex items-center text-[9px] text-gray-500 font-medium min-w-0 w-full justify-center">
                    <span className="shrink-0">Acceso:</span>
                    <span className={`ml-1 ${item.colorTitulo} font-bold truncate`} title={item.acceso}>
                      {item.acceso}
                    </span>
                  </div>
                )}
              </a>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {COLUMNAS.map((col) => (
            <div key={col.key} className={`rounded-2xl shadow border-2 ${col.colorBorde} ${col.colorFondo} p-6 flex flex-col`}>
              <div className="text-3xl text-center mb-2">{col.icono}</div>
              <h2 className={`text-lg font-bold text-center uppercase mb-2 ${col.colorTitulo}`}>{col.titulo}</h2>
              <p className={`${col.colorSubtitulo} text-xs text-center mb-4`}>{col.subtitulo}</p>

              <div className="flex flex-col gap-1 max-h-[520px] overflow-y-auto pr-1">
                {col.categorias.map((cat) => (
                  <details key={cat.titulo} className="group mb-1">
                    <summary
                      className={`flex justify-between items-center font-bold cursor-pointer px-2 py-2 border-b ${col.colorBorde} ${col.colorTitulo} uppercase text-[11px] tracking-wider [&::-webkit-details-marker]:hidden opacity-90 hover:opacity-100`}
                    >
                      <span>{cat.titulo}</span>
                      <span className="transition-transform duration-200 group-open:rotate-180">▾</span>
                    </summary>
                    <div className="flex flex-col gap-2 py-2">
                      {cat.items.map((item) => (
                        <a
                          key={`${item.nombre}-${item.url}`}
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          title={item.nombre}
                          className="flex flex-col items-center px-3 py-2 bg-white rounded-full shadow-sm hover:shadow transition-shadow text-[11px] font-bold text-gray-700 text-center truncate"
                        >
                          {item.nombre}
                        </a>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
