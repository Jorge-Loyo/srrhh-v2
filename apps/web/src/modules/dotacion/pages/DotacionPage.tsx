import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDownIcon, ChevronUpIcon, Squares2X2Icon } from '@heroicons/react/24/outline'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useHospitales, useEscalafones } from '@/shared/hooks/useCatalogos'
import { useAreasProgramaticas, useAreaProgramatica, useUnidadesFijas } from '@/modules/areas-programaticas/hooks/useAreasProgramaticas'
import { MultiSelectDropdown } from '@/shared/components/ui/MultiSelectDropdown'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import { hospitalLabel } from '@/shared/lib/hospitalLabel'
import { capitalizar, capitalizarEtiqueta } from '@/shared/lib/utils'
import { DotacionKpisPanel } from '../components/DotacionKpisPanel'
import {
  useDotacion, useExportDotacion, useDotacionCortes, useDotacionDesglose,
  DOTACION_GROUP_BY_OPTIONS, DOTACION_SIN_DATO,
  type DotacionFilters, type DotacionListResponse, type DotacionRow, type GrupoDotacion,
  type DotacionGroupByKey,
} from '../hooks/useDotacion'

// La ficha "Sin dato" del panel de Fichas representa un NULL (ver
// DOTACION_SIN_DATO) — se traduce a ida y vuelta entre lo que se MUESTRA
// ("Sin dato") y lo que se GUARDA en el filtro (el sentinel), para no andar
// filtrando por el texto literal "Sin dato" (que no existe en la base).
function valorParaFiltro(valorFicha: string): string {
  return valorFicha === 'Sin dato' ? DOTACION_SIN_DATO : valorFicha
}
function valorParaMostrar(valorFiltro: string): string {
  return valorFiltro === DOTACION_SIN_DATO ? 'Sin dato' : valorFiltro
}

// Traduce cada dimensión del panel "Fichas" al campo de DotacionFilters que ya
// existe en esta pantalla. 9 de las 10 dimensiones comparten el mismo valor de
// texto; `escalafon` es la excepción (el desglose agrupa por nombre, Dotación
// filtra por `escalafonId` — se resuelve con `escalafonNombreToId`, ya
// definido más abajo en este componente).
const FICHA_DIM_TO_FILTRO: Partial<Record<DotacionGroupByKey, keyof DotacionFilters>> = {
  sigla: 'sigla',
  universoTotalizador: 'universoTotalizador',
  tipoHospital: 'tipoHospital',
  monovalencia: 'monovalencia',
  literalPuesto: 'puestoNombre',
  especialidad: 'especialidadNombre',
  sexo: 'sexo',
  situacionRevista: 'situacionRevista',
  reparticion: 'reparticion',
}

// 'YYYY-MM' → 'Agosto 2026' (para el selector de fecha de corte).
function formatMesLargo(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y!, (m ?? 1) - 1, 1)
  const s = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Dimensiones que participan de las UNIONES (OR). Son las que se "congelan" en
// un grupo al apretar "+ Unión". Las búsquedas rápidas, edad/antigüedad, solo
// jefes y estado NO entran al grupo: se aplican como filtros globales (AND).
const DIMENSIONES_UNION = [
  'sigla', 'universoTotalizador', 'tipoHospital', 'monovalencia',
  'escalafonId', 'modalidad', 'puestoNombre', 'especialidadNombre', 'grupoEspecialidad',
  'codigoRegistroId', 'regimen', 'tipoOrigen',
  'sexo', 'situacionRevista', 'reparticion', 'especialidadCph', 'provincia', 'localidad',
  'areaProgramaticaId', 'cesacId', 'unidadFijaId',
] as const

const LIMIT = 50

// S21: /dotacion combina persona + cargo. Los filtros NO son cascada forzada:
// se combinan libremente. Puesto/especialidad se buscan por NOMBRE sobre todo
// el catálogo (distinctValues del dataset filtrado). Se quitaron agrupador y
// unificadorPuesto (ya no existen en la dotación).
//
// Multi-select del CARGO (catálogo, por nombre) — distinct del propio dataset.
const CARGO_MULTI: { key: keyof DotacionFilters; distinctKey: keyof NonNullable<DotacionListResponse['distinctValues']>; label: string }[] = [
  { key: 'puestoNombre', distinctKey: 'puesto', label: 'Puesto' },
  { key: 'especialidadNombre', distinctKey: 'especialidad', label: 'Especialidad' },
  { key: 'grupoEspecialidad', distinctKey: 'grupoEspecialidad', label: 'Grupo de especialidad' },
  { key: 'regimen', distinctKey: 'regimen', label: 'Régimen' },
  { key: 'tipoOrigen', distinctKey: 'tipoOrigen', label: 'Tipo de origen' },
]

// Multi-select de la PERSONA / ocupación — distinct del propio dataset.
// "Especialidad CPH" (personas.especialidad_cph) se quitó: hoy está 100% vacío
// (se poblaría desde ref_especialidades_cuil tipo 'cph', maestro que no se
// cargó), así que el filtro no ofrecía opciones. Reponer acá si llega el dato.
const PERSONA_MULTI: { key: keyof DotacionFilters; distinctKey: keyof NonNullable<DotacionListResponse['distinctValues']>; label: string }[] = [
  { key: 'sexo', distinctKey: 'sexo', label: 'Sexo' },
  { key: 'situacionRevista', distinctKey: 'situacionRevista', label: 'Situación de Revista' },
  { key: 'reparticion', distinctKey: 'reparticion', label: 'Repartición (SIAL)' },
  { key: 'provincia', distinctKey: 'provincia', label: 'Provincia' },
  { key: 'localidad', distinctKey: 'localidad', label: 'Localidad' },
]

const SIGLAS_FILTERS: { key: keyof DotacionFilters; label: string }[] = [
  { key: 'universoTotalizador', label: 'Universo' },
  { key: 'tipoHospital', label: 'Tipo Hospital' },
  { key: 'monovalencia', label: 'Monovalencia' },
]

