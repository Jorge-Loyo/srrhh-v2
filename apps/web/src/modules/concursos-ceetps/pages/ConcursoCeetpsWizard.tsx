// Wizard de seguimiento de un concurso CEETPS — RÉPLICA del wizard CPH
// (concursos-cph/pages/ConcursoCphWizard.tsx) que se abre desde la bandeja de
// Gestión de Cargos. Diferencias con el original:
//  - Carga el concurso CEETPS y lo adapta a la forma ConcursoCph (ceetpsComoCph);
//    al guardar traduce los campos a los de CEETPS (cphPatchACeetps).
//  - Dos entradas: desde Gestión de Cargos (/concursos/ceetps/:id/wizard) se
//    ven las 5 etapas; desde el módulo Concursos CEETPS (/concursos/ceetps/:id/etapas)
//    a partir de la etapa 2, que es cuando el concurso pasa a CEETPS.
//  - Los hooks vienen de ../hooks/useCeetpsWizard: mismos nombres que los de CPH;
//    lo que CEETPS todavía no tiene en el backend (jurado, inscriptos, OM,
//    desierto) queda vacío / avisa "no disponible". Se adapta etapa por etapa.

import { CLASE_MAYUSCULAS, alEscribirMayusculas } from '../lib/mayusculas'
import { useState, useMemo, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
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
  getCasoCeetps,
  exportCeetpsPdf,
  exportOrdenMeritoPdf,
} from '@/shared/lib/exportConcursoDocs'
import { aplanarFechasCeetps, errorEnCadenaFechas, esEscalafonCph } from '@srrhh/types'
import type { ConcursoCeetps } from '@srrhh/types'
import { CEETPS_WIZARD_KEY } from '../hooks/useCeetpsWizard'
import { ceetpsComoCph, cphPatchACeetps } from '../lib/ceetpsComoCph'
import { camposDesignacion, designacionCompleta, desigFormDesde } from '../lib/designacionCampos'
import { DesignacionCeetps } from '../components/DesignacionCeetps'
import { pasoActual } from '../lib/pasosVista'
import { useAuth } from '@/modules/auth/hooks/useAuth'
import { can } from '@/shared/lib/can'
import { CorregirTipoControl } from '@/modules/concursos-cph/components/CorregirTipoControl'
import { etapa1CompletaParaAutorizar, puedeCorregirTipo } from '@/modules/concursos-cph/lib/corregirTipo'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import { motivoConcursoLabel } from '@/modules/cargos/lib/bajasHelpers'
import { documentoOrigenDeConcurso } from '@/modules/concursos-cph/lib/documentoOrigen'
import {
  useDesignarConcursoCph,
  useAsignarDesignadoCph,
  useDeclararDesiertoCph,
  useSuspenderConcursoCph,
  useJuradoCeetps,
  useInscriptosCeetps,
  useDesignacionEstado,
} from '../hooks/useCeetpsWizard'
import { JuradoAsignacionPanel } from '../components/JuradoAsignacionPanel'
import { CronogramaCeetps } from '../components/CronogramaCeetps'
import { InscriptosCeetpsPanel } from '../components/InscriptosCeetpsPanel'
import { faltantesJurado, juradoCompleto } from '../lib/juradoCeetps'
import {
  faltantesEtapa3 as faltantesPasosEtapa3,
  inscriptoComoCph,
  ordenMeritoCompleto,
} from '../lib/inscriptosCeetps'
import { SearchableSelect } from '@/shared/components/ui/SearchableSelect'
import { ComboBuscable } from '@/shared/components/selectores/ComboBuscable'
import { esPuestoSinEspecificar } from '@/shared/lib/puestoSinEspecificar'
import { opcionesCarreraEscalafon } from '@/shared/lib/carreraEtiqueta'
import { useConfirm } from '@/shared/components/ui/useConfirm'
import { useToast } from '@/shared/components/ui/useToast'
import {
  type EstadoEtapa,
  type Etapa,
  ESTADO_ETAPA_CONFIG,
  SUB_ESTADOS,
} from '@/modules/concursos-cph/lib/wizard.constants'
import { PanelSubEstados } from '@/modules/concursos-cph/components/PanelSubEstados'
import { siguienteVisible, anteriorVisible } from '@/modules/concursos-cph/lib/etapasVisibles'

// CEETPS: las etapas visibles dependen de por dónde se entra (prop desdeEtapa):
// desde Gestión de Cargos se ven las 5; desde el módulo Concursos CEETPS, a partir
// de la 2. No se usan los permisos concursos-cph/tab:<etapa> del original (son de
// CPH; los roles CEETPS no los tienen).
function etapasVisiblesPara<T extends { numero: number }>(etapas: T[], desdeEtapa: number): T[] {
  return etapas.filter((e) => e.numero >= desdeEtapa)
}
function puedeVerEtapa(desdeEtapa: number, etapaId: string): boolean {
  return etapaId !== 'baja' || desdeEtapa <= 1
}
import {
  aplicarBloqueoPorAutorizacion,
  avisoAutorizacionNuevoCargo,
  esNuevoCargoSinAutorizar,
} from '@/modules/concursos-cph/lib/bloqueoAutorizacion'
import { HistorialCambios } from '@/modules/concursos-cph/components/HistorialCambios'
import { EtiquetasControl } from '@/shared/components/EtiquetasControl'
import { aplicarSaltoOm } from '@/modules/concursos-cph/lib/saltoOm'

