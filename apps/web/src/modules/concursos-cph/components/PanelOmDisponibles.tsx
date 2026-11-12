// Paso 5b — Panel "Órdenes de mérito disponibles" de la Etapa 2 (Jurado / Dispo).
// Aparece tras guardar el Tipo de gestión y solo para quien ve la Etapa 2.
// Designar desde una OM existente salta jurado, inscripción, examen, orden de
// mérito propio y deja el concurso en F — IFACS (Etapa 4), donde el ministerio
// avisa al hospital que hay un postulante designado.
// "Seguir con el concurso" solo oculta la oferta en la sesión (sin llamadas).
import { useState } from 'react'
import type { ConcursoCph, OmDisponible, OmDisponibleIntegrante, Usuario } from '@srrhh/types'
import {
  useDesignarDesdeOm,
  useOmDisponibles,
  useRechazarIntegranteOm,
} from '../hooks/useConcursosCph'
import { useConfirm } from '@/shared/components/ui/useConfirm'
import { useToast } from '@/shared/components/ui/useToast'
import { esNuevoCargoSinAutorizar } from '../lib/bloqueoAutorizacion'
import { etiquetaOm, puedeOperarOm, textoNoHabilitado } from '../lib/saltoOm'

function msgError(e: unknown, fallback: string): string {
  return (
    (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
      ?.message ?? fallback
  )
}

function fecha(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—'
}

function fechaHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? fecha(iso) : d.toLocaleString('es-AR')
}

const PASOS_SALTADOS = [
  'Sorteo de jurado',
  'Inscripción',
  'Examen',
  'Orden de mérito propio',
]

interface Props {
  concursoId: string
  cph: ConcursoCph | null | undefined
  user: Usuario | null | undefined
  /** Se llama tras designar con éxito (el wizard pasa a la Etapa 4, IFACS). */
  onDesignado?: () => void
}