// Etiqueta legible de tipo de origen (R / TTR / null=normal).
function tipoOrigenLabel(v: string): string {
  if (v === 'R') return 'Reemplazante (R)'
  if (v === 'TTR') return 'Titular transitorio (TTR)'
  return v
}

// Columnas de la tabla. Puesto/especialidad muestran el nombre del catálogo
// (capitalizado). Se agregaron Cód. Registro; se quitaron Agrupador/Unificador.
const COLUMNS: { key: keyof DotacionRow; label: string; sortKey?: string; cap?: boolean }[] = [
  { key: 'codigoRol', label: 'Cód. SIAL', sortKey: 'codigoRol' },
  { key: 'cuil', label: 'CUIL', sortKey: 'cuil' },
  { key: 'nombreApellido', label: 'Apellido y Nombre', sortKey: 'nombreApellido' },
  { key: 'sigla', label: 'Repartición', sortKey: 'sigla' },
  { key: 'escalafon', label: 'Carrera', sortKey: 'escalafon' },
  { key: 'codigoRegistro', label: 'Cód. Registro' },
  { key: 'codigoCargo', label: 'Cód. Cargo', sortKey: 'codigoCargo' },
  { key: 'literalPuesto', label: 'Puesto', sortKey: 'literalPuesto', cap: true },
  { key: 'especialidad', label: 'Especialidad', sortKey: 'especialidad', cap: true },
  { key: 'regimen', label: 'Régimen' },
  { key: 'situacionRevista', label: 'Situación de Revista', sortKey: 'situacionRevista' },
  { key: 'reparticion', label: 'Repartición (SIAL)', sortKey: 'reparticion' },
  { key: 'sexo', label: 'Sexo', sortKey: 'sexo' },
  { key: 'edad', label: 'Edad', sortKey: 'edad' },
  { key: 'antiguedad', label: 'Antigüedad', sortKey: 'antiguedad' },
]

function getCsv(searchParams: URLSearchParams, key: string): string[] {
  const v = searchParams.get(key)
  return v ? v.split(',').filter(Boolean) : []
}