export function ConcursoCeetpsWizard({ desdeEtapa = 1 }: { desdeEtapa?: number } = {}) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // Leer concurso real por su ID
  const { data: cphData, isLoading } = useQuery({
    queryKey: [CEETPS_WIZARD_KEY, id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ConcursoCeetps }>(`/api/v1/concursos-ceetps/${id}`)
      return ceetpsComoCph(res.data.data)
    },
    enabled: !!id,
  })

  const { user } = useAuth()
  const queryClient = useQueryClient()
  // Paso 5a: aviso de éxito que deja la corrección de tipo al navegar a este concurso.
  const location = useLocation()
  const [avisoTipo, setAvisoTipo] = useState<string | null>(
    (location.state as { avisoTipo?: string } | null)?.avisoTipo ?? null,
  )

  // S13-C: la Autorizacion pendiente real (tabla genérica) para este concurso,
  // si existe y le corresponde resolverla al usuario logueado. Reemplaza al
  // viejo POST /concursos-cph/:id/autorizar, que nunca tocaba esta tabla y
  // dejaba la fila huérfana en "pendiente" para siempre.
  const { data: autorizacionPendiente } = useQuery({
    queryKey: ['autorizaciones', 'lista', { tipo: 'concurso_ceetps' as const, referenciaId: id }],
    queryFn: async () => {
      const res = await apiClient.get<{
        data: {
          id: string
          referenciaId: string
          resolverPorRolSlug: string
        }[]
      }>('/api/v1/autorizaciones', {
        params: { tipo: 'concurso_ceetps', limit: 100 },
      })
      return res.data.data.find((a) => a.referenciaId === id) ?? null
    },
    enabled: !!id,
  })
  // Paso 2a: el GET del concurso trae la autorización pendiente; sirve de
  // respaldo para el admin (el listado /autorizaciones filtra por el rol propio
  // y no se la devuelve) y para evitar el límite de página del listado.
  const autorizacionPendienteEfectiva = cphData?.autorizacionPendiente ?? autorizacionPendiente ?? null
  const puedeResolverAutorizacion =
    !!autorizacionPendienteEfectiva &&
    (autorizacionPendienteEfectiva.resolverPorRolSlug === user?.rolSlug || user?.rolSlug === 'admin')
  // Quien puede resolver como SGRASV (permiso autorizaciones/resolver_sgrasv, o
  // admin que los tiene todos) puede corregir la Etapa 1 mientras hay una
  // autorización pendiente; el PATCH sigue exigiendo concursos-cph/editar.
  const puedeCorregirEtapa1 =
    can(user, 'autorizaciones', 'resolver_sgrasv') && can(user, 'concursos-ceetps', 'editar')

  const { data: escalafones = [] } = useEscalafones()
  const { data: hospitales = [] } = useHospitales()
  const { data: codigosRegistro = [] } = useCodigosRegistro()
  // Escalafones ordenados igual que PersonasPage
  const escalafonesOrdenados = [...escalafones].sort((a, b) =>
    escalafonLabel(a.nombre).localeCompare(escalafonLabel(b.nombre), 'es'),
  )
  // Helper: dado un escalafonId, devuelve un codigoRegistroId DETERMINÍSTICO
  // del escalafón. FIX A (informe diag-bug1-persiste): antes se usaba
  // `codigosRegistro.find(...)`, que devuelve el PRIMER CR según el orden del
  // array — arbitrario. Cuando un escalafón tiene 2 CRs con el mismo literal
  // (CPH: CR 22 y CR 37), ese orden elegía uno al azar y disparaba el falso
  // "cambio de carrera". Ahora se elige por una regla estable: el CR de menor
  // `codigo` (comparado numérico si aplica, si no alfabético), y como desempate
  // el menor `id`. Esto solo se usa cuando la carrera REALMENTE cambió de
  // escalafón; el backend compara por escalafón, así que cualquier CR válido de
  // ese escalafón representa la misma carrera.
  const crIdDeEscalafon = (escId: string) => {
    const delEsc = codigosRegistro.filter((cr) => cr.escalafonId === escId)
    if (delEsc.length === 0) return null
    const ordenados = [...delEsc].sort((a, b) => {
      const ca = a.codigo ?? ''
      const cb = b.codigo ?? ''
      const na = Number(ca)
      const nb = Number(cb)
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb
      const byCodigo = ca.localeCompare(cb, 'es')
      if (byCodigo !== 0) return byCodigo
      return a.id.localeCompare(b.id)
    })
    return ordenados[0].id
  }
  // Escalafón CPH: funciona con la base actual (código 22, "Nueva Carrera Prof. Hosp") y con la nueva
  // (código 37, "Nueva Carrera Profesional Hospitalaria"); ver esEscalafonCph en @srrhh/types.
  const escalafonCph = escalafones.find((e) => esEscalafonCph(e))

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
          persona?: { apellidoNombre?: string | null; numeroDoc?: string | null; cuil?: string | null } | null
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
      reparticion: c?.cargo?.descripcionRepa ?? null,
      especialidad:
        cphData.especialidadSolicitada ??
        (c?.cargo as any)?.especialidadLegacy ??
        c?.cargo?.especialidad ??
        '—',
      escalafon: 'CPH',
      // Fallback a baja.persona: los concursos importados no tienen
      // concurso.persona, pero la persona que se fue está en la baja.
      personaBaja: c?.persona?.apellidoNombre ?? baja?.persona?.apellidoNombre ?? '—',
      cuilBaja: c?.persona?.cuil ?? baja?.persona?.cuil ?? '',
      fechaBaja: fechaBajaVal,
      eeBaja: eeBajaVal,
      subEstado: cphData.subEstado ?? 'vacante',
      subEstado3: cphData.subEstado3 ?? '',
      suspendido: cphData.suspendido,
      motivoConcurso: c?.motivoConcurso ?? null,
      observaciones: cphData.observaciones ?? '',
    }
  }, [cphData])

  // Jurado asignado (se usa para calcular la completitud de la etapa 2).
  const { data: juradoData } = useJuradoCeetps(id)
  // Inscriptos y sus pasos (completitud de la etapa 3). La Etapa 4 y el modal
  // de designación (heredados de CPH) los usan con la forma de inscripto CPH.
  const { data: inscriptosCeetps = [] } = useInscriptosCeetps(id)
  const inscriptos = useMemo(() => inscriptosCeetps.map(inscriptoComoCph), [inscriptosCeetps])

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
    // Datos informativos de la baja (readonly). Se reutilizan los valores ya
    // resueltos en el memo `concurso` (cuilBaja / especialidad) para no volver
    // a traerlos ni duplicar la lógica de fallback.
    const cuilBajaResuelto = concurso?.cuilBaja ?? ''
    const especialidadBajaResuelto = concurso?.especialidad ?? ''
    // Documento de origen (Baja | Creación) según el motivo del concurso. No toca
    // eeBaja: solo cambia el rótulo/valor mostrado en la Etapa 1.
    const concursoBase = cphData?.concurso as unknown as
      | { expediente?: string | null; cargo?: { expediente?: string | null; fechaDesde?: string | null } }
      | undefined
    const docOrigen = documentoOrigenDeConcurso({
      motivoConcurso: cphData?.concurso?.motivoConcurso ?? null,
      eeBaja: eeBajaResuelto || v('eeBaja'),
      expedienteConcurso: concursoBase?.expediente,
      expedienteCargo: concursoBase?.cargo?.expediente,
    })
    const fechaAltaCargo = (concursoBase?.cargo?.fechaDesde ?? '').slice(0, 10)
    // Determinar estado de cada etapa según qué campos tiene completados.
    // Etapa 2 COMPLETA solo con TODOS sus requisitos: fecha de autorización +
    // jurado COMPLETO (todos los lugares asignados) + disposición de llamado +
    // tipo de gestión. Mientras falte alguno, la etapa sigue "en curso"
    // (amarilla) y no habilita la etapa 3.
    const etapa2Completa =
      !!cphData?.fechaAutorizacion &&
      juradoCompleto(juradoData) &&
      !!cphData?.disposicion &&
      !!cphData?.tipoGestion
    // "Tiene autorización" (para habilitar la etapa como activa) = ya pasó la
    // autorización de DGAYDRH; la completitud plena la define etapa2Completa.
    const tieneAutorizacion = !!(cphData?.fechaAutorizacion || cphData?.disposicion)
    const tieneIfacs = !!cphData?.fechaIfacs
    // Etapa 3 completa = orden de mérito cargado a todos los finalistas. Si ya
    // hay IFACS, el concurso pasó por la etapa 3 (concursos previos al módulo).
    const tieneInscripcion = ordenMeritoCompleto(inscriptosCeetps) || tieneIfacs
    const tieneDesignacion = designacionCompleta(
      desigFormDesde(cphData as unknown as Record<string, unknown> | undefined),
    )
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

    const etapasBase: Etapa[] = [
      {
        id: 'baja',
        numero: 1,
        titulo: 'Apertura / Autorización',
        descripcion: docOrigen.esCreacion
          ? 'Documento de creación del cargo y apertura del expediente de concurso.'
          : 'Registro de la baja del agente y apertura del expediente de concurso.',
        estado: !cphData
          ? 'activa'
          : cphData.eeConcurso && !cphData.pendienteAutorizacion
            ? 'completada'
            : 'activa',
        fechaCompletada: cphData?.fechaEeConcurso ?? undefined,
        campos: [
          {
            key: 'eeBaja',
            label: docOrigen.etiqueta,
            tipo: 'texto',
            valor: docOrigen.esCreacion ? docOrigen.valor : eeBajaResuelto || v('eeBaja'),
            readonly: true,
          },
          // Cargo nuevo: no hay fecha de baja; se muestra la fecha de alta ("Desde").
          // Si no está disponible, el campo se oculta.
          ...(docOrigen.esCreacion
            ? fechaAltaCargo
              ? [
                  {
                    key: 'fechaBaja',
                    label: 'Fecha de alta',
                    tipo: 'fecha' as const,
                    valor: fechaAltaCargo,
                    readonly: true,
                  },
                ]
              : []
            : [
                {
                  key: 'fechaBaja',
                  label: 'Fecha de baja',
                  tipo: 'fecha' as const,
                  valor: fechaBajaResuelto || v('fechaBaja'),
                  readonly: true,
                },
              ]),
          {
            key: 'puesto',
            label: 'Puesto',
            tipo: 'texto',
            valor: cphData?.concurso?.cargo?.literalPuesto ?? '',
            readonly: true,
          },
          // CUIL del agente: solo aplica a una baja.
          ...(docOrigen.esCreacion
            ? []
            : [
                {
                  key: 'cuilBaja',
                  label: 'CUIL',
                  tipo: 'texto' as const,
                  valor: cuilBajaResuelto,
                  readonly: true,
                },
              ]),
          {
            key: 'especialidadBaja',
            label: docOrigen.esCreacion ? 'Especialidad' : 'Especialidad de la baja',
            tipo: 'texto',
            valor: especialidadBajaResuelto,
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
        titulo: 'Jurado / Dispo',
        descripcion: 'Autorización por DGAYDRH, asignación de jurado y disposición de llamado.',
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
        descripcion:
          'Cronograma, inscripción, admisibilidad, examen, análisis curricular, entrevista y orden de mérito.',
        // La etapa 3 se habilita recién cuando la etapa 2 está completa
        // (jurado completo + fecha de autorización + disposición de llamado).
        estado: estadoEtapa(tieneInscripcion, etapa2Completa),
        fechaCompletada: cphData?.fechaOrdenMerito ?? undefined,
        // Las fechas van en el cronograma y los pasos en su propio panel.
        campos: [],
      },
      {
        id: 'ifacs_insal',
        numero: 4,
        titulo: 'IFACS / INSAL',
        descripcion: 'Informe de Aptitud para el Cargo (IFACS) e Informe INSAL.',
        estado: estadoEtapa(tieneIfacs && !!cphData?.fechaInsal, tieneInscripcion),
        campos: [
          {
            key: 'fechaIfacs',
            label: 'Fecha IFACS',
            tipo: 'fecha',
            valor: v('fechaIfacs'),
            requerido: true,
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
        descripcion:
          'Documentación, TAD, apto médico, disposición, convalidación y resolución de designación.',
        estado: estadoEtapa(tieneDesignacion, tieneIfacs),
        campos: camposDesignacion(v, vb),
      },
    ]
    // Paso 2a: nuevo_cargo sin autorizar → Etapas 2–5 bloqueadas hasta que SGRASV autorice.
    // Paso 5b: con salto por orden de mérito, Etapas 2–3 resueltas y Etapa 4 (IFACS) activa.
    return aplicarBloqueoPorAutorizacion(aplicarSaltoOm(etapasBase, cphData), cphData?.concurso)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cphData, juradoData, inscriptosCeetps])

  const [puestoConcurso, setPuestoConcurso] = useState('')
  const [especialidadConcurso, setEspecialidadConcurso] = useState('')
  const [siglaConcurso, setSiglaConcurso] = useState('')
  const [escalafonId, setEscalafonId] = useState('')
  const [eeConcursoInput, setEeConcursoInput] = useState('')
  const [ifAutorizacionInput, setIfAutorizacionInput] = useState('')
  // Puestos del escalafón seleccionado (sin filtrar por tipo). Este wizard
  // todavía trabaja con el string mostrado (no manda puestoCargoSolicitadoId
  // al backend — queda como deuda de S20-11, fuera de este pase por el
  // tamaño y criticidad del archivo); se toma solo el nombre del catálogo.
  const { data: puestosDisponiblesCatalogo = [] } = usePuestosCargoNormalizados(
    escalafonId || undefined,
    undefined,
    undefined,
  )
  const puestosDisponibles = puestosDisponiblesCatalogo.map((p) => p.nombre).filter((n) => !esPuestoSinEspecificar(n))
  const [modalCambios, setModalCambios] = useState<
    { campo: string; de: string; a: string }[] | null
  >(null)
  const [modalAutorizacion, setModalAutorizacion] = useState(false)
  const [obsAutorizacion, setObsAutorizacion] = useState('')
  const [modalBaja, setModalBaja] = useState(false)
  const [menuAcciones, setMenuAcciones] = useState(false)
  const menuAccionesRef = useRef<HTMLDivElement>(null)
  // Encabezado descriptivo del concurso colapsable: arranca contraído para dar
  // más espacio vertical al formulario; el usuario lo expande para ver detalle.
  const [headerAbierto, setHeaderAbierto] = useState(false)
  const [modalDesignar, setModalDesignar] = useState(false)
  // 'proponer' (Etapa 4): solo elegir a quién notificar por INSAL, no ocupa
  // el cargo ni pide fecha de inicio. 'designar' (Etapa 5): designación
  // oficial real, crea la ocupación — comportamiento existente sin cambios.
  // 'asignar': vincular la persona designada SIN ocupar el cargo (caso
  // histórico: concurso finalizado sin persona vinculada). Oculta fecha/idSial
  // y usa asignarDesignadoMutation.
  // 'manual': carga manual por referencia (tercera vía) — el candidato no está
  // en la orden de mérito ni en la BD de personas. Guarda solo la referencia
  // (CUIL + nombre + id_sial opcional); NO crea Persona ni ocupa el cargo.
  const [modalDesignarModo, setModalDesignarModo] = useState<
    'proponer' | 'designar' | 'asignar' | 'manual'
  >('designar')
  const [designarPersonaId, setDesignarPersonaId] = useState('')
  const [designarPersonaNombre, setDesignarPersonaNombre] = useState('')
  const [designarPersonaEspCph, setDesignarPersonaEspCph] = useState<string | null>(null)
  const [designarFechaDesde, setDesignarFechaDesde] = useState('')
  const [designarIdSialRol, setDesignarIdSialRol] = useState('')
  const [designarSearch, setDesignarSearch] = useState('')
  // Vía manual por referencia: CUIL (11 díg), apellido/nombre y id_sial opcional.
  const [manualCuil, setManualCuil] = useState('')
  const [manualNombre, setManualNombre] = useState('')
  const [manualIdSial, setManualIdSial] = useState('')
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

  // ── Etapa 4: IFACS / INSAL (campos controlados para habilitar el guardado) ──
  const [ifacsForm, setIfacsForm] = useState({ fechaIfacs: '' })
  const [insalForm, setInsalForm] = useState({ fechaInsal: '' })
  useEffect(() => {
    setIfacsForm({ fechaIfacs: cphData?.fechaIfacs?.slice(0, 10) ?? '' })
    setInsalForm({ fechaInsal: cphData?.fechaInsal?.slice(0, 10) ?? '' })
  }, [cphData])
  const designarMutation = useDesignarConcursoCph(id!)
  const asignarDesignadoMutation = useAsignarDesignadoCph(id!)
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

  // Búsqueda libre de personas por texto (nombre/CUIL/DNI) — solo en el modo
  // 'asignar', donde no hay orden de mérito con la persona ganadora (casos
  // históricos). Mismo endpoint y shape que usa seleccionarCandidatoOM.
  const { data: personasBusqueda = [] } = useQuery({
    queryKey: ['personas-busqueda', designarSearch],
    enabled:
      modalDesignar &&
      modalDesignarModo === 'asignar' &&
      designarSearch.trim().length >= 2,
    queryFn: async () => {
      const res = await apiClient.get<{
        data: {
          id: string
          apellidoNombre: string
          cuil: string
          numeroDoc?: string | null
          especialidadCph?: string | null
        }[]
      }>('/api/v1/personas', { params: { search: designarSearch.trim(), limit: 10 } })
      return res.data.data
    },
  })

  // Vía 'manual': lookup por CUIL contra la BD de personas. Cuando el operador
  // tipea 11 dígitos, se busca el match exacto por CUIL para informar si la
  // persona ya existe (y qué roles SIAL vincularían). NO crea nada: solo informa.
  const manualCuilNorm = manualCuil.replace(/\D/g, '')
  const { data: manualMatch = null } = useQuery({
    queryKey: ['personas-busqueda-manual', manualCuilNorm],
    enabled: modalDesignar && modalDesignarModo === 'manual' && manualCuilNorm.length === 11,
    queryFn: async () => {
      const res = await apiClient.get<{
        data: {
          id: string
          apellidoNombre: string
          cuil: string
          numeroDoc?: string | null
          especialidadCph?: string | null
        }[]
      }>('/api/v1/personas', { params: { search: manualCuilNorm, limit: 5 } })
      return res.data.data.find((p) => p.cuil.replace(/\D/g, '') === manualCuilNorm) ?? null
    },
  })
  // Roles SIAL de la persona que matcheó por CUIL (para mostrar qué vincularía).
  const { data: manualSialRoles = [] } = useQuery({
    queryKey: ['persona-sial-roles-manual', manualMatch?.id],
    enabled: modalDesignar && modalDesignarModo === 'manual' && !!manualMatch?.id,
    queryFn: async () => {
      const res = await apiClient.get<{
        data: {
          idSialRol: string
          codigoCargo: string | null
          literalPuesto: string | null
          hospitalSigla: string
        }[]
      }>(`/api/v1/personas/${manualMatch!.id}/sial-roles`)
      return res.data.data
    },
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
  // FIX A.2 (informe diag-bug1-persiste): fuente de verdad INMUTABLE de los
  // valores originales de SIGLA y ESCALAFÓN, poblada UNA sola vez cuando llega
  // cphData y NO re-pisada por refetches de codigosRegistro. La comparación de
  // "cambió sigla/carrera" en confirmarCambios usa este ref, no el estado
  // `originales` (que puede quedar desalineado en un re-render intermedio y
  // producía el falso-positivo que enrutaba al Director). `inicializado=false`
  // mientras no haya cargado ⇒ no se evalúan cambios ni se envían
  // sigla/codigoRegistroId.
  const originalesSiglaCarreraRef = useRef<{
    inicializado: boolean
    sigla: string
    escalafonId: string
  }>({ inicializado: false, sigla: '', escalafonId: '' })
  // Guarda para "cargar una sola vez" los campos del cargo desde cphData, sin
  // que un refetch de codigosRegistro los re-pise (FIX A.3).
  const cargaInicialHechaRef = useRef<string | null>(null)
  const { data: especialidadesDisponiblesCatalogo = [] } = useEspecialidadesPuesto(
    escalafonId || undefined,
    puestoConcurso || undefined,
  )
  const especialidadesDisponibles = especialidadesDisponiblesCatalogo.map((e) => e.nombre)
  // S20-11: ids del catálogo derivados de los strings ya normalizados contra
  // la BD (ver los dos useEffect de abajo) — se mandan junto con el texto en
  // el PATCH, sin cambiar la lógica existente basada en string.
  const puestoConcursoId = puestosDisponiblesCatalogo.find((p) => p.nombre === puestoConcurso)?.id ?? null
  const especialidadConcursoId = especialidadesDisponiblesCatalogo.find((e) => e.nombre === especialidadConcurso)?.id ?? null

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

  // FIX A.3 (informe diag-bug1-persiste): CARGAR UNA SOLA VEZ los campos del
  // cargo desde cphData. Antes este efecto dependía también de
  // `codigosRegistro`, así que cada refetch de ese catálogo re-pisaba
  // siglaConcurso/escalafonId/originales — una ventana de re-render en la que
  // `originales` podía quedar a medio cargar mientras el estado vivo ya estaba
  // poblado, lo que producía el falso "cambió sigla/carrera". Ahora el efecto
  // depende SOLO de cphData y se guarda con `cargaInicialHechaRef` por id del
  // concurso. La resolución de fallback por CR (cuando el cargo no trae
  // escalafonId propio) vive en un efecto aparte dep [codigosRegistro].
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
    const cphId = cphData.id
    // Si ya se inicializó para ESTE concurso, no re-pisar (evita que un
    // re-render por otra dependencia resetee lo que el usuario está editando).
    if (cargaInicialHechaRef.current === cphId) return

    setSiglaConcurso(cargo?.hospital?.sigla ?? '')
    // El cargo ya trae escalafonId propio (FK real) — se usa directo. El
    // fallback por codigoRegistro (cuando escalafonId viene vacío) se resuelve
    // en el efecto separado dep [codigosRegistro] más abajo.
    const resolvedEscalafonId = cargo?.escalafonId ?? ''
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
    // Fuente de verdad inmutable para sigla/carrera (FIX A.2). Si el cargo trae
    // escalafonId propio, ya queda inicializado; si no, se completa en el
    // efecto de fallback por CR. Solo se marca `inicializado` cuando hay un
    // escalafonId resuelto, para no evaluar cambios contra un ref vacío.
    originalesSiglaCarreraRef.current = {
      inicializado: resolvedEscalafonId !== '',
      sigla: cargo?.hospital?.sigla ?? '',
      escalafonId: resolvedEscalafonId,
    }
    cargaInicialHechaRef.current = cphId
  }, [cphData])

  // FIX A.3: resolución de FALLBACK del escalafón por codigoRegistro, separada
  // del "cargar una vez". Solo corre si el escalafón aún no se resolvió (cargo
  // sin escalafonId propio, datos legacy) y ya llegó el catálogo de CRs. No
  // re-pisa nada si el escalafón ya está puesto.
  useEffect(() => {
    if (!cphData) return
    if (originalesSiglaCarreraRef.current.inicializado) return
    if (codigosRegistro.length === 0) return
    type CargoCph = { codigoRegistro?: { id?: string; literal?: string } }
    const cargo = (cphData.concurso as unknown as { cargo?: CargoCph })?.cargo
    const crId = cargo?.codigoRegistro?.id ?? ''
    const crLiteral = cargo?.codigoRegistro?.literal ?? ''
    let resolved = ''
    if (crId) {
      resolved = codigosRegistro.find((c) => c.id === crId)?.escalafonId ?? ''
    }
    if (!resolved && crLiteral) {
      resolved = codigosRegistro.find((c) => c.literal === crLiteral)?.escalafonId ?? ''
    }
    if (!resolved) return
    setEscalafonId(resolved)
    setOriginales((prev) => ({ ...prev, escalafonId: resolved }))
    originalesSiglaCarreraRef.current = {
      inicializado: true,
      sigla: originalesSiglaCarreraRef.current.sigla,
      escalafonId: resolved,
    }
  }, [cphData, codigosRegistro])
  // Leer pendienteAutorizacion desde la API (no estado local)
  const pendienteAutorizacion = !!(cphData as unknown as { pendienteAutorizacion?: boolean })
    ?.pendienteAutorizacion
  const aprobadoDirector = !!(cphData as unknown as { aprobadoDirector?: boolean })
    ?.aprobadoDirector
  // Paso 2a: con una autorización pendiente la Etapa 1 queda de solo lectura,
  // salvo para quien resuelve como SGRASV (puede corregir antes de aprobar).
  const bloqueoEdicionEtapa1 = pendienteAutorizacion && !puedeCorregirEtapa1
  const esNuevoCargoPendiente = esNuevoCargoSinAutorizar(cphData?.concurso)
  const avisoNuevoCargo = avisoAutorizacionNuevoCargo(cphData?.concurso)
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
    mutationFn: async (body: Record<string, unknown>) => {
      // CEETPS: los campos del wizard se traducen a los de CEETPS; los que CEETPS
      // todavía no tiene se descartan (su PATCH rechaza campos desconocidos).
      const { body: bodyCeetps, descartados } = cphPatchACeetps(body)
      const lista = descartados.join(', ')
      if (Object.keys(bodyCeetps).length === 0) {
        throw { response: { data: { message: `Estos campos todavía no se guardan en CEETPS: ${lista}` } } }
      }
      if (descartados.length > 0) toast.info(`No se guardaron (todavía no existen en CEETPS): ${lista}`)
      return apiClient.patch(`/api/v1/concursos-ceetps/${id}`, bodyCeetps).then((r) => r.data.data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CEETPS_WIZARD_KEY, id] })
      // Por si el patch tocó personaDesignadaId (proponer candidato al INSAL).
      queryClient.invalidateQueries({ queryKey: ['concurso-cph-persona-designada', id] })
    },
    onError: (err: unknown) => {
      const data = (
        err as {
          response?: { data?: { error?: { message?: string }; message?: string } }
        }
      )?.response?.data
      const msg = data?.error?.message ?? data?.message ?? 'No se pudo guardar'
      toast.error(msg)
    },
  })

  // S13-C: aprobar/rechazar via el módulo genérico de autorizaciones — ya no
  // POST /concursos-cph/:id/autorizar (dejaba la Autorizacion huérfana en
  // "pendiente" porque nunca actualizaba esa tabla).
  const autorizarMutation = useMutation({
    mutationFn: ({ aprobado, observaciones }: { aprobado: boolean; observaciones?: string }) => {
      if (!autorizacionPendienteEfectiva) throw new Error('No hay autorización pendiente para resolver')
      const accion = aprobado ? 'aprobar' : 'rechazar'
      return apiClient
        .post(`/api/v1/autorizaciones/${autorizacionPendienteEfectiva.id}/${accion}`, {
          observaciones,
        })
        .then((r) => r.data.data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CEETPS_WIZARD_KEY, id] })
      queryClient.invalidateQueries({ queryKey: ['autorizaciones'] })
      setModalAutorizacion(false)
      setObsAutorizacion('')
    },
    onError: (err: unknown) => {
      const data = (
        err as {
          response?: { data?: { error?: { message?: string }; message?: string } }
        }
      )?.response?.data
      const msg = data?.error?.message ?? data?.message ?? 'Error al resolver la autorización'
      toast.error(msg)
    },
  })

  const [etapaActivaRaw, setEtapaActivaRaw] = useState(
    etapasIniciales.find((e) => e.estado === 'activa')?.id ?? 'baja',
  )
  // Etapas que el rol puede ver (permiso concursos-cph/tab:<slug>). Solo UI:
  // etapasActuales NO se filtra porque los cálculos usan índice por número.
  const etapasVisibles = etapasVisiblesPara(etapasIniciales, desdeEtapa)
  // Etapa activa derivada: si la pedida/por defecto no es visible, cae en la
  // primera visible (undefined si no hay ninguna).
  const etapaActiva = etapasVisibles.some((e) => e.id === etapaActivaRaw)
    ? etapaActivaRaw
    : etapasVisibles[0]?.id
  function setEtapaActiva(etapaId: string) {
    if (!etapasVisibles.some((e) => e.id === etapaId) && etapasVisibles.length > 0) {
      toast.info('El concurso volvió a la primera etapa disponible')
    }
    setEtapaActivaRaw(etapaId)
  }

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

  const etapa = etapasActuales.find((e) => e.id === etapaActiva) ?? etapasActuales[0]

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
    const sub = (concurso?.subEstado ?? 'vacante').toLowerCase()
    const idx = SUB_ESTADOS.findIndex((s) => s.key === sub)
    if (idx < 0) return 0 // sub-estado fuera de la lista (ej. q-desierto)
    if (idx === 0) return 0 // Vacante: nada completado todavía
    if (idx >= SUB_ESTADOS.length - 1) return idx // último: proceso completo
    return idx + 1 // amarillo = primer pendiente
  })()

  if (isLoading) return <div className="p-8 text-sm text-gray-400">Cargando concurso...</div>
  if (!concurso) return <div className="p-8 text-sm text-danger">No se encontró el concurso.</div>
  if (!user) return <div className="p-8 text-sm text-gray-400">Cargando concurso...</div>
  if (etapasVisibles.length === 0) {
    return (
      <div className="p-8 text-sm text-gray-500">
        No tenés acceso a ninguna etapa de este concurso.
      </div>
    )
  }
  const c = concurso!

  // Las fechas del concurso no pueden ir para atrás: avisa y no deja guardar.
  function fechasEnOrden(cambios: Record<string, string | null | undefined>): boolean {
    const actual = aplanarFechasCeetps(
      (cphData as unknown as { ceetps?: ConcursoCeetps } | undefined)?.ceetps,
    )
    const error = errorEnCadenaFechas(actual, cambios)
    if (error) toast.error(error)
    return !error
  }

  function handleGuardar() {
    if (etapaActiva === 'baja') {
      const labelEsc = (eId: string) => escalafones.find((e) => e.id === eId)?.nombre ?? eId
      // La comparación que decide "cambió / no cambió" es normalizada
      // (trim + toLowerCase) para sigla/especialidad/puesto: un cambio de
      // solo-capitalización ('Medico de Planta' vs 'medico de planta') NO
      // cuenta como cambio y no dispara autorización. El valor que se muestra
      // y se persiste conserva el texto que escribió el usuario.
      // FIX D: normalización robusta (acentos/espacios/invisibles).
      const norm = (s: string | null | undefined) =>
        (s ?? '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase()
      const cambiosConAutorizacion: { campo: string; de: string; a: string }[] = []
      // Sigla y escalafón: autorización doble (director → sgrasv). FIX A.2: se
      // comparan contra el ref inmutable y solo si ya está inicializado, para
      // no abrir el modal por un falso-positivo de timing.
      const origRef = originalesSiglaCarreraRef.current
      if (origRef.inicializado && norm(siglaConcurso) !== norm(origRef.sigla))
        cambiosConAutorizacion.push({
          campo: 'Sigla',
          de: origRef.sigla,
          a: siglaConcurso,
        })
      if (origRef.inicializado && escalafonId !== origRef.escalafonId)
        cambiosConAutorizacion.push({
          campo: 'Carrera',
          de: escalafonLabel(labelEsc(origRef.escalafonId)),
          a: escalafonLabel(labelEsc(escalafonId)),
        })
      // Especialidad y puesto: autorización simple (solo sgrasv)
      const eeConcursoActual = cphData?.eeConcurso
      if (norm(especialidadConcurso) !== norm(originales.especialidad))
        cambiosConAutorizacion.push({
          campo: 'Especialidad',
          de: originales.especialidad,
          a: especialidadConcurso,
        })
      if (norm(puestoConcurso) !== norm(originales.puesto))
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
    // Incluir valores de SearchableSelect (no tienen data-key, viven en estado
    // React). La comparación es normalizada (trim + toLowerCase): un cambio de
    // solo-capitalización no viaja como cambio protegido; si cambió de verdad,
    // se persiste el texto tal cual lo escribió el usuario.
    if (etapaActiva === 'baja') {
      const normCmp = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
      if (normCmp(especialidadConcurso) !== normCmp(originales.especialidad)) {
        body.especialidadSolicitada = especialidadConcurso || null
        body.especialidadPuestoSolicitadaId = especialidadConcursoId
      }
      if (normCmp(puestoConcurso) !== normCmp(originales.puesto)) {
        body.puestoSolicitado = puestoConcurso || null
        body.puestoCargoSolicitadoId = puestoConcursoId
      }
    }
    if (
      !fechasEnOrden({
        fechaCaratulacion: body.fechaEeConcurso as string | null | undefined,
        fechaAutorizacion: body.fechaAutorizacion as string | null | undefined,
      })
    )
      return
    if (Object.keys(body).length > 0) patchMutation.mutate(body)

    // Etapa 2: validar que estén TODOS los requisitos antes de avanzar a la 3.
    // Se guardan igual los campos (arriba), pero no se avanza si falta algo.
    if (etapaActiva === 'autorizacion') {
      const fechaAutz =
        (body.fechaAutorizacion as string | null | undefined) ?? cphData?.fechaAutorizacion
      const dispo = (body.disposicion as string | null | undefined) ?? cphData?.disposicion
      const tipoGest = (body.tipoGestion as string | null | undefined) ?? cphData?.tipoGestion
      const faltan: string[] = []
      faltan.push(...faltantesJurado(juradoData))
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

    // Etapa 3: para avanzar a la 4, todos los finalistas (quienes aprobaron
    // todos los pasos) tienen que tener su posición en el orden de mérito.
    if (etapaActiva === 'inscripcion') {
      const faltan = faltantesPasosEtapa3(inscriptosCeetps)
      if (faltan.length > 0) {
        setFaltantesEtapa3(faltan)
        setGuardado(true)
        setTimeout(() => setGuardado(false), 2500)
        return
      }
      setFaltantesEtapa3([])
    }

    // Etapa 4: para avanzar a la 5, IFACS/INSAL cargados. En CEETPS no hay paso de
    // aceptación: el candidato propuesto pasa directo a la Etapa 5.
    if (etapaActiva === 'ifacs_insal') {
      const faltan: string[] = []
      if (!cphData?.fechaIfacs) faltan.push('Fecha IFACS')
      if (!cphData?.fechaInsal) faltan.push('Fecha INSAL')
      if (faltan.length > 0) {
        setFaltantesEtapa4(faltan)
        setGuardado(true)
        setTimeout(() => setGuardado(false), 2500)
        return
      }
      setFaltantesEtapa4([])
    }

    const siguiente = siguienteVisible(etapasVisibles, etapa.numero)
    if (siguiente) setEtapaActiva(siguiente.id)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2500)
  }

  function confirmarCambios() {
    setModalCambios(null)
    // Con cambios sensibles: enviar a autorización, NO avanzar (queda bloqueado).
    // Persistir los campos de la Etapa 1 para que el usuario no pierda lo
    // cargado al salir y volver a entrar.
    //
    // BUG-FIX autorización doble: antes se mandaban SIEMPRE `sigla` y
    // `codigoRegistroId`, aunque no hubieran cambiado. El backend
    // (patchConcursoCphService) compara `body.sigla`/`body.codigoRegistroId`
    // contra los valores del cargo y, si viajan y difieren, enruta al Director
    // (requiereAutorizacionDoble). Peor: `codigoRegistroId` salía de
    // `crIdDeEscalafon(escalafonId)`, que devuelve el PRIMER CR del escalafón
    // ordenado por literal — y CPH tiene 2 CRs (22 y 37), así que ese id casi
    // nunca coincide con el CR real del cargo → `cambiaCr` falso-positivo →
    // Director indebido. Ahora `sigla` y `codigoRegistroId` solo viajan si de
    // verdad cambiaron respecto de los originales (comparación de sigla
    // normalizada trim+toLowerCase; carrera por `escalafonId`). Si el usuario
    // solo tocó especialidad/puesto, no viajan y el backend cae en
    // tieneCambioProtegido (solo SGRASV), no en autorización doble.
    // FIX D: normalización robusta (acentos/espacios internos/invisibles fuera)
    // para que diferencias solo de formato no cuenten como cambio.
    const norm = (s: string | null | undefined) =>
      (s ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
    // FIX A.2: la comparación de sigla/carrera usa el ref INMUTABLE poblado una
    // vez desde cphData, no el estado `originales` (que podía quedar a medio
    // cargar en un re-render y disparar el falso "cambio"). Si el ref aún no se
    // inicializó (escalafón sin resolver), NO evaluamos ni enviamos
    // sigla/codigoRegistroId — así un guardado prematuro nunca arrastra esos
    // campos al PATCH.
    const origRef = originalesSiglaCarreraRef.current
    const cambioSigla = origRef.inicializado && norm(siglaConcurso) !== norm(origRef.sigla)
    // Carrera por ESCALAFÓN (identidad estable), no por id de CR.
    const cambioCarrera = origRef.inicializado && escalafonId !== origRef.escalafonId
    // Puesto: un cambio de solo-capitalización ('Medico de Planta' vs 'medico
    // de planta') NO cuenta como cambio. Se compara normalizado (trim +
    // toLowerCase); si solo difiere el casing, no se envía como cambio. El
    // valor persistido conserva el texto que escribió el usuario.
    const cambioPuesto =
      norm(puestoConcurso) !== norm(originales.puesto) ||
      puestoConcursoId !== (puestosDisponiblesCatalogo.find((p) => p.nombre === originales.puesto)?.id ?? null)
    const cambioEspecialidad = norm(especialidadConcurso) !== norm(originales.especialidad)

    const body: Record<string, unknown> = {
      eeConcurso: eeConcursoInput || null,
      ifAutorizacion: ifAutorizacionInput || null,
    }
    if (cambioSigla) body.sigla = siglaConcurso || null
    // FIX A.1: NO mandar un CR arbitrario. `codigoRegistroId` solo viaja cuando
    // el ESCALAFÓN realmente cambió, y se deriva de forma DETERMINÍSTICA del
    // nuevo escalafón (crIdDeEscalafon elige por regla estable, no por orden de
    // array). El backend compara por escalafón, así que cualquier CR válido de
    // ese escalafón representa la misma carrera; mientras la carrera no cambie,
    // este campo nunca se envía y el guardado cae en el flujo sin Director.
    if (cambioCarrera) {
      const crNuevo = crIdDeEscalafon(escalafonId)
      if (crNuevo) body.codigoRegistroId = crNuevo
    }
    if (cambioEspecialidad) {
      body.especialidadSolicitada = especialidadConcurso || null
      body.especialidadPuestoSolicitadaId = especialidadConcursoId
    }
    if (cambioPuesto) {
      body.puestoSolicitado = puestoConcurso || null
      body.puestoCargoSolicitadoId = puestoConcursoId
    }

    patchMutation.mutate(
      body,
      {
        onSuccess: () => {
          toast.success(
            'Enviado a autorización del Director. La nueva sigla/carrera se aplicarán cuando se apruebe.',
          )
        },
        // El error se comunica vía el onError global de patchMutation; no duplicar
        // el toast ni marcar guardado.
      },
    )
  }

  return (
    // Contenedor que ocupa todo el alto disponible dentro del <main> scrolleable
    <div
      className={`flex flex-col min-h-full ${CLASE_MAYUSCULAS}`}
      onChangeCapture={alEscribirMayusculas}
    >
      {ConfirmUI}
      {ToastUI}
      {/* ── MODAL DESIGNAR ──────────────────────────────────────────────────── */}
      {modalDesignar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <span className="text-green-500 text-xl">👤</span>
              <div>
                <h3 className="font-primary font-bold text-gray-900">
                  {modalDesignarModo === 'proponer'
                    ? 'Proponer candidato'
                    : modalDesignarModo === 'asignar'
                      ? 'Asignar persona designada'
                      : modalDesignarModo === 'manual'
                        ? 'Carga manual por referencia'
                        : 'Registrar designación'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {modalDesignarModo === 'proponer'
                    ? 'Elegí a quién notificar por INSAL. Esto no ocupa el cargo — la designación oficial es en la Etapa 5.'
                    : modalDesignarModo === 'asignar'
                      ? 'Solo vincula a la persona que ganó el concurso. NO ocupa el cargo — el cargo pasa a ocupado recién cuando la persona aparezca en el padrón semanal.'
                      : modalDesignarModo === 'manual'
                        ? 'Cargá al designado cuando NO está en la orden de mérito ni en la base de personas. Se guarda solo la referencia (CUIL + nombre); la persona real se vincula cuando el padrón la traiga. No ocupa el cargo.'
                        : 'El cargo quedará ocupado inmediatamente, sin esperar el padrón.'}
                </p>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Modo 'asignar': buscador libre de personas por texto. Estos
                  concursos históricos no tienen orden de mérito con la persona
                  ganadora, así que se busca directo contra /api/v1/personas. */}
              {modalDesignarModo === 'asignar' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Buscar persona (nombre, CUIL o DNI){' '}
                    <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={designarSearch}
                    onChange={(e) => setDesignarSearch(e.target.value)}
                    placeholder="Escribí al menos 2 caracteres..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  {designarSearch.trim().length >= 2 && (
                    <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100 max-h-72 overflow-y-auto">
                      {personasBusqueda.length === 0 ? (
                        <p className="px-3 py-2.5 text-xs text-gray-400">
                          Sin resultados para «{designarSearch.trim()}».
                        </p>
                      ) : (
                        personasBusqueda.map((p) => {
                          const elegido = designarPersonaId === p.id
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setDesignarPersonaId(p.id)
                                setDesignarPersonaNombre(p.apellidoNombre)
                                setDesignarPersonaEspCph(p.especialidadCph ?? null)
                                setDesignarSearch(p.apellidoNombre)
                              }}
                              className={`w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-3 ${
                                elegido ? 'bg-green-50' : ''
                              }`}
                            >
                              <span className="flex-1 min-w-0 grid grid-cols-2 gap-x-3 gap-y-0.5">
                                <span className="col-span-2 font-medium text-gray-800 truncate">
                                  {p.apellidoNombre}
                                </span>
                                <span className="text-xs text-gray-400 font-mono">
                                  CUIL {p.cuil ?? '—'}
                                </span>
                                <span className="text-xs text-gray-400">
                                  DNI {p.numeroDoc ?? '—'}
                                </span>
                                {p.especialidadCph && (
                                  <span className="col-span-2 text-xs text-gray-500 truncate">
                                    🩺 {p.especialidadCph}
                                  </span>
                                )}
                              </span>
                              {elegido && <span className="text-green-600 shrink-0">✓</span>}
                            </button>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Modo 'manual': carga por referencia. CUIL + apellido/nombre
                  requeridos, id_sial opcional. Al tipear 11 dígitos de CUIL se
                  consulta la BD y se informa si la persona ya existe. */}
              {modalDesignarModo === 'manual' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      CUIL <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={manualCuil}
                      onChange={(e) => setManualCuil(e.target.value)}
                      placeholder="11 dígitos"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                    />
                    {manualCuil.trim().length > 0 && manualCuilNorm.length !== 11 && (
                      <p className="text-xs text-amber-600 mt-1">
                        El CUIL debe tener 11 dígitos ({manualCuilNorm.length} hasta ahora).
                      </p>
                    )}
                    {manualCuilNorm.length === 11 && (
                      <div className="mt-2 rounded-lg border px-3 py-2 text-xs">
                        {manualMatch ? (
                          <div className="text-emerald-700">
                            <p className="font-semibold">
                              ✓ Esta persona ya está en la base: {manualMatch.apellidoNombre}
                            </p>
                            {manualSialRoles.length > 0 ? (
                              <p className="mt-1 text-gray-600">
                                Roles SIAL que vincularían:{' '}
                                {manualSialRoles.map((r) => r.idSialRol).join(', ')}
                              </p>
                            ) : (
                              <p className="mt-1 text-gray-500">
                                Sin roles SIAL activos — se vinculará y ocupará cuando aparezca en
                                el padrón.
                              </p>
                            )}
                            <p className="mt-1 text-gray-500">
                              Se vinculará la persona real además de guardar la referencia.
                            </p>
                          </div>
                        ) : (
                          <p className="text-blue-700">
                            No está en la base — se guardará solo la referencia. La persona se
                            creará/vinculará cuando el padrón la traiga.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Apellido y nombre <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      value={manualNombre}
                      onChange={(e) => setManualNombre(e.target.value)}
                      placeholder="Apellido, Nombre"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      id_sial (opcional)
                    </label>
                    <input
                      type="text"
                      value={manualIdSial}
                      onChange={(e) => setManualIdSial(e.target.value)}
                      placeholder="Si lo conocés, para el match directo con el padrón"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Elegibles del orden de mérito de este concurso */}
              {modalDesignarModo !== 'asignar' && modalDesignarModo !== 'manual' && elegiblesOM.length === 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  ⚠ Todavía no hay orden de mérito cargado para este concurso — no hay
                  candidatos para proponer. Andá a la Etapa 3 (Inscripción/Examen/OM) y, en la
                  pestaña «Orden de mérito final», cargá la posición de cada finalista.
                </div>
              )}
              {modalDesignarModo !== 'asignar' && modalDesignarModo !== 'manual' && elegiblesOM.length > 0 && (
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
              ) : modalDesignarModo === 'asignar' ? (
                <button
                  className="btn-primary"
                  disabled={!designarPersonaId || asignarDesignadoMutation.isPending}
                  onClick={() =>
                    asignarDesignadoMutation.mutate(
                      { personaId: designarPersonaId },
                      {
                        onSuccess: () => {
                          toast.success(
                            'Persona designada vinculada — el cargo se ocupará cuando aparezca en el padrón.',
                          )
                          setModalDesignar(false)
                          setDesignarPersonaId('')
                          setDesignarPersonaNombre('')
                          setDesignarPersonaEspCph(null)
                          setDesignarSearch('')
                        },
                        onError: (e) =>
                          toast.error(
                            (
                              e as {
                                response?: {
                                  data?: {
                                    message?: string
                                    error?: { message?: string }
                                  }
                                }
                              }
                            )?.response?.data?.error?.message ??
                              (e as { response?: { data?: { message?: string } } })?.response?.data
                                ?.message ??
                              'No se pudo vincular la persona.',
                          ),
                      },
                    )
                  }
                >
                  {asignarDesignadoMutation.isPending
                    ? 'Guardando...'
                    : 'Vincular persona designada'}
                </button>
              ) : modalDesignarModo === 'manual' ? (
                <button
                  className="btn-primary"
                  disabled={
                    manualCuilNorm.length !== 11 ||
                    manualNombre.trim().length === 0 ||
                    asignarDesignadoMutation.isPending
                  }
                  onClick={() =>
                    asignarDesignadoMutation.mutate(
                      {
                        refCuil: manualCuilNorm,
                        refNombre: manualNombre.trim(),
                        ...(manualIdSial.trim() ? { idSialRol: manualIdSial.trim() } : {}),
                      },
                      {
                        onSuccess: () => {
                          toast.success(
                            manualMatch
                              ? 'Designado vinculado por referencia (persona encontrada en la base). El cargo se ocupará cuando el padrón lo confirme.'
                              : 'Designado guardado por referencia. La persona se vinculará cuando el padrón la traiga.',
                          )
                          setModalDesignar(false)
                          setManualCuil('')
                          setManualNombre('')
                          setManualIdSial('')
                        },
                        onError: (e) =>
                          toast.error(
                            (
                              e as {
                                response?: {
                                  data?: { message?: string; error?: { message?: string } }
                                }
                              }
                            )?.response?.data?.error?.message ??
                              (e as { response?: { data?: { message?: string } } })?.response?.data
                                ?.message ??
                              'No se pudo guardar la referencia del designado.',
                          ),
                      },
                    )
                  }
                >
                  {asignarDesignadoMutation.isPending ? 'Guardando...' : 'Guardar referencia'}
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
                  // Relanzamiento: el concurso vuelve a la Etapa 1 (Apertura / Autorización).
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
                jurado asignado o avance posterior quedará basado en una especialidad distinta a
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
                  <ComboBuscable
                    modo="unico"
                    label=""
                    requerido
                    options={especialidadesDisponibles.map((x) => ({ value: x, label: x }))}
                    selected={cambioEspNueva ? [cambioEspNueva] : []}
                    onChange={(v) => setCambioEspNueva(v[0] ?? '')}
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
                Observaciones <span className="font-normal text-gray-500">(obligatorias para rechazar)</span>
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
                disabled={autorizarMutation.isPending || !obsAutorizacion.trim()}
                title={!obsAutorizacion.trim() ? 'Indicá el motivo del rechazo' : undefined}
                onClick={() =>
                  autorizarMutation.mutate({
                    aprobado: false,
                    observaciones: obsAutorizacion.trim(),
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
                  {modalCambios?.some((c) => c.campo === 'Sigla' || c.campo === 'Carrera')
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
                      <Row label="Carrera" value={cargo?.escalafon?.nombre ?? ''} />
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
      <div className="sticky top-0 z-20 mb-6 rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Breadcrumb — siempre visible, con el toggle del encabezado */}
        <nav className="flex items-center gap-1.5 rounded-t-xl border-b border-gray-100 bg-gray-50/60 px-6 py-2 text-xs text-gray-500">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded px-1.5 py-0.5 font-medium text-secondary transition-colors hover:bg-secondary/10"
          >
            ← Atrás
          </button>
          <span className="text-gray-300">/</span>
          <span className="truncate font-medium text-gray-700">{c.cargo}</span>
          <button
            type="button"
            onClick={() => setHeaderAbierto((v) => !v)}
            aria-expanded={headerAbierto}
            aria-label={headerAbierto ? 'Ocultar detalle del concurso' : 'Mostrar detalle del concurso'}
            className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-secondary transition-colors hover:bg-secondary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
          >
            {headerAbierto ? 'Ocultar detalle' : 'Ver detalle'}
            <svg
              className={`h-3.5 w-3.5 transition-transform ${headerAbierto ? 'rotate-180' : ''}`}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
            </svg>
          </button>
        </nav>

        {headerAbierto && (
        <>
        {/* Detalle colapsable del concurso */}

        {/* Datos principales */}
        <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h1 className="font-primary text-xl font-bold leading-tight text-gray-900">
              {c.cargo} — {c.puesto}
            </h1>
            {c.reparticion && (
              <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-secondary">
                <span aria-hidden>🏛️</span>
                {c.reparticion}
              </p>
            )}

            {/* Metadatos como chips */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {c.hospitalNombre && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  🏥 {c.hospitalNombre}
                </span>
              )}
              {c.especialidad && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  🩺 {c.especialidad}
                </span>
              )}
              {c.escalafon && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  📋 {c.escalafon}
                </span>
              )}
            </div>

            {/* Datos de la baja que originó el concurso */}
            {(c.personaBaja !== '—' || c.eeBaja || c.fechaBaja) && (
              <div className="mt-3 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs">
                <span className="font-semibold uppercase tracking-wide text-gray-400">Baja</span>
                {c.personaBaja !== '—' && (
                  <span className="font-medium text-gray-700">{c.personaBaja}</span>
                )}
                {c.cuilBaja && <span className="text-gray-500">CUIL {c.cuilBaja}</span>}
                {c.eeBaja && <span className="font-mono text-gray-500">{c.eeBaja}</span>}
                {c.fechaBaja && <span className="text-gray-500">{c.fechaBaja}</span>}
              </div>
            )}
          </div>

          {/* Badges de estado + menú de acciones */}
          {cphData && (
            <div className="flex flex-wrap items-center gap-2 self-start">
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                {SUB_ESTADOS.find((s) => s.key === c.subEstado)?.label ?? c.subEstado}
              </span>
              {c.subEstado3 && (
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                  {c.subEstado3}
                </span>
              )}
              {motivoConcursoLabel(c.motivoConcurso) && (
                <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700">
                  {motivoConcursoLabel(c.motivoConcurso)}
                </span>
              )}
              {c.suspendido && (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-danger">
                  ⏸ Suspendido
                </span>
              )}

              {/* Menú "Acciones" */}
              <div className="relative" ref={menuAccionesRef}>
                <button
                  onClick={() => setMenuAcciones((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                >
                  ⚙ Acciones <span className="text-gray-400">▾</span>
                </button>
                {menuAcciones && (
                  <div className="absolute right-0 z-50 mt-1 w-60 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                    {/* Etiquetas: solo CPH (las CEETPS no tienen etiquetas) */}
                    {false && id && (
                      <div className="border-b border-gray-100 px-1 pb-2">
                        <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                          Etiquetas
                        </p>
                        <EtiquetasControl
                          entidad="concurso_cph"
                          entidadId={id}
                          asignadas={cphData.etiquetas ?? []}
                        />
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
                    {/* El designado se asigna desde la Etapa 5 (quien firmó el INSAL). */}
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
                                queryKey: [CEETPS_WIZARD_KEY, id],
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
          <div className="mx-6 mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            <span className="mt-px shrink-0" aria-hidden>
              📝
            </span>
            <span className="min-w-0">{c.observaciones}</span>
          </div>
        )}

        {/* Banner campos faltantes */}
        {cphData &&
          (() => {
            const sub = (cphData.subEstado ?? '').toLowerCase()
            const SUB_IDX: Record<string, number> = {
              'a-caratulado': 1,
              'a-autzn': 2,
              'b-sorteo jur': 3,
              'c-dispo de llamado': 4,
              'c2-inscripcion ex': 5,
              'd-examen publicado': 6,
              'e-orden de merito': 7,
              'f-ifacs': 8,
              'g-insal': 9,
              'h-tad': 10,
              'i-carga docu': 11,
              'j-apto med': 12,
              'k-ite': 13,
              'l-pycto de reso': 14,
              'm-reso a la firma': 15,
              'n-designado': 16,
              'o-alta sial': 17,
            }
            const idx = SUB_IDX[sub] ?? 0
            const faltantes: string[] = []
            if (idx >= 2 && !cphData.fechaAutorizacion) faltantes.push('Fecha de autorización')
            if (idx >= 4 && !cphData.disposicion) faltantes.push('Disposición de llamado')
            if (idx >= 5 && !cphData.fechaInscDesde) faltantes.push('Fecha inscripción desde')
            if (idx >= 5 && !cphData.fechaInscHasta) faltantes.push('Fecha inscripción hasta')
            if (idx >= 7 && !cphData.fechaOrdenMerito) faltantes.push('Fecha orden de mérito')
            if (idx >= 8 && !cphData.fechaIfacs) faltantes.push('Fecha IFACS')
            if (idx >= 9 && !cphData.fechaInsal) faltantes.push('Fecha INSAL')
            if (idx >= 10 && !cphData.eeDesignacion) faltantes.push('EE de designación (TAD)')
            if (idx >= 12 && !cphData.fechaAptoMedico) faltantes.push('Fecha apto médico')
            if (idx >= 14 && !cphData.proyectoResolucion) faltantes.push('Designación a la firma')
            if (idx >= 15 && !cphData.resoALaFirma) faltantes.push('Resolución a la firma')
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
                      <span className="text-orange-800">•</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })()}
        </>
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
            {etapasVisibles.map((e) => {
              const cfg = ESTADO_ETAPA_CONFIG[e.estado]
              const isActive = e.id === etapaActiva
              return (
                <button
                  key={e.id}
                  onClick={() => e.estado !== 'bloqueada' && setEtapaActiva(e.id)}
                  disabled={e.estado === 'bloqueada'}
                  title={
                    e.estado === 'bloqueada' && esNuevoCargoPendiente
                      ? 'Pendiente de autorización de SGRASV'
                      : undefined
                  }
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
              {getCasoCeetps(cphData.ceetps).validacion && (
                <button
                  type="button"
                  onClick={() => exportCeetpsPdf(cphData.ceetps, 'validacion')}
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
                  onClick={() => exportCeetpsPdf(cphData.ceetps, 'autorizacion')}
                  className="w-full btn-outline text-xs py-1 px-3 flex items-center gap-2"
                >
                  <span className="w-5 h-5 rounded bg-red-100 flex items-center justify-center text-red-600 text-[9px] font-bold shrink-0">
                    PDF
                  </span>
                  Autorización
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
                <span className="badge-default text-xs" title="Tipo de concurso">Tipo: CEETPS</span>
                {etapaActiva === 'baja' && id && puedeCorregirTipo(user, cphData) && (
                  <CorregirTipoControl
                    tipoActual="ceetps"
                    detalleId={id}
                    puestos={[cphData?.puestoSolicitado, cphData?.concurso?.cargo?.literalPuesto]}
                    etapa1Completa={etapa1CompletaParaAutorizar(cphData)}
                  />
                )}
                <span className={`${ESTADO_ETAPA_CONFIG[etapa.estado].badge} text-xs`}>
                  {ESTADO_ETAPA_CONFIG[etapa.estado].label}
                </span>
                {pendienteAutorizacion &&
                  (etapaActiva === 'baja' || !puedeVerEtapa(desdeEtapa, 'baja')) && (
                    <span className="badge-warning text-xs">⏳ Pendiente de autorización</span>
                  )}
                {puedeResolverAutorizacion &&
                  (etapaActiva === 'baja' || !puedeVerEtapa(desdeEtapa, 'baja')) && (
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

              {avisoTipo && (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800" role="status">
                  <span>✓ {avisoTipo}</span>
                  <button type="button" className="text-xs underline" onClick={() => setAvisoTipo(null)}>
                    Cerrar
                  </button>
                </div>
              )}
              {/* Paso 2a: estado de autorización de un concurso de cargo nuevo */}
              {avisoNuevoCargo && (
                <div
                  className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
                    esNuevoCargoPendiente
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-green-50 border-green-200'
                  }`}
                >
                  <span className="text-base mt-0.5">{esNuevoCargoPendiente ? '🔒' : '✅'}</span>
                  <div>
                    <p
                      className={`font-semibold ${esNuevoCargoPendiente ? 'text-amber-800' : 'text-green-800'}`}
                    >
                      {avisoNuevoCargo}
                    </p>
                    {esNuevoCargoPendiente && (
                      <p className="text-amber-700 text-xs mt-0.5">
                        Las Etapas 2 a 5 se habilitan cuando SGRASV autoriza el concurso. Cargá el
                        expediente en la Etapa 1 para solicitarla. El IF puede completarse después.
                      </p>
                    )}
                  </div>
                </div>
              )}
              {/* Paso 2a: observación del último rechazo, visible hasta que haya una nueva solicitud */}
              {etapaActiva === 'baja' &&
                !pendienteAutorizacion &&
                cphData?.ultimaAutorizacionRechazada && (
                  <div className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm">
                    <span className="text-red-500 text-base mt-0.5">⛔</span>
                    <div>
                      <p className="font-semibold text-red-800">Autorización rechazada</p>
                      <p className="text-red-700 text-xs mt-0.5 whitespace-pre-line">
                        Motivo: {cphData.ultimaAutorizacionRechazada.observaciones || 'sin observación'}
                      </p>
                      <p className="text-red-600 text-[11px] mt-1">
                        {cphData.ultimaAutorizacionRechazada.resueltaPor
                          ? `Rechazada por ${cphData.ultimaAutorizacionRechazada.resueltaPor} el `
                          : 'Rechazada el '}
                        {new Date(cphData.ultimaAutorizacionRechazada.resueltaAt).toLocaleDateString(
                          'es-AR',
                        )}
                        . Corregí y volvé a guardar para solicitarla de nuevo.
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
                  {/* ── Datos de la baja / de origen (readonly) ── */}
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
                      {cphData?.concurso?.motivoConcurso === 'nuevo_cargo'
                        ? 'Datos de origen'
                        : 'Datos de la baja'}
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

                  {/* ── Datos del concurso (editables solo en etapa activa) ──
                      Separación visual clara respecto del bloque de la baja:
                      línea superior (border-t) + espaciado. */}
                  <div className="mt-8 border-t border-gray-200 pt-6">
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
                            Carrera
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
                          {cphData?.concurso?.motivoConcurso === 'nuevo_cargo' ? (
                            <>
                              {/* Cargo nuevo ya autorizado: el IF sigue editable (no reabre la autorización). */}
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={ifAutorizacionInput}
                                  onChange={(e) => setIfAutorizacionInput(e.target.value)}
                                  placeholder="Nro. de documento IF para autorizar"
                                  className="input h-10 w-full"
                                />
                                <button
                                  type="button"
                                  className="btn-primary whitespace-nowrap"
                                  disabled={
                                    patchMutation.isPending ||
                                    (ifAutorizacionInput.trim() || null) === (cphData?.ifAutorizacion ?? null)
                                  }
                                  onClick={() =>
                                    patchMutation.mutate(
                                      { ifAutorizacion: ifAutorizacionInput.trim() || null },
                                      { onSuccess: () => toast.success('IF de autorización guardado.') },
                                    )
                                  }
                                >
                                  Guardar IF
                                </button>
                              </div>
                              <p className="text-[11px] text-gray-400 mt-1">
                                El IF puede completarse después, incluso con el concurso ya autorizado.
                              </p>
                            </>
                          ) : (
                            <input
                              type="text"
                              value={cphData?.ifAutorizacion ?? '—'}
                              className="input h-10 w-full bg-gray-50 text-gray-500"
                              readOnly
                            />
                          )}
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
                                  bloqueoEdicionEtapa1 ||
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
                              bloqueoEdicionEtapa1 ||
                              etapa.estado === 'pendiente' ||
                              etapa.estado === 'bloqueada'
                            }
                          />
                          <p className="text-[11px] text-gray-400 mt-1">
                            {cphData?.concurso?.motivoConcurso === 'nuevo_cargo'
                              ? 'El IF puede completarse después, incluso con el concurso ya autorizado.'
                              : 'Requerido para solicitar la autorización de SGRASV.'}
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
                              bloqueoEdicionEtapa1 ||
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
                          <ComboBuscable
                            modo="unico"
                            label="Carrera"
                            options={opcionesCarreraEscalafon(escalafonesOrdenados)}
                            selected={escalafonId ? [escalafonId] : []}
                            onChange={(v) => {
                              setEscalafonId(v[0] ?? '')
                              setPuestoConcurso('')
                              setEspecialidadConcurso('')
                            }}
                            placeholder="Buscar carrera..."
                            disabled={
                              bloqueoEdicionEtapa1 ||
                              etapa.estado === 'pendiente' ||
                              etapa.estado === 'bloqueada'
                            }
                          />
                        </div>
                        {/* Puesto — en cascada con escalafón */}
                        <div>
                          <ComboBuscable
                            modo="unico"
                            label="Puesto"
                            options={puestosDisponibles.map((x) => ({ value: x, label: x }))}
                            selected={puestoConcurso ? [puestoConcurso] : []}
                            onChange={(v) => {
                              setPuestoConcurso(v[0] ?? '')
                              setEspecialidadConcurso('')
                            }}
                            placeholder={
                              escalafonId ? 'Buscar puesto...' : 'Elegí una carrera primero'
                            }
                            disabled={
                              bloqueoEdicionEtapa1 ||
                              !escalafonId ||
                              etapa.estado === 'pendiente' ||
                              etapa.estado === 'bloqueada'
                            }
                          />
                        </div>
                        {/* Especialidad — condicional */}
                        {especialidadesDisponibles.length > 0 && (
                          <div>
                            <ComboBuscable
                              modo="unico"
                              label="Especialidad del concurso"
                              options={especialidadesDisponibles.map((x) => ({ value: x, label: x }))}
                              selected={especialidadConcurso ? [especialidadConcurso] : []}
                              onChange={(v) => setEspecialidadConcurso(v[0] ?? '')}
                              placeholder="Buscar especialidad..."
                              disabled={
                                bloqueoEdicionEtapa1 ||
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
                                  bloqueoEdicionEtapa1 ||
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
                    {/* Panel "reutilizar orden de mérito": solo CPH (consulta OM de CPH). */}
                  </div>
                </>
              ) : etapa.id === 'autorizacion' ? (
                <div className="space-y-5">
                  {/* Tipo de gestión — va primero: es requisito para completar la etapa. */}
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
                        ⚠ Elegí el tipo de gestión y tocá "Guardar" (acá arriba): sin él la etapa
                        no se completa.
                      </p>
                    )}
                  </div>

                  {/* Paso 5b: designar desde una orden de mérito existente (salta
                      a F — IFACS, Etapa 4). Solo con tipo de gestión guardado. */}
                  {/* Panel de órdenes de mérito disponibles: solo CPH */}
                  {/* Asignación manual del jurado (reemplaza el sorteo de CPH) */}
                  {id && (
                    <JuradoAsignacionPanel
                      concursoId={id}
                      bloqueado={etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'}
                    />
                  )}

                  {/* Campos de autorización — debajo del jurado, arriba de Observaciones. */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {etapa.campos
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
                  {id && (
                    <>
                      <CronogramaCeetps
                        concursoId={id}
                        cronograma={cphData?.ceetps?.cronograma}
                        fechasActuales={aplanarFechasCeetps(cphData?.ceetps)}
                        pasoEnCurso={pasoActual(inscriptosCeetps)}
                        bloqueado={etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'}
                      />
                      <InscriptosCeetpsPanel
                        concursoId={id}
                        minimos={{
                          examen: cphData?.ceetps?.puntajeMinimoExamen ?? null,
                          cv: cphData?.ceetps?.puntajeMinimoCv ?? null,
                          entrevista: cphData?.ceetps?.puntajeMinimoEntrevista ?? null,
                        }}
                        bloqueado={etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'}
                      />
                    </>
                  )}
                </div>
              ) : etapa.id === 'ifacs_insal' ? (
                (() => {
                  // Guardado habilitado solo si hay algo cargado Y difiere de lo
                  // persistido (si ya está guardado igual, se deshabilita).
                  const ifacsGuardado = cphData?.fechaIfacs?.slice(0, 10) ?? ''
                  const insalGuardado = cphData?.fechaInsal?.slice(0, 10) ?? ''
                  const ifacsVacio = !ifacsForm.fechaIfacs
                  const insalVacio = !insalForm.fechaInsal
                  const ifacsSinCambios = ifacsForm.fechaIfacs === ifacsGuardado
                  const insalSinCambios = insalForm.fechaInsal === insalGuardado
                  return (
                    <div className="space-y-5">
                      {/* IFACS */}
                      <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
                        <p className="text-sm font-semibold text-gray-800 mb-3">IFACS</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                          onClick={() => {
                            if (!fechasEnOrden({ fechaIfacs: ifacsForm.fechaIfacs || null })) return
                            patchMutation.mutate(
                              {
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
                          }}
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
                            ⚠ Reservá al candidato (arriba) antes de cargar la fecha
                            INSAL — es la notificación al ganador del concurso.
                          </p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                          onClick={() => {
                            if (!fechasEnOrden({ fechaInsal: insalForm.fechaInsal || null })) return
                            patchMutation.mutate(
                              {
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
                          }}
                        >
                          {insalSinCambios && !insalVacio ? '✓ INSAL guardado' : '💾 Guardar INSAL'}
                        </button>
                      </div>

                      {/* CEETPS: no hay paso de aceptación; el candidato reservado pasa directo a la Etapa 5. */}

                    </div>
                  )
                })()
              ) : etapa.id === 'designacion' ? (
                (() => {
                  const bloqueada =
                    etapa.estado === 'pendiente' || etapa.estado === 'bloqueada'
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
                      {/* Designado = quien firmó el INSAL en la Etapa 4. Solo se vincula (CUIL +
                          nombre); NO ocupa el cargo: eso pasa cuando aparezca en el padrón. */}
                      {cphData && !cphData.personaDesignadaId && !cphData.designadoRefCuil && !cphData.designadoRefNombre && (
                        inscriptoReservado ? (
                          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-center justify-between gap-4">
                            <div>
                              <p className="text-sm font-semibold text-blue-800">
                                Designar al candidato propuesto en la Etapa 4
                              </p>
                              <p className="text-sm font-bold text-gray-900 mt-1">
                                {inscriptoReservado.apellido}, {inscriptoReservado.nombre}
                              </p>
                              <p className="text-xs text-gray-600">
                                {inscriptoReservado.cuil ? (
                                  <>CUIL <span className="font-mono">{inscriptoReservado.cuil}</span></>
                                ) : (
                                  'Sin CUIL cargado: completalo en el paso siguiente.'
                                )}
                              </p>
                              <p className="text-xs text-blue-600 mt-0.5">
                                No ocupa el cargo: eso pasa cuando la persona aparezca en el padrón.
                              </p>
                            </div>
                            <button
                              className="btn-primary text-sm shrink-0"
                              onClick={() => {
                                setManualCuil(inscriptoReservado.cuil ?? '')
                                setManualNombre(
                                  `${inscriptoReservado.apellido}, ${inscriptoReservado.nombre}`,
                                )
                                setManualIdSial('')
                                setModalDesignarModo('manual')
                                setModalDesignar(true)
                              }}
                            >
                              Designar
                            </button>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                            ⚠ Todavía no hay un candidato propuesto. Elegilo en la Etapa 4
                            («Proponer candidato»).
                          </div>
                        )
                      )}
                      {/* Designado ya cargado (referencia o persona vinculada). Editable. */}
                      {cphData && (cphData.designadoRefCuil || cphData.designadoRefNombre) && (
                        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-blue-800">✍ Designado</p>
                            <p className="text-sm font-bold text-gray-900 mt-1">
                              {cphData.designadoRefNombre ?? '—'}
                            </p>
                            <p className="text-xs text-gray-600">
                              {cphData.designadoRefCuil && <>CUIL <span className="font-mono">{cphData.designadoRefCuil}</span></>}
                              {cphData.designadoRefIdSialRol && <> · ID SIAL rol <span className="font-mono">{cphData.designadoRefIdSialRol}</span></>}
                            </p>
                            <p className="text-xs text-blue-600 mt-0.5">
                              {cphData.personaDesignadaId
                                ? 'Vinculado a una persona de la base. El cargo se ocupa cuando el padrón la confirme.'
                                : 'A la espera del padrón. Cuando la persona aparezca con este CUIL, el cargo pasa a ocupado.'}
                            </p>
                          </div>
                          <div className="flex flex-col gap-2 shrink-0">
                            <button
                              className="btn-secondary text-sm"
                              onClick={() => {
                                setManualCuil(cphData.designadoRefCuil ?? '')
                                setManualNombre(cphData.designadoRefNombre ?? '')
                                setManualIdSial(cphData.designadoRefIdSialRol ?? '')
                                setModalDesignarModo('manual')
                                setModalDesignar(true)
                              }}
                            >
                              ✏ Editar
                            </button>
                          </div>
                        </div>
                      )}
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
                                    {(ocup.especialidad ?? ocup.especialidadLegacy) && (
                                      <p>
                                        Especialidad:{' '}
                                        <span className="text-gray-800">
                                          {ocup.especialidad ?? ocup.especialidadLegacy}
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

                      {/* ── ABAJO: tarjetas de la designación (se guardan solas) ── */}
                      <DesignacionCeetps
                        concursoId={id!}
                        valores={cphData as unknown as Record<string, unknown> | undefined}
                        fechasActuales={aplanarFechasCeetps(
                          (cphData as unknown as { ceetps?: ConcursoCeetps } | undefined)?.ceetps,
                        )}
                        bloqueada={bloqueada}
                        guardar={(campos) => patchMutation.mutateAsync(campos)}
                        confirmar={confirm}
                        onVolverAEtapa4={() => setEtapaActiva('ifacs_insal')}
                      />
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
                        'c-dispo de llamado',
                        'c2-inscripcion ex',
                        'd-examen publicado',
                        'e-orden de merito',
                        'f-ifacs',
                        'g-insal',
                        'h-tad',
                        'i-carga docu',
                        'j-apto med',
                        'k-ite',
                        'l-pycto de reso',
                        'm-reso a la firma',
                        'n-designado',
                        'o-alta sial',
                      ].includes((cphData.subEstado ?? '').toLowerCase())

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
                  defaultValue=""
                  rows={2}
                  className="input w-full py-2"
                  placeholder="Notas internas sobre esta etapa..."
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <div className="flex gap-2">
                {anteriorVisible(etapasVisibles, etapa.numero) && (
                  <button
                    className="btn-outline"
                    onClick={() => {
                      const prev = anteriorVisible(etapasVisibles, etapa.numero)
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
                {pendienteAutorizacion && etapaActiva === 'baja' && (
                  <div className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-1.5 max-w-md">
                    <span className="font-semibold">
                      Modificación pendiente de autorización del Director.
                    </span>{' '}
                    La nueva sigla/carrera se aplicarán cuando se apruebe.
                  </div>
                )}
                {etapa.estado !== 'pendiente' &&
                  etapa.estado !== 'bloqueada' &&
                  etapa.estado !== 'completada' && (
                    <>
                      {etapaActiva === 'baja' && !etapaBajaCompleta && (
                        <span className="text-xs text-gray-400">
                          Completá expediente,
                          sigla, carrera, puesto
                          {especialidadesDisponibles.length > 0 ? ' y especialidad' : ''}
                        </span>
                      )}
                      <button
                        className="btn-primary"
                        disabled={
                          (bloqueoEdicionEtapa1 && etapaActiva === 'baja') || !etapaBajaCompleta
                        }
                        title={
                          bloqueoEdicionEtapa1 && etapaActiva === 'baja'
                            ? 'Hay una modificación pendiente de autorización por SGRASV'
                            : !etapaBajaCompleta
                              ? 'Completá todos los campos requeridos'
                              : undefined
                        }
                        onClick={handleGuardar}
                      >
                        {siguienteVisible(etapasVisibles, etapa.numero)
                          ? 'Guardar y continuar →'
                          : 'Guardar cambios'}
                      </button>
                    </>
                  )}
              </div>
            </div>
          </div>

          {/* Historial */}
          {/* El historial lee el acta del sorteo de CPH: CEETPS asigna el jurado a mano. */}
          <HistorialCambios cphData={cphData} juradoData={null} />
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
