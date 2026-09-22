// Wizard de seguimiento CPH — funciona en dos modos:
// Wizard de seguimiento de un concurso CPH — carga el concurso real por su UUID
// (id de la ruta) y guía las 5 etapas del proceso: Baja/Apertura, Autorización/
// Jurado, Inscripción/Examen/OM, IFACS/INSAL y Designación.
// "Declarar desierto" NO es una etapa: es una acción disponible en la Etapa 3
// que relanza el concurso desde la Etapa 1.

import { useState, useMemo, useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import {
  useEscalafones,
  usePuestosCargoNormalizados,
  useEspecialidadesPuesto,
  useHospitales,
  useCodigosRegistro,
} from '@/shared/hooks/useCatalogos'
import { hospitalLabel } from '@/shared/lib/hospitalLabel'
import {
  getCasoCph,
  exportCphPdf,
  exportJuradoPdf,
  exportOrdenMeritoPdf,
} from '@/shared/lib/exportConcursoDocs'
import type { ConcursoCph } from '@srrhh/types'
import { useAuth } from '@/modules/auth/hooks/useAuth'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import {
  useDesignarConcursoCph,
  useDeclararDesiertoCph,
  useSuspenderConcursoCph,
  useGenerarSorteoJurado,
  useReutilizarJurado,
  useJuradosVigentes,
  useJuradoCph,
  useConfirmarSorteoJurado,
  useCancelarSorteoJurado,
  useRevertirConfirmacionSorteo,
  useInscriptosCph,
  useCrearInscriptoCph,
  useActualizarInscriptoCph,
  useImportarInscriptosCph,
  useCerrarInscripcionCph,
  useReabrirInscripcionCph,
  usePublicarExamenCph,
  useDespublicarExamenCph,
  useConfirmarPresentadosCph,
  useRevertirPresentadosCph,
  useConfirmarOrdenMeritoCph,
  useRevertirOrdenMeritoCph,
  useDesignacionEstado,
} from '../hooks/useConcursosCph'
import type { GenerarSorteoJuradoRequest, InscriptoRequest } from '@srrhh/types'
import { SearchableSelect } from '@/shared/components/ui/SearchableSelect'
import { useConfirm } from '@/shared/components/ui/useConfirm'
import { useToast } from '@/shared/components/ui/useToast'
import {
  type EstadoEtapa,
  type Etapa,
  ESTADO_ETAPA_CONFIG,
  SUB_ESTADOS,
} from '../lib/wizard.constants'
import { PanelSubEstados } from '../components/PanelSubEstados'
import { HistorialCambios } from '../components/HistorialCambios'
import { EtiquetasControl } from '../components/EtiquetasControl'
import { PanelReutilizarOm } from '../components/PanelReutilizarOm'

// Calcula el orden de mérito a partir de la nota de cada inscripto: nota más
// alta = posición 1. No puede haber dos personas en la misma posición — un
// empate de nota se desempata por apellido/nombre alfabético, así que las
// posiciones siempre quedan consecutivas y únicas (1, 2, 3...). Solo entran
// los presentados con nota cargada; el resto queda sin posición (null).
function calcularOrdenMerito(
  inscriptos: { id: string; apellido: string; nombre: string; presentoExamen: boolean; nota: number | null }[],
): Map<string, number | null> {
  const ranking = new Map<string, number | null>()
  const conNota = inscriptos
    .filter((i) => i.presentoExamen && i.nota != null)
    .sort((a, b) => {
      if (b.nota !== a.nota) return (b.nota as number) - (a.nota as number)
      return a.apellido.localeCompare(b.apellido) || a.nombre.localeCompare(b.nombre)
    })
  conNota.forEach((i, idx) => ranking.set(i.id, idx + 1))
  inscriptos.forEach((i) => {
    if (!ranking.has(i.id)) ranking.set(i.id, null)
  })
  return ranking
}

export function ConcursoCphWizard() {
  const { id } = useParams<{ id: string }>()

  // Leer concurso real por su ID
  const { data: cphData, isLoading } = useQuery({
    queryKey: ['concurso-cph-wizard', id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ConcursoCph }>(`/api/v1/concursos-cph/${id}`)
      return res.data.data
    },
    enabled: !!id,
  })

  const { user } = useAuth()
  const queryClient = useQueryClient()

  // S13-C: la Autorizacion pendiente real (tabla genérica) para este concurso,
  // si existe y le corresponde resolverla al usuario logueado. Reemplaza al
  // viejo POST /concursos-cph/:id/autorizar, que nunca tocaba esta tabla y
  // dejaba la fila huérfana en "pendiente" para siempre.
  const { data: autorizacionPendiente } = useQuery({
    queryKey: ['autorizaciones', 'lista', { tipo: 'concurso_cph' as const, referenciaId: id }],
    queryFn: async () => {
      const res = await apiClient.get<{
        data: {
          id: string
          referenciaId: string
          resolverPorRolSlug: string
        }[]
      }>('/api/v1/autorizaciones', {
        params: { tipo: 'concurso_cph', limit: 100 },
      })
      return res.data.data.find((a) => a.referenciaId === id) ?? null
    },
    enabled: !!id,
  })
  const puedeResolverAutorizacion =
    !!autorizacionPendiente && autorizacionPendiente.resolverPorRolSlug === user?.rolSlug

  const { data: escalafones = [] } = useEscalafones()
  const { data: hospitales = [] } = useHospitales()
  const { data: codigosRegistro = [] } = useCodigosRegistro()
  // Escalafones ordenados igual que PersonasPage
  const escalafonesOrdenados = [...escalafones].sort((a, b) =>
    escalafonLabel(a.nombre).localeCompare(escalafonLabel(b.nombre), 'es'),
  )
  // Helper: dado un escalafonId, devuelve el primer codigoRegistroId asociado
  const crIdDeEscalafon = (escId: string) =>
    codigosRegistro.find((cr) => cr.escalafonId === escId)?.id ?? null
  const escalafonCph = escalafones.find(
    (e) => e.nombre === 'Nueva Carrera Profesional Hospitalaria',
  )

  // Construir objeto concurso desde la API
  const concurso = useMemo(() => {
    if (!cphData) return null
    const c = cphData.concurso
    const baja = (
      c as unknown as {
        baja?: {
          observaciones?: string | null
          fechaBaja?: string | Date | null
          eeBaja?: string | null
          motivo?: string | null
          docRespaldatoria?: string | null
          tipificadorOrigen?: string | null
          partidaPresupuestaria?: string | null
          cargaHoraria?: number | null
          fechaPaseParalelo?: string | Date | null
        }
      }
    )?.baja
    const eeBajaVal = cphData.eeBaja ?? baja?.eeBaja ?? ''
    const rawFechaHeader = cphData.fechaBaja ?? baja?.fechaBaja ?? ''
    const fechaBajaVal = rawFechaHeader
      ? typeof rawFechaHeader === 'string'
        ? rawFechaHeader.slice(0, 10)
        : (rawFechaHeader as Date).toISOString().slice(0, 10)
      : ''
    return {
      hospital: c?.hospital?.sigla ?? '',
      hospitalNombre: c?.hospital?.nombre ?? '',
      cargo: c?.cargo?.codigo ?? '',
      puesto: c?.cargo?.literalPuesto ?? '—',
      especialidad:
        cphData.especialidadSolicitada ??
        (c?.cargo as any)?.especialidadLegacy ??
        c?.cargo?.especialidad ??
        '—',
      escalafon: 'CPH',
      personaBaja: c?.persona?.apellidoNombre ?? '—',
      fechaBaja: fechaBajaVal,
      eeBaja: eeBajaVal,
      subEstado: cphData.subEstado ?? 'VACANTE',
      subEstado3: cphData.subEstado3 ?? '',
      suspendido: cphData.suspendido,
      observaciones: cphData.observaciones ?? '',
    }
  }, [cphData])

  // Acta del jurado (se usa para calcular la completitud de la etapa 2).
  const { data: juradoData } = useJuradoCph(id)

  // Construir etapas: en modo nuevo todas vacías, con ID real leer valores del backend
  const etapasIniciales: Etapa[] = useMemo(() => {
    const v = (key: string): string => {
      if (!cphData) return ''
      const val = (cphData as unknown as Record<string, unknown>)[key]
      if (!val) return ''
      // Fechas vienen como ISO string desde la API — truncar a YYYY-MM-DD para input[type=date]
      if (typeof val === 'string' && val.length > 10 && val.includes('T')) return val.slice(0, 10)
      return String(val)
    }
    const vb = (key: string): boolean => {
      if (!cphData) return false
      return (cphData as unknown as Record<string, boolean>)[key] ?? false
    }
    const bajaDatos = (
      cphData?.concurso as unknown as
        | {
            baja?: {
              observaciones?: string | null
              fechaBaja?: string | Date | null
              eeBaja?: string | null
              motivo?: string | null
              docRespaldatoria?: string | null
              tipificadorOrigen?: string | null
              partidaPresupuestaria?: string | null
              cargaHoraria?: number | null
              fechaPaseParalelo?: string | Date | null
            }
          }
        | undefined
    )?.baja
    const eeBajaResuelto = cphData?.eeBaja ?? bajaDatos?.eeBaja ?? ''
    const rawFecha = cphData?.fechaBaja ?? bajaDatos?.fechaBaja ?? ''
    const fechaBajaResuelto = rawFecha
      ? typeof rawFecha === 'string'
        ? rawFecha.slice(0, 10)
        : (rawFecha as Date).toISOString().slice(0, 10)
      : ''
    // Determinar estado de cada etapa según qué campos tiene completados.
    // Etapa 2 COMPLETA solo con TODOS sus requisitos: fecha de autorización +
    // jurado CONFIRMADO + disposición de llamado. Mientras falte alguno, la
    // etapa sigue "en curso" (amarilla) y no habilita la etapa 3.
    const juradoConfirmado = !!juradoData?.confirmado
    const etapa2Completa =
      !!cphData?.fechaAutorizacion &&
      juradoConfirmado &&
      !!cphData?.disposicion &&
      !!cphData?.tipoGestion
    // "Tiene autorización" (para habilitar la etapa como activa) = ya pasó la
    // autorización de DGAYDRH; la completitud plena la define etapa2Completa.
    const tieneAutorizacion = !!(cphData?.fechaAutorizacion || cphData?.disposicion)
    const tieneInscripcion = !!(cphData?.fechaExamen || cphData?.fechaOrdenMerito)
    const tieneIfacs = !!cphData?.fechaIfacs
    const tieneDesignacion = !!(cphData?.fechaResolucion || cphData?.cargoSial)
    // Si el concurso ya está designado/finalizado/desierto, las etapas intermedias
    // sin fechas se marcan completadas igual — el concurso pasó por ahí aunque
    // no se registraron todos los datos (gap de datos del legacy)
    const yaFinalizado =
      tieneDesignacion || !!cphData?.resolucionDesignacion || !!cphData?.dispoDesierta

    const estadoEtapa = (condicion: boolean, anterior: boolean): EstadoEtapa => {
      if (condicion || yaFinalizado) return 'completada'
      if (anterior) return 'activa'
      return 'pendiente'
    }

    return [
      {
        id: 'baja',
        numero: 1,
        titulo: 'Baja / Apertura',
        descripcion: 'Registro de la baja del agente y apertura del expediente de concurso.',
        estado: !cphData
          ? 'activa'
          : cphData.eeConcurso && !cphData.pendienteAutorizacion
            ? 'completada'
            : 'activa',
        fechaCompletada: cphData?.fechaEeConcurso ?? undefined,
        campos: [
          {
            key: 'eeBaja',
            label: 'Expediente de baja',
            tipo: 'texto',
            valor: eeBajaResuelto || v('eeBaja'),
            readonly: true,
          },
          {
            key: 'fechaBaja',
            label: 'Fecha de baja',
            tipo: 'fecha',
            valor: fechaBajaResuelto || v('fechaBaja'),
            readonly: true,
          },
          {
            key: 'puesto',
            label: 'Puesto',
            tipo: 'texto',
            valor: cphData?.concurso?.cargo?.literalPuesto ?? '',
            readonly: true,
          },
          {
            key: '__sep__',
            label: '',
            tipo: 'texto',
            valor: '',
            readonly: true,
          },
          {
            key: 'eeConcurso',
            label: 'Expediente de Concurso',
            tipo: 'texto',
            valor: v('eeConcurso'),
          },
        ],
      },
      {
        id: 'autorizacion',
        numero: 2,
        titulo: 'Autorización / Jurado',
        descripcion: 'Autorización por DGAYDRH, sorteo de jurado y disposición de llamado.',
        estado: estadoEtapa(
          etapa2Completa,
          !!cphData?.eeConcurso && !cphData?.pendienteAutorizacion,
        ),
        fechaCompletada: cphData?.fechaAutorizacion ?? undefined,
        campos: [
          {
            key: 'fechaAutorizacion',
            label: 'Fecha de autorización',
            tipo: 'fecha',
            valor: v('fechaAutorizacion'),
          },
          {
            key: 'sorteoJurado',
            label: 'Fecha sorteo de jurado',
            tipo: 'fecha',
            valor: v('sorteoJurado'),
          },
          {
            key: 'disposicion',
            label: 'Disposición de llamado',
            tipo: 'texto',
            valor: v('disposicion'),
          },
        ],
      },
      {
        id: 'inscripcion',
        numero: 3,
        titulo: 'Inscripción / Examen / OM',
        descripcion: 'Período de inscripción, publicación del examen y orden de mérito.',
        // La etapa 3 se habilita recién cuando la etapa 2 está completa
        // (jurado confirmado + fecha de autorización + disposición de llamado).
        estado: estadoEtapa(tieneInscripcion, etapa2Completa),
        fechaCompletada: cphData?.fechaOrdenMerito ?? undefined,
        campos: [
          {
            key: 'fechaInscDesde',
            label: 'Inscripción desde',
            tipo: 'fecha',
            valor: v('fechaInscDesde'),
          },
          {
            key: 'fechaInscHasta',
            label: 'Inscripción hasta',
            tipo: 'fecha',
            valor: v('fechaInscHasta'),
          },
          {
            key: 'fechaExamen',
            label: 'Fecha de examen',
            tipo: 'fecha',
            valor: v('fechaExamen'),
          },
          {
            key: 'fechaOrdenMerito',
            label: 'Fecha orden de mérito',
            tipo: 'fecha',
            valor: v('fechaOrdenMerito'),
          },
        ],
      },
      {
        id: 'ifacs_insal',
        numero: 4,
        titulo: 'IFACS / INSAL',
        descripcion: 'Informe de Aptitud para el Cargo (IFACS) e Informe INSAL.',
        estado: estadoEtapa(tieneIfacs && !!cphData?.fechaInsal, tieneInscripcion),
        campos: [
          {
            key: 'ifacs',
            label: 'Expediente IFACS',
            tipo: 'texto',
            valor: v('ifacs'),
          },
          {
            key: 'fechaIfacs',
            label: 'Fecha IFACS',
            tipo: 'fecha',
            valor: v('fechaIfacs'),
            requerido: true,
          },
          {
            key: 'insal',
            label: 'Expediente INSAL',
            tipo: 'texto',
            valor: v('insal'),
          },
          {
            key: 'fechaInsal',
            label: 'Fecha INSAL',
            tipo: 'fecha',
            valor: v('fechaInsal'),
            requerido: true,
          },
        ],
      },
      {
        id: 'designacion',
        numero: 5,
        titulo: 'Designación',
        descripcion: 'TAD, documentación, apto médico, ITE y resolución de designación.',
        estado: estadoEtapa(tieneDesignacion, tieneIfacs),
        campos: [
          {
            key: 'eeDesignacion',
            label: 'EE de designación (TAD)',
            tipo: 'texto',
            valor: v('eeDesignacion'),
          },
          {
            key: 'cargaDocumentacion',
            label: 'Carga de documentación',
            tipo: 'checkbox',
            valor: vb('cargaDocumentacion'),
          },
          {
            key: 'fechaAptoMedico',
            label: 'Fecha apto médico',
            tipo: 'fecha',
            valor: v('fechaAptoMedico'),
          },
          {
            key: 'fechaIte',
            label: 'Fecha ITE',
            tipo: 'fecha',
            valor: v('fechaIte'),
          },
          {
            key: 'proyectoResolucion',
            label: 'Proyecto de resolución',
            tipo: 'checkbox',
            valor: vb('proyectoResolucion'),
          },
          {
            key: 'resoALaFirma',
            label: 'Reso a la firma',
            tipo: 'checkbox',
            valor: vb('resoALaFirma'),
          },
          {
            key: 'resolucionDesignacion',
            label: 'Resolución de designación',
            tipo: 'texto',
            valor: v('resolucionDesignacion'),
          },
          {
            key: 'fechaResolucion',
            label: 'Fecha de resolución',
            tipo: 'fecha',
            valor: v('fechaResolucion'),
          },
          {
            key: 'cargoSial',
            label: 'Cargo SIAL (alta)',
            tipo: 'texto',
            valor: v('cargoSial'),
          },
        ],
      },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cphData, juradoData?.confirmado])

  const [puestoConcurso, setPuestoConcurso] = useState('')
  const [especialidadConcurso, setEspecialidadConcurso] = useState('')
  const [siglaConcurso, setSiglaConcurso] = useState('')
  const [escalafonId, setEscalafonId] = useState('')
  const [eeConcursoInput, setEeConcursoInput] = useState('')
  const [ifAutorizacionInput, setIfAutorizacionInput] = useState('')
  // Puestos del escalafón seleccionado (sin filtrar por tipo)
  const { data: puestosDisponibles = [] } = usePuestosCargoNormalizados(
    escalafonId || undefined,
    undefined,
    undefined,
  )
  const [modalCambios, setModalCambios] = useState<
    { campo: string; de: string; a: string }[] | null
  >(null)
  const [modalAutorizacion, setModalAutorizacion] = useState(false)
  const [obsAutorizacion, setObsAutorizacion] = useState('')
  const [modalBaja, setModalBaja] = useState(false)
  const [menuAcciones, setMenuAcciones] = useState(false)
  const menuAccionesRef = useRef<HTMLDivElement>(null)
  const [modalDesignar, setModalDesignar] = useState(false)
  // 'proponer' (Etapa 4): solo elegir a quién notificar por INSAL, no ocupa
  // el cargo ni pide fecha de inicio. 'designar' (Etapa 5): designación
  // oficial real, crea la ocupación — comportamiento existente sin cambios.
  const [modalDesignarModo, setModalDesignarModo] = useState<'proponer' | 'designar'>('designar')
  const [designarPersonaId, setDesignarPersonaId] = useState('')
  const [designarPersonaNombre, setDesignarPersonaNombre] = useState('')
  const [designarPersonaEspCph, setDesignarPersonaEspCph] = useState<string | null>(null)
  const [designarFechaDesde, setDesignarFechaDesde] = useState('')
  const [designarIdSialRol, setDesignarIdSialRol] = useState('')
  const [designarSearch, setDesignarSearch] = useState('')
  // Inscripto (de este concurso) que corresponde a la persona propuesta —
  // se necesita para poder marcarlo en insalRechazados si no acepta.
  const [designarInscriptoId, setDesignarInscriptoId] = useState('')
  // Candidato del orden de mérito que se está resolviendo contra el padrón
  // (búsqueda por CUIL para obtener el personaId real) al elegirlo en el
  // modal de designación.
  const [resolviendoOMId, setResolviendoOMId] = useState<string | null>(null)

  const [modalDesierto, setModalDesierto] = useState(false)
  const [desiertoDisp, setDesiertoDisp] = useState('')
  const [desiertoFecha, setDesiertoFecha] = useState('')
  const [desiertoObs, setDesiertoObs] = useState('')

  // Acción "Cambio de especialidad" (menú Acciones): requiere expediente que
  // respalde el cambio, pide la nueva especialidad, y manda el concurso de
  // nuevo a autorización (mismo mecanismo que ya dispara el PATCH cuando se
  // edita especialidadSolicitada: pendienteAutorizacion=true → la Etapa 1
  // vuelve a mostrarse "activa" en vez de "completada").
  const [modalCambioEspecialidad, setModalCambioEspecialidad] = useState(false)
  const [cambioEspExpediente, setCambioEspExpediente] = useState('')
  const [cambioEspNueva, setCambioEspNueva] = useState('')
  const [cambioEspObs, setCambioEspObs] = useState('')

  // Diálogos propios (reemplazan window.confirm / window.alert)
  const { confirm, ConfirmUI } = useConfirm()
  const { toast, ToastUI } = useToast()

  // ── Sorteo de jurado (Etapa 2) ──
  const hoyISO = new Date().toISOString().slice(0, 10)
  const [modalGenerarSorteo, setModalGenerarSorteo] = useState(false)
  const [sorteoCriterios, setSorteoCriterios] = useState<
    Required<
      Omit<
        GenerarSorteoJuradoRequest,
        'semilla' | 'observaciones' | 'especialidadesAdicionales' | 'expedienteEspecialidades'
      >
    > & {
      especialidadesAdicionales: string[]
      expedienteEspecialidades: string
      semilla: string
      observaciones: string
    }
  >({
    cantTitulares: 3,
    cantSuplentes: 3,
    antiguedadMinimaAnios: 15,
    especialidadesAdicionales: [],
    expedienteEspecialidades: '',
    semilla: '',
    observaciones: '',
  })
  const generarSorteoMutation = useGenerarSorteoJurado(id!)
  const confirmarSorteoMutation = useConfirmarSorteoJurado(id!)
  const cancelarSorteoMutation = useCancelarSorteoJurado(id!)
  const revertirSorteoMutation = useRevertirConfirmacionSorteo(id!)
  const reutilizarJuradoMutation = useReutilizarJurado(id!)

  // Jurados vigentes compatibles con este concurso (mismo escalafón +
  // especialidad), excluyendo el propio, para ofrecer reutilización.
  const { data: juradosVigentes = [] } = useJuradosVigentes()
  const normEsp = (s: string | null | undefined) =>
    (s ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  const escalafonParaJurado = cphData?.concurso?.cargo?.escalafonId
  const especialidadParaJurado =
    cphData?.especialidadSolicitada ?? cphData?.concurso?.cargo?.especialidadLegacy ?? null
  // Modalidad del cargo a concursar (guardia = POU, planta = POF) — mismo
  // criterio que el backend (sorteoJurado.service.ts::modalidadDeCargo),
  // determina qué set de reglas de jurado se muestra/aplica.
  const modalidadCargoJurado: 'pou' | 'pof' = (() => {
    const u = normEsp(cphData?.concurso?.cargo?.unificadorPuesto)
    return u.includes('pou') || u.includes('guardia') ? 'pou' : 'pof'
  })()
  // Concurso centralizado: regla única (conducción + especialidad, cualquier
  // hospital), sin distinción POF/POU — ver comentario de cabecera de
  // sorteoJurado.service.ts.
  const esCentralizado = cphData?.tipoGestion === 'centralizado'
  // Sin Tipo de gestión definido no se puede evaluar si un jurado vigente es
  // compatible: un concurso descentralizado exige mismo hospital (prioridad
  // de Regla 1/2), uno centralizado no. Sin ese dato, no se sugiere nada —
  // evita ofrecer jurados de otro hospital como "compatibles" quedando el
  // usuario sin saber si de verdad cumplen.
  const juradosCompatibles = !cphData?.tipoGestion
    ? []
    : juradosVigentes.filter((j) => {
        if (!j.vigente) return false // no se puede reutilizar un jurado vencido
        if (j.concursoCph?.id === id) return false
        const escOk =
          !j.criterios?.escalafonId ||
          !escalafonParaJurado ||
          j.criterios.escalafonId === escalafonParaJurado
        const espOk = normEsp(j.criterios?.especialidadConcurso) === normEsp(especialidadParaJurado)
        // Centralizado no prioriza hospital (regla única, toda la base).
        // Descentralizado sí — reutilizar un jurado de otro hospital viola
        // la Regla 1/2 (mismo hospital), así que solo es compatible si
        // coincide el hospital del concurso original.
        const hospOk =
          esCentralizado ||
          !cphData?.hospitalId ||
          !j.criterios?.hospitalId ||
          j.criterios.hospitalId === cphData.hospitalId
        return escOk && espOk && hospOk
      })

  // ── Etapa 3: inscriptos ──
  const { data: inscriptos = [] } = useInscriptosCph(id)
  const crearInscriptoMutation = useCrearInscriptoCph(id!)
  const actualizarInscriptoMutation = useActualizarInscriptoCph(id!)
  const importarInscriptosMutation = useImportarInscriptosCph(id!)
  const cerrarInscripcionMutation = useCerrarInscripcionCph(id!)
  const reabrirInscripcionMutation = useReabrirInscripcionCph(id!)
  const publicarExamenMutation = usePublicarExamenCph(id!)
  const despublicarExamenMutation = useDespublicarExamenCph(id!)
  // ── Etapa 4: IFACS / INSAL (campos controlados para habilitar el guardado) ──
  const [ifacsForm, setIfacsForm] = useState({ ifacs: '', fechaIfacs: '' })
  const [insalForm, setInsalForm] = useState({ insal: '', fechaInsal: '' })
  useEffect(() => {
    setIfacsForm({
      ifacs: cphData?.ifacs ?? '',
      fechaIfacs: cphData?.fechaIfacs?.slice(0, 10) ?? '',
    })
    setInsalForm({
      insal: cphData?.insal ?? '',
      fechaInsal: cphData?.fechaInsal?.slice(0, 10) ?? '',
    })
  }, [cphData])
  // ── Etapa 5: Designación (campos controlados, un botón "Registrar" por paso) ──
  const [desigForm, setDesigForm] = useState({
    eeDesignacion: '',
    cargaDocumentacion: false,
    fechaAptoMedico: '',
    fechaIte: '',
    proyectoResolucion: false,
    resoALaFirma: false,
    resolucionDesignacion: '',
    fechaResolucion: '',
    cargoSial: '',
  })
  useEffect(() => {
    setDesigForm({
      eeDesignacion: cphData?.eeDesignacion ?? '',
      cargaDocumentacion: cphData?.cargaDocumentacion ?? false,
      fechaAptoMedico: cphData?.fechaAptoMedico?.slice(0, 10) ?? '',
      fechaIte: cphData?.fechaIte?.slice(0, 10) ?? '',
      proyectoResolucion: cphData?.proyectoResolucion ?? false,
      resoALaFirma: cphData?.resoALaFirma ?? false,
      resolucionDesignacion: cphData?.resolucionDesignacion ?? '',
      fechaResolucion: cphData?.fechaResolucion?.slice(0, 10) ?? '',
      cargoSial: cphData?.cargoSial ?? '',
    })
  }, [cphData])

  const confirmarPresentadosMutation = useConfirmarPresentadosCph(id!)
  const revertirPresentadosMutation = useRevertirPresentadosCph(id!)
  const confirmarOrdenMeritoMutation = useConfirmarOrdenMeritoCph(id!)
  const revertirOrdenMeritoMutation = useRevertirOrdenMeritoCph(id!)
  const [modalInscripto, setModalInscripto] = useState(false)
  const [inscriptoForm, setInscriptoForm] = useState<InscriptoRequest>({
    apellido: '',
    nombre: '',
    dni: '',
    cuil: '',
    email: '',
  })
  const inscriptoFileRef = useRef<HTMLInputElement>(null)

  const designarMutation = useDesignarConcursoCph(id!)
  const declararDesiertoMutation = useDeclararDesiertoCph(id!)
  const suspenderMutation = useSuspenderConcursoCph(id!)


  // Candidatos elegibles del orden de mérito de ESTE concurso: presentados
  // con posición asignada, ordenados 1º, 2º, 3º... — la fuente principal
  // para elegir a quién designar (en vez de buscar a mano entre todo el
  // padrón).
  const insalRechazados = cphData?.insalRechazados ?? []
  const elegiblesOM = [...inscriptos]
    .filter((i) => i.presentoExamen && i.ordenMerito != null && !insalRechazados.includes(i.id))
    .sort((a, b) => (a.ordenMerito as number) - (b.ordenMerito as number))

  // Inscripto reservado para el INSAL en Etapa 4 (fuente local, NO padrón).
  // Se resuelve contra la lista de inscriptos de este concurso por su id.
  const inscriptoReservado =
    inscriptos.find((i) => i.id === cphData?.inscriptoReservadoId) ?? null

  // Resuelve un candidato del orden de mérito contra el padrón real (por
  // CUIL) y lo deja seleccionado en el modal de designación, igual que si
  // se hubiera encontrado por búsqueda manual.
  async function seleccionarCandidatoOM(cand: (typeof elegiblesOM)[number]) {
    // Etapa 4 (modo 'proponer'): solo reservar al inscripto del orden de
    // mérito para el INSAL — NO se resuelve contra el padrón (esa resolución
    // es en Etapa 5, al designar oficialmente). Un inscripto puede no existir
    // todavía en el padrón (ganador externo), y eso no debe bloquear la
    // propuesta. Guardamos su inscriptoId y su nombre para mostrar.
    if (modalDesignarModo === 'proponer') {
      setDesignarInscriptoId(cand.id)
      setDesignarSearch(`${cand.apellido}, ${cand.nombre}`)
      // No hay personaId del padrón en esta etapa; limpiamos lo que no aplica.
      setDesignarPersonaId('')
      setDesignarPersonaNombre(`${cand.apellido}, ${cand.nombre}`)
      setDesignarPersonaEspCph(cand.especialidad ?? null)
      return
    }
    if (!cand.cuil) {
      toast.error('Este candidato no tiene CUIL cargado — no se puede resolver contra el padrón.')
      return
    }
    setResolviendoOMId(cand.id)
    try {
      const res = await apiClient.get<{
        data: {
          id: string
          apellidoNombre: string
          cuil: string
          numeroDoc?: string | null
          especialidadCph?: string | null
        }[]
      }>('/api/v1/personas', { params: { search: cand.cuil, limit: 5 } })
      const cuilNorm = cand.cuil.replace(/\D/g, '')
      const match =
        res.data.data.find((p) => p.cuil.replace(/\D/g, '') === cuilNorm) ?? res.data.data[0]
      if (!match) {
        toast.error(
          `No se encontró en el padrón a ${cand.apellido}, ${cand.nombre} (CUIL ${cand.cuil}).`,
        )
        return
      }
      setDesignarPersonaId(match.id)
      setDesignarPersonaNombre(match.apellidoNombre)
      setDesignarPersonaEspCph(match.especialidadCph ?? null)
      setDesignarSearch(match.apellidoNombre)
      setDesignarIdSialRol('')
      setDesignarInscriptoId(cand.id)
    } catch {
      toast.error('No se pudo buscar este candidato en el padrón.')
    } finally {
      setResolviendoOMId(null)
    }
  }

  // Roles SIAL activos de la persona seleccionada
  const { data: sialRolesData } = useQuery({
    queryKey: ['persona-sial-roles', designarPersonaId],
    queryFn: async () => {
      const res = await apiClient.get<{
        data: {
          idSialRol: string
          codigoCargo: string | null
          literalPuesto: string | null
          hospitalSigla: string
        }[]
      }>(`/api/v1/personas/${designarPersonaId}/sial-roles`)
      return res.data.data
    },
    enabled: !!designarPersonaId,
  })
  const formRef = useRef<HTMLDivElement>(null)
  const tipoGestionRef = useRef<HTMLSelectElement>(null)
  // Valores originales para detectar cambios en etapa baja
  const originalesRef = {
    sigla: '',
    escalafonId: '',
    puesto: '',
    especialidad: '',
  }
  const [originales, setOriginales] = useState(originalesRef)
  const { data: especialidadesDisponibles = [] } = useEspecialidadesPuesto(
    escalafonId || undefined,
    puestoConcurso || undefined,
  )
  // Universo más amplio (todos los puestos del escalafón, no solo el del
  // concurso) — un puesto puntual suele tener 1 sola especialidad cargada,
  // insuficiente para ofrecer especialidades adicionales al sortear jurado.
  const { data: especialidadesEscalafon = [] } = useEspecialidadesPuesto(escalafonId || undefined)

  // Cuando llegan los puestos disponibles, normalizar puestoConcurso contra la BD
  // (los cargos legacy tienen MEDICO DE PLANTA, la BD tiene Medico de Planta)
  useEffect(() => {
    if (puestosDisponibles.length === 0 || !puestoConcurso) return
    if (puestosDisponibles.includes(puestoConcurso)) return
    const normalize = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
    const match = puestosDisponibles.find((p) => normalize(p) === normalize(puestoConcurso))
    if (match) {
      setPuestoConcurso(match)
      setOriginales((prev) => ({ ...prev, puesto: match }))
    }
  }, [puestosDisponibles])

  // Cuando llegan las especialidades, normalizar especialidadConcurso contra la BD
  // (ej: 'UROLOGIA' → 'Urologia', 'Ortopedia y Traumatología' vs sin tilde)
  useEffect(() => {
    if (especialidadesDisponibles.length === 0 || !especialidadConcurso) return
    if (especialidadesDisponibles.includes(especialidadConcurso)) return
    const normalize = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
    const match = especialidadesDisponibles.find(
      (e) => normalize(e) === normalize(especialidadConcurso),
    )
    if (match) {
      setEspecialidadConcurso(match)
      setOriginales((prev) => ({ ...prev, especialidad: match }))
    }
  }, [especialidadesDisponibles])

  useEffect(() => {
    if (!cphData) return
    type CargoCph = {
      hospital?: { sigla?: string }
      codigoRegistro?: { id?: string; literal?: string }
      escalafonId?: string
      literalPuesto?: string
      especialidad?: string
      especialidadLegacy?: string
    }
    const cargo = (cphData.concurso as unknown as { cargo?: CargoCph })?.cargo
    setSiglaConcurso(cargo?.hospital?.sigla ?? '')
    // El cargo ya trae escalafonId propio (FK real) — se usa directo. Antes
    // esto se re-derivaba SOLO a través de cargo.codigoRegistro, que puede
    // ser null (cargos sin codigoRegistroId vinculado, ej. altas más viejas o
    // datos legacy) y dejaba escalafonId vacío en silencio, rompiendo los
    // combos de puesto/especialidad de todo el wizard. Se deja el fallback
    // por codigoRegistro por compatibilidad, pero ya no es la vía principal.
    let resolvedEscalafonId = cargo?.escalafonId ?? ''
    if (!resolvedEscalafonId) {
      const crId = cargo?.codigoRegistro?.id ?? ''
      const crLiteral = cargo?.codigoRegistro?.literal ?? ''
      if (crId && codigosRegistro.length > 0) {
        const cr = codigosRegistro.find((c) => c.id === crId)
        resolvedEscalafonId = cr?.escalafonId ?? ''
      } else if (crLiteral && codigosRegistro.length > 0) {
        const cr = codigosRegistro.find((c) => c.literal === crLiteral)
        resolvedEscalafonId = cr?.escalafonId ?? ''
      }
    }
    setEscalafonId(resolvedEscalafonId)
    setEeConcursoInput(cphData.eeConcurso ?? '')
    setIfAutorizacionInput(cphData.ifAutorizacion ?? '')
    // Normalizar puesto y especialidad contra la BD (los cargos legacy vienen en MAYÚSCULAS)
    // El SearchableSelect ya hace match case-insensitive al cargar, pero los originales
    // deben compararse en el mismo formato que los valores del wizard (BD normalizada).
    const rawPuesto = cargo?.literalPuesto ?? ''
    const rawEspecialidad =
      cphData.especialidadSolicitada ?? cargo?.especialidadLegacy ?? cargo?.especialidad ?? ''
    setPuestoConcurso(rawPuesto)
    setEspecialidadConcurso(rawEspecialidad)
    setOriginales({
      sigla: cargo?.hospital?.sigla ?? '',
      escalafonId: resolvedEscalafonId,
      puesto: rawPuesto,
      especialidad: rawEspecialidad,
    })
  }, [cphData, codigosRegistro])
  // Leer pendienteAutorizacion desde la API (no estado local)
  const pendienteAutorizacion = !!(cphData as unknown as { pendienteAutorizacion?: boolean })
    ?.pendienteAutorizacion
  const aprobadoDirector = !!(cphData as unknown as { aprobadoDirector?: boolean })
    ?.aprobadoDirector
  const tieneCambioSiglaCr =
    !!(
      cphData as unknown as {
        siglaSolicitada?: string | null
        codigoRegistroSolicitadoId?: string | null
      }
    )?.siglaSolicitada ||
    !!(cphData as unknown as { codigoRegistroSolicitadoId?: string | null })
      ?.codigoRegistroSolicitadoId

  const patchMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiClient.patch(`/api/v1/concursos-cph/${id}`, body).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['concurso-cph-wizard', id] })
      // Por si el patch tocó personaDesignadaId (proponer candidato al INSAL).
      queryClient.invalidateQueries({ queryKey: ['concurso-cph-persona-designada', id] })
    },
  })

  // S13-C: aprobar/rechazar via el módulo genérico de autorizaciones — ya no
  // POST /concursos-cph/:id/autorizar (dejaba la Autorizacion huérfana en
  // "pendiente" porque nunca actualizaba esa tabla).
  const autorizarMutation = useMutation({
    mutationFn: ({ aprobado, observaciones }: { aprobado: boolean; observaciones?: string }) => {
      if (!autorizacionPendiente) throw new Error('No hay autorización pendiente para resolver')
      const accion = aprobado ? 'aprobar' : 'rechazar'
      return apiClient
        .post(`/api/v1/autorizaciones/${autorizacionPendiente.id}/${accion}`, {
          observaciones,
        })
        .then((r) => r.data.data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['concurso-cph-wizard', id] })
      queryClient.invalidateQueries({ queryKey: ['autorizaciones'] })
      setModalAutorizacion(false)
      setObsAutorizacion('')
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Error al resolver la autorización'
      toast.error(msg)
    },
  })

  const [etapaActiva, setEtapaActiva] = useState(
    etapasIniciales.find((e) => e.estado === 'activa')?.id ?? 'baja',
  )

  // Al cambiar de etapa, subir el scroll al tope (la etapa nueva empieza arriba,
  // no a mitad de página donde quedó el scroll de la etapa anterior).
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [etapaActiva])

  // Cerrar el menú "Acciones" al hacer click afuera.
  useEffect(() => {
    if (!menuAcciones) return
    const onClick = (e: MouseEvent) => {
      if (menuAccionesRef.current && !menuAccionesRef.current.contains(e.target as Node)) {
        setMenuAcciones(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuAcciones])

  // Etapa 5 — estado de designación / validación contra el padrón.
  const { data: designacionEstado } = useDesignacionEstado(id, etapaActiva === 'designacion')
  const [guardado, setGuardado] = useState(false)
  const [faltantesEtapa2, setFaltantesEtapa2] = useState<string[]>([])
  const [faltantesEtapa3, setFaltantesEtapa3] = useState<string[]>([])
  const [faltantesEtapa4, setFaltantesEtapa4] = useState<string[]>([])
  // Las etapas se derivan siempre de cphData (el wizard hace early return si no
  // hay concurso), por eso se usa directamente el useMemo.
  const etapasActuales = etapasIniciales

  const etapa = etapasActuales.find((e) => e.id === etapaActiva)!

  // Validación de campos requeridos en etapa baja antes de habilitar "Guardar y continuar"
  const etapaBajaCompleta =
    etapaActiva !== 'baja' ||
    (!!eeConcursoInput &&
      !!siglaConcurso &&
      !!escalafonId &&
      !!puestoConcurso &&
      (especialidadesDisponibles.length === 0 || !!especialidadConcurso))

  // Índice del marcador "en curso" (amarillo) en el panel de sub-estados.
  // Regla: VERDE = lo ya completado, AMARILLO = el primer paso pendiente.
  // El subEstado del backend representa el ÚLTIMO paso completado, así que el
  // marcador amarillo se ubica en el SIGUIENTE (idx + 1). Los índices menores
  // quedan verdes (isPast usa idx < currentIdx). Excepciones:
  //  - VACANTE (idx 0): aún no se completó nada → el actual es Vacante mismo.
  //  - Último sub-estado (O-ALTA SIAL): el proceso terminó → no hay "siguiente".
  //  - Q-DESIERTO no está en la lista lineal → se deja tal cual.
  const currentIdxDinamico = (() => {
    const sub = concurso?.subEstado ?? 'VACANTE'
    const idx = SUB_ESTADOS.findIndex((s) => s.key === sub)
    if (idx < 0) return 0 // sub-estado fuera de la lista (ej. Q-DESIERTO)
    if (idx === 0) return 0 // Vacante: nada completado todavía
    if (idx >= SUB_ESTADOS.length - 1) return idx // último: proceso completo
    return idx + 1 // amarillo = primer pendiente
  })()

  if (isLoading) return <div className="p-8 text-sm text-gray-400">Cargando concurso...</div>
  if (!concurso) return <div className="p-8 text-sm text-danger">No se encontró el concurso.</div>
  const c = concurso!

  function handleGuardar() {
    if (etapaActiva === 'baja') {
      const labelEsc = (eId: string) => escalafones.find((e) => e.id === eId)?.nombre ?? eId
      const cambiosConAutorizacion: { campo: string; de: string; a: string }[] = []
      // Sigla y escalafón: autorización doble (director → sgrasv)
      if (siglaConcurso !== originales.sigla)
        cambiosConAutorizacion.push({
          campo: 'Sigla',
          de: originales.sigla,
          a: siglaConcurso,
        })
      if (escalafonId !== originales.escalafonId)
        cambiosConAutorizacion.push({
          campo: 'Escalafón',
          de: escalafonLabel(labelEsc(originales.escalafonId)),
          a: escalafonLabel(labelEsc(escalafonId)),
        })
      // Especialidad y puesto: autorización simple (solo sgrasv)
      const eeConcursoActual = cphData?.eeConcurso
      if (especialidadConcurso !== originales.especialidad)
        cambiosConAutorizacion.push({
          campo: 'Especialidad',
          de: originales.especialidad,
          a: especialidadConcurso,
        })
      if (puestoConcurso !== originales.puesto)
        cambiosConAutorizacion.push({
          campo: 'Puesto',
          de: originales.puesto,
          a: puestoConcurso,
        })
      // eeConcurso: solo si ya tenía valor previo (modificación, no carga inicial)
      if (eeConcursoActual && eeConcursoInput && eeConcursoInput !== eeConcursoActual) {
        cambiosConAutorizacion.push({
          campo: 'Expediente de Concurso',
          de: eeConcursoActual,
          a: eeConcursoInput,
        })
      }
      if (cambiosConAutorizacion.length > 0) {
        setModalCambios(cambiosConAutorizacion)
        return
      }
    }
    // Leer todos los campos del formulario activo y enviar al backend
    const body: Record<string, unknown> = {}
    if (formRef.current) {
      formRef.current
        .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          'input[data-key]:not([readonly]):not([disabled]), select[data-key]:not([disabled]), textarea[data-key]:not([disabled])',
        )
        .forEach((el) => {
          const key = el.dataset.key!
          if (el instanceof HTMLInputElement && el.type === 'checkbox') {
            body[key] = el.checked
          } else {
            body[key] = el.value || null
          }
        })
    }
    // Incluir valores de SearchableSelect (no tienen data-key, viven en estado React)
    if (etapaActiva === 'baja') {
      if (especialidadConcurso !== originales.especialidad)
        body.especialidadSolicitada = especialidadConcurso || null
      if (puestoConcurso !== originales.puesto) body.puestoSolicitado = puestoConcurso || null
    }
    if (Object.keys(body).length > 0) patchMutation.mutate(body)

    // Etapa 2: validar que estén TODOS los requisitos antes de avanzar a la 3.
    // Se guardan igual los campos (arriba), pero no se avanza si falta algo.
    if (etapaActiva === 'autorizacion') {
      const fechaAutz =
        (body.fechaAutorizacion as string | null | undefined) ?? cphData?.fechaAutorizacion
      const dispo = (body.disposicion as string | null | undefined) ?? cphData?.disposicion
      const tipoGest = (body.tipoGestion as string | null | undefined) ?? cphData?.tipoGestion
      const faltan: string[] = []
      if (!juradoData?.confirmado) faltan.push('Confirmar el sorteo de jurado')
      if (!fechaAutz) faltan.push('Fecha de autorización')
      if (!dispo) faltan.push('Disposición de llamado')
      if (!tipoGest) faltan.push('Tipo de gestión')
      if (faltan.length > 0) {
        setFaltantesEtapa2(faltan)
        setGuardado(true)
        setTimeout(() => setGuardado(false), 2500)
        return
      }
      setFaltantesEtapa2([])
    }

    // Etapa 3: para avanzar a la 4, el orden de mérito debe estar confirmado
    // (lo que implica examen + presentados confirmados + posiciones completas).
    if (etapaActiva === 'inscripcion') {
      const faltan: string[] = []
      if (!cphData?.fechaExamen) faltan.push('Fecha de examen')
      if (!cphData?.presentadosConfirmados) faltan.push('Confirmar presentados')
      if (!cphData?.ordenMeritoConfirmado) faltan.push('Confirmar orden de mérito')
      if (faltan.length > 0) {
        setFaltantesEtapa3(faltan)
        setGuardado(true)
        setTimeout(() => setGuardado(false), 2500)
        return
      }
      setFaltantesEtapa3([])
    }

    // Etapa 4: para avanzar a la 5, IFACS/INSAL cargados y el cargo tiene
    // que haber sido ACEPTADO por la persona propuesta (si no aceptó, hay
    // que elegir a otra desde el orden de mérito antes de poder continuar).
    if (etapaActiva === 'ifacs_insal') {
      const faltan: string[] = []
      if (!cphData?.fechaIfacs) faltan.push('Fecha IFACS')
      if (!cphData?.fechaInsal) faltan.push('Fecha INSAL')
      if (cphData?.insalAceptado !== true) faltan.push('Confirmar que aceptó el cargo (INSAL)')
      if (faltan.length > 0) {
        setFaltantesEtapa4(faltan)
        setGuardado(true)
        setTimeout(() => setGuardado(false), 2500)
        return
      }
      setFaltantesEtapa4([])
    }

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

  return (
    // Contenedor que ocupa todo el alto disponible dentro del <main> scrolleable
    <div className="flex flex-col min-h-full">
      {ConfirmUI}
      {ToastUI}
      {/* ── MODAL AGREGAR INSCRIPTO ─────────────────────────────────────────── */}
      {modalInscripto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-primary font-bold text-gray-900">Agregar inscripto</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Apellido y nombre son obligatorios. El resto es opcional.
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Apellido <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="input h-10 w-full"
                    value={inscriptoForm.apellido}
                    onChange={(e) => setInscriptoForm((f) => ({ ...f, apellido: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Nombre <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="input h-10 w-full"
                    value={inscriptoForm.nombre}
                    onChange={(e) => setInscriptoForm((f) => ({ ...f, nombre: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">DNI</label>
                  <input
                    type="text"
                    className="input h-10 w-full"
                    value={inscriptoForm.dni ?? ''}
                    onChange={(e) => setInscriptoForm((f) => ({ ...f, dni: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">CUIL</label>
                  <input
                    type="text"
                    className="input h-10 w-full"
                    value={inscriptoForm.cuil ?? ''}
                    onChange={(e) => setInscriptoForm((f) => ({ ...f, cuil: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    className="input h-10 w-full"
                    value={inscriptoForm.email ?? ''}
                    onChange={(e) => setInscriptoForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                className="btn-outline"
                onClick={() => setModalInscripto(false)}
                disabled={crearInscriptoMutation.isPending}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                disabled={
                  !inscriptoForm.apellido.trim() ||
                  !inscriptoForm.nombre.trim() ||
                  crearInscriptoMutation.isPending
                }
                onClick={async () => {
                  try {
                    await crearInscriptoMutation.mutateAsync({
                      apellido: inscriptoForm.apellido.trim(),
                      nombre: inscriptoForm.nombre.trim(),
                      dni: inscriptoForm.dni?.trim() || undefined,
                      cuil: inscriptoForm.cuil?.trim() || undefined,
                      email: inscriptoForm.email?.trim() || undefined,
                    })
                    setModalInscripto(false)
                    toast.success('Inscripto agregado.')
                  } catch {
                    toast.error('No se pudo agregar el inscripto.')
                  }
                }}
              >
                {crearInscriptoMutation.isPending ? 'Guardando…' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CRITERIOS DEL SORTEO ──────────────────────────────────────── */}
      {modalGenerarSorteo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-auto overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
              <span className="text-indigo-500 text-xl">⚙</span>
              <div>
                <h3 className="font-primary font-bold text-gray-900">
                  Criterios del sorteo de jurado
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Configurá cómo se compone y sortea el jurado.
                </p>
              </div>
            </div>

            <div className="overflow-y-auto grid grid-cols-1 md:grid-cols-2">
              {/* ── Columna izquierda: qué se va a sortear + reglas (info) ── */}
              <div className="px-6 py-5 bg-gray-50 md:border-r border-gray-100 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Se va a sortear</p>
                  <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-1.5 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-500">Cargo</span>
                      <span className="font-medium text-gray-800">
                        {cphData?.concurso?.cargo?.codigo ?? '-'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-500">Hospital</span>
                      <span className="font-medium text-gray-800 text-right">
                        {cphData?.concurso?.cargo?.hospital
                          ? `${cphData.concurso.cargo.hospital.sigla} — ${cphData.concurso.cargo.hospital.nombre}`
                          : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-500">Puesto</span>
                      <span className="font-medium text-gray-800 text-right">
                        {cphData?.concurso?.cargo?.literalPuesto ?? '-'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-500">Especialidad</span>
                      <span className="font-medium text-gray-800 text-right">
                        {especialidadParaJurado ?? '-'}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className="text-xs font-semibold text-gray-500">
                      Reglas de elegibilidad {esCentralizado ? '' : '(en orden de prioridad)'}
                    </p>
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        esCentralizado
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-indigo-100 text-indigo-700'
                      }`}
                    >
                      {esCentralizado
                        ? 'Concurso centralizado'
                        : `Cargo ${modalidadCargoJurado === 'pou' ? 'de guardia (POU)' : 'de planta (POF)'}`}
                    </span>
                  </div>
                  {(() => {
                    const especNombre =
                      [especialidadParaJurado, ...sorteoCriterios.especialidadesAdicionales]
                        .filter(Boolean)
                        .join(', ') || 'sin especialidad definida'

                    if (esCentralizado) {
                      return (
                        <ul className="text-xs text-gray-600 space-y-1.5 list-disc pl-4">
                          <li>
                            <strong>Regla única</strong> — cargo de conducción (Jefe de Sección o
                            superior) + especialidad (<strong>{especNombre}</strong>), en{' '}
                            <strong>cualquier hospital de toda la base</strong> (no prioriza el
                            hospital del cargo a concursar).
                          </li>
                        </ul>
                      )
                    }
                    return modalidadCargoJurado === 'pof' ? (
                      <ul className="text-xs text-gray-600 space-y-1.5 list-disc pl-4">
                        <li>
                          <strong>Regla 1</strong> — mismo hospital del cargo a concursar + cargo
                          de conducción (Jefe de Sección o superior) + especialidad (
                          <strong>{especNombre}</strong>).
                        </li>
                        <li>
                          <strong>Regla 2</strong> — mismo hospital + antigüedad mínima de{' '}
                          <strong>{sorteoCriterios.antiguedadMinimaAnios} años</strong> (la
                          especialidad no es obligatoria acá).
                        </li>
                        <li>
                          <strong>Regla 3</strong> — se amplía a todo el sistema de salud
                          (cualquier hospital) + cargo de conducción + misma especialidad.
                        </li>
                      </ul>
                    ) : (
                      <ul className="text-xs text-gray-600 space-y-1.5 list-disc pl-4">
                        <li>
                          <strong>Regla 1</strong> — mismo hospital + Jefe de guardia (POU) +
                          especialidad (<strong>{especNombre}</strong>).
                        </li>
                        <li>
                          <strong>Regla 2</strong> — mismo hospital + Jefe de planta (POF) + misma
                          especialidad.
                        </li>
                        <li>
                          <strong>Regla 3</strong> — mismo hospital + antigüedad mínima de{' '}
                          <strong>{sorteoCriterios.antiguedadMinimaAnios} años</strong> + misma
                          especialidad.
                        </li>
                        <li>
                          <strong>Regla 4</strong> — se amplía a todo el sistema de salud
                          (cualquier hospital) + antigüedad mínima de{' '}
                          <strong>{sorteoCriterios.antiguedadMinimaAnios} años</strong> + misma
                          especialidad.
                        </li>
                      </ul>
                    )
                  })()}
                  <p className="text-xs text-gray-500 mt-2">
                    En todos los casos se exige la misma profesión (escalafón) que el cargo a
                    concursar y ocupación activa. Director y Subdirector quedan excluidos de
                    cualquier jurado.{' '}
                    {esCentralizado ? (
                      <>
                        Al ser centralizado, no hay cascada de reglas ni prioridad de hospital: el
                        pool de candidatos es directamente toda la base de datos.
                      </>
                    ) : (
                      <>
                        Se busca primero por la Regla 1 (especialidad obligatoria salvo Regla 2 de
                        un cargo de planta); si no alcanzan candidatos para completar{' '}
                        <strong>
                          {sorteoCriterios.cantTitulares} titular
                          {sorteoCriterios.cantTitulares === 1 ? '' : 'es'} y{' '}
                          {sorteoCriterios.cantSuplentes} suplente
                          {sorteoCriterios.cantSuplentes === 1 ? '' : 's'}
                        </strong>
                        , se baja a la siguiente regla.
                      </>
                    )}{' '}
                    El sorteo es aleatorio con semilla (auditable) y queda como borrador editable
                    hasta que se confirme.
                  </p>
                </div>

                {juradosCompatibles.length > 0 && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                    <p className="text-sm font-semibold text-gray-700 mb-2">
                      Jurados vigentes compatibles ({juradosCompatibles.length})
                    </p>
                    <p className="text-xs text-gray-500 mb-3">
                      Podés reutilizar un jurado ya confirmado en lugar de sortear uno nuevo.
                    </p>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {juradosCompatibles.map((j) => (
                        <div
                          key={j.id}
                          className="flex items-center justify-between gap-2 rounded border border-gray-200 bg-white px-3 py-2"
                        >
                          <div className="text-xs">
                            <p className="font-medium text-gray-800">
                              {j.concursoCph?.concurso?.cargo?.codigo ?? 'Concurso'} ·{' '}
                              {j.miembros.length} miembros
                            </p>
                            <p className="text-gray-400">
                              Sorteo {j.fechaSorteo.slice(0, 10).split('-').reverse().join('/')} ·
                              vence {j.fechaVencimiento.slice(0, 10).split('-').reverse().join('/')}
                            </p>
                          </div>
                          <button
                            className="btn-outline text-xs py-1 px-2 shrink-0"
                            disabled={reutilizarJuradoMutation.isPending}
                            onClick={async () => {
                              try {
                                await reutilizarJuradoMutation.mutateAsync(j.id)
                                setModalGenerarSorteo(false)
                              } catch {
                                /* el error se muestra en el bloque de la etapa */
                              }
                            }}
                          >
                            Usar este jurado
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Columna derecha: criterios editables ── */}
              <div className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Titulares
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={sorteoCriterios.cantTitulares}
                      onChange={(e) =>
                        setSorteoCriterios((s) => ({
                          ...s,
                          cantTitulares: Number(e.target.value),
                        }))
                      }
                      className="input h-10 w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Suplentes
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={sorteoCriterios.cantSuplentes}
                      onChange={(e) =>
                        setSorteoCriterios((s) => ({
                          ...s,
                          cantSuplentes: Number(e.target.value),
                        }))
                      }
                      className="input h-10 w-full"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Especialidades adicionales (opcional, hasta 2)
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Además de{' '}
                    <strong>{especialidadParaJurado ?? 'la especialidad del concurso'}</strong>,
                    también van a contar como "cumple especialidad" para ampliar el pool de
                    jurados elegibles.
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {[0, 1].map((i) => {
                      const slots = [
                        sorteoCriterios.especialidadesAdicionales[0] ?? '',
                        sorteoCriterios.especialidadesAdicionales[1] ?? '',
                      ]
                      return (
                        <SearchableSelect
                          key={i}
                          value={slots[i] ?? ''}
                          onChange={(v) =>
                            setSorteoCriterios((s) => {
                              const next = [...slots]
                              next[i] = v
                              return {
                                ...s,
                                especialidadesAdicionales: next.filter(Boolean),
                              }
                            })
                          }
                          options={especialidadesEscalafon.filter(
                            (e) => e !== especialidadParaJurado && !slots.includes(e),
                          )}
                          placeholder={`Especialidad extra ${i + 1}...`}
                        />
                      )
                    })}
                  </div>
                  {sorteoCriterios.especialidadesAdicionales.length > 0 && (
                    <div className="mt-3">
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Expediente que respalda las especialidades adicionales
                        <span className="text-danger ml-1">*</span>
                      </label>
                      <input
                        type="text"
                        value={sorteoCriterios.expedienteEspecialidades}
                        onChange={(e) =>
                          setSorteoCriterios((s) => ({
                            ...s,
                            expedienteEspecialidades: e.target.value,
                          }))
                        }
                        className={`input h-10 w-full ${
                          !sorteoCriterios.expedienteEspecialidades.trim()
                            ? 'border-amber-300 focus:border-amber-500'
                            : ''
                        }`}
                        placeholder="Ej: EX-2026-12345678-GCABA-..."
                      />
                      {!sorteoCriterios.expedienteEspecialidades.trim() && (
                        <p className="text-[11px] text-amber-600 mt-1">
                          Obligatorio: indicá el expediente que autoriza ampliar el jurado a estas
                          especialidades adicionales.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Observaciones (opcional)
                  </label>
                  <textarea
                    value={sorteoCriterios.observaciones}
                    onChange={(e) =>
                      setSorteoCriterios((s) => ({
                        ...s,
                        observaciones: e.target.value,
                      }))
                    }
                    rows={3}
                    className="input w-full py-2"
                    placeholder="Notas para el acta del sorteo..."
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 shrink-0">
              <button className="btn-outline" onClick={() => setModalGenerarSorteo(false)}>
                Cerrar
              </button>
              <button
                className="btn-primary"
                disabled={
                  generarSorteoMutation.isPending ||
                  (sorteoCriterios.especialidadesAdicionales.length > 0 &&
                    !sorteoCriterios.expedienteEspecialidades.trim())
                }
                onClick={async () => {
                  try {
                    await generarSorteoMutation.mutateAsync({
                      cantTitulares: sorteoCriterios.cantTitulares,
                      cantSuplentes: sorteoCriterios.cantSuplentes,
                      antiguedadMinimaAnios: sorteoCriterios.antiguedadMinimaAnios,
                      especialidadesAdicionales:
                        sorteoCriterios.especialidadesAdicionales.length > 0
                          ? sorteoCriterios.especialidadesAdicionales
                          : undefined,
                      expedienteEspecialidades:
                        sorteoCriterios.especialidadesAdicionales.length > 0
                          ? sorteoCriterios.expedienteEspecialidades.trim()
                          : undefined,
                      semilla: sorteoCriterios.semilla || undefined,
                      observaciones: sorteoCriterios.observaciones || undefined,
                    })
                    setModalGenerarSorteo(false)
                  } catch {
                    /* el error se muestra en el bloque de la etapa */
                  }
                }}
              >
                {generarSorteoMutation.isPending ? 'Sorteando…' : '✅ Aceptar y sortear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DESIGNAR ──────────────────────────────────────────────────── */}
      {modalDesignar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <span className="text-green-500 text-xl">👤</span>
              <div>
                <h3 className="font-primary font-bold text-gray-900">
                  {modalDesignarModo === 'proponer' ? 'Proponer candidato' : 'Registrar designación'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {modalDesignarModo === 'proponer'
                    ? 'Elegí a quién notificar por INSAL. Esto no ocupa el cargo — la designación oficial es en la Etapa 5.'
                    : 'El cargo quedará ocupado inmediatamente, sin esperar el padrón.'}
                </p>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Elegibles del orden de mérito de este concurso */}
              {elegiblesOM.length === 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  ⚠ Todavía no hay orden de mérito calculado para este concurso — no hay
                  candidatos para proponer. Andá a la Etapa 3 (Inscripción/Examen/OM), cargá las
                  notas de los presentados y apretá «📊 Cargar notas / calcular orden».
                </div>
              )}
              {elegiblesOM.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Orden de mérito — elegí a quién proponer <span className="text-danger">*</span>
                  </label>
                  <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100 max-h-80 overflow-y-auto">
                    {elegiblesOM.map((cand) => {
                      const elegido =
                        modalDesignarModo === 'proponer'
                          ? designarInscriptoId === cand.id
                          : Boolean(
                              designarPersonaId &&
                                designarSearch === cand.apellido + ', ' + cand.nombre,
                            )
                      return (
                        <button
                          key={cand.id}
                          type="button"
                          disabled={resolviendoOMId === cand.id}
                          onClick={() => seleccionarCandidatoOM(cand)}
                          className={`w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-3 ${
                            elegido ? 'bg-green-50' : ''
                          }`}
                        >
                          <span className="shrink-0 w-7 h-7 rounded-full bg-secondary/10 text-secondary text-xs font-bold flex items-center justify-center">
                            {cand.ordenMerito}
                          </span>
                          <span className="flex-1 min-w-0 grid grid-cols-2 gap-x-3 gap-y-0.5">
                            <span className="col-span-2 font-medium text-gray-800 truncate">
                              {cand.apellido}, {cand.nombre}
                            </span>
                            <span className="text-xs text-gray-400 font-mono">
                              CUIL {cand.cuil ?? '—'}
                            </span>
                            <span className="text-xs text-gray-400">DNI {cand.dni ?? '—'}</span>
                            {cand.especialidad && (
                              <span className="col-span-2 text-xs text-gray-500 truncate">
                                🩺 {cand.especialidad}
                              </span>
                            )}
                            {cand.email && (
                              <span className="col-span-2 text-xs text-gray-400 truncate">
                                {cand.email}
                              </span>
                            )}
                          </span>
                          {resolviendoOMId === cand.id && (
                            <span className="text-xs text-gray-400 shrink-0">Buscando...</span>
                          )}
                          {elegido && <span className="text-green-600 shrink-0">✓</span>}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Si el 1º no acepta el cargo, elegí al siguiente.
                  </p>
                </div>
              )}

              {/* Confirmación de la persona elegida (especialidad CPH vs la del concurso) */}
              {/* Modo proponer (Etapa 4): confirmación simple del inscripto
                  reservado, sin datos del padrón (no se resuelve acá). */}
              {modalDesignarModo === 'proponer' && designarInscriptoId && (
                <div className="space-y-1">
                  <p className="text-xs text-green-600">
                    ✓ Candidato reservado: <strong>{designarPersonaNombre}</strong>
                  </p>
                  {designarPersonaEspCph ? (
                    <p className="text-xs text-gray-500">🩺 {designarPersonaEspCph}</p>
                  ) : null}
                </div>
              )}

              {designarPersonaId &&
                (() => {
                  const espConcurso = concurso?.especialidad ?? null
                  const norm = (s: string) =>
                    s
                      .normalize('NFD')
                      .replace(/[\u0300-\u036f]/g, '')
                      .toLowerCase()
                      .trim()
                  const coincide =
                    designarPersonaEspCph && espConcurso
                      ? norm(designarPersonaEspCph) === norm(espConcurso)
                      : null
                  return (
                    <div className="space-y-1">
                      <p className="text-xs text-green-600">
                        ✓ Persona seleccionada: <strong>{designarPersonaNombre}</strong>
                      </p>
                      {designarPersonaEspCph ? (
                        <div
                          className={`rounded px-2.5 py-1.5 text-xs flex items-center gap-1.5 ${
                            coincide === true
                              ? 'bg-green-50 border border-green-200 text-green-700'
                              : 'bg-amber-50 border border-amber-200 text-amber-700'
                          }`}
                        >
                          <span>{coincide === true ? '✓' : '⚠️'}</span>
                          <span>
                            Especialidad CPH: <strong>{designarPersonaEspCph}</strong>
                            {coincide === false && espConcurso && (
                              <>
                                {' '}
                                — el concurso es de <strong>{espConcurso}</strong>
                              </>
                            )}
                          </span>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">Sin especialidad CPH registrada</p>
                      )}
                    </div>
                  )
                })()}

              {/* Selector de ID SIAL Rol — solo aplica a la designación oficial */}
              {designarPersonaId && modalDesignarModo === 'designar' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    ID SIAL Rol
                  </label>
                  {sialRolesData && sialRolesData.length > 0 ? (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setDesignarIdSialRol('')}
                        className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 flex items-center gap-2 ${
                          designarIdSialRol === '' ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${
                            designarIdSialRol === ''
                              ? 'border-blue-500 bg-blue-500'
                              : 'border-gray-300'
                          }`}
                        />
                        <span className="text-gray-500 italic">
                          Sin ID SIAL — pendiente de padrón
                        </span>
                      </button>
                      {sialRolesData.map((r) => (
                        <button
                          key={r.idSialRol}
                          type="button"
                          onClick={() => setDesignarIdSialRol(r.idSialRol)}
                          className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 last:border-0 flex items-center gap-2 ${
                            designarIdSialRol === r.idSialRol ? 'bg-blue-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <span
                            className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${
                              designarIdSialRol === r.idSialRol
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-gray-300'
                            }`}
                          />
                          <span>
                            <span className="font-mono text-gray-700">{r.idSialRol}</span>
                            {r.codigoCargo && (
                              <span className="ml-2 text-xs text-gray-400">{r.codigoCargo}</span>
                            )}
                            {r.literalPuesto && (
                              <span className="ml-1 text-xs text-gray-500">
                                · {r.literalPuesto}
                              </span>
                            )}
                            <span className="ml-1 text-xs text-gray-400">· {r.hospitalSigla}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-500">
                      Esta persona no tiene roles activos en el padrón actual. Se generará un ID
                      provisional que se actualizará automáticamente con el próximo archivo semanal.
                    </div>
                  )}
                </div>
              )}

              {/* Fecha desde — solo aplica a la designación oficial (Etapa 5) */}
              {modalDesignarModo === 'designar' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Fecha de inicio <span className="text-danger">*</span>
                  </label>
                  <input
                    type="date"
                    value={designarFechaDesde}
                    onChange={(e) => setDesignarFechaDesde(e.target.value)}
                    className="input h-10 w-full"
                  />
                </div>
              )}

              {designarMutation.isError && (
                <p className="text-sm text-danger">
                  {(
                    designarMutation.error as {
                      response?: { data?: { message?: string } }
                    }
                  )?.response?.data?.message ?? 'Error al registrar la designación'}
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                className="btn-outline"
                onClick={() => {
                  setModalDesignar(false)
                  setDesignarPersonaId('')
                  setDesignarPersonaNombre('')
                  setDesignarPersonaEspCph(null)
                  setDesignarSearch('')
                  setDesignarFechaDesde('')
                  setDesignarIdSialRol('')
                  setDesignarInscriptoId('')
                }}
              >
                Cancelar
              </button>
              {modalDesignarModo === 'proponer' ? (
                <button
                  className="btn-primary"
                  disabled={!designarInscriptoId || patchMutation.isPending}
                  onClick={() =>
                    // Etapa 4: reservar al inscripto del orden de mérito para el
                    // INSAL. NO se ocupa el cargo ni se resuelve contra el padrón
                    // (eso es Etapa 5). Solo se guarda el inscriptoReservadoId.
                    patchMutation.mutate(
                      { inscriptoReservadoId: designarInscriptoId, insalAceptado: null },
                      {
                        onSuccess: () => {
                          toast.success('Candidato reservado — esperá su respuesta al INSAL.')
                          setModalDesignar(false)
                          // designarInscriptoId se mantiene: hace falta para poder marcar
                          // en insalRechazados si esta persona no acepta el cargo.
                          setDesignarPersonaId('')
                          setDesignarPersonaNombre('')
                          setDesignarPersonaEspCph(null)
                          setDesignarSearch('')
                          setDesignarIdSialRol('')
                        },
                        onError: () => toast.error('No se pudo reservar al candidato.'),
                      },
                    )
                  }
                >
                  {patchMutation.isPending ? 'Guardando...' : 'Proponer candidato'}
                </button>
              ) : (
                <button
                  className="btn-primary"
                  disabled={!designarPersonaId || !designarFechaDesde || designarMutation.isPending}
                  onClick={() => {
                    designarMutation.mutate(
                      {
                        personaId: designarPersonaId,
                        fechaDesde: designarFechaDesde,
                        idSialRol: designarIdSialRol || undefined,
                      },
                      {
                        onSuccess: () => {
                          setModalDesignar(false)
                          setDesignarPersonaId('')
                          setDesignarPersonaNombre('')
                          setDesignarPersonaEspCph(null)
                          setDesignarSearch('')
                          setDesignarFechaDesde('')
                          setDesignarIdSialRol('')
                          setDesignarInscriptoId('')
                        },
                      },
                    )
                  }}
                >
                  {designarMutation.isPending ? 'Guardando...' : 'Confirmar designación'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DECLARAR DESIERTO ─────────────────────────────────────────────── */}
      {modalDesierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-primary font-bold text-gray-900">Declarar desierto</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Se guardará un snapshot de la ronda y se limpiarán los campos para el relanzamiento.
              </p>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Disposición de desierto <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={desiertoDisp}
                  onChange={(e) => setDesiertoDisp(e.target.value)}
                  placeholder="Ej: DISP-123/MSGC/26"
                  className="input w-full"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Fecha de disposición <span className="text-danger">*</span>
                </label>
                <input
                  type="date"
                  value={desiertoFecha}
                  onChange={(e) => setDesiertoFecha(e.target.value)}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Observaciones
                </label>
                <textarea
                  value={desiertoObs}
                  onChange={(e) => setDesiertoObs(e.target.value)}
                  rows={2}
                  className="input w-full py-2"
                  placeholder="Motivo del desierto..."
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                className="btn-outline"
                onClick={() => {
                  setModalDesierto(false)
                  setDesiertoDisp('')
                  setDesiertoFecha('')
                  setDesiertoObs('')
                }}
                disabled={declararDesiertoMutation.isPending}
              >
                Cancelar
              </button>
              <button
                className="btn-danger"
                disabled={
                  !desiertoDisp.trim() || !desiertoFecha || declararDesiertoMutation.isPending
                }
                onClick={async () => {
                  await declararDesiertoMutation.mutateAsync({
                    dispoDesierta: desiertoDisp.trim(),
                    fechaDispoDesierta: desiertoFecha,
                    observaciones: desiertoObs || undefined,
                  })
                  setModalDesierto(false)
                  setDesiertoDisp('')
                  setDesiertoFecha('')
                  setDesiertoObs('')
                  // Relanzamiento: el concurso vuelve a la Etapa 1 (Baja / Apertura).
                  setEtapaActiva('baja')
                }}
              >
                {declararDesiertoMutation.isPending ? 'Guardando...' : 'Confirmar desierto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CAMBIO DE ESPECIALIDAD ─────────────────────────────────────────── */}
      {modalCambioEspecialidad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-primary font-bold text-gray-900">Cambio de especialidad</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                El concurso vuelve a autorización (Etapa 1) con la nueva especialidad. Cualquier
                sorteo de jurado o avance posterior quedará basado en una especialidad distinta a
                la nueva y debe revisarse.
              </p>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Expediente que respalda el cambio <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={cambioEspExpediente}
                  onChange={(e) => setCambioEspExpediente(e.target.value)}
                  placeholder="Ej: EX-2026-12345678-GCABA-..."
                  className="input w-full"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Nueva especialidad <span className="text-danger">*</span>
                </label>
                {especialidadesDisponibles.length > 0 ? (
                  <SearchableSelect
                    value={cambioEspNueva}
                    onChange={setCambioEspNueva}
                    options={especialidadesDisponibles}
                    placeholder="Buscar especialidad..."
                  />
                ) : (
                  <input
                    type="text"
                    value={cambioEspNueva}
                    onChange={(e) => setCambioEspNueva(e.target.value)}
                    placeholder="Nombre de la especialidad"
                    className="input w-full"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Observaciones (opcional)
                </label>
                <textarea
                  value={cambioEspObs}
                  onChange={(e) => setCambioEspObs(e.target.value)}
                  rows={2}
                  className="input w-full py-2"
                  placeholder="Motivo del cambio de especialidad..."
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                className="btn-outline"
                onClick={() => {
                  setModalCambioEspecialidad(false)
                  setCambioEspExpediente('')
                  setCambioEspNueva('')
                  setCambioEspObs('')
                }}
                disabled={patchMutation.isPending}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                disabled={
                  !cambioEspExpediente.trim() || !cambioEspNueva.trim() || patchMutation.isPending
                }
                onClick={async () => {
                  try {
                    await patchMutation.mutateAsync({
                      especialidadSolicitada: cambioEspNueva.trim(),
                      cambioEspecialidad: true,
                      motivoCambioEspecialidad: [
                        `Expediente ${cambioEspExpediente.trim()}`,
                        cambioEspObs.trim() || null,
                      ]
                        .filter(Boolean)
                        .join(' — '),
                    })
                    toast.success(
                      'Especialidad cambiada. El concurso vuelve a autorización (Etapa 1).',
                    )
                    setModalCambioEspecialidad(false)
                    setCambioEspExpediente('')
                    setCambioEspNueva('')
                    setCambioEspObs('')
                    // El concurso vuelve a Etapa 1 (pendienteAutorizacion=true la
                    // marca "activa" de nuevo — ver etapasIniciales).
                    setEtapaActiva('baja')
                  } catch {
                    toast.error('No se pudo registrar el cambio de especialidad.')
                  }
                }}
              >
                {patchMutation.isPending ? 'Guardando...' : 'Confirmar cambio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL AUTORIZAR (sgrasv) ─────────────────────────────────────────────── */}
      {modalAutorizacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <span className="text-blue-500 text-xl">🔐</span>
              <div>
                <h3 className="font-primary font-bold text-gray-900">Resolver autorización</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Podés aprobar o rechazar la modificación solicitada.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 space-y-3">
              <label className="block text-sm font-semibold text-gray-700">
                Observaciones (opcional)
              </label>
              <textarea
                value={obsAutorizacion}
                onChange={(e) => setObsAutorizacion(e.target.value)}
                rows={2}
                className="input w-full py-2"
                placeholder="Motivo de aprobación o rechazo..."
              />
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button className="btn-outline" onClick={() => setModalAutorizacion(false)}>
                Cancelar
              </button>
              <button
                className="btn-danger"
                disabled={autorizarMutation.isPending}
                onClick={() =>
                  autorizarMutation.mutate({
                    aprobado: false,
                    observaciones: obsAutorizacion || undefined,
                  })
                }
              >
                Rechazar
              </button>
              <button
                className="btn-primary"
                disabled={autorizarMutation.isPending}
                onClick={() =>
                  autorizarMutation.mutate({
                    aprobado: true,
                    observaciones: obsAutorizacion || undefined,
                  })
                }
              >
                Aprobar
              </button>
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
                <p className="text-xs text-gray-500 mt-0.5">
                  {modalCambios?.some((c) => c.campo === 'Sigla' || c.campo === 'Escalafón')
                    ? 'Requiere autorización del Director y luego de SGRASV.'
                    : 'Requiere autorización de SGRASV.'}
                </p>
              </div>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">
                Se modificarán los siguientes campos:
              </p>
              <div className="space-y-2">
                {modalCambios.map((c) => (
                  <div
                    key={c.campo}
                    className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5"
                  >
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      {c.campo}
                    </p>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-red-500 line-through">
                        {c.de || <em className="not-italic text-gray-400">vacío</em>}
                      </span>
                      <span className="text-gray-400">→</span>
                      <span className="text-green-700 font-medium">
                        {c.a || <em className="not-italic text-gray-400">vacío</em>}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button className="btn-outline" onClick={() => setModalCambios(null)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={confirmarCambios}>
                Confirmar y enviar a autorización
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL VER BAJA ──────────────────────────────────────────────────── */}
      {modalBaja &&
        cphData &&
        (() => {
          type BajaExt = {
            motivo?: string | null
            docRespaldatoria?: string | null
            tipificadorOrigen?: string | null
            partidaPresupuestaria?: string | null
            cargaHoraria?: number | null
            fechaPaseParalelo?: string | Date | null
            observaciones?: string | null
            fechaBaja?: string | Date | null
            eeBaja?: string | null
            tipoBaja?: string | null
          }
          type CargoExt = {
            codigo?: string
            literalPuesto?: string
            especialidad?: string
            especialidadLegacy?: string
            hospital?: { sigla?: string; nombre?: string }
            escalafon?: { nombre?: string }
            codigoRegistro?: { codigo?: string; literal?: string }
            unificadorPuesto?: string
            idSial?: string | null
            cargoSial?: string | null
          }
          type PersonaExt = {
            apellidoNombre?: string
            cuil?: string
            legajo?: string | null
          }
          const b = (cphData?.concurso as unknown as { baja?: BajaExt })?.baja
          const cargo = (cphData.concurso as unknown as { cargo?: CargoExt })?.cargo
          const persona = (cphData.concurso as unknown as { persona?: PersonaExt })?.persona
          const toDate = (val: string | Date | null | undefined) =>
            val
              ? typeof val === 'string'
                ? val.slice(0, 10).split('-').reverse().join('/')
                : (val as Date).toISOString().slice(0, 10).split('-').reverse().join('/')
              : ''
          const Row = ({ label, value }: { label: string; value: string }) =>
            value ? (
              <div className="flex gap-2 text-sm">
                <span className="text-gray-500 w-44 shrink-0">{label}:</span>
                <span className="text-gray-800 font-medium">{value}</span>
              </div>
            ) : null
          // ID SIAL del agente: puede estar en persona.legajo o cargo.idSial/cargoSial
          const idSialAgente = persona?.legajo ?? cargo?.idSial ?? cargo?.cargoSial ?? ''
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
                <div className="bg-navy px-6 py-4 rounded-t-xl flex items-start justify-between gap-4">
                  <div>
                    <p className="text-white/60 text-xs uppercase tracking-wider mb-0.5">
                      Datos de la baja
                    </p>
                    <p className="text-white font-bold font-mono">{cargo?.codigo ?? '—'}</p>
                  </div>
                  <button
                    onClick={() => setModalBaja(false)}
                    className="text-white/60 hover:text-white text-2xl leading-none mt-0.5"
                  >
                    ×
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 p-6 space-y-4">
                  {/* Cargo */}
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                      Cargo
                    </p>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      <Row label="Código" value={cargo?.codigo ?? ''} />
                      <Row
                        label="Hospital"
                        value={
                          cargo?.hospital
                            ? `${cargo.hospital.sigla} — ${cargo.hospital.nombre}`
                            : ''
                        }
                      />
                      <Row label="Puesto" value={cargo?.literalPuesto ?? ''} />
                      <Row
                        label="Especialidad"
                        value={cargo?.especialidadLegacy ?? cargo?.especialidad ?? ''}
                      />
                      <Row label="Escalafón" value={cargo?.escalafon?.nombre ?? ''} />
                      <Row
                        label="Código de registro"
                        value={
                          cargo?.codigoRegistro?.codigo
                            ? `${cargo.codigoRegistro.codigo} — ${cargo.codigoRegistro.literal ?? ''}`
                            : (cargo?.codigoRegistro?.literal ?? '')
                        }
                      />
                      <Row label="Tipo de puesto" value={cargo?.unificadorPuesto ?? ''} />
                    </div>
                  </div>
                  {/* Agente */}
                  {persona && (
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                        Agente
                      </p>
                      <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                        <Row label="Apellido y Nombre" value={persona.apellidoNombre ?? ''} />
                        <Row label="CUIL" value={persona.cuil ?? ''} />
                        <Row label="ID SIAL" value={idSialAgente} />
                      </div>
                    </div>
                  )}
                  {/* Datos de la baja */}
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                      Datos de la baja
                    </p>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      <Row label="Fecha de baja" value={toDate(b?.fechaBaja)} />
                      <Row label="Expediente de baja" value={b?.eeBaja ?? ''} />
                      <Row label="Tipo de baja" value={b?.tipoBaja ?? ''} />
                      <Row label="Origen" value={b?.tipificadorOrigen ?? ''} />
                      <Row label="Motivo" value={b?.motivo ?? ''} />
                      <Row label="Doc. respaldatoria" value={b?.docRespaldatoria ?? ''} />
                      <Row label="Partida presupuestaria" value={b?.partidaPresupuestaria ?? ''} />
                      <Row
                        label="Carga horaria"
                        value={b?.cargaHoraria != null ? `${b.cargaHoraria} hs` : ''}
                      />
                      <Row label="Fecha pase paralelo" value={toDate(b?.fechaPaseParalelo)} />
                      <Row label="Observaciones" value={b?.observaciones ?? ''} />
                    </div>
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
                  <button onClick={() => setModalBaja(false)} className="btn-outline">
                    Cerrar
                  </button>
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
          <span className="text-gray-300">/</span>
          <Link to="/concursos/cph" className="text-secondary hover:underline">
            Concursos CPH
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-400">{c.cargo}</span>
        </div>

        {/* Datos principales */}
        <div className="px-6 py-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-primary text-lg font-bold text-gray-900 leading-tight">
              {c.cargo} — {c.puesto}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {c.hospitalNombre} · {c.especialidad} · {c.escalafon}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Baja:{' '}
              {c.personaBaja !== '—' && (
                <>
                  <span className="text-gray-600 font-medium">{c.personaBaja}</span>{' '}
                </>
              )}
              {c.eeBaja && <>{c.eeBaja} </>}
              {c.fechaBaja && c.fechaBaja}
            </p>
          </div>

          {/* Badges de estado + menú de acciones */}
          {cphData && (
            <div className="flex flex-wrap items-center gap-2 self-start">
              <span className="badge-info text-xs">
                {SUB_ESTADOS.find((s) => s.key === c.subEstado)?.label ?? c.subEstado}
              </span>
              <span className="badge-default text-xs">{c.subEstado3}</span>
              {c.suspendido && <span className="badge-danger text-xs">Suspendido</span>}

              {/* Menú "Acciones" */}
              <div className="relative" ref={menuAccionesRef}>
                <button
                  onClick={() => setMenuAcciones((v) => !v)}
                  className="btn-outline text-xs py-1 px-3"
                >
                  ⚙ Acciones ▾
                </button>
                {menuAcciones && (
                  <div className="absolute right-0 z-50 mt-1 w-60 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                    {/* Etiquetas */}
                    {id && (
                      <div className="border-b border-gray-100 px-1 pb-2">
                        <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                          Etiquetas
                        </p>
                        <EtiquetasControl concursoCphId={id} asignadas={cphData.etiquetas ?? []} />
                      </div>
                    )}
                    {/* Ver baja */}
                    <button
                      onClick={() => {
                        setModalBaja(true)
                        setMenuAcciones(false)
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      📋 Ver baja
                    </button>
                    {/* Suspender / Activar */}
                    <button
                      disabled={suspenderMutation.isPending}
                      onClick={async () => {
                        setMenuAcciones(false)
                        const activar = !!cphData.suspendido
                        const ok = await confirm({
                          titulo: activar ? 'Activar concurso' : 'Suspender concurso',
                          mensaje: activar
                            ? 'El concurso volverá a estar activo. ¿Continuar?'
                            : 'El concurso quedará suspendido y saldrá de los listados operativos. ¿Continuar?',
                          peligro: !activar,
                        })
                        if (!ok) return
                        suspenderMutation.mutate(
                          { suspendido: !activar },
                          {
                            onSuccess: () => {
                              queryClient.invalidateQueries({
                                queryKey: ['concurso-cph-wizard', id],
                              })
                              toast.success(activar ? 'Concurso activado.' : 'Concurso suspendido.')
                            },
                            onError: (e) =>
                              toast.error(
                                (e as { response?: { data?: { error?: { message?: string } } } })
                                  ?.response?.data?.error?.message ??
                                  'No se pudo cambiar el estado.',
                              ),
                          },
                        )
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {cphData.suspendido ? '▶ Activar' : '⏸ Suspender'}
                    </button>
                    {/* Cambio de especialidad */}
                    {cphData.estado !== 'finalizado' && (
                      <button
                        onClick={() => {
                          setModalCambioEspecialidad(true)
                          setMenuAcciones(false)
                        }}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        🔁 Cambio de especialidad
                      </button>
                    )}
                    {/* Declarar desierto */}
                    {cphData.estado !== 'finalizado' && (
                      <button
                        onClick={() => {
                          setModalDesierto(true)
                          setMenuAcciones(false)
                        }}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-danger hover:bg-red-50"
                      >
                        🚫 Declarar desierto
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Observaciones en el header */}
        {c.observaciones && (
          <div className="mx-6 mb-3 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 text-xs text-amber-800">
            📝 {c.observaciones}
          </div>
        )}

        {/* Banner campos faltantes */}
        {cphData &&
          (() => {
            const sub = cphData.subEstado ?? ''
            const SUB_IDX: Record<string, number> = {
              'A-CARATULADO': 1,
              'A-AUTZN': 2,
              'B-SORTEO JUR': 3,
              'C-DISPO DE LLAMADO': 4,
              'C2-INSCRIPCION EX': 5,
              'D-EXAMEN PUBLICADO': 6,
              'E-ORDEN DE MERITO': 7,
              'F-IFACS': 8,
              'G-INSAL': 9,
              'H-TAD': 10,
              'I-CARGA DOCU': 11,
              'J-APTO MED': 12,
              'K-ITE': 13,
              'L-PYCTO DE RESO': 14,
              'M-RESO A LA FIRMA': 15,
              'N-DESIGNADO': 16,
              'O-ALTA SIAL': 17,
            }
            const idx = SUB_IDX[sub] ?? 0
            const faltantes: string[] = []
            if (idx >= 2 && !cphData.fechaAutorizacion) faltantes.push('Fecha de autorización')
            if (idx >= 3 && !cphData.sorteoJurado) faltantes.push('Sorteo de jurado')
            if (idx >= 4 && !cphData.disposicion) faltantes.push('Disposición de llamado')
            if (idx >= 5 && !cphData.fechaInscDesde) faltantes.push('Fecha inscripción desde')
            if (idx >= 5 && !cphData.fechaInscHasta) faltantes.push('Fecha inscripción hasta')
            if (idx >= 7 && !cphData.fechaOrdenMerito) faltantes.push('Fecha orden de mérito')
            if (idx >= 8 && !cphData.fechaIfacs) faltantes.push('Fecha IFACS')
            if (idx >= 9 && !cphData.fechaInsal) faltantes.push('Fecha INSAL')
            if (idx >= 10 && !cphData.eeDesignacion) faltantes.push('EE de designación (TAD)')
            if (idx >= 11 && !cphData.cargaDocumentacion) faltantes.push('Carga de documentación')
            if (idx >= 12 && !cphData.fechaAptoMedico) faltantes.push('Fecha apto médico')
            if (idx >= 13 && !cphData.fechaIte) faltantes.push('Fecha ITE')
            if (idx >= 14 && !cphData.proyectoResolucion) faltantes.push('Proyecto de resolución')
            if (idx >= 15 && !cphData.resoALaFirma) faltantes.push('Reso a la firma')
            if (idx >= 16 && !cphData.resolucionDesignacion)
              faltantes.push('Resolución de designación')
            if (faltantes.length === 0) return null
            return (
              <div className="mx-6 mb-3 bg-orange-50 border border-orange-300 rounded-lg px-4 py-3">
                <p className="text-xs font-semibold text-orange-800 mb-1.5">
                  ⚠️ Completar documentación — el concurso está en{' '}
                  <span className="font-mono">{sub}</span> pero faltan {faltantes.length} campo
                  {faltantes.length > 1 ? 's' : ''}:
                </p>
                <ul className="flex flex-wrap gap-x-4 gap-y-1">
                  {faltantes.map((f) => (
                    <li key={f} className="text-xs text-orange-700 flex items-center gap-1">
                      <span className="text-orange-400">•</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })()}
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
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-white' : cfg.dot}`}
                  />
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
          {cphData && (
            <div className="bg-white rounded-lg shadow-sm p-3 mt-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
                Documentación
              </p>
              {getCasoCph(cphData).validacion && (
                <button
                  type="button"
                  onClick={() => exportCphPdf(cphData, 'validacion')}
                  className="w-full btn-outline text-xs py-1 px-3 flex items-center gap-2"
                >
                  <span className="w-5 h-5 rounded bg-red-100 flex items-center justify-center text-red-600 text-[9px] font-bold shrink-0">
                    PDF
                  </span>
                  Validación
                </button>
              )}
              {cphData.eeConcurso && (
                <button
                  type="button"
                  onClick={() => exportCphPdf(cphData, 'autorizacion')}
                  className="w-full btn-outline text-xs py-1 px-3 flex items-center gap-2"
                >
                  <span className="w-5 h-5 rounded bg-red-100 flex items-center justify-center text-red-600 text-[9px] font-bold shrink-0">
                    PDF
                  </span>
                  Autorización
                </button>
              )}
              {juradoData && (
                <button
                  type="button"
                  onClick={() => exportJuradoPdf(cphData, juradoData)}
                  className="w-full btn-outline text-xs py-1 px-3 flex items-center gap-2"
                >
                  <span className="w-5 h-5 rounded bg-red-100 flex items-center justify-center text-red-600 text-[9px] font-bold shrink-0">
                    PDF
                  </span>
                  Acta de jurado
                </button>
              )}
              {cphData.ordenMeritoConfirmado && (
                <button
                  type="button"
                  onClick={() => exportOrdenMeritoPdf(cphData, inscriptos)}
                  className="w-full btn-outline text-xs py-1 px-3 flex items-center gap-2"
                >
                  <span className="w-5 h-5 rounded bg-red-100 flex items-center justify-center text-red-600 text-[9px] font-bold shrink-0">
                    PDF
                  </span>
                  Acta orden de mérito
                </button>
              )}
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
                {puedeResolverAutorizacion && etapaActiva === 'baja' && (
                  <button
                    className="btn-primary text-xs py-1 px-3"
                    onClick={() => setModalAutorizacion(true)}
                  >
                    Resolver autorización
                  </button>
                )}
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Banner: esta etapa espera que se complete la etapa anterior */}
              {etapa.estado === 'pendiente' &&
                (() => {
                  const anterior = etapasActuales[etapa.numero - 2]
                  return (
                    <div className="flex items-start gap-3 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm">
                      <span className="text-blue-400 text-base mt-0.5">🔒</span>
                      <div>
                        <p className="font-semibold text-blue-800">
                          {anterior
                            ? `Esperando que se complete la Etapa ${anterior.numero}: ${anterior.titulo}`
                            : 'Esperando que se complete la etapa anterior'}
                        </p>
                        <p className="text-blue-600 text-xs mt-0.5">
                          Esta etapa se habilitará cuando la anterior esté completa.
                        </p>
                      </div>
                    </div>
                  )
                })()}

              {etapa.estado === 'completada' && etapaActiva === 'baja' && (
                <div className="flex items-start gap-3 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm">
                  <span className="text-gray-400 text-base mt-0.5">🔒</span>
                  <div>
                    <p className="font-semibold text-gray-700">Etapa guardada — solo lectura</p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      Para modificar estos datos, SGRASV debe hacerlo desde su panel de
                      autorizaciones.
                    </p>
                  </div>
                </div>
              )}

              {pendienteAutorizacion && etapaActiva === 'baja' && (
                <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm">
                  <span className="text-amber-500 text-base mt-0.5">⏳</span>
                  <div>
                    <p className="font-semibold text-amber-800">
                      Modificación pendiente de autorización
                    </p>
                    {tieneCambioSiglaCr ? (
                      aprobadoDirector ? (
                        <p className="text-amber-700 text-xs mt-0.5">
                          El <strong>Director</strong> ya aprobó. Esperando resolución final de{' '}
                          <strong>SGRASV</strong>.
                        </p>
                      ) : (
                        <p className="text-amber-700 text-xs mt-0.5">
                          Se solicitó un cambio de sigla o código de registro. El rol{' '}
                          <strong>Director</strong> debe autorizar primero, luego{' '}
                          <strong>SGRASV</strong> confirma.
                        </p>
                      )
                    ) : (
                      <p className="text-amber-700 text-xs mt-0.5">
                        Requiere autorización de <strong>SGRASV</strong> para continuar.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {etapa.id === 'desierto' ? (
                <div className="space-y-4">
                  {/* Botón declarar desierto — solo si el concurso no está finalizado */}
                  {cphData && cphData.estado !== 'finalizado' && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-red-800">
                          Declarar ronda desierta
                        </p>
                        <p className="text-xs text-red-600 mt-0.5">
                          Se guardará el historial y se limpiarán los campos para el relanzamiento.
                        </p>
                      </div>
                      <button
                        className="btn-danger text-sm shrink-0"
                        onClick={() => setModalDesierto(true)}
                      >
                        Declarar desierto
                      </button>
                    </div>
                  )}
                  {/* Historial de rondas desiertas */}
                  {cphData &&
                  (
                    cphData as unknown as {
                      desiertoHistorial?: {
                        id: string
                        nroRonda: number
                        dispoDesierta: string
                        fechaDispoDesierta: string
                        disposicion: string | null
                        fechaInscDesde: string | null
                        fechaInscHasta: string | null
                        fechaExamen: string | null
                        qInscriptos: number | null
                      }[]
                    }
                  ).desiertoHistorial?.length ? (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                        Historial de rondas desiertas
                      </p>
                      <div className="space-y-2">
                        {(
                          cphData as unknown as {
                            desiertoHistorial: {
                              id: string
                              nroRonda: number
                              dispoDesierta: string
                              fechaDispoDesierta: string
                              disposicion: string | null
                              fechaInscDesde: string | null
                              fechaInscHasta: string | null
                              fechaExamen: string | null
                              qInscriptos: number | null
                            }[]
                          }
                        ).desiertoHistorial.map((r) => (
                          <div
                            key={r.id}
                            className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                                Ronda {r.nroRonda}
                              </span>
                              <span className="text-xs text-gray-500">
                                {r.fechaDispoDesierta?.slice(0, 10)} · {r.dispoDesierta}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
                              {r.disposicion && <span>Dispo: {r.disposicion}</span>}
                              {r.fechaInscDesde && (
                                <span>Insc. desde: {r.fechaInscDesde.slice(0, 10)}</span>
                              )}
                              {r.fechaInscHasta && (
                                <span>Insc. hasta: {r.fechaInscHasta.slice(0, 10)}</span>
                              )}
                              {r.fechaExamen && <span>Examen: {r.fechaExamen.slice(0, 10)}</span>}
                              {r.qInscriptos != null && <span>Inscriptos: {r.qInscriptos}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">Sin rondas desiertas registradas.</p>
                  )}
                </div>
              ) : etapa.id === 'baja' ? (
                <>
                  {/* ── Datos de la baja (readonly) ── */}
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
                      Datos de la baja
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {etapa.campos
                        .filter((c) => c.key !== '__sep__' && c.key !== 'eeConcurso')
                        .map((campo) => (
                          <div
                            key={campo.key}
                            className={campo.key === 'puesto' ? 'sm:col-span-2' : ''}
                          >
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                              {campo.label}
                            </label>
                            <input
                              type={campo.tipo === 'fecha' ? 'date' : 'text'}
                              defaultValue={campo.valor as string}
                              className="input h-10 w-full bg-gray-50 text-gray-500"
                              readOnly
                            />
                          </div>
                        ))}
                      {/* Campos extra de la baja */}
                      {(() => {
                        const b = (
                          cphData?.concurso as unknown as {
                            baja?: {
                              motivo?: string | null
                              docRespaldatoria?: string | null
                              tipificadorOrigen?: string | null
                              partidaPresupuestaria?: string | null
                              cargaHoraria?: number | null
                              fechaPaseParalelo?: string | Date | null
                              observaciones?: string | null
                            }
                          }
                        )?.baja
                        if (!b) return null
                        const toDate = (v: string | Date | null | undefined) =>
                          v
                            ? typeof v === 'string'
                              ? v.slice(0, 10)
                              : v.toISOString().slice(0, 10)
                            : ''
                        const extras: {
                          label: string
                          value: string
                          fecha?: boolean
                          wide?: boolean
                        }[] = [
                          {
                            label: 'Origen',
                            value: b.tipificadorOrigen ?? '',
                          },
                          { label: 'Motivo', value: b.motivo ?? '' },
                          {
                            label: 'Doc. respaldatoria',
                            value: b.docRespaldatoria ?? '',
                          },
                          {
                            label: 'Partida presup.',
                            value: b.partidaPresupuestaria ?? '',
                          },
                          {
                            label: 'Carga horaria',
                            value: b.cargaHoraria != null ? `${b.cargaHoraria} hs` : '',
                          },
                          {
                            label: 'Fecha pase paralelo',
                            value: toDate(b.fechaPaseParalelo),
                            fecha: true,
                          },
                          {
                            label: 'Observaciones',
                            value: b.observaciones ?? '',
                            wide: true,
                          },
                        ]
                        return extras
                          .filter((e) => e.value)
                          .map((e) => (
                            <div key={e.label} className={e.wide ? 'sm:col-span-2' : ''}>
                              <label className="block text-sm font-semibold text-gray-700 mb-1">
                                {e.label}
                              </label>
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

                  {/* ── Datos del concurso (editables solo en etapa activa) ── */}
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
                      Datos del concurso
                    </p>
                    {etapa.estado === 'completada' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {etapa.campos
                          .filter((c) => c.key === 'eeConcurso')
                          .map((campo) => (
                            <div key={campo.key} className="sm:col-span-2">
                              <label className="block text-sm font-semibold text-gray-700 mb-1">
                                {campo.label}
                              </label>
                              <input
                                type="text"
                                value={campo.valor as string}
                                className="input h-10 w-full bg-gray-50 text-gray-500"
                                readOnly
                              />
                            </div>
                          ))}
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">
                            Sigla
                          </label>
                          <input
                            type="text"
                            value={siglaConcurso}
                            className="input h-10 w-full bg-gray-50 text-gray-500"
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                            Escalafón
                          </label>
                          <input
                            type="text"
                            value={escalafonLabel(
                              escalafones.find((e) => e.id === escalafonId)?.nombre ?? '',
                            )}
                            className="input h-10 w-full bg-gray-50 text-gray-500"
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                            Puesto
                          </label>
                          <input
                            type="text"
                            value={puestoConcurso}
                            className="input h-10 w-full bg-gray-50 text-gray-500"
                            readOnly
                          />
                        </div>
                        {especialidadConcurso && (
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                              Especialidad del concurso
                            </label>
                            <input
                              type="text"
                              value={especialidadConcurso}
                              className="input h-10 w-full bg-gray-50 text-gray-500"
                              readOnly
                            />
                          </div>
                        )}
                        {/* IF de autorización — al final, justo antes de Observaciones */}
                        <div className="sm:col-span-2">
                          <label className="block text-sm font-semibold text-gray-700 mb-1">
                            IF de autorización
                          </label>
                          <input
                            type="text"
                            value={cphData?.ifAutorizacion ?? '—'}
                            className="input h-10 w-full bg-gray-50 text-gray-500"
                            readOnly
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Expediente de Concurso */}
                        {etapa.campos
                          .filter((c) => c.key === 'eeConcurso')
                          .map((campo) => (
                            <div key={campo.key} className="sm:col-span-2">
                              <label className="block text-sm font-semibold text-gray-700 mb-1">
                                {campo.label}
                              </label>
                              <input
                                type="text"
                                value={eeConcursoInput}
                                onChange={(e) => setEeConcursoInput(e.target.value)}
                                data-key={campo.key}
                                className="input h-10 w-full"
                                disabled={
                                  pendienteAutorizacion ||
                                  etapa.estado === 'pendiente' ||
                                  etapa.estado === 'bloqueada'
                                }
                              />
                            </div>
                          ))}
                        {/* IF de autorización — nro de documento requerido para
                            solicitar la autorización a SGRASV */}
                        <div className="sm:col-span-2">
                          <label className="block text-sm font-semibold text-gray-700 mb-1">
                            IF de autorización
                          </label>
                          <input
                            type="text"
                            value={ifAutorizacionInput}
                            onChange={(e) => setIfAutorizacionInput(e.target.value)}
                            data-key="ifAutorizacion"
                            placeholder="Nro. de documento IF para autorizar"
                            className="input h-10 w-full"
                            disabled={
                              pendienteAutorizacion ||
                              etapa.estado === 'pendiente' ||
                              etapa.estado === 'bloqueada'
                            }
                          />
                          <p className="text-[11px] text-gray-400 mt-1">
                            Requerido para solicitar la autorización de SGRASV.
                          </p>
                        </div>
                        {/* Sigla */}
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">
                            Sigla
                          </label>
                          <SearchableSelect
                            value={siglaConcurso}
                            onChange={setSiglaConcurso}
                            options={hospitales.map((h) => hospitalLabel(h))}
                            placeholder="Buscar sigla..."
                            disabled={
                              pendienteAutorizacion ||
                              etapa.estado === 'pendiente' ||
                              etapa.estado === 'bloqueada'
                            }
                            displayToValue={(label) =>
                              hospitales.find((h) => hospitalLabel(h) === label)?.sigla ?? label
                            }
                            valueToDisplay={(sigla) => {
                              const h = hospitales.find((h) => h.sigla === sigla)
                              return h ? hospitalLabel(h) : sigla
                            }}
                          />
                        </div>
                        {/* Escalafón */}
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                            Escalafón
                          </label>
                          <SearchableSelect
                            value={escalafonId}
                            onChange={(id) => {
                              setEscalafonId(id)
                              setPuestoConcurso('')
                              setEspecialidadConcurso('')
                            }}
                            options={escalafonesOrdenados.map((e) => escalafonLabel(e.nombre))}
                            placeholder="Buscar escalafón..."
                            disabled={
                              pendienteAutorizacion ||
                              etapa.estado === 'pendiente' ||
                              etapa.estado === 'bloqueada'
                            }
                            displayToValue={(label) =>
                              escalafonesOrdenados.find((e) => escalafonLabel(e.nombre) === label)
                                ?.id ?? label
                            }
                            valueToDisplay={(id) => {
                              const e = escalafonesOrdenados.find((e) => e.id === id)
                              return e ? escalafonLabel(e.nombre) : id
                            }}
                          />
                        </div>
                        {/* Puesto — en cascada con escalafón */}
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                            Puesto
                          </label>
                          <SearchableSelect
                            value={puestoConcurso}
                            onChange={(p) => {
                              setPuestoConcurso(p)
                              setEspecialidadConcurso('')
                            }}
                            options={puestosDisponibles}
                            placeholder={
                              escalafonId ? 'Buscar puesto...' : 'Elegí un escalafón primero'
                            }
                            disabled={
                              pendienteAutorizacion ||
                              !escalafonId ||
                              etapa.estado === 'pendiente' ||
                              etapa.estado === 'bloqueada'
                            }
                          />
                        </div>
                        {/* Especialidad — condicional */}
                        {especialidadesDisponibles.length > 0 && (
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                              Especialidad del concurso
                            </label>
                            <SearchableSelect
                              value={especialidadConcurso}
                              onChange={setEspecialidadConcurso}
                              options={especialidadesDisponibles}
                              placeholder="Buscar especialidad..."
                              disabled={
                                pendienteAutorizacion ||
                                etapa.estado === 'pendiente' ||
                                etapa.estado === 'bloqueada'
                              }
                            />
                          </div>
                        )}
                        {/* Motivo cambio de especialidad — aparece cuando difiere de la original */}
                        {especialidadesDisponibles.length > 0 &&
                          especialidadConcurso &&
                          originales.especialidad &&
                          especialidadConcurso.toLowerCase() !==
                            originales.especialidad.toLowerCase() && (
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-semibold text-amber-700 mb-1.5">
                                ⚠ Nota del cambio de especialidad
                                <span className="text-danger ml-1">*</span>
                              </label>
                              <textarea
                                data-key="motivoCambioEspecialidad"
                                defaultValue={
                                  ((cphData as unknown as Record<string, unknown>)
                                    ?.motivoCambioEspecialidad as string) ?? ''
                                }
                                rows={2}
                                className="input w-full py-2 border-amber-300 focus:border-amber-500"
                                placeholder="Justificá por qué se cambia la especialidad del concurso..."
                                disabled={
                                  pendienteAutorizacion ||
                                  etapa.estado === 'pendiente' ||
                                  etapa.estado === 'bloqueada'
                                }
                              />
                            </div>
                          )}
                      </div>
                    )}

                    {/* Reutilizar orden de mérito compatible — solo con el
                        Expediente de Concurso cargado y sin autorización en curso.
                        Permite reservar un candidato antes de solicitar la
                        autorización de SGRASV (define si el concurso salta etapas). */}
                    {id && eeConcursoInput.trim() && !pendienteAutorizacion && (
                      <div className="mt-5">
                        <PanelReutilizarOm concursoId={id} />
                      </div>
                    )}
                  </div>
                </>
              ) : etapa.id === 'autorizacion' ? (
                <div className="space-y-5">
                  {/* Tipo de gestión — va primero: hay que definirlo (y guardarlo)
                      antes de poder generar el sorteo de jurado. */}
                  <div
                    className={`rounded-lg border px-4 py-4 ${
                      cphData?.tipoGestion
                        ? 'border-gray-200 bg-white'
                        : 'border-amber-300 bg-amber-50'
                    }`}
                  >
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Tipo de gestión
                      <span className="text-danger ml-1">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        ref={tipoGestionRef}
                        data-key="tipoGestion"
                        defaultValue={cphData?.tipoGestion ?? ''}
                        className="input h-10 w-full sm:w-72"
                        disabled={etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'}
                      >
                        <option value="">Sin definir</option>
                        <option value="centralizado">Centralizado</option>
                        <option value="descentralizado">Descentralizado</option>
                      </select>
                      <button
                        type="button"
                        className="btn-outline text-sm shrink-0"
                        disabled={patchMutation.isPending}
                        onClick={() => {
                          const valor = tipoGestionRef.current?.value || null
                          if (!valor) return
                          patchMutation.mutate(
                            { tipoGestion: valor },
                            { onSuccess: () => toast.success('Tipo de gestión guardado.') },
                          )
                        }}
                      >
                        {patchMutation.isPending ? 'Guardando…' : 'Guardar'}
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Centralizado: interviene SGOCDCPS y su equipo en la etapa 3. Descentralizado:
                      interviene un tercero.
                    </p>
                    {!cphData?.tipoGestion && (
                      <p className="text-xs text-amber-700 mt-2 font-medium">
                        ⚠ Elegí el tipo de gestión y tocá "Guardar" (acá arriba) antes de poder
                        generar el sorteo de jurado.
                      </p>
                    )}
                  </div>

                  {/* Bloque sorteo de jurado (primero — es lo primero que se hace) */}
                  {cphData && (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-4 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-indigo-900">Sorteo de jurado</p>
                          <p className="text-xs text-indigo-600 mt-0.5">
                            Sortea titulares y suplentes entre profesionales de la misma profesión
                            con cargo activo, priorizando la misma unidad organizativa y ampliando
                            al sistema de salud si es necesario.
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          {(() => {
                            const bloqueada =
                              etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'
                            // No se puede generar/re-sortear sin Tipo de gestión guardado.
                            const sinTipoGestion = !cphData?.tipoGestion
                            const busy =
                              generarSorteoMutation.isPending ||
                              confirmarSorteoMutation.isPending ||
                              cancelarSorteoMutation.isPending ||
                              revertirSorteoMutation.isPending
                            // Confirmado → solo lectura + revertir
                            if (juradoData?.confirmado) {
                              return (
                                <>
                                  <span className="px-3 py-1.5 rounded-lg bg-green-100 text-green-800 text-sm font-semibold flex items-center gap-1.5">
                                    🔒 Jurado confirmado
                                  </span>
                                  <button
                                    className="btn-outline text-sm"
                                    onClick={async () => {
                                      if (
                                        await confirm({
                                          titulo: 'Revertir confirmación',
                                          mensaje:
                                            'El jurado volverá a estado borrador y podrás re-sortearlo. ¿Continuar?',
                                        })
                                      )
                                        revertirSorteoMutation.mutate()
                                    }}
                                    disabled={busy}
                                  >
                                    {revertirSorteoMutation.isPending
                                      ? 'Revirtiendo…'
                                      : '↩ Revertir confirmación'}
                                  </button>
                                </>
                              )
                            }

                            // Hay borrador sin confirmar → Re-sortear / Cancelar / Confirmar
                            if (juradoData) {
                              return (
                                <>
                                  <button
                                    className="btn-outline text-sm"
                                    onClick={() => setModalGenerarSorteo(true)}
                                    disabled={busy || bloqueada || sinTipoGestion}
                                    title={sinTipoGestion ? 'Completá el Tipo de gestión primero' : undefined}
                                  >
                                    🔄 Re-sortear
                                  </button>
                                  <button
                                    className="btn-outline text-sm text-danger border-red-200 hover:bg-red-50"
                                    onClick={async () => {
                                      if (
                                        await confirm({
                                          titulo: 'Descartar sorteo',
                                          mensaje: '¿Descartar el sorteo actual?',
                                          peligro: true,
                                          confirmLabel: 'Descartar',
                                        })
                                      )
                                        cancelarSorteoMutation.mutate()
                                    }}
                                    disabled={busy || bloqueada}
                                  >
                                    {cancelarSorteoMutation.isPending
                                      ? 'Cancelando…'
                                      : '✕ Cancelar'}
                                  </button>
                                  <button
                                    className="btn-primary text-sm"
                                    onClick={async () => {
                                      if (
                                        await confirm({
                                          titulo: 'Confirmar jurado',
                                          mensaje:
                                            'Una vez confirmado no podrás re-sortearlo (deberás revertir primero). ¿Confirmar el jurado?',
                                        })
                                      )
                                        confirmarSorteoMutation.mutate()
                                    }}
                                    disabled={busy || bloqueada}
                                  >
                                    {confirmarSorteoMutation.isPending
                                      ? 'Confirmando…'
                                      : '✓ Confirmar'}
                                  </button>
                                </>
                              )
                            }

                            // Sin sorteo aún → abre el modal de criterios/resumen
                            return (
                              <button
                                className="btn-primary text-sm"
                                onClick={() => setModalGenerarSorteo(true)}
                                disabled={busy || bloqueada || sinTipoGestion}
                                title={sinTipoGestion ? 'Completá el Tipo de gestión primero' : undefined}
                              >
                                🎲 Generar sorteo
                              </button>
                            )
                          })()}
                        </div>
                      </div>

                      {generarSorteoMutation.isError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                          ⚠️{' '}
                          {(
                            generarSorteoMutation.error as {
                              response?: {
                                data?: { error?: { message?: string } }
                              }
                            }
                          )?.response?.data?.error?.message ?? 'No se pudo generar el sorteo.'}
                        </div>
                      )}

                      {/* Aviso de jurados vigentes compatibles reutilizables —
                          solo cuando no hay jurado confirmado todavía. */}
                      {!juradoData?.confirmado && juradosCompatibles.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                          <p className="text-xs text-green-800">
                            ♻️ Hay <strong>{juradosCompatibles.length}</strong> jurado(s) vigente(s)
                            compatible(s) que podés reutilizar en vez de sortear uno nuevo.
                          </p>
                          <button
                            className="btn-outline text-xs py-1 px-3 border-green-300"
                            onClick={() => setModalGenerarSorteo(true)}
                            disabled={!cphData?.tipoGestion}
                            title={
                              !cphData?.tipoGestion
                                ? 'Completá el Tipo de gestión primero'
                                : undefined
                            }
                          >
                            Ver jurados compatibles
                          </button>
                        </div>
                      )}

                      {/* Resultado del sorteo */}
                      {juradoData ? (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-semibold">
                              Sorteo del{' '}
                              {juradoData.fechaSorteo.slice(0, 10).split('-').reverse().join('/')}
                            </span>
                            {juradoData.confirmado ? (
                              <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-semibold">
                                ✓ Confirmado
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                                Borrador — sin confirmar
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded-full font-semibold ${
                                juradoData.ambito === 'hospital'
                                  ? 'bg-green-100 text-green-800'
                                  : juradoData.ambito === 'sistema'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              Ámbito:{' '}
                              {juradoData.ambito === 'hospital'
                                ? 'Misma unidad organizativa'
                                : juradoData.ambito === 'sistema'
                                  ? 'Sistema de salud'
                                  : 'Mixto (hospital + sistema)'}
                            </span>
                            <span className="text-gray-500">
                              {juradoData.criterios.totalCandidatos} candidatos elegibles
                              {' · '}
                              {juradoData.criterios.candidatosMismoHospital} en el hospital
                            </span>
                            {juradoData.criterios.reglaUsada != null && (
                              <span
                                className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold"
                                title={
                                  juradoData.criterios.candidatosPorRegla
                                    ? `Candidatos por regla — R1: ${juradoData.criterios.candidatosPorRegla[1]} · R2: ${juradoData.criterios.candidatosPorRegla[2]} · R3: ${juradoData.criterios.candidatosPorRegla[3]}`
                                    : undefined
                                }
                              >
                                Cascada hasta Regla {juradoData.criterios.reglaUsada}
                              </span>
                            )}
                          </div>

                          {juradoData.observaciones && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                              ⚠ {juradoData.observaciones}
                            </div>
                          )}

                          {(['titular', 'suplente'] as const).map((rol) => {
                            const miembros = juradoData.miembros.filter((m) => m.rol === rol)
                            if (miembros.length === 0) return null
                            return (
                              <div key={rol}>
                                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                                  {rol === 'titular' ? 'Titulares' : 'Suplentes'}
                                </p>
                                <div className="space-y-1.5">
                                  {miembros.map((m) => (
                                    <div
                                      key={m.id}
                                      className="rounded-lg border border-gray-200 bg-white px-3 py-2"
                                    >
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px] font-bold">
                                          {rol === 'titular' ? 'T' : 'S'}
                                          {m.orden}
                                        </span>
                                        <span className="text-sm font-semibold text-gray-900">
                                          {m.apellidoNombre}
                                        </span>
                                        <span className="text-xs text-gray-400 font-mono">
                                          {m.cuil}
                                        </span>
                                        <span
                                          className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                            m.ambito === 'hospital'
                                              ? 'bg-green-50 text-green-700 border border-green-200'
                                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                                          }`}
                                        >
                                          {m.ambito === 'hospital'
                                            ? 'Mismo hospital'
                                            : 'Sistema de salud'}
                                        </span>
                                      </div>
                                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-gray-500">
                                        {m.reglaAplicada != null && (
                                          <span
                                            className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold"
                                            title={
                                              m.reglaAplicada === 1
                                                ? 'Regla 1: mismo hospital + conducción + misma especialidad'
                                                : m.reglaAplicada === 2
                                                  ? 'Regla 2: mismo hospital + antigüedad ≥ mínima'
                                                  : 'Regla 3: sistema de salud + conducción'
                                            }
                                          >
                                            Regla {m.reglaAplicada}
                                          </span>
                                        )}
                                        {m.hospitalNombre && <span>🏥 {m.hospitalNombre}</span>}
                                        {m.puesto && <span>💼 {m.puesto}</span>}
                                        {m.especialidad && (
                                          <span
                                            className={m.cumpleEspecialidad ? 'text-green-600' : ''}
                                          >
                                            🩺 {m.especialidad}
                                            {m.cumpleEspecialidad ? ' ✓' : ''}
                                          </span>
                                        )}
                                        {m.esConduccion && (
                                          <span className="text-indigo-600">
                                            👔 Cargo de conducción
                                          </span>
                                        )}
                                        {m.antiguedadAnios != null && (
                                          <span>📅 {m.antiguedadAnios} años de antigüedad</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">
                          Aún no se generó el sorteo de jurado para este concurso.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Campos de autorización — debajo del sorteo, arriba de Observaciones.
                      La "Fecha sorteo de jurado" NO se muestra acá: sale solo en el acta. */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {etapa.campos
                      .filter((campo) => campo.key !== 'sorteoJurado')
                      .map((campo) => (
                        <div key={campo.key}>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">
                            {campo.label}
                            {campo.requerido && <span className="text-danger ml-1">*</span>}
                          </label>
                          <input
                            type={campo.tipo === 'fecha' ? 'date' : 'text'}
                            defaultValue={campo.valor as string}
                            data-key={campo.key}
                            className="input h-10 w-full"
                            disabled={etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'}
                          />
                        </div>
                      ))}
                  </div>
                </div>
              ) : etapa.id === 'inscripcion' ? (
                <div className="space-y-5">
                  {(() => {
                    const deshab = etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'
                    // Orden de la tabla: primero los que tienen posición de OM
                    // (asc), luego el resto por apellido/nombre.
                    const inscriptosOrdenados = [...inscriptos].sort((a, b) => {
                      const pa = a.ordenMerito ?? Infinity
                      const pb = b.ordenMerito ?? Infinity
                      if (pa !== pb) return pa - pb
                      return (
                        a.apellido.localeCompare(b.apellido) || a.nombre.localeCompare(b.nombre)
                      )
                    })
                    // Validación de posiciones del orden de mérito.
                    const posiciones = inscriptos
                      .filter((i) => i.ordenMerito != null)
                      .map((i) => i.ordenMerito as number)
                    const hayRepetidas = new Set(posiciones).size !== posiciones.length
                    const presentadosSinPos = inscriptos.filter(
                      (i) => i.presentoExamen && i.ordenMerito == null,
                    ).length
                    const campoInput = (key: string) => {
                      const campo = etapa.campos.find((c) => c.key === key)
                      if (!campo) return null
                      if (campo.tipo === 'checkbox')
                        return (
                          <div key={key}>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                              {campo.label}
                            </label>
                            <div className="flex items-center gap-2 h-10">
                              <input
                                type="checkbox"
                                defaultChecked={campo.valor as boolean}
                                data-key={key}
                                className="checkbox"
                                disabled={deshab}
                              />
                              <span className="text-sm text-gray-500">Sí</span>
                            </div>
                          </div>
                        )
                      // Las fechas de inscripción quedan de solo lectura una vez
                      // publicadas (inscripción cerrada).
                      const roInsc =
                        (key === 'fechaInscDesde' || key === 'fechaInscHasta') &&
                        !!cphData?.inscripcionCerrada
                      return (
                        <div key={key}>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">
                            {campo.label}
                          </label>
                          <input
                            type={campo.tipo === 'fecha' ? 'date' : 'text'}
                            defaultValue={campo.valor as string}
                            data-key={roInsc ? undefined : key}
                            readOnly={roInsc}
                            className={`input h-10 w-full ${roInsc ? 'bg-gray-50 text-gray-500' : ''}`}
                            disabled={deshab}
                          />
                        </div>
                      )
                    }
                    // La inscripción se considera ya cerrada/publicada si el flag
                    // lo indica, o si ya hay examen publicado, o si el sub-estado
                    // avanzó más allá de la etapa de inscripción (D en adelante).
                    // Cubre datos históricos que nunca setearon inscripcionCerrada.
                    const SUBS_POST_INSCRIPCION = [
                      'D-EXAMEN PUBLICADO',
                      'E-ORDEN DE MERITO',
                      'F-IFACS',
                      'G-INSAL',
                      'H-TAD',
                      'I-CARGA DOCU',
                      'J-APTO MED',
                      'K-ITE',
                      'L-PYCTO DE RESO',
                      'M-RESO A LA FIRMA',
                      'N-DESIGNADO',
                      'O-ALTA SIAL',
                    ]
                    const inscripcionYaCerrada =
                      !!cphData?.inscripcionCerrada ||
                      !!cphData?.fechaExamen ||
                      SUBS_POST_INSCRIPCION.includes(cphData?.subEstado ?? '')
                    return (
                      <>
                        {/* Fechas de inscripción + publicar */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {campoInput('fechaInscDesde')}
                          {campoInput('fechaInscHasta')}
                        </div>
                        {cphData && (
                          <div>
                            {!inscripcionYaCerrada ? (
                              <button
                                className="btn-primary text-sm whitespace-nowrap"
                                disabled={cerrarInscripcionMutation.isPending}
                                onClick={async () => {
                                  const desde =
                                    formRef.current?.querySelector<HTMLInputElement>(
                                      'input[data-key="fechaInscDesde"]',
                                    )?.value || null
                                  const hasta =
                                    formRef.current?.querySelector<HTMLInputElement>(
                                      'input[data-key="fechaInscHasta"]',
                                    )?.value || null
                                  if (!desde || !hasta) {
                                    toast.error('Cargá las fechas de inscripción (desde y hasta).')
                                    return
                                  }
                                  if (
                                    await confirm({
                                      titulo: 'Publicar fechas de inscripción',
                                      mensaje:
                                        'El sub-estado avanza a “Publicación Examen” y no se podrán agregar más inscriptos. ¿Publicar?',
                                    })
                                  )
                                    cerrarInscripcionMutation.mutate(
                                      { fechaInscDesde: desde, fechaInscHasta: hasta },
                                      {
                                        onError: (e) =>
                                          toast.error(
                                            (
                                              e as {
                                                response?: {
                                                  data?: { error?: { message?: string } }
                                                }
                                              }
                                            )?.response?.data?.error?.message ??
                                              'No se pudo publicar.',
                                          ),
                                      },
                                    )
                                }}
                              >
                                {cerrarInscripcionMutation.isPending
                                  ? 'Publicando…'
                                  : '📢 Publicar fechas de inscripción'}
                              </button>
                            ) : (
                              <div className="flex items-center gap-3 flex-wrap">
                                <button
                                  className="btn-outline text-xs whitespace-nowrap"
                                  disabled={
                                    reabrirInscripcionMutation.isPending || !!cphData.fechaExamen
                                  }
                                  title={
                                    cphData.fechaExamen ? 'Despublicá primero el examen' : undefined
                                  }
                                  onClick={async () => {
                                    if (
                                      await confirm({
                                        titulo: 'Reabrir inscripciones',
                                        mensaje:
                                          'El sub-estado vuelve a “Inscripción de exámenes”. ¿Reabrir?',
                                      })
                                    )
                                      reabrirInscripcionMutation.mutate()
                                  }}
                                >
                                  ↩ Reabrir inscripciones
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Fecha de examen (editable) / Fecha orden de mérito (autocompletada al confirmar) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                              Fecha de examen
                            </label>
                            <input
                              type="date"
                              defaultValue={
                                (cphData?.fechaExamen?.slice(0, 10) ??
                                  (etapa.campos.find((c) => c.key === 'fechaExamen')
                                    ?.valor as string)) ||
                                ''
                              }
                              data-key={cphData?.fechaExamen ? undefined : 'fechaExamen'}
                              readOnly={!!cphData?.fechaExamen}
                              className={`input h-10 w-full ${cphData?.fechaExamen ? 'bg-gray-50 text-gray-500' : ''}`}
                              disabled={deshab}
                            />
                            {!cphData?.fechaExamen ? (
                              <button
                                className="btn-primary text-xs mt-2 whitespace-nowrap"
                                disabled={
                                  publicarExamenMutation.isPending || !cphData?.inscripcionCerrada
                                }
                                title={
                                  !cphData?.inscripcionCerrada
                                    ? 'Publicá primero las fechas de inscripción'
                                    : undefined
                                }
                                onClick={async () => {
                                  const val =
                                    formRef.current?.querySelector<HTMLInputElement>(
                                      'input[data-key="fechaExamen"]',
                                    )?.value || null
                                  if (!val) {
                                    toast.error('Cargá la fecha de examen.')
                                    return
                                  }
                                  if (
                                    await confirm({
                                      titulo: 'Publicar examen',
                                      mensaje: 'Se publicará la fecha de examen. ¿Continuar?',
                                    })
                                  )
                                    publicarExamenMutation.mutate(val, {
                                      onError: (e) =>
                                        toast.error(
                                          (
                                            e as {
                                              response?: { data?: { error?: { message?: string } } }
                                            }
                                          )?.response?.data?.error?.message ??
                                            'No se pudo publicar.',
                                        ),
                                    })
                                }}
                              >
                                {publicarExamenMutation.isPending
                                  ? 'Publicando…'
                                  : '📢 Publicar examen'}
                              </button>
                            ) : (
                              <button
                                className="btn-outline text-xs mt-2 whitespace-nowrap"
                                disabled={
                                  despublicarExamenMutation.isPending ||
                                  cphData.presentadosConfirmados
                                }
                                title={
                                  cphData.presentadosConfirmados
                                    ? 'Revertí primero los presentados'
                                    : undefined
                                }
                                onClick={async () => {
                                  if (
                                    await confirm({
                                      titulo: 'Despublicar examen',
                                      mensaje:
                                        'Se quitará la fecha de examen publicada. ¿Continuar?',
                                    })
                                  )
                                    despublicarExamenMutation.mutate()
                                }}
                              >
                                ↩ Despublicar examen
                              </button>
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                              Fecha orden de mérito
                            </label>
                            <input
                              type="date"
                              value={cphData?.fechaOrdenMerito?.slice(0, 10) ?? ''}
                              readOnly
                              className="input h-10 w-full bg-gray-50 text-gray-500"
                              title="Se completa automáticamente al confirmar el orden de mérito"
                            />
                          </div>
                        </div>

                        {/* Tabla de inscriptos — al fondo: la usan todas las fases de la etapa */}
                        {cphData && (
                          <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
                            <div className="flex items-start justify-between gap-4 mb-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-800 mb-2">
                                  Inscriptos
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium">
                                    Inscriptos: <strong>{inscriptos.length}</strong>
                                  </span>
                                  <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium">
                                    Presentados:{' '}
                                    <strong>
                                      {inscriptos.filter((i) => i.presentoExamen).length}
                                    </strong>
                                  </span>
                                  <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-medium">
                                    En orden de mérito:{' '}
                                    <strong>
                                      {inscriptos.filter((i) => i.ordenMerito != null).length}
                                    </strong>
                                  </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                  {cphData.inscripcionCerrada
                                    ? `Inscripciones cerradas${cphData.fechaCierreInscripcion ? ' el ' + cphData.fechaCierreInscripcion.slice(0, 10).split('-').reverse().join('/') : ''}.`
                                    : 'Cargá inscriptos uno por uno o importá un Excel/CSV. La cantidad se calcula sola.'}
                                </p>
                              </div>
                              <div className="flex flex-col gap-2 shrink-0 w-56">
                                <button
                                  className="btn-outline text-sm w-full whitespace-nowrap"
                                  onClick={() => inscriptoFileRef.current?.click()}
                                  disabled={
                                    importarInscriptosMutation.isPending ||
                                    cphData.inscripcionCerrada
                                  }
                                >
                                  {importarInscriptosMutation.isPending
                                    ? 'Importando…'
                                    : '⬆ Importar Excel/CSV'}
                                </button>
                                <input
                                  ref={inscriptoFileRef}
                                  type="file"
                                  accept=".xlsx,.xls,.csv"
                                  className="hidden"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0]
                                    if (!file) return
                                    try {
                                      const r = await importarInscriptosMutation.mutateAsync(file)
                                      toast.success(
                                        `Importados ${r.creados} inscriptos. Ignorados: ${r.ignorados}. Total: ${r.total}.`,
                                      )
                                    } catch {
                                      toast.error('No se pudo importar el archivo.')
                                    } finally {
                                      if (inscriptoFileRef.current)
                                        inscriptoFileRef.current.value = ''
                                    }
                                  }}
                                />
                                <button
                                  className="btn-primary text-sm w-full whitespace-nowrap"
                                  disabled={cphData.inscripcionCerrada}
                                  onClick={() => {
                                    setInscriptoForm({
                                      apellido: '',
                                      nombre: '',
                                      dni: '',
                                      cuil: '',
                                      email: '',
                                    })
                                    setModalInscripto(true)
                                  }}
                                >
                                  + Agregar inscripto
                                </button>
                              </div>
                            </div>
                            {cerrarInscripcionMutation.isError && (
                              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                ⚠️{' '}
                                {(
                                  cerrarInscripcionMutation.error as {
                                    response?: { data?: { error?: { message?: string } } }
                                  }
                                )?.response?.data?.error?.message ??
                                  'No se pudieron cerrar las inscripciones.'}
                              </div>
                            )}

                            {(hayRepetidas || presentadosSinPos > 0) && (
                              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                ⚠ Orden de mérito:
                                {hayRepetidas && ' hay posiciones repetidas.'}
                                {presentadosSinPos > 0 &&
                                  ` faltan asignar ${presentadosSinPos} posición(es) de presentados.`}
                              </div>
                            )}
                            {inscriptos.length === 0 ? (
                              <p className="text-sm text-gray-400">Sin inscriptos cargados.</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                                      <th className="py-2 pr-3">Apellido y nombre</th>
                                      <th className="py-2 pr-3">DNI</th>
                                      <th className="py-2 pr-3">CUIL</th>
                                      <th className="py-2 pr-3">Email</th>
                                      <th className="py-2 pr-3 text-center">Presentó</th>
                                      <th className="py-2 pr-3 text-center">Nota</th>
                                      <th className="py-2 pr-3 text-center">Orden mérito</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {inscriptosOrdenados.map((ins) => (
                                      <tr key={ins.id} className="border-b border-gray-50">
                                        <td className="py-2 pr-3 font-medium text-gray-800">
                                          {ins.apellido}, {ins.nombre}
                                        </td>
                                        <td className="py-2 pr-3 text-gray-500">
                                          {ins.dni ?? '—'}
                                        </td>
                                        <td className="py-2 pr-3 text-gray-500 font-mono">
                                          {ins.cuil ?? '—'}
                                        </td>
                                        <td className="py-2 pr-3 text-gray-500">
                                          {ins.email ?? '—'}
                                        </td>
                                        <td className="py-2 pr-3 text-center">
                                          <input
                                            type="checkbox"
                                            className="checkbox"
                                            checked={ins.presentoExamen}
                                            disabled={
                                              actualizarInscriptoMutation.isPending ||
                                              cphData.presentadosConfirmados
                                            }
                                            onChange={(e) =>
                                              actualizarInscriptoMutation.mutate({
                                                inscriptoId: ins.id,
                                                body: { presentoExamen: e.target.checked },
                                              })
                                            }
                                            title="Marcar si se presentó al examen. El orden de mérito se recalcula con el botón «Cargar notas / calcular orden», no automáticamente."
                                          />
                                        </td>
                                        <td className="py-2 pr-3 text-center">
                                          {ins.presentoExamen ? (
                                            <input
                                              type="number"
                                              min={0}
                                              max={10}
                                              step={0.01}
                                              className="input h-8 w-16 text-center"
                                              defaultValue={ins.nota ?? ''}
                                              disabled={
                                                actualizarInscriptoMutation.isPending ||
                                                cphData.ordenMeritoConfirmado
                                              }
                                              onBlur={(e) => {
                                                const raw = e.target.value
                                                let val = raw === '' ? null : Number(raw)
                                                if (val != null) val = Math.min(10, Math.max(0, val))
                                                if (val === (ins.nota ?? null)) return
                                                // Solo guarda la nota. El orden de mérito NO se
                                                // recalcula en vivo — se arma recién al apretar
                                                // «Cargar notas / calcular orden» más abajo.
                                                actualizarInscriptoMutation.mutate({
                                                  inscriptoId: ins.id,
                                                  body: { nota: val },
                                                })
                                              }}
                                              title="Nota del examen (0-10). El orden de mérito se calcula con el botón «Cargar notas / calcular orden»."
                                            />
                                          ) : (
                                            <span className="text-gray-300">—</span>
                                          )}
                                        </td>
                                        <td className="py-2 pr-3 text-center">
                                          {ins.presentoExamen ? (
                                            <span
                                              className={`font-semibold ${
                                                ins.ordenMerito != null
                                                  ? 'text-gray-800'
                                                  : 'text-gray-300'
                                              }`}
                                              title="Calculado automáticamente a partir de la nota"
                                            >
                                              {ins.ordenMerito ?? '—'}
                                            </span>
                                          ) : (
                                            <span className="text-gray-300">—</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Acciones de confirmación: presentados y orden de mérito
                            (debajo de la tabla, arriba de Declarar desierto) */}
                        {cphData && (
                          <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-4 space-y-3">
                            {/* Presentados */}
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <div>
                                <p className="text-sm font-semibold text-indigo-900">
                                  Presentados al examen
                                </p>
                                <p className="text-xs text-indigo-600 mt-0.5">
                                  {cphData.presentadosConfirmados
                                    ? 'Confirmado — la marca de presentes quedó fija.'
                                    : 'Marcá en la tabla quién se presentó y confirmá para congelar la lista.'}
                                </p>
                              </div>
                              {cphData.presentadosConfirmados ? (
                                <button
                                  className="btn-outline text-sm"
                                  disabled={
                                    revertirPresentadosMutation.isPending ||
                                    cphData.ordenMeritoConfirmado
                                  }
                                  onClick={async () => {
                                    if (
                                      await confirm({
                                        titulo: 'Revertir presentados',
                                        mensaje:
                                          'Vas a poder volver a editar quién se presentó. ¿Continuar?',
                                      })
                                    )
                                      revertirPresentadosMutation.mutate()
                                  }}
                                >
                                  ↩ Revertir presentados
                                </button>
                              ) : (
                                <button
                                  className="btn-primary text-sm"
                                  disabled={confirmarPresentadosMutation.isPending}
                                  onClick={async () => {
                                    if (
                                      await confirm({
                                        titulo: 'Confirmar presentados',
                                        mensaje:
                                          'Se congelará quién se presentó al examen (no se podrá editar luego). ¿Confirmar?',
                                      })
                                    )
                                      confirmarPresentadosMutation.mutate(undefined, {
                                        onError: (e) =>
                                          toast.error(
                                            (
                                              e as {
                                                response?: {
                                                  data?: { error?: { message?: string } }
                                                }
                                              }
                                            )?.response?.data?.error?.message ??
                                              'No se pudo confirmar.',
                                          ),
                                      })
                                  }}
                                >
                                  ✓ Confirmar presentados
                                </button>
                              )}
                            </div>

                            <div className="h-px bg-indigo-100" />

                            {/* Orden de mérito */}
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <div>
                                <p className="text-sm font-semibold text-indigo-900">
                                  Orden de mérito
                                </p>
                                <p className="text-xs text-indigo-600 mt-0.5">
                                  {cphData.ordenMeritoConfirmado
                                    ? 'Confirmado — el ranking quedó fijo y se generó el acta.'
                                    : 'Asigná la posición a cada presentado y confirmá (la fecha se toma de hoy).'}
                                </p>
                              </div>
                              {cphData.ordenMeritoConfirmado ? (
                                <button
                                  className="btn-outline text-sm"
                                  disabled={revertirOrdenMeritoMutation.isPending}
                                  onClick={async () => {
                                    if (
                                      await confirm({
                                        titulo: 'Revertir orden de mérito',
                                        mensaje:
                                          'El ranking volverá a ser editable y se quitará la fecha de orden de mérito. ¿Continuar?',
                                      })
                                    )
                                      revertirOrdenMeritoMutation.mutate()
                                  }}
                                >
                                  ↩ Revertir orden de mérito
                                </button>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <button
                                    className="btn-outline text-sm"
                                    disabled={actualizarInscriptoMutation.isPending}
                                    title="Recalcula la posición de todos a partir de las notas cargadas (por si alguna nota se cargó sin pasar por acá, ej. importada)"
                                    onClick={() => {
                                      const ranking = calcularOrdenMerito(inscriptos)
                                      let cambios = 0
                                      inscriptos.forEach((i) => {
                                        const nuevoOrden = ranking.get(i.id) ?? null
                                        if (nuevoOrden !== (i.ordenMerito ?? null)) {
                                          cambios++
                                          actualizarInscriptoMutation.mutate({
                                            inscriptoId: i.id,
                                            body: { ordenMerito: nuevoOrden },
                                          })
                                        }
                                      })
                                      toast.success(
                                        cambios > 0
                                          ? `Orden de mérito recalculado — ${cambios} posición(es) actualizada(s).`
                                          : 'El orden de mérito ya está al día con las notas cargadas.',
                                      )
                                    }}
                                  >
                                    📊 Cargar notas / calcular orden
                                  </button>
                                  <button
                                    className="btn-primary text-sm"
                                    disabled={
                                      confirmarOrdenMeritoMutation.isPending ||
                                      !cphData.presentadosConfirmados
                                    }
                                    title={
                                      !cphData.presentadosConfirmados
                                        ? 'Confirmá primero los presentados'
                                        : undefined
                                    }
                                    onClick={async () => {
                                      if (
                                        await confirm({
                                          titulo: 'Confirmar orden de mérito',
                                          mensaje:
                                            'Se fijará el ranking, la fecha de orden de mérito será hoy y se habilitará el acta. ¿Confirmar?',
                                        })
                                      )
                                        confirmarOrdenMeritoMutation.mutate(undefined, {
                                          onError: (e) =>
                                            toast.error(
                                              (
                                                e as {
                                                  response?: {
                                                    data?: { error?: { message?: string } }
                                                  }
                                                }
                                              )?.response?.data?.error?.message ??
                                                'No se pudo confirmar.',
                                            ),
                                        })
                                    }}
                                  >
                                    ✓ Confirmar orden de mérito
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              ) : etapa.id === 'ifacs_insal' ? (
                (() => {
                  // Guardado habilitado solo si hay algo cargado Y difiere de lo
                  // persistido (si ya está guardado igual, se deshabilita).
                  const ifacsGuardado = {
                    ifacs: cphData?.ifacs ?? '',
                    fechaIfacs: cphData?.fechaIfacs?.slice(0, 10) ?? '',
                  }
                  const insalGuardado = {
                    insal: cphData?.insal ?? '',
                    fechaInsal: cphData?.fechaInsal?.slice(0, 10) ?? '',
                  }
                  const ifacsVacio = !ifacsForm.ifacs.trim() && !ifacsForm.fechaIfacs
                  const insalVacio = !insalForm.insal.trim() && !insalForm.fechaInsal
                  const ifacsSinCambios =
                    ifacsForm.ifacs === ifacsGuardado.ifacs &&
                    ifacsForm.fechaIfacs === ifacsGuardado.fechaIfacs
                  const insalSinCambios =
                    insalForm.insal === insalGuardado.insal &&
                    insalForm.fechaInsal === insalGuardado.fechaInsal
                  return (
                    <div className="space-y-5">
                      {/* IFACS */}
                      <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
                        <p className="text-sm font-semibold text-gray-800 mb-3">IFACS</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                              Expediente IFACS
                            </label>
                            <input
                              type="text"
                              value={ifacsForm.ifacs}
                              onChange={(e) =>
                                setIfacsForm((f) => ({ ...f, ifacs: e.target.value }))
                              }
                              className="input h-10 w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                              Fecha IFACS <span className="text-danger">*</span>
                            </label>
                            <input
                              type="date"
                              value={ifacsForm.fechaIfacs}
                              onChange={(e) =>
                                setIfacsForm((f) => ({ ...f, fechaIfacs: e.target.value }))
                              }
                              className="input h-10 w-full"
                            />
                          </div>
                        </div>
                        <button
                          className="btn-primary text-sm mt-3 whitespace-nowrap"
                          disabled={patchMutation.isPending || ifacsVacio || ifacsSinCambios}
                          onClick={() =>
                            patchMutation.mutate(
                              {
                                ifacs: ifacsForm.ifacs || null,
                                fechaIfacs: ifacsForm.fechaIfacs || null,
                              },
                              {
                                onSuccess: () => toast.success('IFACS guardado.'),
                                onError: (e) =>
                                  toast.error(
                                    (
                                      e as {
                                        response?: { data?: { error?: { message?: string } } }
                                      }
                                    )?.response?.data?.error?.message ??
                                      'No se pudo guardar IFACS.',
                                  ),
                              },
                            )
                          }
                        >
                          {ifacsSinCambios && !ifacsVacio ? '✓ IFACS guardado' : '💾 Guardar IFACS'}
                        </button>
                      </div>

                      {/* Proponer candidato para el INSAL — NO es la designación
                          oficial (esa es en Etapa 5). Solo elige a quién notificar. */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Persona propuesta para el INSAL
                        </label>
                        {cphData && cphData.estado !== 'finalizado' && !inscriptoReservado && (
                          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-center justify-between gap-4">
                            <div>
                              <p className="text-sm font-semibold text-blue-800">
                                Proponer candidato
                              </p>
                              <p className="text-xs text-blue-600 mt-0.5">
                                Elegí a quién notificar por INSAL. La designación oficial del
                                cargo se hace en la Etapa 5, no acá.
                              </p>
                            </div>
                            <button
                              className="btn-primary text-sm shrink-0"
                              onClick={() => {
                                setModalDesignarModo('proponer')
                                setModalDesignar(true)
                              }}
                            >
                              👤 Elegir candidato
                            </button>
                          </div>
                        )}
                        {inscriptoReservado && (
                          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-green-600 text-sm">✓</span>
                              <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                                Reservado del orden de mérito
                              </span>
                            </div>
                            <p className="text-sm font-bold text-gray-900">
                              {inscriptoReservado.apellido}, {inscriptoReservado.nombre}
                            </p>
                            <p className="text-xs text-gray-500">
                              CUIL:{' '}
                              <span className="font-mono text-gray-700">
                                {inscriptoReservado.cuil ?? '—'}
                              </span>
                            </p>
                            {inscriptoReservado.especialidad && (
                              <p className="text-xs text-gray-500">
                                🩺 {inscriptoReservado.especialidad}
                              </p>
                            )}
                            <div className="pt-1">
                              <button
                                className="text-xs text-gray-500 underline hover:text-gray-700 disabled:opacity-50"
                                disabled={patchMutation.isPending}
                                onClick={() =>
                                  patchMutation.mutate(
                                    { inscriptoReservadoId: null, insalAceptado: null },
                                    {
                                      onSuccess: () =>
                                        toast.success('Reserva quitada — elegí otro candidato.'),
                                    },
                                  )
                                }
                              >
                                Cambiar candidato
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* INSAL */}
                      <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
                        <p className="text-sm font-semibold text-gray-800 mb-3">INSAL</p>
                        {!inscriptoReservado && (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 mb-3">
                            ⚠ Reservá al candidato (arriba) antes de cargar el expediente
                            INSAL — es la notificación al ganador del concurso.
                          </p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                              Expediente INSAL
                            </label>
                            <input
                              type="text"
                              value={insalForm.insal}
                              onChange={(e) =>
                                setInsalForm((f) => ({ ...f, insal: e.target.value }))
                              }
                              disabled={!inscriptoReservado}
                              className="input h-10 w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                              Fecha INSAL <span className="text-danger">*</span>
                            </label>
                            <input
                              type="date"
                              value={insalForm.fechaInsal}
                              onChange={(e) =>
                                setInsalForm((f) => ({ ...f, fechaInsal: e.target.value }))
                              }
                              disabled={!inscriptoReservado}
                              className="input h-10 w-full"
                            />
                          </div>
                        </div>
                        <button
                          className="btn-primary text-sm mt-3 whitespace-nowrap"
                          disabled={
                            patchMutation.isPending ||
                            insalVacio ||
                            insalSinCambios ||
                            !inscriptoReservado
                          }
                          title={
                            !inscriptoReservado
                              ? 'Reservá primero al candidato'
                              : undefined
                          }
                          onClick={() =>
                            patchMutation.mutate(
                              {
                                insal: insalForm.insal || null,
                                fechaInsal: insalForm.fechaInsal || null,
                              },
                              {
                                onSuccess: () => toast.success('INSAL guardado.'),
                                onError: (e) =>
                                  toast.error(
                                    (
                                      e as {
                                        response?: { data?: { error?: { message?: string } } }
                                      }
                                    )?.response?.data?.error?.message ??
                                      'No se pudo guardar INSAL.',
                                  ),
                              },
                            )
                          }
                        >
                          {insalSinCambios && !insalVacio ? '✓ INSAL guardado' : '💾 Guardar INSAL'}
                        </button>
                      </div>

                      {/* ¿Aceptó el cargo? — solo tiene sentido una vez que hay alguien
                          propuesto y el expediente INSAL está cargado. Si acepta, no hay
                          más que hacer acá (ya puede avanzar a Etapa 5 a designarlo
                          oficialmente). Si no acepta, se lo excluye del orden de mérito
                          para este concurso y hay que elegir a otro candidato. */}
                      {inscriptoReservado && cphData?.insal && (
                        <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
                          <p className="text-sm font-semibold text-gray-800 mb-1">
                            ¿{inscriptoReservado.apellido}, {inscriptoReservado.nombre} aceptó el
                            cargo?
                          </p>
                          {cphData?.insalAceptado === true ? (
                            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 flex items-center justify-between gap-3">
                              <p className="text-sm text-green-700">
                                ✓ Aceptó el cargo — ya podés continuar a la Etapa 5 para
                                registrar la designación oficial.
                              </p>
                              <button
                                className="btn-outline text-xs shrink-0"
                                disabled={patchMutation.isPending}
                                onClick={() => patchMutation.mutate({ insalAceptado: null })}
                              >
                                Deshacer
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                className="btn-primary text-sm"
                                disabled={patchMutation.isPending}
                                onClick={() =>
                                  patchMutation.mutate(
                                    { insalAceptado: true },
                                    { onSuccess: () => toast.success('Cargo aceptado.') },
                                  )
                                }
                              >
                                ✅ Cargo aceptado
                              </button>
                              <button
                                className="btn-outline text-sm text-danger border-red-200 hover:bg-red-50"
                                disabled={patchMutation.isPending}
                                onClick={async () => {
                                  if (
                                    !(await confirm({
                                      titulo: 'No aceptó el cargo',
                                      mensaje: `${inscriptoReservado.apellido}, ${inscriptoReservado.nombre} queda excluido/a del orden de mérito de este concurso y vas a tener que elegir a otro candidato. ¿Continuar?`,
                                      peligro: true,
                                      confirmLabel: 'No aceptó',
                                    }))
                                  )
                                    return
                                  // El inscripto rechazado ES el reservado: se limpia la
                                  // reserva y se lo agrega a insalRechazados para no volver
                                  // a ofrecerlo en el orden de mérito.
                                  patchMutation.mutate(
                                    {
                                      insalAceptado: null,
                                      inscriptoReservadoId: null,
                                      insalRechazados: [
                                        ...insalRechazados,
                                        inscriptoReservado.id,
                                      ],
                                    },
                                    {
                                      onSuccess: () => {
                                        setDesignarInscriptoId('')
                                        toast.success(
                                          'Registrado — elegí a otro candidato del orden de mérito.',
                                        )
                                      },
                                    },
                                  )
                                }}
                              >
                                ❌ No aceptó
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  )
                })()
              ) : etapa.id === 'designacion' ? (
                (() => {
                  const bloqueada =
                    etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'
                  // Registra un solo campo en el backend (PATCH). El sub-estado
                  // se recalcula solo, así que la etapa avanza paso a paso.
                  const registrarPaso = (
                    campos: Record<string, unknown>,
                    okMsg: string,
                  ) =>
                    patchMutation.mutate(campos, {
                      onSuccess: () => toast.success(okMsg),
                      onError: (e) =>
                        toast.error(
                          (e as { response?: { data?: { error?: { message?: string } } } })
                            ?.response?.data?.error?.message ?? 'No se pudo registrar el paso.',
                        ),
                    })
                  const v = designacionEstado
                  const val = v?.validacion
                  const cfg =
                    val?.estado === 'validado'
                      ? { cls: 'bg-green-50 border-green-200 text-green-800', icon: '✅', t: 'Asignación validada' }
                      : val?.estado === 'rol_no_coincide'
                        ? { cls: 'bg-amber-50 border-amber-200 text-amber-800', icon: '⚠️', t: 'Rol del padrón no coincide' }
                        : val?.estado === 'esperando_padron'
                          ? { cls: 'bg-blue-50 border-blue-200 text-blue-800', icon: '⏳', t: 'A la espera del padrón' }
                          : { cls: 'bg-blue-50 border-blue-200 text-blue-800', icon: '⏳', t: 'Persona no encontrada en el padrón' }
                  const ocup = v?.ocupacionVigente ?? v?.ultimaOcupacion ?? null
                  return (
                    <div className="space-y-5">
                      {/* ── ARRIBA: detalle informativo de la persona ── */}
                      {v && (
                        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                          <div className={`px-4 py-3 border-b ${cfg.cls}`}>
                            <div className="flex items-center gap-2">
                              <span>{cfg.icon}</span>
                              <span className="text-sm font-semibold">{cfg.t}</span>
                            </div>
                            {val?.mensaje && <p className="text-xs mt-1">{val.mensaje}</p>}
                            {val?.idSialRolValidado && (
                              <p className="text-xs mt-1">
                                ID SIAL Rol validado:{' '}
                                <span className="font-mono font-semibold">
                                  {val.idSialRolValidado}
                                </span>
                              </p>
                            )}
                          </div>
                          {v.persona ? (
                            <div className="px-4 py-3 space-y-2">
                              <p className="text-sm font-bold text-gray-900">
                                {v.persona.apellidoNombre}
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                                <p>
                                  CUIL:{' '}
                                  <span className="font-mono text-gray-800">{v.persona.cuil}</span>
                                </p>
                                {v.persona.numeroDoc && (
                                  <p>
                                    {v.persona.tipoDoc ?? 'DNI'}:{' '}
                                    <span className="text-gray-800">{v.persona.numeroDoc}</span>
                                  </p>
                                )}
                                {v.persona.especialidadCph && (
                                  <p>
                                    Especialidad CPH:{' '}
                                    <span className="text-gray-800">
                                      {v.persona.especialidadCph}
                                    </span>
                                  </p>
                                )}
                                {v.persona.especialidadPrincipal && (
                                  <p>
                                    Especialidad principal:{' '}
                                    <span className="text-gray-800">
                                      {v.persona.especialidadPrincipal}
                                    </span>
                                  </p>
                                )}
                                {v.persona.mailLaboral && (
                                  <p>
                                    Mail laboral:{' '}
                                    <span className="text-gray-800">{v.persona.mailLaboral}</span>
                                  </p>
                                )}
                                {v.persona.telefono && (
                                  <p>
                                    Tel:{' '}
                                    <span className="text-gray-800">{v.persona.telefono}</span>
                                  </p>
                                )}
                                {(v.persona.domicilio ||
                                  v.persona.localidad ||
                                  v.persona.provincia) && (
                                  <p className="sm:col-span-2">
                                    Domicilio:{' '}
                                    <span className="text-gray-800">
                                      {[
                                        v.persona.domicilio,
                                        v.persona.localidad,
                                        v.persona.provincia,
                                      ]
                                        .filter(Boolean)
                                        .join(', ')}
                                    </span>
                                  </p>
                                )}
                                <p>
                                  Estado:{' '}
                                  <span className="text-gray-800">
                                    {v.persona.activo ? 'Activo' : 'Inactivo'}
                                  </span>
                                </p>
                              </div>
                              {ocup && (
                                <div className="pt-2 border-t border-gray-100 space-y-1">
                                  <p className="text-xs font-semibold text-gray-700">
                                    {v.ocupacionVigente ? 'Cargo actual' : 'Último cargo'}
                                    {!v.ocupacionVigente && ocup.hasta && (
                                      <span className="font-normal text-gray-400">
                                        {' '}
                                        (hasta {ocup.hasta.slice(0, 10)})
                                      </span>
                                    )}
                                  </p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                                    <p>
                                      ID SIAL Rol:{' '}
                                      <span className="font-mono text-gray-800">
                                        {ocup.idSialRol}
                                      </span>
                                    </p>
                                    <p>
                                      Cargo:{' '}
                                      <span className="text-gray-800">
                                        {ocup.cargoCodigo ?? ocup.cargoIdSial}
                                      </span>
                                    </p>
                                    {ocup.literalPuesto && (
                                      <p>
                                        Puesto:{' '}
                                        <span className="text-gray-800">{ocup.literalPuesto}</span>
                                      </p>
                                    )}
                                    {ocup.escalafonNombre && (
                                      <p>
                                        Carrera:{' '}
                                        <span className="text-gray-800">
                                          {ocup.escalafonNombre}
                                        </span>
                                      </p>
                                    )}
                                    {ocup.especialidadLegacy && (
                                      <p>
                                        Especialidad:{' '}
                                        <span className="text-gray-800">
                                          {ocup.especialidadLegacy}
                                        </span>
                                      </p>
                                    )}
                                    {ocup.hospitalSigla && (
                                      <p>
                                        Hospital:{' '}
                                        <span className="text-gray-800">{ocup.hospitalSigla}</span>
                                      </p>
                                    )}
                                    <p>
                                      Estado del cargo:{' '}
                                      <span className="text-gray-800">{ocup.cargoEstado}</span>
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5 pt-1">
                                    {(ocup.situacionRevista ?? '')
                                      .toLowerCase()
                                      .includes('reten') && (
                                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                        🔶 Retención de cargo
                                      </span>
                                    )}
                                    <span
                                      className={`text-[11px] px-2 py-0.5 rounded-full border ${
                                        ocup.carreraCoincide
                                          ? 'bg-green-100 text-green-800 border-green-200'
                                          : 'bg-gray-100 text-gray-600 border-gray-200'
                                      }`}
                                    >
                                      Carrera {ocup.carreraCoincide ? '✓' : '✗'}
                                    </span>
                                    <span
                                      className={`text-[11px] px-2 py-0.5 rounded-full border ${
                                        ocup.especialidadCoincide
                                          ? 'bg-green-100 text-green-800 border-green-200'
                                          : 'bg-gray-100 text-gray-600 border-gray-200'
                                      }`}
                                    >
                                      Especialidad {ocup.especialidadCoincide ? '✓' : '✗'}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : v.inscripto ? (
                            <div className="px-4 py-3 space-y-2">
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                                Datos del orden de mérito
                              </p>
                              <p className="text-sm font-bold text-gray-900">
                                {v.inscripto.apellido}, {v.inscripto.nombre}
                              </p>
                              <p className="text-xs text-gray-600">
                                CUIL:{' '}
                                <span className="font-mono text-gray-800">
                                  {v.inscripto.cuil ?? '—'}
                                </span>
                              </p>
                              <p className="text-xs text-gray-400">
                                Todavía no figura en el padrón — a la espera del archivo semanal.
                              </p>
                            </div>
                          ) : (
                            <div className="px-4 py-3 text-xs text-gray-500">
                              {v.cuil ? (
                                <>
                                  CUIL del ganador:{' '}
                                  <span className="font-mono text-gray-700">{v.cuil}</span> —
                                  todavía no figura en el padrón.
                                </>
                              ) : (
                                'Todavía no hay un candidato reservado ni designado para este concurso.'
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── ABAJO: pasos de designación, cada uno con su botón ── */}
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-gray-800">
                          Pasos de la designación
                        </p>

                        {/* EE de designación (TAD) */}
                        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-end gap-3">
                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-semibold text-gray-600 mb-1">
                              EE de designación (TAD)
                            </label>
                            <input
                              type="text"
                              value={desigForm.eeDesignacion}
                              disabled={bloqueada}
                              onChange={(e) =>
                                setDesigForm((f) => ({ ...f, eeDesignacion: e.target.value }))
                              }
                              className="input h-10 w-full"
                            />
                          </div>
                          <button
                            className="btn-primary text-sm shrink-0"
                            disabled={bloqueada || patchMutation.isPending}
                            onClick={() =>
                              registrarPaso(
                                { eeDesignacion: desigForm.eeDesignacion || null },
                                'EE de designación registrado.',
                              )
                            }
                          >
                            Registrar
                          </button>
                        </div>

                        {/* Carga de documentación */}
                        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex items-center justify-between gap-3">
                          <label className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              className="checkbox"
                              checked={desigForm.cargaDocumentacion}
                              disabled={bloqueada}
                              onChange={(e) =>
                                setDesigForm((f) => ({
                                  ...f,
                                  cargaDocumentacion: e.target.checked,
                                }))
                              }
                            />
                            Carga de documentación
                          </label>
                          <button
                            className="btn-primary text-sm shrink-0"
                            disabled={bloqueada || patchMutation.isPending}
                            onClick={() =>
                              registrarPaso(
                                { cargaDocumentacion: desigForm.cargaDocumentacion },
                                'Carga de documentación registrada.',
                              )
                            }
                          >
                            Registrar
                          </button>
                        </div>

                        {/* Fecha apto médico */}
                        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-end gap-3">
                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-semibold text-gray-600 mb-1">
                              Fecha apto médico
                            </label>
                            <input
                              type="date"
                              value={desigForm.fechaAptoMedico}
                              disabled={bloqueada}
                              onChange={(e) =>
                                setDesigForm((f) => ({ ...f, fechaAptoMedico: e.target.value }))
                              }
                              className="input h-10 w-full"
                            />
                          </div>
                          <button
                            className="btn-primary text-sm shrink-0"
                            disabled={bloqueada || patchMutation.isPending}
                            onClick={() =>
                              registrarPaso(
                                { fechaAptoMedico: desigForm.fechaAptoMedico || null },
                                'Fecha de apto médico registrada.',
                              )
                            }
                          >
                            Registrar
                          </button>
                        </div>

                        {/* Fecha ITE */}
                        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-end gap-3">
                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-semibold text-gray-600 mb-1">
                              Fecha ITE
                            </label>
                            <input
                              type="date"
                              value={desigForm.fechaIte}
                              disabled={bloqueada}
                              onChange={(e) =>
                                setDesigForm((f) => ({ ...f, fechaIte: e.target.value }))
                              }
                              className="input h-10 w-full"
                            />
                          </div>
                          <button
                            className="btn-primary text-sm shrink-0"
                            disabled={bloqueada || patchMutation.isPending}
                            onClick={() =>
                              registrarPaso(
                                { fechaIte: desigForm.fechaIte || null },
                                'Fecha ITE registrada.',
                              )
                            }
                          >
                            Registrar
                          </button>
                        </div>

                        {/* Proyecto de resolución */}
                        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex items-center justify-between gap-3">
                          <label className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              className="checkbox"
                              checked={desigForm.proyectoResolucion}
                              disabled={bloqueada}
                              onChange={(e) =>
                                setDesigForm((f) => ({
                                  ...f,
                                  proyectoResolucion: e.target.checked,
                                }))
                              }
                            />
                            Proyecto de resolución
                          </label>
                          <button
                            className="btn-primary text-sm shrink-0"
                            disabled={bloqueada || patchMutation.isPending}
                            onClick={() =>
                              registrarPaso(
                                { proyectoResolucion: desigForm.proyectoResolucion },
                                'Proyecto de resolución registrado.',
                              )
                            }
                          >
                            Registrar
                          </button>
                        </div>

                        {/* Reso a la firma */}
                        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex items-center justify-between gap-3">
                          <label className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              className="checkbox"
                              checked={desigForm.resoALaFirma}
                              disabled={bloqueada}
                              onChange={(e) =>
                                setDesigForm((f) => ({ ...f, resoALaFirma: e.target.checked }))
                              }
                            />
                            Reso a la firma
                          </label>
                          <button
                            className="btn-primary text-sm shrink-0"
                            disabled={bloqueada || patchMutation.isPending}
                            onClick={() =>
                              registrarPaso(
                                { resoALaFirma: desigForm.resoALaFirma },
                                'Reso a la firma registrada.',
                              )
                            }
                          >
                            Registrar
                          </button>
                        </div>

                        {/* Resolución de designación + fecha */}
                        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-end gap-3">
                          <div className="flex-1 min-w-[180px]">
                            <label className="block text-xs font-semibold text-gray-600 mb-1">
                              Resolución de designación
                            </label>
                            <input
                              type="text"
                              value={desigForm.resolucionDesignacion}
                              disabled={bloqueada}
                              onChange={(e) =>
                                setDesigForm((f) => ({
                                  ...f,
                                  resolucionDesignacion: e.target.value,
                                }))
                              }
                              className="input h-10 w-full"
                            />
                          </div>
                          <div className="min-w-[160px]">
                            <label className="block text-xs font-semibold text-gray-600 mb-1">
                              Fecha de resolución
                            </label>
                            <input
                              type="date"
                              value={desigForm.fechaResolucion}
                              disabled={bloqueada}
                              onChange={(e) =>
                                setDesigForm((f) => ({ ...f, fechaResolucion: e.target.value }))
                              }
                              className="input h-10 w-full"
                            />
                          </div>
                          <button
                            className="btn-primary text-sm shrink-0"
                            disabled={bloqueada || patchMutation.isPending}
                            onClick={() =>
                              registrarPaso(
                                {
                                  resolucionDesignacion: desigForm.resolucionDesignacion || null,
                                  fechaResolucion: desigForm.fechaResolucion || null,
                                },
                                'Resolución de designación registrada.',
                              )
                            }
                          >
                            Registrar
                          </button>
                        </div>

                        {/* Cargo SIAL (alta) */}
                        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-end gap-3">
                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-semibold text-gray-600 mb-1">
                              Cargo SIAL (alta)
                            </label>
                            <input
                              type="text"
                              value={desigForm.cargoSial}
                              disabled={bloqueada}
                              onChange={(e) =>
                                setDesigForm((f) => ({ ...f, cargoSial: e.target.value }))
                              }
                              className="input h-10 w-full"
                            />
                          </div>
                          <button
                            className="btn-primary text-sm shrink-0"
                            disabled={bloqueada || patchMutation.isPending}
                            onClick={() =>
                              registrarPaso(
                                { cargoSial: desigForm.cargoSial || null },
                                'Cargo SIAL registrado.',
                              )
                            }
                          >
                            Registrar
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })()
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {etapa.campos.map((campo) => {
                    // sorteoJurado: el CSV solo tiene bool — si el concurso ya superó
                    // ese paso pero no hay fecha, mostramos un hint
                    const sorteoSinFecha =
                      campo.key === 'sorteoJurado' &&
                      !campo.valor &&
                      cphData &&
                      [
                        'C-DISPO DE LLAMADO',
                        'C2-INSCRIPCION EX',
                        'D-EXAMEN PUBLICADO',
                        'E-ORDEN DE MERITO',
                        'F-IFACS',
                        'G-INSAL',
                        'H-TAD',
                        'I-CARGA DOCU',
                        'J-APTO MED',
                        'K-ITE',
                        'L-PYCTO DE RESO',
                        'M-RESO A LA FIRMA',
                        'N-DESIGNADO',
                        'O-ALTA SIAL',
                      ].includes(cphData.subEstado ?? '')

                    return (
                      <div
                        key={campo.key}
                        className={campo.tipo === 'textarea' ? 'sm:col-span-2' : ''}
                      >
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          {campo.label}
                          {campo.requerido && <span className="text-danger ml-1">*</span>}
                          {sorteoSinFecha && (
                            <span className="ml-2 text-xs font-normal text-amber-600">
                              ⚠ realizado, fecha pendiente
                            </span>
                          )}
                        </label>
                        {campo.tipo === 'checkbox' ? (
                          <div className="flex items-center gap-2 h-10">
                            <input
                              type="checkbox"
                              defaultChecked={campo.valor as boolean}
                              data-key={campo.key}
                              className="checkbox"
                              disabled={
                                campo.readonly ||
                                etapa.estado === 'pendiente' ||
                                etapa.estado === 'bloqueada'
                              }
                            />
                            <span className="text-sm text-gray-500">Sí</span>
                          </div>
                        ) : campo.tipo === 'textarea' ? (
                          <textarea
                            defaultValue={campo.valor as string}
                            data-key={campo.key}
                            rows={3}
                            className="input w-full py-2"
                            disabled={
                              campo.readonly ||
                              etapa.estado === 'pendiente' ||
                              etapa.estado === 'bloqueada'
                            }
                          />
                        ) : (
                          <input
                            type={campo.tipo === 'fecha' ? 'date' : 'text'}
                            defaultValue={campo.valor as string}
                            data-key={campo.key}
                            className={`input h-10 w-full ${campo.readonly ? 'bg-gray-50 text-gray-500' : ''}`}
                            readOnly={campo.readonly}
                            disabled={
                              !campo.readonly &&
                              (etapa.estado === 'pendiente' || etapa.estado === 'bloqueada')
                            }
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Etapa 3: se puede declarar desierta la ronda — relanza el concurso
                  (vuelve a la Etapa 1 para reiniciar el proceso). */}
              {etapa.id === 'inscripcion' && cphData && cphData.estado !== 'finalizado' && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-red-800">Declarar ronda desierta</p>
                    <p className="text-xs text-red-600 mt-0.5">
                      Registra la ronda como desierta, guarda el historial y relanza el concurso
                      desde la Etapa 1.
                    </p>
                  </div>
                  <button
                    className="btn-danger text-sm shrink-0"
                    onClick={() => setModalDesierto(true)}
                  >
                    Declarar desierto
                  </button>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Observaciones
                </label>
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
                {etapaActiva === 'autorizacion' && faltantesEtapa2.length > 0 && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 max-w-md">
                    <span className="font-semibold">Falta para avanzar a la etapa 3:</span>{' '}
                    {faltantesEtapa2.join(' · ')}
                  </div>
                )}
                {etapaActiva === 'inscripcion' && faltantesEtapa3.length > 0 && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 max-w-md">
                    <span className="font-semibold">Falta para avanzar a la etapa 4:</span>{' '}
                    {faltantesEtapa3.join(' · ')}
                  </div>
                )}
                {etapaActiva === 'ifacs_insal' && faltantesEtapa4.length > 0 && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 max-w-md">
                    <span className="font-semibold">Falta para avanzar a la etapa 5:</span>{' '}
                    {faltantesEtapa4.join(' · ')}
                  </div>
                )}
                {guardado &&
                  faltantesEtapa2.length === 0 &&
                  faltantesEtapa3.length === 0 &&
                  faltantesEtapa4.length === 0 && (
                    <span className="text-sm text-green-600 font-medium">✓ Guardado</span>
                  )}
                {etapa.estado !== 'pendiente' &&
                  etapa.estado !== 'bloqueada' &&
                  etapa.estado !== 'completada' && (
                    <>
                      {etapaActiva === 'baja' && !etapaBajaCompleta && (
                        <span className="text-xs text-gray-400">
                          Completá expediente, sigla, escalafón, puesto
                          {especialidadesDisponibles.length > 0 ? ' y especialidad' : ''}
                        </span>
                      )}
                      <button
                        className="btn-primary"
                        disabled={
                          (pendienteAutorizacion && etapaActiva === 'baja') || !etapaBajaCompleta
                        }
                        title={
                          pendienteAutorizacion && etapaActiva === 'baja'
                            ? 'Hay una modificación pendiente de autorización por SGRASV'
                            : !etapaBajaCompleta
                              ? 'Completá todos los campos requeridos'
                              : undefined
                        }
                        onClick={handleGuardar}
                      >
                        {etapa.numero < etapasActuales.length
                          ? 'Guardar y continuar →'
                          : 'Guardar cambios'}
                      </button>
                    </>
                  )}
              </div>
            </div>
          </div>

          {/* Historial */}
          <HistorialCambios cphData={cphData} juradoData={juradoData} />
        </div>

        {/* Columna derecha — panel de estado sticky */}
        <PanelSubEstados
          currentIdx={currentIdxDinamico}
          pendienteAutorizacion={pendienteAutorizacion}
        />
      </div>
    </div>
  )
}
