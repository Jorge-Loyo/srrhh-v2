// Wizard de seguimiento CPH — funciona en dos modos:
// - id === 'nuevo': formulario limpio (sin datos reales aún)
// - id === UUID:    carga el concurso real de la API

import { useState, useMemo, useEffect, useRef } from 'react'
import { Link, useParams, useSearchParams, Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import { useEscalafones, usePuestosCargoNormalizados, useEspecialidadesPuesto, useHospitales, useCodigosRegistro } from '@/shared/hooks/useCatalogos'
import { hospitalLabel } from '@/shared/lib/hospitalLabel'
import { ExportDropdown } from '@/shared/components/ExportDropdown'
import { getCasoCph, exportCphPdf, exportCphWord } from '@/shared/lib/exportConcursoDocs'
import type { ConcursoCph } from '@srrhh/types'
import { useAuth } from '@/modules/auth/hooks/useAuth'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'

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

  // El wizard solo funciona con un ID real — 'nuevo' ya no se usa
  if (esNuevo) return <Navigate to="/concursos/cph" replace />

  // Leer concurso real cuando tiene ID
  const { data: cphData, isLoading } = useQuery({
    queryKey: ['concurso-cph-wizard', id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ConcursoCph }>(`/api/v1/concursos-cph/${id}`)
      return res.data.data
    },
    enabled: !esNuevo,
  })

  const { user } = useAuth()
  const queryClient = useQueryClient()
  const esSgrasv = user?.rolSlug === 'sgrasv'

  const { data: escalafones = [] } = useEscalafones()
  const { data: hospitales = [] } = useHospitales()
  const { data: codigosRegistro = [] } = useCodigosRegistro()
  // Escalafones ordenados igual que PersonasPage
  const escalafonesOrdenados = [...escalafones].sort((a, b) =>
    escalafonLabel(a.nombre).localeCompare(escalafonLabel(b.nombre), 'es')
  )
  // Helper: dado un escalafonId, devuelve el primer codigoRegistroId asociado
  const crIdDeEscalafon = (escId: string) =>
    codigosRegistro.find((cr) => cr.escalafonId === escId)?.id ?? null
  const escalafonCph = escalafones.find((e) => e.nombre === 'Nueva Carrera Profesional Hospitalaria')

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
    const baja = (c as unknown as { baja?: { observaciones?: string | null; fechaBaja?: string | Date | null; eeBaja?: string | null; motivo?: string | null; docRespaldatoria?: string | null; tipificadorOrigen?: string | null; partidaPresupuestaria?: string | null; cargaHoraria?: number | null; fechaPaseParalelo?: string | Date | null } })?.baja
    const eeBajaVal   = cphData.eeBaja   ?? baja?.eeBaja ?? ''
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
      especialidad:   cphData.especialidadSolicitada ?? (c?.cargo as any)?.especialidadLegacy ?? c?.cargo?.especialidad ?? '—',
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
    const bajaDatos = (cphData?.concurso as unknown as { baja?: { observaciones?: string | null; fechaBaja?: string | Date | null; eeBaja?: string | null; motivo?: string | null; docRespaldatoria?: string | null; tipificadorOrigen?: string | null; partidaPresupuestaria?: string | null; cargaHoraria?: number | null; fechaPaseParalelo?: string | Date | null } } | undefined)?.baja
    const eeBajaResuelto   = cphData?.eeBaja ?? bajaDatos?.eeBaja ?? ''
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
  const [escalafonId, setEscalafonId] = useState('')
  // Puestos del escalafón seleccionado (sin filtrar por tipo)
  const { data: puestosDisponibles = [] } = usePuestosCargoNormalizados(
    escalafonId || undefined,
    undefined,
    undefined
  )
  const [modalCambios, setModalCambios] = useState<{ campo: string; de: string; a: string }[] | null>(null)
  const [modalAutorizacion, setModalAutorizacion] = useState(false)
  const [obsAutorizacion, setObsAutorizacion] = useState('')
  const [modalBaja, setModalBaja] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)
  // Valores originales para detectar cambios en etapa baja
  const originalesRef = { sigla: '', escalafonId: '', puesto: '', especialidad: '' }
  const [originales, setOriginales] = useState(originalesRef)
  const { data: especialidadesDisponibles = [] } = useEspecialidadesPuesto(
    escalafonId || undefined,
    puestoConcurso || undefined
  )

  // Cuando llegan las opciones, corregir especialidadConcurso si no coincide exactamente
  // (ej: 'Ortopedia y Traumatología' vs 'Ortopedia y Traumatologia' — tildes legacy)
  useEffect(() => {
    if (especialidadesDisponibles.length === 0 || !especialidadConcurso) return
    if (especialidadesDisponibles.includes(especialidadConcurso)) return
    const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const match = especialidadesDisponibles.find((e) => normalize(e) === normalize(especialidadConcurso))
    if (match) setEspecialidadConcurso(match)
  }, [especialidadesDisponibles])

  useEffect(() => {
    if (!cphData) return
    type CargoCph = { hospital?: { sigla?: string }; codigoRegistro?: { id?: string; literal?: string }; literalPuesto?: string; especialidad?: string; especialidadLegacy?: string }
    const cargo = (cphData.concurso as unknown as { cargo?: CargoCph })?.cargo
    setSiglaConcurso(cargo?.hospital?.sigla ?? '')
    // Resolver escalafonId desde el codigoRegistro del cargo
    const crId = cargo?.codigoRegistro?.id ?? ''
    const crLiteral = cargo?.codigoRegistro?.literal ?? ''
    let resolvedEscalafonId = ''
    if (crId && codigosRegistro.length > 0) {
      const cr = codigosRegistro.find((c) => c.id === crId)
      resolvedEscalafonId = cr?.escalafonId ?? ''
    } else if (crLiteral && codigosRegistro.length > 0) {
      const cr = codigosRegistro.find((c) => c.literal === crLiteral)
      resolvedEscalafonId = cr?.escalafonId ?? ''
    }
    setEscalafonId(resolvedEscalafonId)
    setPuestoConcurso(cargo?.literalPuesto ?? '')
    setEspecialidadConcurso(cphData.especialidadSolicitada ?? cargo?.especialidadLegacy ?? cargo?.especialidad ?? '')
    setOriginales({
      sigla: cargo?.hospital?.sigla ?? '',
      escalafonId: resolvedEscalafonId,
      puesto: cargo?.literalPuesto ?? '',
      especialidad: cphData.especialidadSolicitada ?? cargo?.especialidadLegacy ?? cargo?.especialidad ?? '',
    })
  }, [cphData, codigosRegistro])
  // Leer pendienteAutorizacion desde la API (no estado local)
  const pendienteAutorizacion = !!(cphData as unknown as { pendienteAutorizacion?: boolean })?.pendienteAutorizacion
  const aprobadoDirector = !!(cphData as unknown as { aprobadoDirector?: boolean })?.aprobadoDirector
  const tieneCambioSiglaCr = !!(cphData as unknown as { siglaSolicitada?: string | null; codigoRegistroSolicitadoId?: string | null })?.siglaSolicitada
    || !!(cphData as unknown as { codigoRegistroSolicitadoId?: string | null })?.codigoRegistroSolicitadoId
  // SGRASV puede resolver si: no hay cambio de sigla/CR, o el director ya aprobó
  const sgrasvPuedeResolver = pendienteAutorizacion && esSgrasv && (!tieneCambioSiglaCr || aprobadoDirector)

  const patchMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiClient.patch(`/api/v1/concursos-cph/${id}`, body).then((r) => r.data.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['concurso-cph-wizard', id] }),
  })

  const autorizarMutation = useMutation({
    mutationFn: (payload: { aprobado: boolean; observaciones?: string }) =>
      apiClient.post(`/api/v1/concursos-cph/${id}/autorizar`, payload).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['concurso-cph-wizard', id] })
      setModalAutorizacion(false)
      setObsAutorizacion('')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al resolver la autorización'
      alert(msg)
    },
  })

  const [etapaActiva, setEtapaActiva] = useState(
    etapasIniciales.find((e) => e.estado === 'activa')?.id ?? 'baja'
  )
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
      const labelEsc = (eId: string) => escalafones.find((e) => e.id === eId)?.nombre ?? eId
      const cambios: { campo: string; de: string; a: string }[] = []
      if (siglaConcurso !== originales.sigla)       cambios.push({ campo: 'Sigla',      de: originales.sigla,                a: siglaConcurso })
      if (escalafonId   !== originales.escalafonId) cambios.push({ campo: 'Escalafón', de: escalafonLabel(labelEsc(originales.escalafonId)), a: escalafonLabel(labelEsc(escalafonId)) })
      if (puestoConcurso       !== originales.puesto)      cambios.push({ campo: 'Puesto',      de: originales.puesto,               a: puestoConcurso })
      if (especialidadConcurso !== originales.especialidad) cambios.push({ campo: 'Especialidad', de: originales.especialidad,         a: especialidadConcurso })
      if (cambios.length > 0) {
        setModalCambios(cambios)
        return
      }
    }
    // Leer todos los campos del formulario activo y enviar al backend
    const body: Record<string, unknown> = {}
    if (formRef.current) {
      formRef.current.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input[data-key]:not([readonly]):not([disabled]), select[data-key]:not([disabled]), textarea[data-key]:not([disabled])'
      ).forEach((el) => {
        const key = el.dataset.key!
        if (el instanceof HTMLInputElement && el.type === 'checkbox') {
          body[key] = el.checked
        } else {
          body[key] = el.value || null
        }
      })
    }
    if (Object.keys(body).length > 0) patchMutation.mutate(body)

    const siguiente = etapasActuales[etapa.numero]
    if (siguiente && siguiente.estado !== 'bloqueada') setEtapaActiva(siguiente.id)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2500)
  }

  function confirmarCambios() {
    setModalCambios(null)
    // Con cambios sensibles: enviar a autorización, NO avanzar (queda bloqueado)
    patchMutation.mutate({
      sigla: siglaConcurso || null,
      codigoRegistroId: crIdDeEscalafon(escalafonId),
      especialidadSolicitada: especialidadConcurso || null,
    })
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

      {/* ── MODAL AUTORIZAR (sgrasv) ─────────────────────────────────────────────── */}
      {modalAutorizacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <span className="text-blue-500 text-xl">🔐</span>
              <div>
                <h3 className="font-primary font-bold text-gray-900">Resolver autorización</h3>
                <p className="text-xs text-gray-500 mt-0.5">Como SGRASV podés aprobar o rechazar la modificación solicitada.</p>
              </div>
            </div>
            <div className="px-6 py-4 space-y-3">
              <label className="block text-sm font-semibold text-gray-700">Observaciones (opcional)</label>
              <textarea value={obsAutorizacion} onChange={(e) => setObsAutorizacion(e.target.value)} rows={2} className="input w-full py-2" placeholder="Motivo de aprobación o rechazo..." />
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button className="btn-outline" onClick={() => setModalAutorizacion(false)}>Cancelar</button>
              <button className="btn-danger" disabled={autorizarMutation.isPending} onClick={() => autorizarMutation.mutate({ aprobado: false, observaciones: obsAutorizacion || undefined })}>Rechazar</button>
              <button className="btn-primary" disabled={autorizarMutation.isPending} onClick={() => autorizarMutation.mutate({ aprobado: true, observaciones: obsAutorizacion || undefined })}>Aprobar</button>
            </div>
          </div>
        </div>
      )}

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

      {/* ── MODAL VER BAJA ──────────────────────────────────────────────────── */}
      {modalBaja && cphData && (() => {
        const b = (cphData?.concurso as unknown as { baja?: { motivo?: string | null; docRespaldatoria?: string | null; tipificadorOrigen?: string | null; partidaPresupuestaria?: string | null; cargaHoraria?: number | null; fechaPaseParalelo?: string | Date | null; observaciones?: string | null; fechaBaja?: string | Date | null; eeBaja?: string | null } })?.baja
        const cargo = (cphData.concurso as unknown as { cargo?: { codigo?: string; literalPuesto?: string; especialidad?: string; especialidadLegacy?: string; hospital?: { sigla?: string; nombre?: string }; escalafon?: { nombre?: string } } })?.cargo
        const persona = (cphData.concurso as unknown as { persona?: { apellidoNombre?: string; cuil?: string } })?.persona
        const toDate = (v: string | Date | null | undefined) => v ? (typeof v === 'string' ? v.slice(0, 10) : (v as Date).toISOString().slice(0, 10)) : ''
        const Row = ({ label, value }: { label: string; value: string }) => value ? (
          <div className="flex gap-2 text-sm">
            <span className="text-gray-500 w-44 shrink-0">{label}:</span>
            <span className="text-gray-800 font-medium">{value}</span>
          </div>
        ) : null
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
              <div className="bg-navy px-6 py-4 rounded-t-xl flex items-start justify-between gap-4">
                <div>
                  <p className="text-white/60 text-xs uppercase tracking-wider mb-0.5">Datos de la baja</p>
                  <p className="text-white font-bold font-mono">{cargo?.codigo ?? '—'}</p>
                </div>
                <button onClick={() => setModalBaja(false)} className="text-white/60 hover:text-white text-2xl leading-none mt-0.5">×</button>
              </div>
              <div className="overflow-y-auto flex-1 p-6 space-y-4">
                {/* Cargo */}
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Cargo</p>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <Row label="Código" value={cargo?.codigo ?? ''} />
                    <Row label="Hospital" value={cargo?.hospital ? `${cargo.hospital.sigla} — ${cargo.hospital.nombre}` : ''} />
                    <Row label="Puesto" value={cargo?.literalPuesto ?? ''} />
                    <Row label="Especialidad" value={cargo?.especialidadLegacy ?? cargo?.especialidad ?? ''} />
                    <Row label="Escalafón" value={cargo?.escalafon?.nombre ?? ''} />
                  </div>
                </div>
                {/* Agente */}
                {persona && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Agente</p>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      <Row label="Apellido y Nombre" value={persona.apellidoNombre ?? ''} />
                      <Row label="CUIL" value={persona.cuil ?? ''} />
                    </div>
                  </div>
                )}
                {/* Datos de la baja */}
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Datos de la baja</p>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <Row label="Fecha de baja" value={toDate(b?.fechaBaja)} />
                    <Row label="Expediente de baja" value={b?.eeBaja ?? ''} />
                    <Row label="Origen" value={b?.tipificadorOrigen ?? ''} />
                    <Row label="Motivo" value={b?.motivo ?? ''} />
                    <Row label="Doc. respaldatoria" value={b?.docRespaldatoria ?? ''} />
                    <Row label="Partida presup." value={b?.partidaPresupuestaria ?? ''} />
                    <Row label="Carga horaria" value={b?.cargaHoraria != null ? `${b.cargaHoraria} hs` : ''} />
                    <Row label="Fecha pase paralelo" value={toDate(b?.fechaPaseParalelo)} />
                    <Row label="Observaciones" value={b?.observaciones ?? ''} />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
                <button onClick={() => setModalBaja(false)} className="btn-outline">Cerrar</button>
              </div>
            </div>
          </div>
        )
      })()}

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
          {!esNuevo && cphData && (
            <div className="flex flex-wrap items-center gap-2 self-start">
              <span className="badge-info text-xs">
                {SUB_ESTADOS.find((s) => s.key === c.subEstado)?.label ?? c.subEstado}
              </span>
              <span className="badge-default text-xs">{c.subEstado3}</span>
              {c.suspendido && <span className="badge-danger text-xs">Suspendido</span>}
              <button
                onClick={() => setModalBaja(true)}
                className="btn-outline text-xs py-1 px-3"
              >
                📋 Ver baja
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

          {/* Documentación — debajo del card de etapas */}
          {!esNuevo && cphData && (
            <div className="bg-white rounded-lg shadow-sm p-3 mt-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
                Documentación
              </p>
              {getCasoCph(cphData).validacion && (
                <ExportDropdown
                  label="Validación"
                  onExport={(fmt) => (fmt === 'pdf' ? exportCphPdf(cphData, 'validacion') : exportCphWord(cphData, 'validacion'))}
                />
              )}
              <ExportDropdown
                label="Autorización"
                onExport={(fmt) => (fmt === 'pdf' ? exportCphPdf(cphData, 'autorizacion') : exportCphWord(cphData, 'autorizacion'))}
              />
            </div>
          )}
        </div>

        {/* Columna central — formulario de la etapa activa */}
        <div className="flex-1 min-w-0 space-y-4" ref={formRef}>
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
                {sgrasvPuedeResolver && etapaActiva === 'baja' && (
                  <button className="btn-primary text-xs py-1 px-3" onClick={() => setModalAutorizacion(true)}>Resolver autorización</button>
                )}
              </div>
            </div>

            <div className="p-6 space-y-6">

              {/* Banner: qué rol debe actuar en esta etapa */}
              {etapa.estado === 'pendiente' && (
                <div className="flex items-start gap-3 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm">
                  <span className="text-blue-400 text-base mt-0.5">🔒</span>
                  <div>
                    <p className="font-semibold text-blue-800">
                      {etapa.id === 'autorizacion' && 'Esperando acción del rol Director / DGAYDRH'}
                      {etapa.id === 'inscripcion'  && 'Esperando acción del área de Concursos CPH'}
                      {etapa.id === 'ifacs_insal'  && 'Esperando acción de IFACS / INSAL'}
                      {etapa.id === 'designacion'  && 'Esperando acción del área de Designaciones'}
                      {etapa.id === 'desierto'     && 'Esperando acción del área de Concursos CPH'}
                    </p>
                    <p className="text-blue-600 text-xs mt-0.5">Esta etapa se habilitará cuando la anterior esté completa.</p>
                  </div>
                </div>
              )}

              {pendienteAutorizacion && etapaActiva === 'baja' && (
                <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm">
                  <span className="text-amber-500 text-base mt-0.5">⏳</span>
                  <div>
                    <p className="font-semibold text-amber-800">Modificación pendiente de autorización</p>
                    {tieneCambioSiglaCr ? (
                      aprobadoDirector ? (
                        <p className="text-amber-700 text-xs mt-0.5">El <strong>Director</strong> ya aprobó. Esperando resolución final de <strong>SGRASV</strong>.</p>
                      ) : (
                        <p className="text-amber-700 text-xs mt-0.5">Se solicitó un cambio de sigla o código de registro. El rol <strong>Director</strong> debe autorizar primero, luego <strong>SGRASV</strong> confirma.</p>
                      )
                    ) : (
                      <p className="text-amber-700 text-xs mt-0.5">Requiere autorización de <strong>SGRASV</strong> para continuar.</p>
                    )}
                  </div>
                </div>
              )}

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
                      {/* Campos extra de la baja — solo cuando hay datos de API (no modo nuevo) */}
                      {!esNuevo && (() => {
                        const b = (cphData?.concurso as unknown as { baja?: { motivo?: string | null; docRespaldatoria?: string | null; tipificadorOrigen?: string | null; partidaPresupuestaria?: string | null; cargaHoraria?: number | null; fechaPaseParalelo?: string | Date | null; observaciones?: string | null } })?.baja
                        if (!b) return null
                        const toDate = (v: string | Date | null | undefined) => v ? (typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10)) : ''
                        const extras: { label: string; value: string; fecha?: boolean; wide?: boolean }[] = [
                          { label: 'Origen',                value: b.tipificadorOrigen ?? '' },
                          { label: 'Motivo',                value: b.motivo ?? '' },
                          { label: 'Doc. respaldatoria',    value: b.docRespaldatoria ?? '' },
                          { label: 'Partida presup.',       value: b.partidaPresupuestaria ?? '' },
                          { label: 'Carga horaria',         value: b.cargaHoraria != null ? `${b.cargaHoraria} hs` : '' },
                          { label: 'Fecha pase paralelo',   value: toDate(b.fechaPaseParalelo), fecha: true },
                          { label: 'Observaciones',         value: b.observaciones ?? '', wide: true },
                        ]
                        return extras.filter((e) => e.value).map((e) => (
                          <div key={e.label} className={e.wide ? 'sm:col-span-2' : ''}>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">{e.label}</label>
                            <input
                              type={e.fecha ? 'date' : 'text'}
                              defaultValue={e.value}
                              className="input h-10 w-full bg-gray-50 text-gray-500"
                              readOnly
                            />
                          </div>
                        ))
                      })()}
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
                            data-key={campo.key}
                            className="input h-10 w-full"
                            disabled={pendienteAutorizacion || etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'}
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
                          disabled={pendienteAutorizacion || etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'}
                        >
                          <option value="">Seleccioná...</option>
                          {hospitales.map((h) => (
                            <option key={h.id} value={h.sigla}>{hospitalLabel(h)}</option>
                          ))}
                        </select>
                      </div>
                      {/* Escalafón */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Escalafón</label>
                        <select
                          value={escalafonId}
                          onChange={(e) => { setEscalafonId(e.target.value); setPuestoConcurso(''); setEspecialidadConcurso('') }}
                          className="input h-10 w-full"
                          disabled={pendienteAutorizacion || etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'}
                        >
                          <option value="">Seleccioná...</option>
                          {escalafonesOrdenados.map((e) => (
                            <option key={e.id} value={e.id}>{escalafonLabel(e.nombre)}</option>
                          ))}
                        </select>
                      </div>
                      {/* Puesto — en cascada con escalafón */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Puesto</label>
                        <select
                          value={puestoConcurso}
                          onChange={(e) => { setPuestoConcurso(e.target.value); setEspecialidadConcurso('') }}
                          className="input h-10 w-full"
                          disabled={pendienteAutorizacion || etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'}
                        >
                          <option value="">{escalafonId ? 'Seleccioná...' : 'Elegí un escalafón primero'}</option>
                          {puestosDisponibles.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>
                      {/* Especialidad — condicional */}
                      {especialidadesDisponibles.length > 0 && (
                        <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Especialidad del concurso</label>
                          <select
                            value={especialidadConcurso}
                            onChange={(e) => setEspecialidadConcurso(e.target.value)}
                            className="input h-10 w-full"
                            disabled={pendienteAutorizacion || etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'}
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
                            data-key={campo.key}
                            className="checkbox"
                            disabled={campo.readonly || etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'}
                          />
                          <span className="text-sm text-gray-500">Sí</span>
                        </div>
                      ) : campo.tipo === 'textarea' ? (
                        <textarea
                          defaultValue={campo.valor as string}
                          data-key={campo.key}
                          rows={3}
                          className="input w-full py-2"
                          disabled={campo.readonly || etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'}
                        />
                      ) : (
                        <input
                          type={campo.tipo === 'fecha' ? 'date' : 'text'}
                          defaultValue={campo.valor as string}
                          data-key={campo.key}
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
              </div>
              <div className="flex items-center gap-3">
                {guardado && <span className="text-sm text-green-600 font-medium">✓ Guardado</span>}
                {etapa.estado !== 'pendiente' && etapa.estado !== 'bloqueada' && (
                  <button
                    className="btn-primary"
                    disabled={pendienteAutorizacion && etapaActiva === 'baja'}
                    title={pendienteAutorizacion && etapaActiva === 'baja' ? 'Hay una modificación pendiente de autorización por SGRASV' : undefined}
                    onClick={handleGuardar}
                  >
                    {etapa.numero < etapasActuales.length ? 'Guardar y continuar →' : 'Guardar cambios'}
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
            {pendienteAutorizacion && (
              <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2">
                <span className="text-amber-500 text-sm">⏳</span>
                <div>
                  <p className="text-[10px] font-bold text-amber-700 leading-tight">Autorización pendiente</p>
                  <p className="text-[10px] text-amber-600 leading-tight">Esperando aprobación de SGRASV para continuar</p>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              {SUB_ESTADOS.map((s, idx) => {
                const isCurrent = idx === currentIdxDinamico
                const isPast    = idx < currentIdxDinamico
                return (
                  <div key={s.key} className="flex items-center gap-2">
                    <div className="flex flex-col items-center self-stretch">
                      <span className={[
                        'w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5',
                        isCurrent && pendienteAutorizacion ? 'bg-amber-400 ring-2 ring-amber-200 animate-pulse' :
                        isCurrent ? 'bg-amber-400 ring-2 ring-amber-200' :
                        isPast    ? 'bg-green-400' : 'bg-gray-200',
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
                      {isCurrent && pendienteAutorizacion && (
                        <span className="ml-1 text-[10px] text-amber-500">⏳</span>
                      )}
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
