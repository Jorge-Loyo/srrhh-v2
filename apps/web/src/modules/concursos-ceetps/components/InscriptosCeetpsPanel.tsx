import { useEffect, useState, type ReactNode } from 'react'
import type { InscriptoCeetpsDto } from '@srrhh/types'
import { useToast } from '@/shared/components/ui/useToast'
import { useConfirm } from '@/shared/components/ui/useConfirm'
import {
  useActualizarInscriptoCeetps,
  useCrearInscriptoCeetps,
  useEliminarInscriptoCeetps,
  useInscriptosCeetps,
  useMarcarDocumentacionCeetps,
  usePatchConcursoCeetps,
  type InscriptoCeetpsCambios,
} from '../hooks/useCeetpsWizard'
import { PASOS_CEETPS, inscriptosDelPaso, type PasoCeetps } from '../lib/inscriptosCeetps'
import {
  filtrarInscriptos,
  ordenarFinalistas,
  paginar,
  pasoActual,
  type ColumnaOrden,
} from '../lib/pasosVista'
import { ImportarPasoExcel } from './ImportarPasoExcel'
import { TextoModal } from './TextoModal'

// Etapa 3 del wizard CEETPS: los pasos del concurso (inscripción →
// admisibilidad → examen → análisis curricular → entrevista → orden de mérito
// final). Cada paso es una tarjeta que abre un modal con las personas que llegaron
// a él (con buscador y paginación). Todo es editable durante el concurso y se
// guarda al salir de cada campo. La posición del orden de mérito es automática.

interface Minimos {
  examen: number | null
  cv: number | null
  entrevista: number | null
}

const CAMPO_MINIMO: Record<'examen' | 'cv' | 'entrevista', string> = {
  examen: 'puntajeMinimoExamen',
  cv: 'puntajeMinimoCv',
  entrevista: 'puntajeMinimoEntrevista',
}

const POR_PAGINA = 10

const DESCRIPCION_PASO: Record<PasoCeetps, string> = {
  inscripcion: 'Alta de inscriptos y entrega de documentación',
  admisibilidad: 'Admitidos / no admitidos y reclamos',
  examen: 'Nota del examen y reclamos',
  cv: 'Puntaje del análisis curricular',
  entrevista: 'Puntaje de la entrevista',
  orden: 'Posición final, calculada con las notas',
}

function mensajeError(e: unknown, porDefecto: string): string {
  const data = (e as { response?: { data?: { error?: { message?: string }; message?: string } } })
    ?.response?.data
  return data?.error?.message ?? data?.message ?? porDefecto
}

// ── Celdas editables (guardan al salir del campo, solo si cambió) ─────────────

function CampoTexto({
  valor,
  onGuardar,
  disabled,
  requerido = false,
  placeholder,
  className = 'w-full',
  tipo = 'text',
}: {
  valor: string | null
  onGuardar: (v: string | null) => void
  disabled: boolean
  // Requerido: vaciarlo no se guarda, vuelve al valor anterior.
  requerido?: boolean
  placeholder?: string
  className?: string
  tipo?: 'text' | 'email' | 'tel'
}) {
  const [texto, setTexto] = useState(valor ?? '')
  useEffect(() => setTexto(valor ?? ''), [valor])
  return (
    <input
      type={tipo}
      value={texto}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        const nuevo = texto.trim() || null
        if (requerido && nuevo == null) {
          setTexto(valor ?? '')
          return
        }
        if (nuevo !== (valor ?? null)) onGuardar(nuevo)
      }}
      className={`input h-8 text-sm ${className}`}
    />
  )
}

function CampoNumero({
  valor,
  onGuardar,
  disabled,
  min = 0,
  className = 'w-24',
}: {
  valor: number | null
  onGuardar: (v: number | null) => void
  disabled: boolean
  min?: number
  className?: string
}) {
  const [texto, setTexto] = useState(valor == null ? '' : String(valor))
  useEffect(() => setTexto(valor == null ? '' : String(valor)), [valor])
  return (
    <input
      type="number"
      min={min}
      step="any"
      value={texto}
      disabled={disabled}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        const limpio = texto.trim().replace(',', '.')
        const nuevo = limpio === '' ? null : Number(limpio)
        if (nuevo != null && (!Number.isFinite(nuevo) || nuevo < min)) {
          setTexto(valor == null ? '' : String(valor))
          return
        }
        if (nuevo !== valor) onGuardar(nuevo)
      }}
      className={`input h-8 text-sm ${className}`}
    />
  )
}

