// Wizard de seguimiento CPH — funciona en dos modos:
// - id === 'nuevo': formulario limpio (sin datos reales aún)
// - id === UUID:    carga el concurso real de la API

import { useState, useMemo, useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import { useEscalafones, usePuestosCargos, useHospitales, useCodigosRegistro } from '@/shared/hooks/useCatalogos'
import { getEspecialidadOptions } from '@/modules/cargos/lib/bajasHelpers'
import type { ConcursoCph } from '@srrhh/types'

type EstadoEtapa = 'completada' | 'activa' | 'pendiente' | 'bloqueada'

interface Campo {
  key: string
  label: string
  tipo: 'texto' | 'fecha' | 'checkbox' | 'textarea'
  valor: string | boolean
  requerido?: boolean
  readonly?: boolean
}

interface Etapa {
  id: string
  numero: number
  titulo: string
  descripcion: string
  estado: EstadoEtapa
  campos: Campo[]
  fechaCompletada?: string
}

const ESTADO_ETAPA_CONFIG: Record<EstadoEtapa, { label: string; dot: string; badge: string }> = {
  completada: { label: 'Completada', dot: 'bg-green-500',                    badge: 'badge-success' },
  activa:     { label: 'En curso',   dot: 'bg-amber-400 animate-pulse',      badge: 'badge-warning' },
  pendiente:  { label: 'Pendiente',  dot: 'bg-gray-300',                     badge: 'badge-default' },
  bloqueada:  { label: 'Bloqueada',  dot: 'bg-gray-200',                     badge: 'badge-default' },
}

// Orden canónico del sub-estado — igual que calcSubEstado en el backend
const SUB_ESTADOS: { key: string; label: string }[] = [
  { key: 'VACANTE',            label: 'Vacante' },
  { key: 'A-CARATULADO',       label: 'A — Caratulado' },
  { key: 'A-AUTZN',            label: 'A — Autorización' },
  { key: 'B-SORTEO JUR',       label: 'B — Sorteo de jurado' },
  { key: 'C-DISPO DE LLAMADO', label: 'C — Dispo de llamado' },
  { key: 'D-EXAMEN PUBLICADO', label: 'D — Examen publicado' },
  { key: 'E-ORDEN DE MERITO',  label: 'E — Orden de mérito' },
  { key: 'F-IFACS',            label: 'F — IFACS' },
  { key: 'G-INSAL',            label: 'G — INSAL' },
  { key: 'H-TAD',              label: 'H — TAD' },
  { key: 'I-CARGA DOCU',       label: 'I — Carga documentación' },
  { key: 'J-APTO MED',         label: 'J — Apto médico' },
  { key: 'K-ITE',              label: 'K — ITE' },
  { key: 'L-PYCTO DE RESO',    label: 'L — Proyecto resolución' },
  { key: 'M-RESO A LA FIRMA',  label: 'M — Reso a la firma' },
  { key: 'N-DESIGNADO',        label: 'N — Designado' },
  { key: 'O-ALTA SIAL',        label: 'O — Alta SIAL' },
]

export function ConcursoCphWizard() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const esNuevo = id === 'nuevo'

  // Leer concurso real cuando tiene ID
  const { data: cphData, isLoading } = useQuery({
    queryKey: ['concurso-cph-wizard', id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ConcursoCph }>(`/api/v1/concursos-cph/${id}`)
      return res.data.data
    },
    enabled: !esNuevo,
  })

  const { data: escalafones = [] } = useEscalafones()
  const { data: hospitales = [] } = useHospitales()
  const { data: codigosRegistro = [] } = useCodigosRegistro()
  const escalafonCph = escalafones.find((e) => e.nombre === 'Nueva Carrera Prof. Hosp')
  const { data: puestosDisponibles = [] } = usePuestosCargos(escalafonCph?.id)

  // Query params solo se usan en modo nuevo (vienen de NuevaBajaPage)
  const datosBaja = esNuevo ? {
    codigoCargo:    searchParams.get('codigoCargo') ?? '',
    cargoId:        searchParams.get('cargoId') ?? '',
    eeBaja:         searchParams.get('eeBaja') ?? '',
    fechaBaja:      searchParams.get('fechaBaja') ?? '',
    hospital:       searchParams.get('hospital') ?? '',
    hospitalNombre: searchParams.get('hospitalNombre') ?? 'Nuevo concurso',
    puesto:         searchParams.get('puesto') ?? '',
    especialidad:   searchParams.get('especialidad') ?? '',
    escalafon:      searchParams.get('escalafon') ?? '',
    persona:        searchParams.get('persona') ?? '',
    cuil:           searchParams.get('cuil') ?? '',
    motivo:         searchParams.get('motivo') ?? '',
    cargaHoraria:   searchParams.get('cargaHoraria') ?? '',
  } : null

  // Construir objeto concurso desde la API o desde query params
  const concurso = useMemo(() => {
    if (esNuevo) return {
      hospital:       datosBaja?.hospital ?? '',
      hospitalNombre: datosBaja?.hospitalNombre ?? 'Nuevo concurso',
      cargo:          datosBaja?.codigoCargo || 'Sin asignar',
      puesto:         datosBaja?.puesto ?? '—',
      especialidad:   datosBaja?.especialidad ?? '—',
      escalafon:      datosBaja?.escalafon ?? 'CPH',
      personaBaja:    datosBaja?.persona ?? '—',
      fechaBaja:      datosBaja?.fechaBaja ?? '',
      eeBaja:         datosBaja?.eeBaja ?? '',
      subEstado:      'VACANTE',
      subEstado3:     '',
      suspendido:     false,
      observaciones:  datosBaja?.motivo ? `Motivo de baja: ${datosBaja.motivo}` : '',
    }
    if (!cphData) return null
    const c = cphData.concurso
    const baja = (c as unknown as { baja?: { observaciones?: string | null; fechaBaja?: string | Date | null; eeBaja?: string | null } })?.baja
    const eeBajaVal   = cphData.eeBaja   ?? baja?.observaciones ?? ''
    const rawFechaHeader = cphData.fechaBaja ?? baja?.fechaBaja ?? ''
    const fechaBajaVal = rawFechaHeader
      ? (typeof rawFechaHeader === 'string'
          ? rawFechaHeader.slice(0, 10)
          : (rawFechaHeader as Date).toISOString().slice(0, 10))
      : ''
    return {
      hospital:       c?.hospital?.sigla ?? '',
      hospitalNombre: c?.hospital?.nombre ?? '',
      cargo:          c?.cargo?.codigo ?? '',
      puesto:         c?.cargo?.literalPuesto ?? '—',
      especialidad:   cphData.especialidadSolicitada ?? c?.cargo?.especialidad ?? '—',
      escalafon:      'CPH',
      personaBaja:    c?.persona?.apellidoNombre ?? '—',
      fechaBaja:      fechaBajaVal,
      eeBaja:         eeBajaVal,
      subEstado:      cphData.subEstado ?? 'VACANTE',
      subEstado3:     cphData.subEstado3 ?? '',
      suspendido:     cphData.suspendido,
      observaciones:  cphData.observaciones ?? '',
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esNuevo, cphData])

  // Construir etapas: en modo nuevo todas vacías, con ID real leer valores del backend
  const etapasIniciales: Etapa[] = useMemo(() => {
    const v = (key: string): string => {
      if (!cphData) return ''
      return (cphData as unknown as Record<string, unknown>)[key] as string ?? ''
    }
    const vb = (key: string): boolean => {
      if (!cphData) return false
      return (cphData as unknown as Record<string, boolean>)[key] ?? false
    }
    const bajaDatos = (cphData?.concurso as unknown as { baja?: { observaciones?: string | null; fechaBaja?: string | Date | null; eeBaja?: string | null } } | undefined)?.baja
    const eeBajaResuelto   = cphData?.eeBaja ?? bajaDatos?.observaciones ?? ''
    const rawFecha = cphData?.fechaBaja ?? bajaDatos?.fechaBaja ?? ''
    const fechaBajaResuelto = rawFecha
      ? (typeof rawFecha === 'string'
          ? rawFecha.slice(0, 10)
          : (rawFecha as Date).toISOString().slice(0, 10))
      : ''
    // Determinar estado de cada etapa según qué campos tiene completados
    const tieneAutorizacion = !!(cphData?.fechaAutorizacion || cphData?.disposicion)
    const tieneInscripcion  = !!(cphData?.fechaExamen || cphData?.fechaOrdenMerito)
    const tieneIfacs        = !!(cphData?.fechaIfacs)
    const tieneDesignacion  = !!(cphData?.fechaResolucion || cphData?.cargoSial)

    const estadoEtapa = (condicion: boolean, anterior: boolean): EstadoEtapa => {
      if (condicion) return 'completada'
      if (anterior)  return 'activa'
      return 'pendiente'
    }

    return [
      {
        id: 'baja', numero: 1,
        titulo: 'Baja / Apertura',
        descripcion: 'Registro de la baja del agente y apertura del expediente de concurso.',
        estado: (esNuevo || !cphData) ? 'activa' : (cphData.eeConcurso ? 'completada' : 'activa'),
        fechaCompletada: cphData?.fechaEeConcurso ?? undefined,
        campos: [
          { key: 'eeBaja',                label: 'Expediente de baja',       tipo: 'texto', valor: esNuevo ? (datosBaja?.eeBaja ?? '') : (eeBajaResuelto || v('eeBaja')), readonly: true },
          { key: 'fechaBaja',             label: 'Fecha de baja',            tipo: 'fecha', valor: esNuevo ? (datosBaja?.fechaBaja ?? '') : (fechaBajaResuelto || v('fechaBaja')), readonly: true },
          { key: 'puesto',                label: 'Puesto',                   tipo: 'texto', valor: esNuevo ? (datosBaja?.puesto ?? '') : (cphData?.concurso?.cargo?.literalPuesto ?? ''), readonly: true },
          { key: '__sep__',               label: '',                         tipo: 'texto', valor: '', readonly: true },
          { key: 'eeConcurso',            label: 'Expediente de Concurso',   tipo: 'texto', valor: v('eeConcurso') },
        ],
      },
      {
        id: 'autorizacion', numero: 2,
        titulo: 'Autorización',
        descripcion: 'Autorización por DGAYDRH, sorteo de jurado y disposición de llamado.',
        estado: estadoEtapa(tieneAutorizacion, !!(cphData?.eeConcurso) || esNuevo),
        fechaCompletada: cphData?.fechaAutorizacion ?? undefined,
        campos: [
          { key: 'fechaAutorizacion', label: 'Fecha de autorización',  tipo: 'fecha', valor: v('fechaAutorizacion') },
          { key: 'sorteoJurado',      label: 'Fecha sorteo de jurado', tipo: 'fecha', valor: v('sorteoJurado') },
          { key: 'disposicion',       label: 'Disposición de llamado', tipo: 'texto', valor: v('disposicion') },
        ],
      },
      {
        id: 'inscripcion', numero: 3,
        titulo: 'Inscripción / Examen / OM',
        descripcion: 'Período de inscripción, publicación del examen y orden de mérito.',
        estado: estadoEtapa(tieneInscripcion, tieneAutorizacion),
        fechaCompletada: cphData?.fechaOrdenMerito ?? undefined,
        campos: [
          { key: 'fechaInscDesde',   label: 'Inscripción desde',    tipo: 'fecha', valor: v('fechaInscDesde') },
          { key: 'fechaInscHasta',   label: 'Inscripción hasta',    tipo: 'fecha', valor: v('fechaInscHasta') },
          { key: 'fechaExamen',      label: 'Fecha de examen',      tipo: 'fecha', valor: v('fechaExamen') },
          { key: 'fechaOrdenMerito', label: 'Fecha orden de mérito', tipo: 'fecha', valor: v('fechaOrdenMerito') },
        ],
      },
      {
        id: 'ifacs_insal', numero: 4,
        titulo: 'IFACS / INSAL',
        descripcion: 'Informe de Aptitud para el Cargo (IFACS) e Informe INSAL.',
        estado: estadoEtapa(tieneIfacs && !!(cphData?.fechaInsal), tieneInscripcion),
        campos: [
          { key: 'fechaIfacs', label: 'Fecha IFACS', tipo: 'fecha', valor: v('fechaIfacs'), requerido: true },
          { key: 'fechaInsal', label: 'Fecha INSAL', tipo: 'fecha', valor: v('fechaInsal'), requerido: true },
        ],
      },
      {
        id: 'designacion', numero: 5,
        titulo: 'Designación',
        descripcion: 'TAD, documentación, apto médico, ITE y resolución de designación.',
        estado: estadoEtapa(tieneDesignacion, tieneIfacs),
        campos: [
          { key: 'eeDesignacion',        label: 'EE de designación (TAD)',    tipo: 'texto',    valor: v('eeDesignacion') },
          { key: 'cargaDocumentacion',   label: 'Carga de documentación',     tipo: 'checkbox', valor: vb('cargaDocumentacion') },
          { key: 'fechaAptoMedico',      label: 'Fecha apto médico',          tipo: 'fecha',    valor: v('fechaAptoMedico') },
          { key: 'fechaIte',             label: 'Fecha ITE',                  tipo: 'fecha',    valor: v('fechaIte') },
          { key: 'proyectoResolucion',   label: 'Proyecto de resolución',     tipo: 'checkbox', valor: vb('proyectoResolucion') },
          { key: 'resoALaFirma',         label: 'Reso a la firma',            tipo: 'checkbox', valor: vb('resoALaFirma') },
          { key: 'resolucionDesignacion',label: 'Resolución de designación',  tipo: 'texto',    valor: v('resolucionDesignacion') },
          { key: 'fechaResolucion',      label: 'Fecha de resolución',        tipo: 'fecha',    valor: v('fechaResolucion') },
          { key: 'cargoSial',            label: 'Cargo SIAL (alta)',          tipo: 'texto',    valor: v('cargoSial') },
          { key: 'personaDesignada',     label: 'Persona designada',          tipo: 'texto',    valor: '' },
        ],
      },
      {
        id: 'desierto', numero: 6,
        titulo: 'Desierto (si aplica)',
        descripcion: 'Disposición de desierto si el concurso no prospera.',
        estado: 'bloqueada',
        campos: [
          { key: 'dispoDesierta',     label: 'Disposición de desierto', tipo: 'texto', valor: v('dispoDesierta') },
          { key: 'fechaDispoDesierta',label: 'Fecha de disposición',    tipo: 'fecha', valor: v('fechaDispoDesierta') },
        ],
      },
    ]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esNuevo, cphData])

  const [puestoConcurso, setPuestoConcurso] = useState('')
  const [especialidadConcurso, setEspecialidadConcurso] = useState('')
  const [siglaConcurso, setSiglaConcurso] = useState('')
  const [codigoRegistroId, setCodigoRegistroId] = useState('')
  const [pendienteAutorizacion, setPendienteAutorizacion] = useState(false)
  const [modalCambios, setModalCambios] = useState<{ campo: string; de: string; a: string }[] | null>(null)
  // Valores originales para detectar cambios en etapa baja
  const originalesRef = { sigla: '', codigoRegistroId: '', puesto: '', especialidad: '' }
  const [originales, setOriginales] = useState(originalesRef)
  const especialidadesDisponibles = getEspecialidadOptions(puestoConcurso)

  useEffect(() => {
    if (!cphData) return
    type CargoCph = { hospital?: { sigla?: string }; codigoRegistro?: { id?: string; literal?: string }; literalPuesto?: string; especialidad?: string }
    const cargo = (cphData.concurso as unknown as { cargo?: CargoCph })?.cargo
    setSiglaConcurso(cargo?.hospital?.sigla ?? '')
    // Preferir el id directo del cargo; si no llegó aún el catálogo, buscar por literal cuando cargue
    const crId = cargo?.codigoRegistro?.id ?? ''
    const crLiteral = cargo?.codigoRegistro?.literal ?? ''
    if (crId) {
      setCodigoRegistroId(crId)
    } else if (crLiteral && codigosRegistro.length > 0) {
      const found = codigosRegistro.find((cr) => cr.literal === crLiteral)
      if (found) setCodigoRegistroId(found.id)
    }
    setPuestoConcurso(cargo?.literalPuesto ?? '')
    setEspecialidadConcurso(cphData.especialidadSolicitada ?? cargo?.especialidad ?? '')
    // Guardar originales para detectar cambios
    const resolvedCrId = crId || (crLiteral && codigosRegistro.length > 0 ? (codigosRegistro.find((cr) => cr.literal === crLiteral)?.id ?? '') : '')
    setOriginales({
      sigla: cargo?.hospital?.sigla ?? '',
      codigoRegistroId: resolvedCrId,
      puesto: cargo?.literalPuesto ?? '',
      especialidad: cphData.especialidadSolicitada ?? cargo?.especialidad ?? '',
    })
  }, [cphData, codigosRegistro])
  const primeraEtapaActiva = etapasIniciales.find((e) => e.estado === 'activa')?.id ?? 'baja'
  const [etapaActiva, setEtapaActiva] = useState(primeraEtapaActiva)
  const [suspendido, setSuspendido]   = useState(false)
  const [guardado, setGuardado]       = useState(false)
  const [etapas, setEtapas]           = useState<Etapa[]>(etapasIniciales)

  // Sincronizar etapas cuando llegan datos de la API
  const etapasActuales = cphData ? etapasIniciales : etapas

  const etapa = etapasActuales.find((e) => e.id === etapaActiva)!

  const currentIdxDinamico = (() => {
    const sub = concurso?.subEstado ?? 'VACANTE'
    return SUB_ESTADOS.findIndex((s) => s.key === sub)
  })()

  if (!esNuevo && isLoading) return <div className="p-8 text-sm text-gray-400">Cargando concurso...</div>
  if (!esNuevo && !concurso)  return <div className="p-8 text-sm text-danger">No se encontró el concurso.</div>
  const c = concurso!

  function handleGuardar() {
    if (etapaActiva === 'baja' && !esNuevo) {
      const labelCr = (id: string) => codigosRegistro.find((cr) => cr.id === id)?.literal ?? id
      const cambios: { campo: string; de: string; a: string }[] = []
      if (siglaConcurso      !== originales.sigla)            cambios.push({ campo: 'Sigla',              de: originales.sigla,                          a: siglaConcurso })
      if (codigoRegistroId   !== originales.codigoRegistroId) cambios.push({ campo: 'Código de registro', de: labelCr(originales.codigoRegistroId),        a: labelCr(codigoRegistroId) })
      if (puestoConcurso     !== originales.puesto)           cambios.push({ campo: 'Puesto',             de: originales.puesto,                         a: puestoConcurso })
      if (especialidadConcurso !== originales.especialidad)   cambios.push({ campo: 'Especialidad',       de: originales.especialidad,                   a: especialidadConcurso })
      if (cambios.length > 0) {
        setModalCambios(cambios)
        return
      }
    }
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2500)
  }

  function confirmarCambios() {
    setModalCambios(null)
    setPendienteAutorizacion(true)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2500)
  }

  function handleMarcarCompleta() {
    const hoy = new Date().toISOString().split('T')[0]
    setEtapas((prev) => {
      const idx = prev.findIndex((e) => e.id === etapaActiva)
      if (idx === -1) return prev
      const next: Etapa[] = prev.map((e, i) => {
        if (i === idx)     return { ...e, estado: 'completada' as EstadoEtapa, fechaCompletada: hoy }
        if (i === idx + 1) return { ...e, estado: 'activa'     as EstadoEtapa }
        return e
      })
      const siguienteId = next[idx + 1]?.id
      if (siguienteId) setEtapaActiva(siguienteId)
      return next
    })
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2500)
  }

  return (
    // Contenedor que ocupa todo el alto disponible dentro del <main> scrolleable
    <div className="flex flex-col min-h-full">

      {/* ── MODAL CONFIRMACIÓN DE CAMBIOS ───────────────────────────────────────────── */}
      {modalCambios && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <span className="text-amber-500 text-xl">⚠️</span>
              <div>
                <h3 className="font-primary font-bold text-gray-900">Confirmar modificación</h3>
                <p className="text-xs text-gray-500 mt-0.5">Esta acción quedará pendiente de autorización por una autoridad superior.</p>
              </div>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">Se modificarán los siguientes campos:</p>
              <div className="space-y-2">
                {modalCambios.map((c) => (
                  <div key={c.campo} className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{c.campo}</p>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-red-500 line-through">{c.de || <em className="not-italic text-gray-400">vacío</em>}</span>
                      <span className="text-gray-400">→</span>
                      <span className="text-green-700 font-medium">{c.a || <em className="not-italic text-gray-400">vacío</em>}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button className="btn-outline" onClick={() => setModalCambios(null)}>Cancelar</button>
              <button className="btn-primary" onClick={confirmarCambios}>Confirmar y enviar a autorización</button>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER STICKY ─────────────────────────────────────────────────── */}
      {/* sticky top-0 funciona porque el scroll está en el <main> padre      */}
      <div className="sticky top-0 z-20 bg-white shadow-md rounded-lg mb-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs px-6 pt-3 pb-1 border-b border-gray-100">
          <Link to="/cargos/alta-por-baja" className="text-secondary hover:underline">
            ← Alta por Baja
          </Link>
          {!esNuevo && (
            <>
              <span className="text-gray-300">/</span>
              <Link to="/concursos/cph" className="text-secondary hover:underline">Concursos CPH</Link>
            </>
          )}
          <span className="text-gray-300">/</span>
          <span className="text-gray-400">{esNuevo ? 'Nuevo concurso' : c.cargo}</span>
        </div>

        {/* Datos principales */}
        <div className="px-6 py-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-primary text-lg font-bold text-gray-900 leading-tight">
              {esNuevo ? (
                datosBaja?.codigoCargo
                  ? <><span className="font-mono">{datosBaja.codigoCargo}</span> — {datosBaja.puesto || 'Nuevo Concurso'}</>
                  : 'Nuevo Concurso CPH'
              ) : `${c.cargo} — ${c.puesto}`}
            </h1>
            {esNuevo ? (
              <p className="text-sm text-gray-400 mt-0.5">Completá los datos de la baja para iniciar el seguimiento</p>
            ) : (
              <>
                <p className="text-sm text-gray-500 mt-0.5">
                  {c.hospitalNombre} · {c.especialidad} · {c.escalafon}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Baja:{' '}
                  {c.personaBaja !== '—' && <><span className="text-gray-600 font-medium">{c.personaBaja}</span>{' '}</>}
                  {c.eeBaja && <>{c.eeBaja}{' '}</>}
                  {c.fechaBaja && c.fechaBaja}
                </p>
              </>
            )}
          </div>

          {/* Badges + acción — solo en modo edición */}
          {!esNuevo && (
            <div className="flex flex-wrap items-center gap-2 self-start">
              <span className="badge-info text-xs">
                {SUB_ESTADOS.find((s) => s.key === c.subEstado)?.label ?? c.subEstado}
              </span>
              <span className="badge-default text-xs">{c.subEstado3}</span>
              {c.suspendido && <span className="badge-danger text-xs">Suspendido</span>}
              <button
                onClick={() => setSuspendido(!suspendido)}
                className={c.suspendido ? 'btn-secondary text-xs py-1 px-3' : 'btn-danger text-xs py-1 px-3'}
              >
                {c.suspendido ? 'Reanudar' : 'Suspender'}
              </button>
            </div>
          )}
        </div>

        {/* Observaciones en el header */}
        {c.observaciones && (
          <div className="mx-6 mb-3 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 text-xs text-amber-800">
            📝 {c.observaciones}
          </div>
        )}
      </div>

      {/* ── CUERPO: stepper izq + formulario centro + estado derecho ─────── */}
      <div className="flex gap-6 flex-1 items-start">

        {/* Columna izquierda — stepper de etapas (sticky) */}
        <div className="w-52 shrink-0 sticky top-[var(--header-offset,160px)]">
          <div className="bg-white rounded-lg shadow-sm p-3 space-y-0.5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 px-2">
              Etapas
            </p>
            {etapasActuales.map((e) => {
              const cfg = ESTADO_ETAPA_CONFIG[e.estado]
              const isActive = e.id === etapaActiva
              return (
                <button
                  key={e.id}
                  onClick={() => e.estado !== 'bloqueada' && setEtapaActiva(e.id)}
                  disabled={e.estado === 'bloqueada'}
                  className={[
                    'w-full text-left px-2.5 py-2 rounded flex items-center gap-2 transition-colors',
                    isActive
                      ? 'bg-navy text-white'
                      : e.estado === 'bloqueada'
                        ? 'opacity-35 cursor-not-allowed text-gray-400'
                        : 'hover:bg-gray-50 text-gray-700',
                  ].join(' ')}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-white' : cfg.dot}`} />
                  <span className="text-xs font-medium leading-tight">
                    {e.numero}. {e.titulo}
                  </span>
                  {e.estado === 'completada' && !isActive && (
                    <span className="ml-auto text-green-500 text-[10px]">✓</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Columna central — formulario de la etapa activa */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-primary text-base font-bold text-gray-900">
                  Etapa {etapa.numero}: {etapa.titulo}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">{etapa.descripcion}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`${ESTADO_ETAPA_CONFIG[etapa.estado].badge} text-xs`}>
                  {ESTADO_ETAPA_CONFIG[etapa.estado].label}
                </span>
                {pendienteAutorizacion && etapaActiva === 'baja' && (
                  <span className="badge-warning text-xs">⏳ Pendiente de autorización</span>
                )}
              </div>
            </div>

            <div className="p-6 space-y-6">
              {etapa.id === 'baja' ? (
                <>
                  {/* ── Datos de la baja (readonly) ── */}
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Datos de la baja</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {etapa.campos.filter((c) => c.key !== '__sep__' && c.key !== 'eeConcurso').map((campo) => (
                        <div key={campo.key} className={campo.key === 'puesto' ? 'sm:col-span-2' : ''}>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">{campo.label}</label>
                          <input
                            type={campo.tipo === 'fecha' ? 'date' : 'text'}
                            defaultValue={campo.valor as string}
                            className="input h-10 w-full bg-gray-50 text-gray-500"
                            readOnly
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Datos del concurso (editables) ── */}
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Datos del concurso</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Expediente de Concurso */}
                      {etapa.campos.filter((c) => c.key === 'eeConcurso').map((campo) => (
                        <div key={campo.key} className="sm:col-span-2">
                          <label className="block text-sm font-semibold text-gray-700 mb-1">{campo.label}</label>
                          <input
                            type="text"
                            defaultValue={campo.valor as string}
                            className="input h-10 w-full"
                            disabled={etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'}
                          />
                        </div>
                      ))}
                      {/* Sigla */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Sigla</label>
                        <select
                          value={siglaConcurso}
                          onChange={(e) => setSiglaConcurso(e.target.value)}
                          className="input h-10 w-full"
                          disabled={etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'}
                        >
                          <option value="">Seleccioná...</option>
                          {hospitales.map((h) => (
                            <option key={h.id} value={h.sigla}>{h.sigla}</option>
                          ))}
                        </select>
                      </div>
                      {/* Código de registro */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Código de registro</label>
                        <select
                          value={codigoRegistroId}
                          onChange={(e) => setCodigoRegistroId(e.target.value)}
                          className="input h-10 w-full"
                          disabled={etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'}
                        >
                          <option value="">Seleccioná...</option>
                          {codigosRegistro.map((cr) => (
                            <option key={cr.id} value={cr.id}>{cr.literal}</option>
                          ))}
                        </select>
                      </div>
                      {/* Puesto del concurso */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Puesto del concurso</label>
                        <input
                          list="puestos-cph-list"
                          value={puestoConcurso}
                          onChange={(e) => { setPuestoConcurso(e.target.value); setEspecialidadConcurso('') }}
                          placeholder="Escribí para buscar..."
                          className="input h-10 w-full"
                          disabled={etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'}
                        />
                        <datalist id="puestos-cph-list">
                          {puestosDisponibles.map((p) => (
                            <option key={p} value={p} />
                          ))}
                        </datalist>
                      </div>
                      {/* Especialidad — condicional */}
                      {especialidadesDisponibles.length > 0 && (
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Especialidad del concurso</label>
                          <select
                            value={especialidadConcurso}
                            onChange={(e) => setEspecialidadConcurso(e.target.value)}
                            className="input h-10 w-full"
                            disabled={etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'}
                          >
                            <option value="">Seleccioná...</option>
                            {especialidadesDisponibles.map((e) => (
                              <option key={e} value={e}>{e}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {etapa.campos.map((campo) => (
                    <div key={campo.key} className={campo.tipo === 'textarea' ? 'sm:col-span-2' : ''}>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        {campo.label}
                        {campo.requerido && <span className="text-danger ml-1">*</span>}
                      </label>
                      {campo.tipo === 'checkbox' ? (
                        <div className="flex items-center gap-2 h-10">
                          <input
                            type="checkbox"
                            defaultChecked={campo.valor as boolean}
                            className="checkbox"
                            disabled={campo.readonly || etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'}
                          />
                          <span className="text-sm text-gray-500">Sí</span>
                        </div>
                      ) : campo.tipo === 'textarea' ? (
                        <textarea
                          defaultValue={campo.valor as string}
                          rows={3}
                          className="input w-full py-2"
                          disabled={campo.readonly || etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'}
                        />
                      ) : (
                        <input
                          type={campo.tipo === 'fecha' ? 'date' : 'text'}
                          defaultValue={campo.valor as string}
                          className={`input h-10 w-full ${campo.readonly ? 'bg-gray-50 text-gray-500' : ''}`}
                          readOnly={campo.readonly}
                          disabled={!campo.readonly && (etapa.estado === 'pendiente' || etapa.estado === 'bloqueada')}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Observaciones</label>
                <textarea
                  defaultValue={etapa.id === 'ifacs_insal' ? c.observaciones : ''}
                  rows={2}
                  className="input w-full py-2"
                  placeholder="Notas internas sobre esta etapa..."
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <div className="flex gap-2">
                {etapa.numero > 1 && (
                  <button
                    className="btn-outline"
                    onClick={() => {
                      const prev = etapasActuales[etapa.numero - 2]
                      if (prev) setEtapaActiva(prev.id)
                    }}
                  >
                    ← Anterior
                  </button>
                )}
                {etapa.numero < etapasActuales.length && etapa.estado !== 'bloqueada' && (
                  <button
                    className="btn-outline"
                    onClick={() => {
                      const next = etapasActuales[etapa.numero]
                      if (next && next.estado !== 'bloqueada') setEtapaActiva(next.id)
                    }}
                  >
                    Siguiente →
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                {guardado && <span className="text-sm text-green-600 font-medium">✓ Guardado</span>}
                {etapa.estado !== 'pendiente' && etapa.estado !== 'bloqueada' && (
                  <button className="btn-primary" onClick={handleGuardar}>
                    Guardar cambios
                  </button>
                )}
                {etapa.estado === 'activa' && (
                  <button className="btn-secondary" onClick={handleMarcarCompleta}>
                    Marcar completa ✓
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Historial */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="font-primary text-sm font-bold text-gray-700 mb-3">Historial de cambios</h3>
            {(() => {
              if (esNuevo || !cphData) return (
                <p className="text-sm text-gray-400">Sin historial aún.</p>
              )
              const eventos: { fecha: string; texto: string }[] = [
                { fecha: cphData.fechaBaja,          texto: 'Baja registrada' + (cphData.eeBaja ? `: ${cphData.eeBaja}` : '') },
                { fecha: cphData.fechaEeConcurso,    texto: 'EE de concurso' + (cphData.eeConcurso ? `: ${cphData.eeConcurso}` : '') },
                { fecha: cphData.fechaAutorizacion,  texto: 'Autorización registrada' },
                { fecha: cphData.sorteoJurado,       texto: 'Sorteo de jurado' },
                { fecha: cphData.fechaInscDesde,     texto: 'Apertura de inscripción' + (cphData.disposicion ? ` — ${cphData.disposicion}` : '') },
                { fecha: cphData.fechaInscHasta,     texto: 'Cierre de inscripción' },
                { fecha: cphData.fechaExamen,        texto: 'Examen publicado' },
                { fecha: cphData.fechaOrdenMerito,   texto: 'Orden de mérito registrado' },
                { fecha: cphData.fechaIfacs,         texto: 'IFACS registrado' },
                { fecha: cphData.fechaInsal,         texto: 'INSAL registrado' },
                { fecha: cphData.fechaAptoMedico,    texto: 'Apto médico' },
                { fecha: cphData.fechaIte,           texto: 'ITE registrado' },
                { fecha: cphData.fechaResolucion,    texto: 'Resolución de designación' + (cphData.resolucionDesignacion ? `: ${cphData.resolucionDesignacion}` : '') },
                { fecha: cphData.fechaDispoDesierta, texto: 'Disposición de desierto' + (cphData.dispoDesierta ? `: ${cphData.dispoDesierta}` : '') },
              ]
                .filter((e): e is { fecha: string; texto: string } => !!e.fecha)
                .sort((a, b) => b.fecha.localeCompare(a.fecha))

              if (eventos.length === 0) return (
                <p className="text-sm text-gray-400">Sin eventos registrados aún.</p>
              )
              return (
                <div className="space-y-2 text-sm text-gray-500">
                  {eventos.map((h) => (
                    <div key={h.fecha + h.texto} className="flex gap-3">
                      <span className="text-gray-300 whitespace-nowrap tabular-nums">
                        {h.fecha.slice(0, 10).split('-').reverse().join('/')}
                      </span>
                      <span>{h.texto}</span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        </div>

        {/* Columna derecha — panel de estado sticky */}
        <div className="w-52 shrink-0 sticky top-[var(--header-offset,160px)]">
          <div className="bg-white rounded-lg shadow-sm p-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Sub-estado actual
            </p>
            <div className="space-y-1.5">
              {SUB_ESTADOS.map((s, idx) => {
                const isCurrent = idx === currentIdxDinamico
                const isPast    = idx < currentIdxDinamico
                return (
                  <div key={s.key} className="flex items-center gap-2">
                    {/* línea conectora */}
                    <div className="flex flex-col items-center self-stretch">
                      <span className={[
                        'w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5',
                        isCurrent ? 'bg-amber-400 ring-2 ring-amber-200' : isPast ? 'bg-green-400' : 'bg-gray-200',
                      ].join(' ')} />
                      {idx < SUB_ESTADOS.length - 1 && (
                        <span className={`w-px flex-1 mt-0.5 ${isPast ? 'bg-green-300' : 'bg-gray-200'}`} />
                      )}
                    </div>
                    <span className={[
                      'text-xs pb-1.5 leading-tight',
                      isCurrent ? 'font-bold text-amber-700' : isPast ? 'text-gray-500' : 'text-gray-300',
                    ].join(' ')}>
                      {s.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
