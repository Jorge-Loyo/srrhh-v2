import { useEffect, useState } from 'react'
import { errorEnCadenaFechas, type FechasCadenaCeetps } from '@srrhh/types'
import { useToast } from '@/shared/components/ui/useToast'
import {
  APTO,
  NO_APTO,
  PASOS_DESIGNACION,
  bodyCampoDesignacion,
  desigFormDesde,
  type DesigForm,
} from '../lib/designacionCampos'
import { useHistorialDesignacionCeetps, useNoAptoCeetps } from '../hooks/useCeetpsWizard'

// Etapa 5 del wizard CEETPS: las tarjetas de la designación. No hay botón
// "Registrar": cada campo se guarda solo al completarlo (texto al salir del campo;
// fecha, casilla y resultado al cambiar). Las fechas no pueden ir para atrás.

type Confirmar = (o: {
  titulo: string
  mensaje: string
  peligro?: boolean
  confirmLabel?: string
}) => Promise<boolean>

function mensajeError(e: unknown, defecto: string): string {
  const data = (e as { response?: { data?: { error?: { message?: string }; message?: string } } })
    ?.response?.data
  return data?.error?.message ?? data?.message ?? defecto
}

const CLAVE_FECHA: Partial<Record<keyof DesigForm, string>> = {
  fechaAptoMedico: 'fechaAptoMedico',
  fechaDispoDesignacion: 'fechaDispoDesignacion',
}