export function DotacionPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [kpisOpen, setKpisOpen] = useState(false)
  const [fichasOpen, setFichasOpen] = useState(false)
  const [groupByFichas, setGroupByFichas] = useState<DotacionGroupByKey>('sigla')
  // "Elegir varias" del panel de fichas — igual que el resto de los multi-select
  // de esta pantalla, se van marcando y se aplican todas juntas al filtro.
  const [modoMultiFichas, setModoMultiFichas] = useState(false)
  const [seleccionMultiFichas, setSeleccionMultiFichas] = useState<string[]>([])
  const [buscarFicha, setBuscarFicha] = useState('')
  const exportar = useExportDotacion()
  const { data: cortes } = useDotacionCortes()
  const mesCorte = searchParams.get('mesCorte') ?? ''

  const page = Number(searchParams.get('page') ?? '1')
  const sortBy = searchParams.get('sortBy') ?? undefined
  const sortDir = (searchParams.get('sortDir') as 'asc' | 'desc' | null) ?? 'asc'

  // Uniones (OR) ya fijadas — persistidas como JSON en el searchParam `grupos`.
  const grupos: GrupoDotacion[] = (() => {
    const raw = searchParams.get('grupos')
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as GrupoDotacion[]) : []
    } catch {
      return []
    }
  })()

  // Repartición ahora es multi-select (CSV, igual que el resto de filtros de
  // segmentación). El backend ya acepta `sigla` como lista (IN).
  const siglas = getCsv(searchParams, 'sigla')
  const escalafonId = getCsv(searchParams, 'escalafonId')
  const codigoRegistroId = getCsv(searchParams, 'codigoRegistroId')
  const modalidad = (searchParams.get('modalidad') ?? '') as '' | 'pof' | 'pou'
  const soloJefes = searchParams.get('soloJefes') === 'true'
  const codigoCargo = searchParams.get('codigoCargo') ?? ''
  const nombreApellido = searchParams.get('nombreApellido') ?? ''
  const cuil = searchParams.get('cuil') ?? ''
  const codigoRol = searchParams.get('codigoRol') ?? ''
  // S23-8: Área Programática / CeSAC / unidad fija. El combo de CeSAC se
  // acota a la AP elegida (cascada, igual que el boceto) — un solo id de AP
  // a la vez maneja esa cascada aunque el filtro en sí sea multi-select.
  const areaProgramaticaId = getCsv(searchParams, 'areaProgramaticaId')
  const cesacId = getCsv(searchParams, 'cesacId')
  const unidadFijaId = getCsv(searchParams, 'unidadFijaId')

  const nombreApellidoDeb = useDebounce(nombreApellido, 300)
  const cuilDeb = useDebounce(cuil, 300)
  const codigoCargoDeb = useDebounce(codigoCargo, 300)
  const codigoRolDeb = useDebounce(codigoRol, 300)

  function setParam(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value); else next.delete(key)
      next.delete('page')
      return next
    })
  }

  function setCsvParam(key: string, values: string[]) {
    setParam(key, values.join(','))
  }

  // Guarda la lista de grupos como JSON en la URL (o la borra si queda vacía).
  function setGrupos(next: GrupoDotacion[]) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      if (next.length) params.set('grupos', JSON.stringify(next))
      else params.delete('grupos')
      params.delete('page')
      return params
    })
  }

  function quitarGrupo(index: number) {
    setGrupos(grupos.filter((_, i) => i !== index))
  }

  function setPage(p: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (p === 1) next.delete('page'); else next.set('page', String(p))
      return next
    }, { replace: true })
  }

  function handleSort(sortKey?: string) {
    if (!sortKey) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      const curSortBy = prev.get('sortBy')
      const curDir = prev.get('sortDir') ?? 'asc'
      const nextDir = curSortBy === sortKey && curDir === 'asc' ? 'desc' : 'asc'
      next.set('sortBy', sortKey)
      next.set('sortDir', nextDir)
      next.delete('page')
      return next
    })
  }

  const filters: DotacionFilters = {
    page, limit: LIMIT, sortBy, sortDir,
    ...(grupos.length && { grupos }),
    ...(siglas.length && { sigla: siglas }),
    ...(getCsv(searchParams, 'universoTotalizador').length && { universoTotalizador: getCsv(searchParams, 'universoTotalizador') }),
    ...(getCsv(searchParams, 'tipoHospital').length && { tipoHospital: getCsv(searchParams, 'tipoHospital') }),
    ...(getCsv(searchParams, 'monovalencia').length && { monovalencia: getCsv(searchParams, 'monovalencia') }),
    // Catálogo del cargo (multi-select combinable, por nombre / FK).
    ...(escalafonId.length && { escalafonId }),
    ...(modalidad && { modalidad }),
    ...(getCsv(searchParams, 'puestoNombre').length && { puestoNombre: getCsv(searchParams, 'puestoNombre') }),
    ...(getCsv(searchParams, 'especialidadNombre').length && { especialidadNombre: getCsv(searchParams, 'especialidadNombre') }),
    ...(getCsv(searchParams, 'grupoEspecialidad').length && { grupoEspecialidad: getCsv(searchParams, 'grupoEspecialidad') }),
    ...(codigoRegistroId.length && { codigoRegistroId }),
    ...(getCsv(searchParams, 'regimen').length && { regimen: getCsv(searchParams, 'regimen') }),
    ...(getCsv(searchParams, 'tipoOrigen').length && { tipoOrigen: getCsv(searchParams, 'tipoOrigen') }),
    ...(soloJefes && { soloJefes: true }),
    // Persona / ocupación.
    ...(getCsv(searchParams, 'sexo').length && { sexo: getCsv(searchParams, 'sexo') }),
    ...(getCsv(searchParams, 'situacionRevista').length && { situacionRevista: getCsv(searchParams, 'situacionRevista') }),
    ...(getCsv(searchParams, 'reparticion').length && { reparticion: getCsv(searchParams, 'reparticion') }),
    ...(getCsv(searchParams, 'especialidadCph').length && { especialidadCph: getCsv(searchParams, 'especialidadCph') }),
    ...(getCsv(searchParams, 'provincia').length && { provincia: getCsv(searchParams, 'provincia') }),
    ...(getCsv(searchParams, 'localidad').length && { localidad: getCsv(searchParams, 'localidad') }),
    ...(areaProgramaticaId.length && { areaProgramaticaId }),
    ...(cesacId.length && { cesacId }),
    ...(unidadFijaId.length && { unidadFijaId }),
    ...(codigoCargoDeb && { codigoCargo: codigoCargoDeb }),
    ...(nombreApellidoDeb && { nombreApellido: nombreApellidoDeb }),
    ...(cuilDeb && { cuil: cuilDeb }),
    ...(codigoRolDeb && { codigoRol: codigoRolDeb }),
    ...(searchParams.get('edadMin') && { edadMin: Number(searchParams.get('edadMin')) }),
    ...(searchParams.get('edadMax') && { edadMax: Number(searchParams.get('edadMax')) }),
    ...(searchParams.get('antiguedadMin') && { antiguedadMin: Number(searchParams.get('antiguedadMin')) }),
    ...(searchParams.get('antiguedadMax') && { antiguedadMax: Number(searchParams.get('antiguedadMax')) }),
    ...(searchParams.get('estado') && { estado: searchParams.get('estado') as string }),
    ...(mesCorte && { mesCorte }),
  }

  const { data, isLoading, isFetching, isError } = useDotacion(filters)
  const { data: hospitales } = useHospitales()
  const { data: escalafones } = useEscalafones(true)
  // S23-8: catálogo de Área Programática / CeSAC / unidad fija (S23-5).
  const { data: areasProgramaticas } = useAreasProgramaticas()
  const { data: unidadesFijas } = useUnidadesFijas()
  // Cascada: el combo de CeSAC muestra solo los de la 1ª AP elegida.
  const { data: apSeleccionada } = useAreaProgramatica(areaProgramaticaId[0])
  const apNombreToId = (nombre: string) => areasProgramaticas?.find((a) => a.nombre === nombre)?.id ?? ''
  const apIdToNombre = (id: string) => areasProgramaticas?.find((a) => a.id === id)?.nombre ?? id
  const cesacLabel = (c: { numero: number; barrio: string | null }) => `Nº ${c.numero}${c.barrio ? ` — ${c.barrio}` : ''}`
  const cesacOptions = apSeleccionada?.cesacs.map(cesacLabel) ?? []
  const cesacLabelToId = (label: string) => apSeleccionada?.cesacs.find((c) => cesacLabel(c) === label)?.id ?? ''
  const cesacIdToLabel = (id: string) => {
    const c = apSeleccionada?.cesacs.find((x) => x.id === id)
    return c ? cesacLabel(c) : id
  }
  const unidadFijaNombreToId = (nombre: string) => unidadesFijas?.find((u) => u.nombre === nombre)?.id ?? ''
  const unidadFijaIdToNombre = (id: string) => unidadesFijas?.find((u) => u.id === id)?.nombre ?? id
  const escalafonesOrdenados = [...(escalafones ?? [])].sort((a, b) =>
    escalafonLabel(a.nombre).localeCompare(escalafonLabel(b.nombre), 'es')
  )
  const codigosRegistro = data?.codigoRegistro ?? []

  const hasActiveFilters = Array.from(searchParams.keys()).some((k) => !['page', 'sortBy', 'sortDir'].includes(k))
  const estadoFilter = searchParams.get('estado') ?? ''

  // Multi-select de escalafón (por id; muestra el nombre). Independiente:
  // se puede elegir varios; el resto de filtros se combinan con AND.
  // Repartición multi-select: value = sigla, label = nombre legible del hospital.
  const reparticionOptions = (hospitales ?? []).map((h) => h.sigla)
  const reparticionLabelDeSigla = (s: string) => {
    const h = hospitales?.find((x) => x.sigla === s)
    return h ? hospitalLabel(h) : s
  }

  const escalafonOptions = escalafonesOrdenados.map((e) => escalafonLabel(e.nombre))
  const escalafonNombreToId = (nombre: string) =>
    escalafonesOrdenados.find((e) => escalafonLabel(e.nombre) === nombre)?.id ?? ''
  const escalafonIdToNombre = (id: string) => {
    const e = escalafonesOrdenados.find((x) => x.id === id)
    return e ? escalafonLabel(e.nombre) : id
  }

  // Panel "Fichas" — conteo por valor de la dimensión elegida, bajo los MISMOS
  // `filters` que ya tiene aplicado el listado de abajo (uniones incluidas).
  const { data: fichas, isFetching: isFetchingFichas } = useDotacionDesglose(groupByFichas, filters, { enabled: fichasOpen })

  useEffect(() => { setModoMultiFichas(false); setSeleccionMultiFichas([]); setBuscarFicha('') }, [groupByFichas])

  // ¿Este valor ya está aplicado como filtro de esa dimensión? — se usa para
  // marcar la ficha como "ya aplicada" apenas se toca, confirmación visual de
  // que el click realmente sumó el filtro (antes no había ninguna).
  function fichaYaAplicada(dim: DotacionGroupByKey, value: string): boolean {
    const valorFiltro = valorParaFiltro(value)
    if (dim === 'escalafon') return escalafonId.includes(escalafonNombreToId(valorFiltro))
    const campo = FICHA_DIM_TO_FILTRO[dim]
    if (!campo) return false
    return getCsv(searchParams, campo as string).includes(valorFiltro)
  }

  function toggleSeleccionMultiFicha(value: string) {
    setSeleccionMultiFichas((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  }

  // Agrega (no reemplaza) el/los valor(es) elegidos al filtro de esa
  // dimensión — mismo criterio "multi-select que se combina" que ya usa el
  // resto de la pantalla.
  function agregarValoresFicha(dim: DotacionGroupByKey, valoresFicha: string[]) {
    const valores = valoresFicha.map(valorParaFiltro)
    if (dim === 'escalafon') {
      const idsNuevos = valores.map(escalafonNombreToId).filter(Boolean)
      const siguiente = [...new Set([...escalafonId, ...idsNuevos])]
      setCsvParam('escalafonId', siguiente)
      return
    }
    const campo = FICHA_DIM_TO_FILTRO[dim]
    if (!campo) return
    const actuales = getCsv(searchParams, campo as string)
    const siguiente = [...new Set([...actuales, ...valores])]
    setCsvParam(campo as string, siguiente)
  }

  function quitarValorFicha(dim: DotacionGroupByKey, valorFicha: string) {
    const value = valorParaFiltro(valorFicha)
    if (dim === 'escalafon') {
      const id = escalafonNombreToId(value)
      setCsvParam('escalafonId', escalafonId.filter((x) => x !== id))
      return
    }
    const campo = FICHA_DIM_TO_FILTRO[dim]
    if (!campo) return
    setCsvParam(campo as string, getCsv(searchParams, campo as string).filter((v) => v !== value))
  }

  function tocarFicha(value: string) {
    if (modoMultiFichas) { toggleSeleccionMultiFicha(value); return }
    if (fichaYaAplicada(groupByFichas, value)) {
      quitarValorFicha(groupByFichas, value)
    } else {
      agregarValoresFicha(groupByFichas, [value])
    }
  }

  function aplicarSeleccionMultiFichas() {
    if (seleccionMultiFichas.length === 0) return
    agregarValoresFicha(groupByFichas, seleccionMultiFichas)
    setModoMultiFichas(false)
    setSeleccionMultiFichas([])
  }

  // Etiqueta "codigo — literal" (ej. "24 — Residencias"): el código desambigua
  // literales repetidos (22 y 37 comparten "Nueva Carrera Prof. Hosp").
  const codigoRegistroLabel = (c: { codigo: string; nombre: string }) => `${c.codigo} — ${c.nombre}`
  const codigoRegistroOptions = codigosRegistro.map(codigoRegistroLabel)
  const codigoRegistroNombreToId = (label: string) => codigosRegistro.find((c) => codigoRegistroLabel(c) === label)?.id ?? ''
  const codigoRegistroIdToNombre = (id: string) => {
    const c = codigosRegistro.find((x) => x.id === id)
    return c ? codigoRegistroLabel(c) : id
  }

  // ¿Hay dimensiones de unión seteadas en el "grupo en edición" (filtros sueltos)?
  const hayDimensionEnEdicion = DIMENSIONES_UNION.some((k) => {
    if (k === 'modalidad') return Boolean(modalidad)
    if (k === 'sigla') return siglas.length > 0
    return getCsv(searchParams, k).length > 0
  })

  // Toma las dimensiones actuales (grupo en edición), las congela como una nueva
  // unión con etiquetas legibles para los chips, y limpia esos filtros sueltos
  // para armar el próximo grupo. Las búsquedas rápidas / rangos / solo jefes NO
  // se tocan (son filtros globales AND).
  function agregarUnion() {
    if (!hayDimensionEnEdicion) return
    const g: GrupoDotacion = {}
    const labels: string[] = []

    const addArr = (key: Exclude<keyof GrupoDotacion, 'labels' | 'modalidad'>, valores: string[], chip: (v: string) => string = (v) => v) => {
      if (valores.length) {
        g[key] = valores
        labels.push(valores.map(chip).join(' / '))
      }
    }

    addArr('sigla', siglas)
    addArr('universoTotalizador', getCsv(searchParams, 'universoTotalizador'), capitalizarEtiqueta)
    addArr('tipoHospital', getCsv(searchParams, 'tipoHospital'), capitalizarEtiqueta)
    addArr('monovalencia', getCsv(searchParams, 'monovalencia'), capitalizarEtiqueta)
    addArr('escalafonId', getCsv(searchParams, 'escalafonId'), escalafonIdToNombre)
    if (modalidad) { g.modalidad = modalidad; labels.push(modalidad === 'pof' ? 'POF' : 'POU') }
    addArr('puestoNombre', getCsv(searchParams, 'puestoNombre'), capitalizar)
    addArr('especialidadNombre', getCsv(searchParams, 'especialidadNombre'), capitalizar)
    addArr('grupoEspecialidad', getCsv(searchParams, 'grupoEspecialidad'))
    addArr('codigoRegistroId', getCsv(searchParams, 'codigoRegistroId'), codigoRegistroIdToNombre)
    addArr('regimen', getCsv(searchParams, 'regimen'))
    addArr('tipoOrigen', getCsv(searchParams, 'tipoOrigen'), tipoOrigenLabel)
    addArr('sexo', getCsv(searchParams, 'sexo'))
    addArr('situacionRevista', getCsv(searchParams, 'situacionRevista'))
    addArr('reparticion', getCsv(searchParams, 'reparticion'))
    addArr('especialidadCph', getCsv(searchParams, 'especialidadCph'))
    addArr('provincia', getCsv(searchParams, 'provincia'))
    addArr('localidad', getCsv(searchParams, 'localidad'))
    addArr('areaProgramaticaId', areaProgramaticaId, apIdToNombre)
    addArr('cesacId', cesacId, cesacIdToLabel)
    addArr('unidadFijaId', unidadFijaId, unidadFijaIdToNombre)
    g.labels = labels

    // Agrega el grupo y limpia las dimensiones sueltas en una sola actualización.
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      params.set('grupos', JSON.stringify([...grupos, g]))
      for (const k of DIMENSIONES_UNION) params.delete(k)
      params.delete('page')
      return params
    })
  }

  // Chips de "Filtros activos" para cada dimensión multi-valor — antes solo
  // mostraba sigla/grupos/estado/solo jefes, así que algo aplicado desde
  // Fichas (o desde el propio drawer) en cualquier otra dimensión quedaba sin
  // ninguna confirmación visual acá. labelFn solo cambia el texto mostrado; al
  // quitar se filtra sobre los valores CRUDOS (ids donde corresponda).
  function chipsPara(key: string, valores: string[], labelFn: (v: string) => string = (v) => v) {
    return valores.map((v) => ({
      key: `${key}:${v}`,
      label: v === DOTACION_SIN_DATO ? valorParaMostrar(v) : labelFn(v),
      onQuitar: () => setCsvParam(key, valores.filter((x) => x !== v)),
    }))
  }

  const chipsFiltrosMultiValor = [
    ...chipsPara('universoTotalizador', getCsv(searchParams, 'universoTotalizador'), capitalizarEtiqueta),
    ...chipsPara('tipoHospital', getCsv(searchParams, 'tipoHospital'), capitalizarEtiqueta),
    ...chipsPara('monovalencia', getCsv(searchParams, 'monovalencia'), capitalizarEtiqueta),
    ...chipsPara('escalafonId', escalafonId, escalafonIdToNombre),
    ...chipsPara('codigoRegistroId', codigoRegistroId, codigoRegistroIdToNombre),
    ...chipsPara('puestoNombre', getCsv(searchParams, 'puestoNombre'), capitalizar),
    ...chipsPara('especialidadNombre', getCsv(searchParams, 'especialidadNombre'), capitalizar),
    ...chipsPara('regimen', getCsv(searchParams, 'regimen')),
    ...chipsPara('tipoOrigen', getCsv(searchParams, 'tipoOrigen'), tipoOrigenLabel),
    ...chipsPara('sexo', getCsv(searchParams, 'sexo')),
    ...chipsPara('situacionRevista', getCsv(searchParams, 'situacionRevista')),
    ...chipsPara('reparticion', getCsv(searchParams, 'reparticion')),
    ...chipsPara('especialidadCph', getCsv(searchParams, 'especialidadCph')),
    ...chipsPara('provincia', getCsv(searchParams, 'provincia')),
    ...chipsPara('localidad', getCsv(searchParams, 'localidad')),
    ...chipsPara('areaProgramaticaId', areaProgramaticaId, apIdToNombre),
    ...chipsPara('cesacId', cesacId, cesacIdToLabel),
    ...chipsPara('unidadFijaId', unidadFijaId, unidadFijaIdToNombre),
  ]

  // Filtros escalares (un solo valor, no CSV) — modalidad + búsqueda rápida +
  // rangos de edad/antigüedad.
  const chipsFiltrosEscalares = [
    ...(modalidad ? [{ key: 'modalidad', label: modalidad === 'pof' ? 'Planta (POF)' : 'Guardia (POU)', onQuitar: () => setParam('modalidad', '') }] : []),
    ...(codigoCargo ? [{ key: 'codigoCargo', label: `Cód. Cargo: ${codigoCargo}`, onQuitar: () => setParam('codigoCargo', '') }] : []),
    ...(nombreApellido ? [{ key: 'nombreApellido', label: nombreApellido, onQuitar: () => setParam('nombreApellido', '') }] : []),
    ...(cuil ? [{ key: 'cuil', label: `CUIL: ${cuil}`, onQuitar: () => setParam('cuil', '') }] : []),
    ...(codigoRol ? [{ key: 'codigoRol', label: `Cód. SIAL: ${codigoRol}`, onQuitar: () => setParam('codigoRol', '') }] : []),
    ...(searchParams.get('edadMin') ? [{ key: 'edadMin', label: `Edad ≥ ${searchParams.get('edadMin')}`, onQuitar: () => setParam('edadMin', '') }] : []),
    ...(searchParams.get('edadMax') ? [{ key: 'edadMax', label: `Edad ≤ ${searchParams.get('edadMax')}`, onQuitar: () => setParam('edadMax', '') }] : []),
    ...(searchParams.get('antiguedadMin') ? [{ key: 'antiguedadMin', label: `Antigüedad ≥ ${searchParams.get('antiguedadMin')}`, onQuitar: () => setParam('antiguedadMin', '') }] : []),
    ...(searchParams.get('antiguedadMax') ? [{ key: 'antiguedadMax', label: `Antigüedad ≤ ${searchParams.get('antiguedadMax')}`, onQuitar: () => setParam('antiguedadMax', '') }] : []),
  ]

  function renderCell(row: DotacionRow, col: (typeof COLUMNS)[number]) {
    const raw = row[col.key]
    if (raw === null || raw === undefined || raw === '') return '—'
    return col.cap ? capitalizar(String(raw)) : raw
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-primary text-xl font-bold text-gray-900">Dotación</h1>
          <div className="flex items-center gap-2 mt-1">
            <label className="text-xs text-gray-500">Fecha de corte:</label>
            <select
              value={mesCorte}
              onChange={(e) => setParam('mesCorte', e.target.value)}
              className="h-7 px-2 border border-gray-300 rounded text-xs focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            >
              <option value="">Actual (hoy)</option>
              {cortes?.map((c) => (
                <option key={c.mes} value={c.mes}>{formatMesLargo(c.mes)}</option>
              ))}
            </select>
            {mesCorte && (
              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium">
                📸 Foto al cierre de {formatMesLargo(mesCorte)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setKpisOpen(true)}
            className="inline-flex items-center gap-1.5 bg-secondary text-white text-sm font-semibold px-3 py-2 rounded hover:bg-secondary-dark transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
            </svg>
            KPIs
          </button>
          <button
            onClick={() => setFichasOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded border transition-colors ${
              fichasOpen ? 'bg-secondary/10 border-secondary text-secondary' : 'border-gray-300 text-gray-600 hover:border-gray-400'
            }`}
          >
            <Squares2X2Icon className="w-4 h-4" />
            Fichas
            {fichasOpen ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-1.5 bg-navy text-white text-sm font-semibold px-3 py-2 rounded hover:bg-navy/80 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V17a1 1 0 01-.553.894l-4 2A1 1 0 017 19v-8.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
            </svg>
            Búsqueda avanzada
            {hasActiveFilters && (
              <span className="bg-white/30 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {Array.from(searchParams.keys()).filter((k) => !['page','sortBy','sortDir'].includes(k)).length}
              </span>
            )}
          </button>

          <div className="w-px h-6 bg-gray-200" />

          <button
            onClick={() => exportar.mutate(filters)}
            disabled={exportar.isPending}
            className="inline-flex items-center gap-1.5 btn-outline text-sm py-2 disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" />
            </svg>
            {exportar.isPending ? 'Exportando...' : 'Exportar'}
          </button>
        </div>
      </div>

      {/* Panel "Fichas" — conteo por dimensión bajo los filtros ya aplicados;
          tocar una ficha la suma al filtro correspondiente (no reemplaza,
          se combina como el resto de los multi-select de esta pantalla). */}
      {fichasOpen && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {DOTACION_GROUP_BY_OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => setGroupByFichas(o.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  groupByFichas === o.key
                    ? 'bg-secondary border-secondary text-white'
                    : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Fichas — {DOTACION_GROUP_BY_OPTIONS.find((o) => o.key === groupByFichas)?.label}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                value={buscarFicha}
                onChange={(e) => setBuscarFicha(e.target.value)}
                placeholder="Buscar..."
                className="h-8 px-2.5 w-36 border border-gray-300 rounded text-xs focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
              />
              <button
                onClick={() => setModoMultiFichas((v) => !v)}
                className={`text-xs font-semibold px-3 py-1.5 rounded border transition-colors ${
                  modoMultiFichas
                    ? 'bg-secondary/10 border-secondary text-secondary'
                    : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                }`}
              >
                Elegir varias
              </button>
              {modoMultiFichas && (
                <button
                  onClick={aplicarSeleccionMultiFichas}
                  disabled={seleccionMultiFichas.length === 0}
                  className="btn-outline text-xs px-3 py-1.5 disabled:opacity-40"
                >
                  Aplicar ({seleccionMultiFichas.length})
                </button>
              )}
            </div>
          </div>

          {(() => {
            const q = buscarFicha.trim().toLowerCase()
            const rows = (fichas?.rows ?? []).filter((row) => !q || row.value.toLowerCase().includes(q))
            if (rows.length === 0) {
              return (
                <p className="text-sm text-gray-400">
                  {q ? 'Ninguna ficha coincide con la búsqueda.' : 'Sin datos para los filtros actuales.'}
                </p>
              )
            }
            return (
              <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-64 overflow-y-auto pr-1 ${isFetchingFichas ? 'opacity-60' : ''}`}>
                {rows.map((row) => {
                  // "Sin dato" es una etiqueta que le pone el backend a los
                  // NULL de esta dimensión (ver getDotacionDesgloseService) —
                  // no es un valor real de la base, así que no hay forma de
                  // filtrar por él directo (buildConditions ya lo traduce a
                  // IS NULL, ver DOTACION_SIN_DATO) — se ve igual que el resto.
                  const marcada = seleccionMultiFichas.includes(row.value)
                  const aplicada = fichaYaAplicada(groupByFichas, row.value)
                  return (
                    <button
                      key={row.value}
                      onClick={() => tocarFicha(row.value)}
                      title={aplicada ? 'Ya aplicado como filtro — tocá de nuevo para quitarlo' : undefined}
                      className={`text-left rounded-lg px-4 py-3 border transition-colors ${
                        marcada
                          ? 'bg-secondary/10 border-secondary ring-1 ring-secondary'
                          : aplicada
                            ? 'bg-green-50 border-green-300'
                            : 'bg-gray-50 border-gray-200 hover:border-secondary hover:bg-secondary/5'
                      }`}
                    >
                      <p className="text-xs font-medium text-gray-500 truncate flex items-center gap-1.5">
                        {modoMultiFichas && (
                          <span className={`inline-block w-3 h-3 rounded-sm border ${marcada ? 'bg-secondary border-secondary' : 'border-gray-300'}`} />
                        )}
                        {!modoMultiFichas && aplicada && <span className="text-green-600">✓</span>}
                        {row.value}
                      </p>
                      <p className="text-xl font-bold text-gray-900 tabular-nums">{row.total.toLocaleString('es-AR')}</p>
                    </button>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}

      {/* Indicador de filtros activos — todas las dimensiones (incluidas las
          que se aplican desde el panel "Fichas"), no solo sigla/uniones. */}
      {hasActiveFilters && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-2 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 shrink-0">Filtros activos</span>
          {grupos.length > 0 && (
            <span className="inline-flex items-center gap-1 bg-secondary/10 text-secondary text-xs px-2 py-0.5 rounded-full">
              {grupos.length} {grupos.length === 1 ? 'unión' : 'uniones'} (O)
              <button onClick={() => setGrupos([])} className="hover:text-danger">×</button>
            </span>
          )}
          {estadoFilter && (
            <span className="inline-flex items-center gap-1 bg-secondary/10 text-secondary text-xs px-2 py-0.5 rounded-full">
              {estadoFilter}
              <button onClick={() => setParam('estado', '')} className="hover:text-danger">×</button>
            </span>
          )}
          {siglas.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 bg-secondary/10 text-secondary text-xs px-2 py-0.5 rounded-full">
              {s}
              <button onClick={() => setCsvParam('sigla', siglas.filter((x) => x !== s))} className="hover:text-danger">×</button>
            </span>
          ))}
          {soloJefes && (
            <span className="inline-flex items-center gap-1 bg-secondary/10 text-secondary text-xs px-2 py-0.5 rounded-full">
              Solo jefes
              <button onClick={() => setParam('soloJefes', '')} className="hover:text-danger">×</button>
            </span>
          )}
          {[...chipsFiltrosMultiValor, ...chipsFiltrosEscalares].map((chip) => (
            <span key={chip.key} className="inline-flex items-center gap-1 bg-secondary/10 text-secondary text-xs px-2 py-0.5 rounded-full">
              {chip.label}
              <button onClick={chip.onQuitar} className="hover:text-danger">×</button>
            </span>
          ))}
          <button onClick={() => setSearchParams({})} className="ml-auto text-xs text-danger hover:underline">
            Limpiar todo
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 flex flex-col overflow-hidden min-h-0">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando dotación...</p>}
        {isError && <p className="p-6 text-sm text-danger">No se pudo cargar el listado de dotación.</p>}

        {!isLoading && !isError && data && (
          <>
            <div className="flex-1 overflow-auto min-h-0">
              {data.rows.length === 0 ? (
                <p className="p-6 text-sm text-gray-400 text-center">Sin registros para los filtros seleccionados.</p>
              ) : (
                <table className={`w-full text-sm border-separate border-spacing-0 ${isFetching ? 'opacity-60' : ''}`}>
                  <thead className="bg-navy text-white text-left sticky top-0 z-10">
                    <tr>
                      {COLUMNS.map((col) => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.sortKey)}
                          className={`px-3 py-2.5 font-semibold whitespace-nowrap select-none ${col.sortKey ? 'cursor-pointer hover:bg-navy/80' : ''}`}
                        >
                          <div className="flex items-center gap-1">
                            {col.label}
                            {col.sortKey && sortBy === col.sortKey && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.rows.map((row, idx) => (
                      <tr key={`${row.cuil}-${row.codigoRol}-${idx}`} className="hover:bg-gray-50">
                        {COLUMNS.map((col) => (
                          <td key={col.key} className="px-3 py-1.5 whitespace-nowrap text-gray-800">
                            {renderCell(row, col)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
              <span>
                Mostrando {data.rows.length} de {data.total.toLocaleString('es-AR')} — página {data.page} de {data.pages || 1}
              </span>
              <div className="flex gap-2">
                <button className="btn-outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
                <button className="btn-outline" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Siguiente</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal KPIs */}
      {kpisOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4" onClick={() => setKpisOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h2 className="font-primary text-base font-bold text-gray-900">KPIs de Dotación</h2>
              <button onClick={() => setKpisOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <div className="p-5">
              <DotacionKpisPanel
                sigla={siglas[0] ?? ''}
                onFilterSigla={(s) => { setCsvParam('sigla', s ? [s] : []); setKpisOpen(false) }}
                estado={estadoFilter}
                onFilterEstado={(e) => { setParam('estado', e); setKpisOpen(false) }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Drawer búsqueda avanzada */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <div className="relative bg-white w-full max-w-sm h-full shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h2 className="font-primary text-base font-bold text-gray-900">Búsqueda avanzada</h2>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-5">

              {/* Uniones (OR): grupos ya fijados + acción para fijar el actual */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Uniones (O)</p>
                  <button
                    type="button"
                    onClick={agregarUnion}
                    disabled={!hayDimensionEnEdicion}
                    title="Fijar los filtros de abajo como una unión (OR) y empezar otra combinación"
                    className="h-8 px-3 rounded border border-secondary text-secondary text-xs font-semibold hover:bg-secondary/5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    + Unión
                  </button>
                </div>
                {grupos.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    Combiná filtros abajo y tocá <span className="font-semibold">+ Unión</span> para
                    sumar un conjunto. Los conjuntos se unen con O (ej. “psicólogos del Hospital A” O “enfermeros del Hospital B”).
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {grupos.map((g, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-full bg-secondary/15 px-2.5 py-1 text-xs font-medium text-secondary"
                      >
                        {(g.labels && g.labels.length ? g.labels.join(' · ') : 'Filtro')}
                        <button
                          type="button"
                          onClick={() => quitarGrupo(i)}
                          className="ml-0.5 hover:text-secondary/60"
                          aria-label="Quitar unión"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Repartición</p>
                <MultiSelectDropdown
                  label="Reparticiones"
                  value={siglas}
                  options={reparticionOptions}
                  onChange={(v) => setCsvParam('sigla', v)}
                  formatOption={reparticionLabelDeSigla}
                />
                <div className="space-y-2 mt-2">
                  {SIGLAS_FILTERS.map(({ key, label }) => (
                    <MultiSelectDropdown
                      key={key}
                      label={label}
                      value={getCsv(searchParams, key)}
                      options={data?.siglasDistinctValues?.[key as 'universoTotalizador' | 'tipoHospital' | 'monovalencia'] ?? []}
                      onChange={(v) => setCsvParam(key, v)}
                      formatOption={capitalizarEtiqueta}
                    />
                  ))}
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Cargo</p>
                <div className="space-y-2">
                  {/* Carrera (multi, por id mostrando nombre) */}
                  <MultiSelectDropdown
                    label="Carrera"
                    value={escalafonId.map(escalafonIdToNombre)}
                    options={escalafonOptions}
                    onChange={(nombres) => setCsvParam('escalafonId', nombres.map(escalafonNombreToId).filter(Boolean))}
                  />
                  {/* Modalidad (única) */}
                  <select
                    value={modalidad}
                    onChange={(e) => setParam('modalidad', e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                  >
                    <option value="">Todas las modalidades</option>
                    <option value="pof">Planta (POF)</option>
                    <option value="pou">Guardia (POU)</option>
                  </select>
                  {/* Código de registro (multi, por id mostrando nombre) */}
                  <MultiSelectDropdown
                    label="Código de registro"
                    value={codigoRegistroId.map(codigoRegistroIdToNombre)}
                    options={codigoRegistroOptions}
                    onChange={(nombres) => setCsvParam('codigoRegistroId', nombres.map(codigoRegistroNombreToId).filter(Boolean))}
                  />
                  {/* Puesto / especialidad por NOMBRE (buscables sobre todo el
                      catálogo — se acotan solos según lo ya elegido vía distinct) */}
                  {CARGO_MULTI.map(({ key, distinctKey, label }) => (
                    <MultiSelectDropdown
                      key={key}
                      label={label}
                      value={getCsv(searchParams, key)}
                      options={data?.distinctValues?.[distinctKey] ?? []}
                      onChange={(v) => setCsvParam(key, v)}
                      formatOption={distinctKey === 'tipoOrigen' ? tipoOrigenLabel : distinctKey === 'puesto' || distinctKey === 'especialidad' ? capitalizar : undefined}
                    />
                  ))}
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Personal</p>
                <div className="space-y-2">
                  {/* Solo jefes (toggle) */}
                  <button
                    type="button"
                    onClick={() => setParam('soloJefes', soloJefes ? '' : 'true')}
                    className={`w-full h-10 px-3 rounded border text-sm font-semibold transition-colors ${
                      soloJefes
                        ? 'bg-yellow-100 border-yellow-300 text-yellow-800'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    👔 Solo jefes
                  </button>
                  {PERSONA_MULTI.map(({ key, distinctKey, label }) => (
                    <MultiSelectDropdown
                      key={key}
                      label={label}
                      value={getCsv(searchParams, key)}
                      options={data?.distinctValues?.[distinctKey] ?? []}
                      onChange={(v) => setCsvParam(key, v)}
                    />
                  ))}
                </div>
              </section>

              {/* S23-8: Área Programática / CeSAC / estructura fija (S23-5/S23-6) */}
              <section className="border border-secondary/30 rounded-lg p-3 bg-secondary/5">
                <p className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Área Programática / CeSAC</p>
                <div className="space-y-2">
                  <MultiSelectDropdown
                    label="Área Programática"
                    value={areaProgramaticaId.map(apIdToNombre)}
                    options={(areasProgramaticas ?? []).map((a) => a.nombre)}
                    onChange={(nombres) => setCsvParam('areaProgramaticaId', nombres.map(apNombreToId).filter(Boolean))}
                    formatOption={capitalizarEtiqueta}
                  />
                  <MultiSelectDropdown
                    label="CeSAC"
                    value={cesacId.map(cesacIdToLabel)}
                    options={cesacOptions}
                    onChange={(labels) => setCsvParam('cesacId', labels.map(cesacLabelToId).filter(Boolean))}
                    formatOption={capitalizarEtiqueta}
                  />
                  <p className="text-[11px] text-gray-400">CeSAC se acota a la primera Área Programática elegida.</p>
                  <MultiSelectDropdown
                    label="Unidad fija (CEMAR / COI / Red Odonto)"
                    value={unidadFijaId.map(unidadFijaIdToNombre)}
                    options={(unidadesFijas ?? []).map((u) => u.nombre)}
                    onChange={(nombres) => setCsvParam('unidadFijaId', nombres.map(unidadFijaNombreToId).filter(Boolean))}
                    formatOption={capitalizarEtiqueta}
                  />
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Búsqueda rápida</p>
                <div className="space-y-2">
                  <input type="text" value={codigoCargo} placeholder="Cód. Cargo"
                    onChange={(e) => setParam('codigoCargo', e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
                  <input type="text" value={nombreApellido} placeholder="Nombre / Apellido"
                    onChange={(e) => setParam('nombreApellido', e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
                  <input type="text" value={cuil} placeholder="CUIL"
                    onChange={(e) => setParam('cuil', e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
                  <input type="text" value={codigoRol} placeholder="Cód. SIAL"
                    onChange={(e) => setParam('codigoRol', e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Edad</p>
                <div className="flex gap-2">
                  <input type="number" placeholder="Mín" min={0} max={120}
                    value={searchParams.get('edadMin') ?? ''}
                    onChange={(e) => setParam('edadMin', e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
                  <input type="number" placeholder="Máx" min={0} max={120}
                    value={searchParams.get('edadMax') ?? ''}
                    onChange={(e) => setParam('edadMax', e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Antigüedad (años)</p>
                <div className="flex gap-2">
                  <input type="number" placeholder="Mín" min={0}
                    value={searchParams.get('antiguedadMin') ?? ''}
                    onChange={(e) => setParam('antiguedadMin', e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
                  <input type="number" placeholder="Máx" min={0}
                    value={searchParams.get('antiguedadMax') ?? ''}
                    onChange={(e) => setParam('antiguedadMax', e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
                </div>
              </section>
            </div>

            <div className="px-4 py-3 border-t border-gray-200 flex gap-2">
              {hasActiveFilters && (
                <button onClick={() => setSearchParams({})} className="flex-1 btn-outline text-danger border-danger hover:bg-danger/5">
                  Limpiar filtros
                </button>
              )}
              <button onClick={() => setDrawerOpen(false)} className="flex-1 btn-primary">
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