export function PanelOmDisponibles({ concursoId, cph, user, onDesignado }: Props) {
  const permitido = puedeOperarOm(user)
  const bloqueado = esNuevoCargoSinAutorizar(cph?.concurso)
  const salto = cph?.saltoOm ?? null
  const tieneTipoGestion = !!cph?.tipoGestion
  const consultar = permitido && !bloqueado && !salto && tieneTipoGestion
  const { data, isLoading } = useOmDisponibles(concursoId, consultar)
  const designar = useDesignarDesdeOm(concursoId)
  const rechazar = useRechazarIntegranteOm(concursoId)
  const { toast, ToastUI } = useToast()
  const { confirm, ConfirmUI } = useConfirm()
  const [descartado, setDescartado] = useState(false)
  const [elegido, setElegido] = useState<{
    orden: OmDisponible
    integrante: OmDisponibleIntegrante
  } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [errorModal, setErrorModal] = useState<string | null>(null)

  if (!permitido || bloqueado || !cph) return null

  // Trazabilidad tras el salto.
  if (salto) {
    return (
      <div
        className="rounded-lg border border-green-200 bg-green-50 px-4 py-4"
        aria-label="Designación desde orden de mérito"
      >
        <p className="text-sm font-semibold text-green-800">Designado desde orden de mérito</p>
        <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-gray-700 sm:grid-cols-2">
          <div>
            <dt className="inline text-gray-500">Persona: </dt>
            <dd className="inline font-medium">{salto.integrante.apellidoNombre}</dd>
          </div>
          <div>
            <dt className="inline text-gray-500">Posición: </dt>
            <dd className="inline font-medium">{salto.integrante.posicion}</dd>
          </div>
          <div>
            <dt className="inline text-gray-500">CUIL: </dt>
            <dd className="inline font-mono">{salto.integrante.cuil}</dd>
          </div>
          <div>
            <dt className="inline text-gray-500">Concurso de origen: </dt>
            <dd className="inline font-medium">{salto.concursoOrigen?.codigo ?? '—'}</dd>
          </div>
          <div>
            <dt className="inline text-gray-500">Tipo de gestión del origen: </dt>
            <dd className="inline font-medium">{salto.tipoGestionOrigen ?? 'Sin definir'}</dd>
          </div>
          <div>
            <dt className="inline text-gray-500">Quién y cuándo: </dt>
            <dd className="inline font-medium">
              {salto.usuario ?? 'Usuario no identificado'} · {fechaHora(salto.at)}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-gray-600">
          Pasos resueltos por orden de mérito existente: {PASOS_SALTADOS.join(', ')}.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Marcar que la persona no aceptó el cargo"
            className="btn-outline border-red-300 px-2 py-1 text-xs text-danger"
            disabled={rechazar.isPending}
            onClick={async () => {
              const ok = await confirm({
                titulo: 'No aceptó el cargo',
                mensaje: `Se anula a ${salto.integrante.apellidoNombre} en la orden de mérito y el concurso vuelve a la Etapa 2. ¿Continuar?`,
                confirmLabel: 'Sí, no aceptó',
                peligro: true,
              })
              if (!ok) return
              try {
                const r = await rechazar.mutateAsync({ integranteId: salto.integrante.id })
                toast.info(
                  r.disponiblesRestantes > 0
                    ? `Candidato anulado. Quedan ${r.disponiblesRestantes} disponible(s) en la orden de mérito.`
                    : 'Candidato anulado. No quedan más personas en la orden de mérito.',
                )
              } catch (e) {
                toast.error(msgError(e, 'No se pudo anular el candidato'))
              }
            }}
          >
            No aceptó el cargo
          </button>
          <span className="text-[11px] text-gray-500">
            Revierte el salto: el concurso vuelve a la Etapa 2.
          </span>
        </div>
        {ConfirmUI}
        {ToastUI}
      </div>
    )
  }

  // Sin tipo de gestión guardado: aviso corto.
  if (!tieneTipoGestion) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        {textoNoHabilitado('sin_tipo_gestion')}
      </p>
    )
  }

  if (descartado || isLoading || !data) return null

  if (!data.habilitado) {
    return (
      <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
        {textoNoHabilitado(data.motivoNoHabilitado)}
      </p>
    )
  }

  if (data.ordenes.length === 0) {
    return (
      <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
        No hay órdenes de mérito disponibles para este concurso. Continuá con el concurso normal.
      </p>
    )
  }

  function cerrarModal() {
    if (designar.isPending) return
    setElegido(null)
    setMotivo('')
    setErrorModal(null)
  }

  async function confirmarDesignacion() {
    if (!elegido || designar.isPending) return
    setErrorModal(null)
    try {
      await designar.mutateAsync({
        integranteId: elegido.integrante.id,
        motivo: motivo.trim() || undefined,
      })
      toast.success(`${elegido.integrante.apellidoNombre} designado desde la orden de mérito`)
      setElegido(null)
      setMotivo('')
      onDesignado?.()
    } catch (e) {
      setErrorModal(msgError(e, 'No se pudo designar desde la orden de mérito'))
    }
  }

  return (
    <div
      className="rounded-lg border border-secondary/30 bg-secondary/5 px-4 py-4"
      aria-label="Órdenes de mérito disponibles"
    >
      <p className="text-sm font-semibold text-gray-800">Órdenes de mérito disponibles</p>
      <p className="mt-1 text-xs text-gray-600">
        Si designás a una persona de una orden de mérito vigente, el concurso pasa directo a la
        F — IFACS (Etapa 4). Si preferís, seguí con el concurso normal.
      </p>
      <div className="mt-3 space-y-3">
        {data.ordenes.map((o) => (
          <div key={o.id} className="rounded border border-gray-200 bg-white p-3">
            <p className="text-xs font-medium text-gray-700">{etiquetaOm(o)}</p>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Origen: {o.concursoOrigen.hospital.sigla ?? o.concursoOrigen.hospital.nombre ?? '—'} ·{' '}
              {o.concursoOrigen.tipoGestion ?? 'tipo de gestión sin definir'}
              {o.expediente ? ` · Exp. ${o.expediente}` : ''}
            </p>
            {o.advertencias.map((a) => (
              <p
                key={a}
                className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800"
              >
                ⚠ {a}
              </p>
            ))}
            <ul className="mt-2 space-y-1">
              {o.integrantes.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
                  <span>
                    <span className="font-mono text-gray-400">{i.posicion}.</span>{' '}
                    {i.apellidoNombre}
                  </span>
                  <button
                    type="button"
                    className="btn-outline px-2 py-1 text-xs"
                    aria-label={`Designar a ${i.apellidoNombre} desde esta orden de mérito`}
                    disabled={designar.isPending}
                    onClick={() => {
                      setErrorModal(null)
                      setElegido({ orden: o, integrante: i })
                    }}
                  >
                    Designar desde esta orden de mérito
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <button
          type="button"
          className="btn-outline px-3 py-1 text-xs"
          aria-label="Seguir con el concurso sin usar una orden de mérito"
          onClick={() => setDescartado(true)}
        >
          Seguir con el concurso
        </button>
      </div>

      {elegido && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="om-designar-titulo"
            className="mx-4 w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl"
          >
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 id="om-designar-titulo" className="font-primary font-bold text-gray-900">
                Designar desde orden de mérito
              </h3>
            </div>
            <div className="space-y-3 px-6 py-5 text-sm text-gray-600">
              <p>
                Se designará a <strong>{elegido.integrante.apellidoNombre}</strong> (posición{' '}
                {elegido.integrante.posicion}) de la orden de mérito{' '}
                <strong>{elegido.orden.concursoOrigen.codigo ?? 'seleccionada'}</strong>.
              </p>
              <div>
                <p>Se saltan estas etapas y el concurso pasa a F — IFACS:</p>
                <ul className="mt-1 list-disc pl-5 text-xs">
                  <li>Sorteo de jurado</li>
                  <li>Inscripción</li>
                  <li>Examen</li>
                  <li>Orden de mérito propio</li>
                </ul>
              </div>
              <div>
                <label htmlFor="om-designar-motivo" className="block text-xs text-gray-500">
                  Motivo (opcional)
                </label>
                <textarea
                  id="om-designar-motivo"
                  className="input mt-1 w-full py-2 text-sm"
                  rows={2}
                  maxLength={300}
                  value={motivo}
                  disabled={designar.isPending}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </div>
              {errorModal && (
                <p
                  role="alert"
                  className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                >
                  {errorModal}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                className="btn-outline"
                disabled={designar.isPending}
                onClick={cerrarModal}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={designar.isPending}
                onClick={confirmarDesignacion}
              >
                {designar.isPending ? 'Designando…' : 'Confirmar designación'}
              </button>
            </div>
          </div>
        </div>
      )}
      {ConfirmUI}
      {ToastUI}
    </div>
  )
}