function fechaLegible(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function DesignacionCeetps({
  concursoId,
  valores,
  fechasActuales,
  bloqueada,
  guardar,
  confirmar,
  onVolverAEtapa4,
}: {
  concursoId: string
  /** Concurso en la forma que usa el wizard (adaptador CPH). */
  valores: Record<string, unknown> | undefined
  /** Fechas actuales del concurso, para validar el orden de las nuevas. */
  fechasActuales: FechasCadenaCeetps
  bloqueada: boolean
  guardar: (campos: Record<string, unknown>) => Promise<unknown>
  confirmar: Confirmar
  onVolverAEtapa4: () => void
}) {
  const { toast, ToastUI } = useToast()
  const [form, setForm] = useState<DesigForm>(() => desigFormDesde(valores))
  const [errores, setErrores] = useState<Partial<Record<keyof DesigForm, string>>>({})
  const [guardado, setGuardado] = useState<string | null>(null)
  const noApto = useNoAptoCeetps(concursoId)
  const historial = useHistorialDesignacionCeetps(concursoId)

  useEffect(() => setForm(desigFormDesde(valores)), [valores])

  const servidor = desigFormDesde(valores)

  async function guardarCampo(key: keyof DesigForm, valor: string | boolean) {
    setErrores((e) => ({ ...e, [key]: undefined }))
    const claveFecha = CLAVE_FECHA[key]
    if (claveFecha && typeof valor === 'string' && valor) {
      const error = errorEnCadenaFechas(fechasActuales, { [claveFecha]: valor })
      if (error) {
        setErrores((e) => ({ ...e, [key]: error }))
        setForm((f) => ({ ...f, [key]: servidor[key] }))
        return
      }
    }
    try {
      await guardar(bodyCampoDesignacion(key, valor))
      setGuardado(key)
      setTimeout(() => setGuardado((g) => (g === key ? null : g)), 2000)
    } catch (e) {
      setForm((f) => ({ ...f, [key]: servidor[key] }))
      toast.error(mensajeError(e, 'No se pudo guardar el dato.'))
    }
  }

  async function cambiarResultado(valor: string) {
    if (valor !== NO_APTO) {
      setForm((f) => ({ ...f, estadoApto: valor }))
      await guardarCampo('estadoApto', valor)
      return
    }
    const ok = await confirmar({
      titulo: 'Candidato no apto',
      mensaje:
        'El concurso vuelve a la Etapa 4 para proponer a otro candidato. Los datos cargados de este candidato quedan guardados en el historial.',
      peligro: true,
      confirmLabel: 'Marcar como No apto',
    })
    if (!ok) {
      setForm((f) => ({ ...f, estadoApto: servidor.estadoApto }))
      return
    }
    try {
      await noApto.mutateAsync()
      toast.success('Candidato registrado como No apto. Elegí a otro en la Etapa 4.')
      onVolverAEtapa4()
    } catch (e) {
      setForm((f) => ({ ...f, estadoApto: servidor.estadoApto }))
      toast.error(mensajeError(e, 'No se pudo registrar el No apto.'))
    }
  }

  return (
    <div className="space-y-3">
      {ToastUI}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-800">Pasos de la designación</p>
        <p className="text-xs text-gray-400">Los datos se guardan solos al completarlos.</p>
      </div>

      {PASOS_DESIGNACION.map((paso) => (
        <div
          key={paso.id}
          className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-end gap-x-4 gap-y-3"
        >
          {paso.campos.map((campo) => {
            const error = errores[campo.key]
            const ok = guardado === campo.key
            const aviso = error ? (
              <p className="mt-1 text-xs text-danger">{error}</p>
            ) : ok ? (
              <p className="mt-1 text-xs text-green-600">✓ Guardado</p>
            ) : null

            if (campo.tipo === 'checkbox') {
              return (
                <div key={campo.key} className="basis-full">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={form[campo.key] as boolean}
                      disabled={bloqueada}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, [campo.key]: e.target.checked }))
                        void guardarCampo(campo.key, e.target.checked)
                      }}
                    />
                    {campo.label}
                  </label>
                  {aviso}
                </div>
              )
            }

            if (campo.tipo === 'apto') {
              return (
                <div key={campo.key} className="min-w-[150px]">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    {campo.label}
                  </label>
                  <select
                    className="input h-10 w-full"
                    value={form.estadoApto}
                    disabled={bloqueada || noApto.isPending}
                    onChange={(e) => void cambiarResultado(e.target.value)}
                  >
                    <option value="">—</option>
                    <option value={APTO}>Apto</option>
                    <option value={NO_APTO}>No apto</option>
                  </select>
                  {aviso}
                </div>
              )
            }

            return (
              <div
                key={campo.key}
                className={campo.tipo === 'fecha' ? 'min-w-[170px]' : 'flex-1 min-w-[200px]'}
              >
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  {campo.label}
                </label>
                <input
                  type={campo.tipo === 'fecha' ? 'date' : 'text'}
                  value={form[campo.key] as string}
                  disabled={bloqueada}
                  onChange={(e) => {
                    const valor = e.target.value
                    setForm((f) => ({ ...f, [campo.key]: valor }))
                    // La fecha se guarda al elegirla; el texto, al salir del campo.
                    if (campo.tipo === 'fecha' && valor !== servidor[campo.key])
                      void guardarCampo(campo.key, valor)
                  }}
                  onBlur={() => {
                    if (campo.tipo === 'texto' && form[campo.key] !== servidor[campo.key])
                      void guardarCampo(campo.key, form[campo.key] as string)
                  }}
                  className="input h-10 w-full"
                />
                {aviso}
              </div>
            )
          })}
        </div>
      ))}

      {historial.data && historial.data.length > 0 && (
        <details className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-amber-900">
            Candidatos anteriores que no fueron aptos ({historial.data.length})
          </summary>
          <div className="mt-3 space-y-3">
            {historial.data.map((h) => {
              const d = h.datos as Record<string, string | boolean | null>
              const fila = (rotulo: string, valor: string | boolean | null | undefined) =>
                valor === null || valor === undefined || valor === '' ? null : (
                  <p key={rotulo} className="text-xs text-gray-600">
                    {rotulo}:{' '}
                    <span className="text-gray-800">
                      {valor === true
                        ? 'Sí'
                        : typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)
                          ? fechaLegible(valor)
                          : String(valor)}
                    </span>
                  </p>
                )
              return (
                <div key={h.id} className="rounded border border-amber-200 bg-white px-3 py-2">
                  <p className="text-sm font-bold text-gray-900">{h.apellidoNombre}</p>
                  <p className="text-xs text-gray-500 mb-1">
                    {h.cuil ? `CUIL ${h.cuil} · ` : ''}No apto el {fechaLegible(h.createdAt)}
                  </p>
                  {fila('Número de nota', h.numeroNota)}
                  {fila('EE de designación', d.expedienteDesignacion)}
                  {fila('Fecha apto médico', d.fechaAptoMedico)}
                  {fila('Designación a la firma', d.proyectoResolucion)}
                  {fila('Disposición de designación', d.dispoDesignacion)}
                  {fila('Fecha de disposición', d.fechaDispoDesignacion)}
                  {fila('Resolución a la firma', d.resoALaFirma)}
                  {fila('Resolución de convalidación', d.resolucionConvalidacion)}
                  {fila('Fecha INSAL', d.fechaInsal)}
                </div>
              )
            })}
          </div>
        </details>
      )}
    </div>
  )
}
