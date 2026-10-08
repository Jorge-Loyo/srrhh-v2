import type { PuestoCatalogoEspecialidad } from '@srrhh/types'
import {
  useHospitales,
  useEscalafones,
  useCodigosRegistro,
  usePuestosCargoNormalizados,
  useEspecialidadesDePuestoId,
} from '@/shared/hooks/useCatalogos'
import { SearchableSelect } from '@/shared/components/ui/SearchableSelect'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import { hospitalLabel } from '@/shared/lib/hospitalLabel'
import { capitalizar } from '@/shared/lib/utils'

// Valores actuales de la cascada de filtros del catálogo. Todos strings (ids)
// o '' cuando no hay selección — pensado para conectarse a searchParams.
export interface FiltrosCatalogoValores {
  reparticionId: string // (efector/hospital — se muestra como "Repartición")
  escalafonId: string
  // S25: código de registro puntual dentro del escalafón (ej. CPH → 22 ó 37).
  codigoRegistroId: string
  modalidad: '' | 'pof' | 'pou'
  puestoCargoId: string
  especialidadPuestoId: string
}

interface FiltrosCatalogoProps {
  valores: FiltrosCatalogoValores
  onChange: (cambios: Partial<FiltrosCatalogoValores>) => void
  // Permite ocultar el selector de repartición donde no aplique.
  mostrarReparticion?: boolean
  // Permite ocultar el nivel de especialidad (ej. CEETPS, cuyo concurso no
  // guarda especialidad — solo puesto solicitado).
  mostrarEspecialidad?: boolean
  // Clase extra para el contenedor.
  className?: string
}

// Componente de filtros por CATÁLOGO, reutilizable en toda la app (S21).
// Cascada: Repartición · Escalafón → Modalidad → Puesto → Especialidad.
// - Los datos salen del CATÁLOGO (no de cargos cargados): los desplegables se
//   llenan aunque no haya padrón importado.
// - Puesto y especialidad se muestran capitalizados (en la BD están en
//   minúscula — normalizados en S21); es solo presentación.
// - Es un componente CONTROLADO: no maneja su propio estado, recibe `valores`
//   y emite `onChange` con los cambios (la página los sincroniza con la URL).
//   Al cambiar un nivel superior, resetea los inferiores vía `onChange`.
export function FiltrosCatalogo({
  valores,
  onChange,
  mostrarReparticion = true,
  mostrarEspecialidad = true,
  className,
}: FiltrosCatalogoProps) {
  const { reparticionId, escalafonId, codigoRegistroId, modalidad, puestoCargoId, especialidadPuestoId } = valores

  const { data: hospitales } = useHospitales()
  // paraNuevaAlta=true → escalafones del catálogo (se llenan sin padrón).
  const { data: escalafones } = useEscalafones(true)
  // S25: códigos de registro del escalafón elegido (ej. CPH → 22 y 37). Un
  // escalafón canónico engloba varios códigos de registro; este nivel deja
  // acotar a uno puntual. El catálogo completo se filtra en memoria por
  // escalafonId (no cambia seguido, cache de TanStack alcanza).
  const { data: codigosRegistro } = useCodigosRegistro()
  const codigosDelEscalafon = (codigosRegistro ?? [])
    .filter((cr) => cr.escalafonId === escalafonId)
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
  const { data: puestos } = usePuestosCargoNormalizados(
    escalafonId || undefined,
    modalidad || undefined,
  )
  const puestosLista = puestos ?? []
  // Especialidades del puesto EXACTO por id (no por nombre): evita el bug de
  // puestos homónimos donde el filtro por especialidad no coincidía.
  const { data: especialidades } = useEspecialidadesDePuestoId(puestoCargoId || undefined)
  const especialidadesLista: PuestoCatalogoEspecialidad[] = especialidades ?? []

  const escalafonesOrdenados = [...(escalafones ?? [])].sort((a, b) =>
    escalafonLabel(a.nombre).localeCompare(escalafonLabel(b.nombre), 'es'),
  )

  // Cambios que resetean la cascada inferior:
  const cambiarEscalafon = (id: string) =>
    onChange({ escalafonId: id, codigoRegistroId: '', modalidad: '', puestoCargoId: '', especialidadPuestoId: '' })
  const cambiarCodigoRegistro = (id: string) =>
    onChange({ codigoRegistroId: id })
  const cambiarModalidad = (m: string) =>
    onChange({ modalidad: (m as '' | 'pof' | 'pou'), puestoCargoId: '', especialidadPuestoId: '' })
  const cambiarPuesto = (id: string) =>
    onChange({ puestoCargoId: id, especialidadPuestoId: '' })

  const selectCls =
    'h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary'

  return (
    <div className={`flex flex-wrap gap-3 ${className ?? ''}`}>
      {mostrarReparticion && (
        <select
          value={reparticionId}
          onChange={(e) => onChange({ reparticionId: e.target.value })}
          className={selectCls}
        >
          <option value="">Todas las reparticiones</option>
          {hospitales?.map((h) => (
            <option key={h.id} value={h.id}>
              {hospitalLabel(h)}
            </option>
          ))}
        </select>
      )}

      <select value={escalafonId} onChange={(e) => cambiarEscalafon(e.target.value)} className={selectCls}>
        <option value="">Todas las carreras</option>
        {escalafonesOrdenados.map((e) => (
          <option key={e.id} value={e.id}>
            {escalafonLabel(e.nombre)}
          </option>
        ))}
      </select>

      {/* S25: código de registro dentro de la carrera. Solo se muestra si la
          carrera elegida tiene códigos de registro cargados (puede tener 1 o
          varios; p.ej. CPH tiene 22 y 37). */}
      {escalafonId && codigosDelEscalafon.length > 0 && (
        <select
          value={codigoRegistroId}
          onChange={(e) => cambiarCodigoRegistro(e.target.value)}
          className={selectCls}
        >
          <option value="">Todos los cód. de registro</option>
          {codigosDelEscalafon.map((cr) => (
            <option key={cr.id} value={cr.id}>
              {cr.codigo} — {cr.literal}
            </option>
          ))}
        </select>
      )}

      {escalafonId && (
        <select value={modalidad} onChange={(e) => cambiarModalidad(e.target.value)} className={selectCls}>
          <option value="">Todas las modalidades</option>
          <option value="pof">Planta (POF)</option>
          <option value="pou">Guardia (POU)</option>
        </select>
      )}

      {escalafonId && (
        <SearchableSelect
          value={puestoCargoId}
          onChange={cambiarPuesto}
          options={puestosLista.map((p) => capitalizar(p.nombre))}
          valueToDisplay={(id) => capitalizar(puestosLista.find((p) => p.id === id)?.nombre) || id}
          displayToValue={(label) => puestosLista.find((p) => capitalizar(p.nombre) === label)?.id ?? label}
          placeholder="Todos los puestos"
          className="min-w-[240px]"
        />
      )}

      {mostrarEspecialidad && puestoCargoId && especialidadesLista.length > 0 && (
        <SearchableSelect
          value={especialidadPuestoId}
          onChange={(id) => onChange({ especialidadPuestoId: id })}
          options={especialidadesLista.map((esp) => capitalizar(esp.nombre))}
          valueToDisplay={(id) =>
            capitalizar(especialidadesLista.find((esp) => esp.id === id)?.nombre) || id
          }
          displayToValue={(label) =>
            especialidadesLista.find((esp) => capitalizar(esp.nombre) === label)?.id ?? label
          }
          placeholder="Todas las especialidades"
          className="min-w-[240px]"
        />
      )}
    </div>
  )
}