function Resultado({ pasa }: { pasa: boolean | null }) {
  if (pasa === true) return <span className="text-xs font-semibold text-green-700">✓ Aprobó</span>
  if (pasa === false) return <span className="text-xs font-semibold text-red-700">✗ No aprobó</span>
  return <span className="text-xs text-gray-400">Pendiente</span>
}

// Botón que abre la ventana de un texto largo (ver, escribir o editar).
function BotonTexto({
  valor,
  onAbrir,
  etiqueta,
}: {
  valor: string | null
  onAbrir: () => void
  etiqueta: string
}) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      title={valor ?? undefined}
      className="max-w-[220px] truncate rounded border border-gray-200 px-2 py-1 text-left text-xs text-gray-700 hover:bg-gray-50"
    >
      {valor ? valor : <span className="text-gray-400">{etiqueta}</span>}
    </button>
  )
}

function Tabla({ columnas, children }: { columnas: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
          <tr>
            {columnas.map((c, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  )
}

const nombreDe = (i: InscriptoCeetpsDto) => `${i.apellido}, ${i.nombre}`

const ALTA_VACIA = { apellido: '', nombre: '', dni: '', cuil: '', email: '', telefono: '' }

type CampoTextoLargo =
  'motivoNoAdmision' | 'resultadoReclamoAdmisibilidad' | 'resultadoReclamoExamen'

// ── Panel ─────────────────────────────────────────────────────────────────────

export function InscriptosCeetpsPanel({
  concursoId,
  minimos,
  bloqueado,
}: {
  concursoId: string
  minimos: Minimos
  bloqueado: boolean
}) {
  const { toast, ToastUI } = useToast()
  const { confirm, ConfirmUI } = useConfirm()
  const { data: inscriptos = [], isLoading } = useInscriptosCeetps(concursoId)
  const crear = useCrearInscriptoCeetps(concursoId)
  const actualizar = useActualizarInscriptoCeetps(concursoId)
  const eliminar = useEliminarInscriptoCeetps(concursoId)
  const marcarDocumentacion = useMarcarDocumentacionCeetps(concursoId)
  const patchConcurso = usePatchConcursoCeetps(concursoId)

  const [abierto, setAbierto] = useState<PasoCeetps | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  const [orden, setOrden] = useState<{ columna: ColumnaOrden; desc: boolean }>({
    columna: 'posicion',
    desc: false,
  })
  const [texto, setTexto] = useState<{
    titulo: string
    subtitulo: string
    valor: string | null
    campo: CampoTextoLargo
    inscripto: InscriptoCeetpsDto
  } | null>(null)
  const [alta, setAlta] = useState(ALTA_VACIA)
  const [altaAbierta, setAltaAbierta] = useState(false)

  const enCurso = pasoActual(inscriptos)
  // No se deshabilita mientras se guarda: al pasar con Tab de un campo al
  // siguiente, el guardado del anterior no tiene que hacer perder el foco.
  const deshabilitado = bloqueado

  function abrir(paso: PasoCeetps) {
    setAbierto(paso)
    setBusqueda('')
    setPagina(1)
  }

  function guardar(i: InscriptoCeetpsDto, cambios: InscriptoCeetpsCambios) {
    actualizar.mutate(
      { inscriptoId: i.id, cambios },
      { onError: (e) => toast.error(mensajeError(e, 'No se pudo guardar el cambio.')) },
    )
  }

  function guardarMinimo(clave: 'examen' | 'cv' | 'entrevista', valor: number | null) {
    patchConcurso.mutate(
      { [CAMPO_MINIMO[clave]]: valor },
      {
        onSuccess: () => toast.success('Puntaje mínimo guardado.'),
        onError: (e) => toast.error(mensajeError(e, 'No se pudo guardar el puntaje mínimo.')),
      },
    )
  }

  async function onEliminar(i: InscriptoCeetpsDto) {
    const ok = await confirm({
      titulo: 'Quitar inscripto',
      mensaje: `¿Quitar a ${nombreDe(i)} del concurso? Se pierden los datos de todos sus pasos.`,
    })
    if (!ok) return
    eliminar.mutate(i.id, {
      onSuccess: () => toast.success('Inscripto quitado.'),
      onError: (e) => toast.error(mensajeError(e, 'No se pudo quitar al inscripto.')),
    })
  }

  function onAgregar() {
    crear.mutate(
      {
        apellido: alta.apellido.trim(),
        nombre: alta.nombre.trim(),
        dni: alta.dni.trim() || null,
        cuil: alta.cuil.trim() || null,
        email: alta.email.trim() || null,
        telefono: alta.telefono.trim() || null,
      },
      {
        onSuccess: () => {
          setAlta(ALTA_VACIA)
          toast.success('Inscripto agregado.')
        },
        onError: (e) => toast.error(mensajeError(e, 'No se pudo agregar al inscripto.')),
      },
    )
  }

  async function onMarcarTodos() {
    const ok = await confirm({
      titulo: 'Todos entregaron documentación',
      mensaje: `Se marca a los ${inscriptos.length} inscriptos como que entregaron la documentación. Después podés desmarcar a quienes no la entregaron.`,
      confirmLabel: 'Marcar a todos',
    })
    if (!ok) return
    marcarDocumentacion.mutate(true, {
      onSuccess: () => toast.success('Todos marcados como que entregaron documentación.'),
      onError: (e) => toast.error(mensajeError(e, 'No se pudo marcar a todos.')),
    })
  }

  function abrirTexto(i: InscriptoCeetpsDto, campo: CampoTextoLargo, titulo: string) {
    setTexto({ titulo, subtitulo: nombreDe(i), valor: i[campo], campo, inscripto: i })
  }

  // ── Contenido del modal abierto ──
  const filasDelPaso = abierto ? inscriptosDelPaso(inscriptos, abierto) : []
  const filtradas = filtrarInscriptos(filasDelPaso, busqueda)
  const visibles =
    abierto === 'orden'
      ? ordenarFinalistas(filtradas, orden.columna, orden.desc)
      : [...filtradas].sort((a, b) => nombreDe(a).localeCompare(nombreDe(b), 'es'))
  const pag = paginar(visibles, pagina, POR_PAGINA)
  const minimoDelPaso =
    abierto === 'examen' || abierto === 'cv' || abierto === 'entrevista' ? abierto : null

  function ordenarPor(columna: ColumnaOrden) {
    setOrden((o) => ({ columna, desc: o.columna === columna ? !o.desc : columna !== 'posicion' }))
    setPagina(1)
  }
  const cabeceraOrden = (columna: ColumnaOrden, etiqueta: string) => (
    <button
      type="button"
      className="flex items-center gap-1 font-semibold uppercase"
      onClick={() => ordenarPor(columna)}
    >
      {etiqueta}
      <span className="text-[10px] text-gray-400">
        {orden.columna === columna ? (orden.desc ? '▼' : '▲') : '↕'}
      </span>
    </button>
  )

  const sinFilas = (mensaje: string) => (
    <p className="py-6 text-center text-sm text-gray-400">
      {busqueda.trim() ? 'Ninguna persona coincide con la búsqueda.' : mensaje}
    </p>
  )

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 space-y-4">
      {ToastUI}
      {ConfirmUI}
      <div>
        <p className="text-sm font-semibold text-gray-800">Pasos del concurso</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Tocá un paso para ver a las personas que llegaron a él. Cada paso muestra a quienes
          aprobaron el anterior. Todo se puede editar durante el concurso.
        </p>
      </div>

      {isLoading ? (
        <p className="text-xs text-gray-400">Cargando inscriptos…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PASOS_CEETPS.map((p, idx) => {
            const n = inscriptosDelPaso(inscriptos, p.id).length
            const actual = p.id === enCurso
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => abrir(p.id)}
                className={`rounded-lg border px-4 py-3 text-left transition hover:shadow-sm ${
                  actual
                    ? 'border-navy bg-navy/5 ring-1 ring-navy'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-gray-400">PASO {idx + 1}</span>
                  {actual && (
                    <span className="rounded-full bg-navy px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      En curso
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm font-semibold text-gray-900">{p.label}</p>
                <p className="mt-0.5 text-xs text-gray-500">{DESCRIPCION_PASO[p.id]}</p>
                <p className="mt-2 text-xs font-semibold text-gray-700">
                  {n} {n === 1 ? 'persona' : 'personas'}
                </p>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Modal del paso ── */}
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="font-primary text-lg font-bold text-gray-900">
                  {PASOS_CEETPS.find((p) => p.id === abierto)?.label}
                  {abierto === enCurso && (
                    <span className="ml-2 rounded-full bg-navy px-2 py-0.5 align-middle text-[10px] font-bold uppercase text-white">
                      En curso
                    </span>
                  )}
                </h3>
                <p className="text-xs text-gray-500">{DESCRIPCION_PASO[abierto]}</p>
              </div>
              <button
                type="button"
                className="text-xl leading-none text-gray-400 hover:text-gray-700"
                aria-label="Cerrar"
                onClick={() => setAbierto(null)}
              >
                ×
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
              {/* Buscador + mínimo */}
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => {
                    setBusqueda(e.target.value)
                    setPagina(1)
                  }}
                  placeholder="Buscar por apellido, nombre, DNI o CUIL…"
                  className="input h-9 w-full max-w-sm text-sm"
                />
                <span className="text-xs text-gray-400">
                  {pag.total} {pag.total === 1 ? 'persona' : 'personas'}
                </span>
                {minimoDelPaso && (
                  <div className="ml-auto flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5">
                    <span className="text-xs font-semibold text-gray-700">
                      Puntaje mínimo para aprobar
                    </span>
                    <CampoNumero
                      valor={minimos[minimoDelPaso]}
                      disabled={bloqueado || patchConcurso.isPending}
                      onGuardar={(v) => guardarMinimo(minimoDelPaso, v)}
                    />
                  </div>
                )}
              </div>
              {minimoDelPaso && (
                <p className="text-[11px] text-gray-400">
                  Vacío = aprueba cualquier puntaje cargado. Igual al mínimo aprueba.
                </p>
              )}

              {abierto !== 'orden' && (
                <ImportarPasoExcel
                  concursoId={concursoId}
                  paso={abierto}
                  deshabilitado={bloqueado}
                />
              )}

              {/* ── Inscripción ── */}
              {abierto === 'inscripcion' && (
                <>
                  {!bloqueado && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="btn-outline text-sm"
                          onClick={() => setAltaAbierta((v) => !v)}
                        >
                          {altaAbierta ? '− Ocultar el alta' : '+ Agregar inscripto'}
                        </button>
                        <button
                          type="button"
                          className="btn-outline text-sm"
                          disabled={inscriptos.length === 0 || marcarDocumentacion.isPending}
                          onClick={onMarcarTodos}
                        >
                          ✔ Todos entregaron documentación
                        </button>
                      </div>
                      {altaAbierta && (
                        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-3">
                          {(
                            [
                              ['apellido', 'Apellido *', 'text'],
                              ['nombre', 'Nombre *', 'text'],
                              ['dni', 'DNI', 'text'],
                              ['cuil', 'CUIL', 'text'],
                              ['email', 'Email', 'email'],
                              ['telefono', 'Teléfono', 'tel'],
                            ] as const
                          ).map(([k, label, tipo]) => (
                            <div key={k} className="min-w-[130px] flex-1">
                              <label className="mb-1 block text-[11px] font-semibold text-gray-600">
                                {label}
                              </label>
                              <input
                                type={tipo}
                                value={alta[k]}
                                onChange={(e) => setAlta((a) => ({ ...a, [k]: e.target.value }))}
                                className="input h-9 w-full text-sm"
                              />
                            </div>
                          ))}
                          <button
                            className="btn-primary shrink-0 text-sm"
                            disabled={
                              crear.isPending || !alta.apellido.trim() || !alta.nombre.trim()
                            }
                            onClick={onAgregar}
                          >
                            {crear.isPending ? 'Agregando…' : 'Agregar'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {pag.total === 0 ? (
                    sinFilas('Sin inscriptos cargados.')
                  ) : (
                    <Tabla
                      columnas={[
                        'Apellido',
                        'Nombre',
                        'DNI',
                        'CUIL',
                        'Email',
                        'Teléfono',
                        'Entregó doc.',
                        '',
                      ]}
                    >
                      {pag.items.map((i) => (
                        <tr key={i.id}>
                          <td className="px-3 py-1.5">
                            <CampoTexto
                              valor={i.apellido}
                              disabled={deshabilitado}
                              requerido
                              onGuardar={(v) => v && guardar(i, { apellido: v })}
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <CampoTexto
                              valor={i.nombre}
                              disabled={deshabilitado}
                              requerido
                              onGuardar={(v) => v && guardar(i, { nombre: v })}
                            />
                          </td>
                          {(
                            [
                              ['dni', 'text'],
                              ['cuil', 'text'],
                              ['email', 'email'],
                              ['telefono', 'tel'],
                            ] as const
                          ).map(([k, tipo]) => (
                            <td key={k} className="px-3 py-1.5">
                              <CampoTexto
                                valor={i[k]}
                                tipo={tipo}
                                disabled={deshabilitado}
                                onGuardar={(v) => guardar(i, { [k]: v })}
                              />
                            </td>
                          ))}
                          <td className="px-3 py-1.5 text-center">
                            <input
                              type="checkbox"
                              className="checkbox"
                              checked={i.entregoDocumentacion}
                              disabled={deshabilitado}
                              onChange={(e) =>
                                guardar(i, { entregoDocumentacion: e.target.checked })
                              }
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <button
                              className="text-xs text-danger hover:underline disabled:opacity-50"
                              disabled={bloqueado || eliminar.isPending}
                              onClick={() => onEliminar(i)}
                            >
                              Quitar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </Tabla>
                  )}
                </>
              )}

              {/* ── Admisibilidad ── */}
              {abierto === 'admisibilidad' &&
                (pag.total === 0 ? (
                  sinFilas('Sin inscriptos cargados.')
                ) : (
                  <Tabla
                    columnas={[
                      'Inscripto',
                      'Admisión',
                      'Motivo de no admisión',
                      'Reclamo',
                      'Resultado del reclamo',
                    ]}
                  >
                    {pag.items.map((i) => (
                      <tr key={i.id}>
                        <td className="whitespace-nowrap px-3 py-1.5 font-medium text-gray-800">
                          {nombreDe(i)}
                        </td>
                        <td className="px-3 py-1.5">
                          <select
                            value={i.admitido == null ? '' : String(i.admitido)}
                            disabled={deshabilitado}
                            onChange={(e) =>
                              guardar(i, {
                                admitido: e.target.value === '' ? null : e.target.value === 'true',
                              })
                            }
                            className="input h-8 w-36 text-sm"
                          >
                            <option value="">Pendiente</option>
                            <option value="true">Admitido</option>
                            <option value="false">No admitido</option>
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          {i.admitido === false && (
                            <BotonTexto
                              valor={i.motivoNoAdmision}
                              etiqueta="Escribir el motivo…"
                              onAbrir={() =>
                                abrirTexto(i, 'motivoNoAdmision', 'Motivo de no admisión')
                              }
                            />
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <input
                            type="checkbox"
                            className="checkbox"
                            checked={i.reclamoAdmisibilidad}
                            disabled={deshabilitado}
                            onChange={(e) => guardar(i, { reclamoAdmisibilidad: e.target.checked })}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          {i.reclamoAdmisibilidad && (
                            <BotonTexto
                              valor={i.resultadoReclamoAdmisibilidad}
                              etiqueta="Escribir el resultado…"
                              onAbrir={() =>
                                abrirTexto(
                                  i,
                                  'resultadoReclamoAdmisibilidad',
                                  'Resultado del reclamo de admisibilidad',
                                )
                              }
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </Tabla>
                ))}

              {/* ── Examen ── */}
              {abierto === 'examen' &&
                (pag.total === 0 ? (
                  sinFilas('Todavía no hay inscriptos admitidos.')
                ) : (
                  <Tabla
                    columnas={[
                      'Inscripto',
                      'Se presentó',
                      'Nota',
                      'Resultado',
                      'Reclamo',
                      'Resultado del reclamo',
                    ]}
                  >
                    {pag.items.map((i) => {
                      // Reclama la nota solo quien NO aprobó (si ya había un reclamo
                      // iniciado, se conserva aunque la nota corregida ahora apruebe).
                      const puedeReclamar = i.pasaExamen === false || i.reclamoExamen
                      return (
                        <tr key={i.id}>
                          <td className="whitespace-nowrap px-3 py-1.5 font-medium text-gray-800">
                            {nombreDe(i)}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <input
                              type="checkbox"
                              className="checkbox"
                              checked={i.presentoExamen}
                              disabled={deshabilitado}
                              onChange={(e) => guardar(i, { presentoExamen: e.target.checked })}
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <CampoNumero
                              valor={i.notaExamen}
                              disabled={deshabilitado || !i.presentoExamen}
                              onGuardar={(v) => guardar(i, { notaExamen: v })}
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <Resultado pasa={i.pasaExamen} />
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <input
                              type="checkbox"
                              className="checkbox"
                              checked={i.reclamoExamen}
                              disabled={deshabilitado || !puedeReclamar}
                              title={
                                puedeReclamar
                                  ? undefined
                                  : 'Solo puede reclamar quien no alcanzó el puntaje mínimo.'
                              }
                              onChange={(e) => guardar(i, { reclamoExamen: e.target.checked })}
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            {i.reclamoExamen && (
                              <BotonTexto
                                valor={i.resultadoReclamoExamen}
                                etiqueta="Escribir el resultado…"
                                onAbrir={() =>
                                  abrirTexto(
                                    i,
                                    'resultadoReclamoExamen',
                                    'Resultado del reclamo de la nota',
                                  )
                                }
                              />
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </Tabla>
                ))}

              {/* ── Análisis curricular / Entrevista ── */}
              {(abierto === 'cv' || abierto === 'entrevista') &&
                (pag.total === 0 ? (
                  sinFilas(
                    abierto === 'cv'
                      ? 'Todavía nadie aprobó el examen.'
                      : 'Todavía nadie aprobó el análisis curricular.',
                  )
                ) : (
                  <Tabla columnas={['Inscripto', 'Puntaje', 'Resultado']}>
                    {pag.items.map((i) => (
                      <tr key={i.id}>
                        <td className="whitespace-nowrap px-3 py-1.5 font-medium text-gray-800">
                          {nombreDe(i)}
                        </td>
                        <td className="px-3 py-1.5">
                          <CampoNumero
                            valor={abierto === 'cv' ? i.puntajeCv : i.puntajeEntrevista}
                            disabled={deshabilitado}
                            onGuardar={(v) =>
                              guardar(
                                i,
                                abierto === 'cv' ? { puntajeCv: v } : { puntajeEntrevista: v },
                              )
                            }
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Resultado pasa={abierto === 'cv' ? i.pasaCv : i.pasaEntrevista} />
                        </td>
                      </tr>
                    ))}
                  </Tabla>
                ))}

              {/* ── Orden de mérito final (posición automática) ── */}
              {abierto === 'orden' && (
                <>
                  <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    La posición se calcula sola con las notas más altas, en este orden de
                    importancia: <strong>1° Entrevista</strong>, <strong>2° Examen</strong>,{' '}
                    <strong>3° Análisis curricular</strong>. Si dos personas empatan en las tres, se
                    ordenan por apellido y quedan marcadas. Podés ordenar la tabla por cualquier
                    columna; la posición no cambia.
                  </p>
                  {pag.total === 0 ? (
                    sinFilas('Todavía no hay finalistas (quienes aprobaron todos los pasos).')
                  ) : (
                    <Tabla
                      columnas={[
                        cabeceraOrden('posicion', 'Posición'),
                        'Inscripto',
                        cabeceraOrden('entrevista', 'Entrevista'),
                        cabeceraOrden('examen', 'Nota examen'),
                        cabeceraOrden('cv', 'Puntaje CV'),
                      ]}
                    >
                      {pag.items.map((i) => (
                        <tr key={i.id}>
                          <td className="px-3 py-1.5">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-secondary/10 text-xs font-bold text-secondary">
                              {i.ordenMerito}
                            </span>
                            {i.empate && (
                              <span
                                className="ml-2 text-[11px] font-semibold text-amber-700"
                                title="Empate en las tres notas: se desempató por apellido."
                              >
                                empate
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-1.5 font-medium text-gray-800">
                            {nombreDe(i)}
                          </td>
                          <td className="px-3 py-1.5 text-gray-700">
                            {i.puntajeEntrevista ?? '—'}
                          </td>
                          <td className="px-3 py-1.5 text-gray-700">{i.notaExamen ?? '—'}</td>
                          <td className="px-3 py-1.5 text-gray-700">{i.puntajeCv ?? '—'}</td>
                        </tr>
                      ))}
                    </Tabla>
                  )}
                </>
              )}

              {/* Paginación */}
              {pag.paginas > 1 && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-gray-500">
                    Página {pag.pagina} de {pag.paginas}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-outline text-xs"
                      disabled={pag.pagina <= 1}
                      onClick={() => setPagina(pag.pagina - 1)}
                    >
                      ← Anterior
                    </button>
                    <button
                      type="button"
                      className="btn-outline text-xs"
                      disabled={pag.pagina >= pag.paginas}
                      onClick={() => setPagina(pag.pagina + 1)}
                    >
                      Siguiente →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {texto && (
        <TextoModal
          titulo={texto.titulo}
          subtitulo={texto.subtitulo}
          valor={texto.valor}
          soloLectura={bloqueado}
          onGuardar={(v) => guardar(texto.inscripto, { [texto.campo]: v })}
          onCerrar={() => setTexto(null)}
        />
      )}
    </div>
  )
}
