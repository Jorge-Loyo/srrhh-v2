import { useEffect, useState } from 'react'
import { ALL_FLOWS } from './reglasData'
import type { EscalafonFlow, TipoCargoFlow, Color } from './reglasData.types'

interface Props { onClose: () => void }

// ── Árbol de estados universal ────────────────────────────────────────────────
// Esta estructura es la misma para TODOS los escalafones.
// Lo que varía por escalafón es cómo se llega a cada estado (concurso, docs, código).

const ESTADO_TREE = {
  root: {
    label: 'CARGO',
    desc: 'Unidad mínima de dotación. Existe independientemente de si está ocupado o vacante.',
    color: 'gray' as Color,
  },
  ramas: [
    {
      estado: 'EN VALIDACIÓN',
      color: 'orange' as Color,
      desc: 'Estado previo a vigente/no_vigente. El padrón semanal detectó que la persona ya no figura. El cargo espera aprobación manual desde el panel de notificaciones para iniciar el flujo de alta por baja.',
      badge: 'bg-orange-50 text-orange-700 border-orange-300',
      razones: [
        { label: 'Padrón semanal — diff "eliminado"', desc: 'El id_sial_rol desaparece del Excel semanal. El sistema pone el cargo en validacion_vacante y genera una notificación pendiente.' },
      ],
      reglas: [
        'Estado propio del cargo — al mismo nivel que vigente y no_vigente.',
        'El cargo sigue con su ocupación activa (hasta IS NULL) hasta que se resuelva.',
        'Desde el panel de notificaciones el operador aprueba o rechaza uno por uno.',
        'Si se aprueba: se inicia el flujo de alta por baja. El cargo puede pasar a vigente (vacante) o no_vigente según el acto administrativo.',
        'Si se rechaza: cargo.estado vuelve a vigente sin modificar la ocupación.',
        'Único origen válido para seleccionar un cargo en el flujo de alta por baja.',
      ],
    },
    {
      estado: 'NO VIGENTE',
      color: 'gray' as Color,
      desc: 'Estado terminal. El cargo sale de la estructura. No puede volver a vigente.',
      badge: 'bg-gray-100 text-gray-600 border-gray-300',
      razones: [
        { label: 'Desfinanciación', desc: 'El cargo pierde financiamiento presupuestario. Se registra en un acto administrativo de baja.' },
        { label: 'Modificación de Estructura', desc: 'Modificacion de la estructura. con un expediente y un acto administrativo.' },
        { label: 'Vacante a No Vigente', desc: 'Un cargo vacante pasa a no vigente de forma manual en el sistema. La contrapartida es un expediente de alta de otro cargo.' },
      ],
      reglas: [
        'Un cargo no vigente NO puede tener ocupaciones activas (hasta = NULL).',
        'El historial de ocupaciones anteriores se preserva.',
        'No genera nuevos concursos.',
        'Solo pasa a no_vigente por acto administrativo manual — nunca por el padrón semanal.',
      ],
    },
    {
      estado: 'VIGENTE',
      color: 'green' as Color,
      desc: 'El cargo está activo en la estructura orgánica.',
      badge: 'bg-green-50 text-green-700 border-green-300',
      razones: [],
      reglas: [
        'Un cargo vigente puede estar ocupado o vacante.',
        '"Vacante" NO es un estado del cargo — es una condición derivada: vigente + sin ocupación activa.',
        '"Ocupado" = vigente + existe una ocupación con hasta = NULL.',
      ],
      subramas: [
        {
          estado: 'VACANTE',
          color: 'yellow' as Color,
          desc: 'Vigente sin persona asignada. Condición derivada: no existe ocupación con hasta = NULL.',
          badge: 'bg-yellow-50 text-yellow-700 border-yellow-300',
          reglas: [
            'Condición: cargo.estado = vigente AND NOT EXISTS (ocupacion WHERE hasta IS NULL).',
            'Puede generar un concurso (genera_concurso = true en la baja que lo originó).',
            'El tipo de concurso depende del escalafón (ver detalle por escalafón abajo).',
            'Puede quedar vacante sin generar concurso (genera_concurso = false) o puede seguir Vacante si el concurso no prosperó.',
          ],
          hijos: [
            {
              label: 'No requiere Concurso',
              color: 'gray' as Color,
              desc: 'El cargo espera designación directa (RG, AS, EG estructura) o está en pausa.',
            },
            {
              label: 'Con concurso abierto',
              color: 'yellow' as Color,
              desc: 'Se inició un proceso de selección. El tipo de concurso depende del escalafón.',
            },
          ],
        },
        {
          estado: 'OCUPADO',
          color: 'blue' as Color,
          desc: 'Vigente con persona asignada. Existe una ocupación con hasta = NULL.',
          badge: 'bg-blue-50 text-blue-700 border-blue-300',
          reglas: [
            'Condición: cargo.estado = vigente AND EXISTS (ocupacion WHERE hasta IS NULL).',
            'La persona se vincula desde la tabla ocupaciones (persona_id → personas).',
            'id_sial_rol = legajo SIAL de la persona + nro de rol (ej: 001448563-3).',
            'El cargo estructural es UNO SOLO aunque cambien las personas a lo largo del tiempo.',
            'Cada persona que ocupa el cargo genera su propio id_sial_rol.',
          ],
          hijos: [
            {
              label: 'Activo',
              color: 'green' as Color,
              desc: 'situacion_revista = "Activo". La persona ejerce normalmente en este cargo.',
              detalle: ['La persona está presente y en funciones.','Es el estado normal de una ocupación vigente.'],
            },
            {
              label: 'Retención de Cargo',
              color: 'purple' as Color,
              desc: 'situacion_revista = "Retencion de Cargo". La persona retiene este cargo pero ejerce funciones en otro.',
              detalle: ['El cargo sigue vigente + ocupado (no genera vacante).','sr_doc_respaldo = documento que avala la retención.','sr_comentario = observaciones.','Ejemplo: jefe que asume como director interino.'],
            },
            {
              label: 'Comisionado',
              color: 'orange' as Color,
              desc: 'situacion_revista = "Comision". La persona está en comisión de servicios en otra repartición.',
              detalle: ['El cargo sigue vigente + ocupado (no genera vacante).','comision = descripción de la comisión.','repa_comision = repartición de destino.','cr_comentario = comentarios adicionales.'],
            },
          ],
        },
      ],
    },
  ],
}

// ── Ciclo de vida: condiciones y transiciones en el sistema ─────────────────

const CICLO_TABS = [
  {
    id: 'vigente',
    label: 'VIGENTE',
    color: 'green' as Color,
    condicion: "cargo.estado = 'vigente'",
    descripcion: 'El cargo existe y está activo en la estructura orgánica del hospital.',
    origen: [
      { evento: 'Alta de cargo', detalle: 'Se crea el cargo en el sistema (manual o por importación del padrón SIAL). El estado inicial siempre es vigente.' },
      { evento: 'Padrón semanal — diff tipo "nuevo"', detalle: 'Aparece un id_sial_rol que no existía. El sistema busca cargo por (hospital, escalafon, codigo_repa, literal_puesto). Si no existe, crea uno nuevo con estado = vigente.' },
    ],
    validaciones: [
      'No puede tener estado = no_vigente si existe una ocupación con hasta IS NULL.',
      'El código del cargo (ej: RG-CG-000047) no cambia aunque cambien las personas.',
      'Un cargo vigente puede estar VACANTE u OCUPADO — son condiciones derivadas, no estados.',
    ],
    campos: [
      { campo: 'estado', valor: "'vigente'", tabla: 'cargos' },
    ],
  },
  {
    id: 'no_vigente',
    label: 'NO VIGENTE',
    color: 'gray' as Color,
    condicion: "cargo.estado = 'no_vigente'",
    descripcion: 'Estado terminal. El cargo fue suprimido de la estructura. No puede reactivarse.',
    origen: [
      { evento: 'Baja manual — Desfinanciación', detalle: 'El cargo pierde financiamiento presupuestario. Se registra con un acto administrativo de baja.' },
      { evento: 'Baja manual — Modificación de Estructura', detalle: 'Modificación de la estructura con un expediente y un acto administrativo.' },
      { evento: 'Baja manual — Vacante a No Vigente', detalle: 'Un cargo vacante pasa a no vigente de forma manual en el sistema. La contrapartida es un expediente de alta de otro cargo.' },
    ],
    validaciones: [
      'El padrón semanal NUNCA marca un cargo como no_vigente — solo cierra la ocupación de la persona.',
      'Al pasar a no_vigente por baja manual: cerrar ocupación activa si existe (ocupacion.hasta = fecha de baja).',
      'No puede generarse un concurso sobre un cargo no_vigente.',
      'El historial de ocupaciones anteriores se preserva (no se borra).',
      'Estado irreversible: no existe transición de no_vigente → vigente.',
    ],
    campos: [
      { campo: 'estado', valor: "'no_vigente'", tabla: 'cargos' },
    ],
  },
  {
    id: 'validacion_vacante',
    label: 'En Validación',
    color: 'orange' as Color,
    condicion: "cargo.estado = 'validacion_vacante'",
    descripcion: 'Estado propio del cargo, previo a vigente/no_vigente. El padrón semanal detectó que la persona ya no figura. El cargo espera aprobación manual desde el panel de notificaciones para habilitar el flujo de alta por baja.',
    origen: [
      { evento: 'Padrón semanal — diff tipo "eliminado"', detalle: 'El id_sial_rol desaparece del Excel semanal. El sistema pone el cargo en validacion_vacante y genera una notificación pendiente. La ocupación activa NO se toca.' },
    ],
    validaciones: [
      'Estado al mismo nivel que vigente y no_vigente — no es subrama de ninguno.',
      'La ocupación activa (hasta IS NULL) permanece intacta mientras el cargo está en este estado.',
      'El operador aprueba o rechaza cada caso individualmente desde el panel de notificaciones.',
      'Si se aprueba: se habilita el flujo de alta por baja. El destino final (vigente vacante o no_vigente) lo determina el acto administrativo.',
      'Si se rechaza: cargo.estado vuelve a vigente sin modificar la ocupación.',
      'Único estado desde el cual se puede seleccionar un cargo para declarar una baja (alta por baja).',
      'No puede generarse un concurso sobre un cargo en validacion_vacante.',
    ],
    campos: [
      { campo: 'estado', valor: "'validacion_vacante'", tabla: 'cargos' },
    ],
  },
  {
    id: 'vacante',
    label: 'VACANTE',
    color: 'yellow' as Color,
    condicion: "cargo.estado = 'vigente' AND NOT EXISTS (SELECT 1 FROM ocupaciones WHERE cargo_id = cargo.id AND hasta IS NULL)",
    descripcion: 'Condición derivada. El cargo está vigente pero no tiene ninguna persona asignada actualmente.',
    origen: [
      { evento: 'Cierre de ocupación activa', detalle: 'Se setea ocupacion.hasta = fecha. Puede ser por jubilación, renuncia, fallecimiento, vencimiento de mandato (RG), etc.' },
      { evento: 'Cargo recién creado sin designación', detalle: 'El cargo se crea pero aún no se le asigna una persona.' },
      { evento: 'Aprobación desde panel de notificaciones', detalle: 'El operador aprueba la validación de vacante. Se cierra la ocupación (hasta = fecha) y el cargo pasa a condición VACANTE.' },
    ],
    validaciones: [
      'No es un campo en la tabla cargos — se calcula en tiempo de consulta.',
      'Un cargo vacante puede o no tener un concurso abierto asociado.',
      'Para CPH/ENF/TEC: la vacante puede disparar un concurso CEETPS.',
      'Para RG: la vacante espera nueva designación directa (no concurso).',
      'Para AS/EG estructura: designación política directa, sin concurso.',
      'El padrón semanal NUNCA genera vacante directamente — siempre pasa por validacion_vacante primero.',
      'Solo un cargo en estado validacion_vacante puede ser seleccionado para declarar una baja (alta por baja).',
    ],
    campos: [
      { campo: 'hasta', valor: 'IS NULL → ninguna fila', tabla: 'ocupaciones' },
    ],
  },
  {
    id: 'ocupado',
    label: 'OCUPADO',
    color: 'blue' as Color,
    condicion: "cargo.estado = 'vigente' AND EXISTS (SELECT 1 FROM ocupaciones WHERE cargo_id = cargo.id AND hasta IS NULL)",
    descripcion: 'Condición derivada. El cargo está vigente y tiene exactamente una persona asignada (ocupacion.hasta IS NULL).',
    origen: [
      { evento: 'Nueva designación', detalle: 'Se inserta una fila en ocupaciones con hasta = NULL. El id_sial_rol identifica la relación persona-cargo.' },
      { evento: 'Padrón semanal — diff tipo "nuevo" sobre cargo existente', detalle: 'Aparece un id_sial_rol nuevo para un cargo que ya existe. Se crea la ocupación sin cerrar el cargo.' },
      { evento: 'Resolución de concurso (CPH/ENF/TEC)', detalle: 'El ganador del concurso es designado. Se crea la ocupación con situacion_revista = Activo.' },
    ],
    validaciones: [
      'Solo puede existir UNA ocupación activa (hasta IS NULL) por cargo a la vez.',
      'Antes de insertar una nueva ocupación, verificar que no exista otra activa.',
      'El id_sial_rol es único por ocupación — identifica persona + cargo + período.',
      'El cargo estructural (su código) no cambia aunque cambie el ocupante.',
    ],
    campos: [
      { campo: 'hasta', valor: 'IS NULL', tabla: 'ocupaciones' },
      { campo: 'id_sial_rol', valor: 'ej: 001448563-3', tabla: 'ocupaciones' },
    ],
  },
  {
    id: 'activo',
    label: 'Activo',
    color: 'green' as Color,
    condicion: "ocupacion.hasta IS NULL AND ocupacion.situacion_revista = 'Activo'",
    descripcion: 'La persona ejerce normalmente en el cargo. Es la situación de revista estándar.',
    origen: [
      { evento: 'Designación normal', detalle: 'Se crea la ocupación con situacion_revista = Activo. Es el valor por defecto al designar.' },
      { evento: 'Fin de retención de cargo', detalle: 'La persona vuelve a ejercer en su cargo original. Se actualiza situacion_revista = Activo.' },
      { evento: 'Fin de comisión', detalle: 'La persona regresa de la comisión. Se actualiza situacion_revista = Activo.' },
    ],
    validaciones: [
      'La persona está presente y en funciones en el hospital del cargo.',
      'Es el estado normal de una ocupación vigente.',
    ],
    campos: [
      { campo: 'situacion_revista', valor: "'Activo'", tabla: 'ocupaciones' },
      { campo: 'hasta', valor: 'IS NULL', tabla: 'ocupaciones' },
    ],
  },
  {
    id: 'retencion',
    label: 'Retención de Cargo',
    color: 'purple' as Color,
    condicion: "ocupacion.hasta IS NULL AND ocupacion.situacion_revista = 'Retencion de Cargo'",
    descripcion: 'La persona retiene formalmente este cargo pero ejerce funciones en otro puesto (ej: asume como director interino).',
    origen: [
      { evento: 'Asunción de cargo superior', detalle: 'El agente es designado en un cargo de mayor jerarquía pero retiene el cargo de origen. Se actualiza situacion_revista = Retencion de Cargo.' },
    ],
    validaciones: [
      'El cargo sigue OCUPADO — no genera vacante ni habilita concurso.',
      'sr_doc_respaldo debe registrar el documento que avala la retención.',
      'sr_comentario puede contener observaciones adicionales.',
      'Al finalizar la retención, situacion_revista vuelve a Activo.',
    ],
    campos: [
      { campo: 'situacion_revista', valor: "'Retencion de Cargo'", tabla: 'ocupaciones' },
      { campo: 'sr_doc_respaldo', valor: 'nro. de resolución', tabla: 'ocupaciones' },
      { campo: 'sr_comentario', valor: 'texto libre', tabla: 'ocupaciones' },
    ],
  },
  {
    id: 'comision',
    label: 'Comisionado',
    color: 'orange' as Color,
    condicion: "ocupacion.hasta IS NULL AND ocupacion.situacion_revista = 'Comision'",
    descripcion: 'La persona está en comisión de servicios en otra repartición. El cargo de origen sigue ocupado.',
    origen: [
      { evento: 'Comisión de servicios', detalle: 'El agente es enviado a prestar servicios en otra repartición. Se actualiza situacion_revista = Comision y se registra la repartición de destino.' },
    ],
    validaciones: [
      'El cargo sigue OCUPADO — no genera vacante ni habilita concurso.',
      'comision debe describir el motivo/tipo de comisión.',
      'repa_comision debe registrar la repartición de destino.',
      'cr_comentario puede contener observaciones adicionales.',
      'Al finalizar la comisión, situacion_revista vuelve a Activo.',
    ],
    campos: [
      { campo: 'situacion_revista', valor: "'Comision'", tabla: 'ocupaciones' },
      { campo: 'comision', valor: 'descripción', tabla: 'ocupaciones' },
      { campo: 'repa_comision', valor: 'repartición destino', tabla: 'ocupaciones' },
    ],
  },
]

export function ReglasNegocioModal({ onClose }: Props) {
  const [escalafonIdx, setEscalafonIdx] = useState(0)
  const [tipoIdx, setTipoIdx] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [cicloTab, setCicloTab] = useState(0)

  const escalafon = ALL_FLOWS[escalafonIdx] as EscalafonFlow
  const tipo = escalafon.tipos[tipoIdx] as TipoCargoFlow

  useEffect(() => { setTipoIdx(0) }, [escalafonIdx])
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 ${fullscreen ? '' : 'p-4'}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={`bg-white flex flex-col ${fullscreen ? 'w-full h-full' : 'rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh]'}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="font-primary text-lg font-bold text-gray-900">Ciclo de vida de un cargo</h2>
            <p className="text-xs text-gray-500 mt-0.5">Reglas de negocio por escalafón y tipo de cargo</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFullscreen(f => !f)}
              className="text-gray-400 hover:text-gray-600 text-sm px-2 py-1 rounded hover:bg-gray-100"
              title={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            >
              {fullscreen ? '⊡' : '⊞'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
          </div>
        </div>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto">

          {/* ── SECCIÓN 0: Cómo crear cargos ── */}
          <div className="px-6 pt-5 pb-4 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">
              Cómo se crean cargos en el sistema
            </h3>
            <ComoCrearCargos />
          </div>

          {/* ── SECCIÓN 1: Árbol universal ── */}
          <div className="px-6 pt-5 pb-4 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">
              Estructura de estados — aplica a todos los escalafones
            </h3>
            <EstadoTree />
          </div>

          {/* ── SECCIÓN 2: Ciclo de vida en el sistema ── */}
          <div className="px-6 pt-5 pb-4 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">
              Ciclo de vida en el sistema — condiciones y transiciones
            </h3>
            <CicloVida activeIdx={cicloTab} onSelect={setCicloTab} />
          </div>

          {/* ── SECCIÓN 3: Detalle por escalafón ── */}
          <div className="px-6 pt-5 pb-6">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
              Detalle por escalafón — cómo se llega a cada estado
            </h3>

            {/* Tabs escalafones */}
            <div className="flex gap-1 mb-4 overflow-x-auto border-b border-gray-100">
              {ALL_FLOWS.map((f, i) => (
                <button
                  key={f.id}
                  onClick={() => setEscalafonIdx(i)}
                  className={`px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                    i === escalafonIdx
                      ? `${TAB_ACTIVE[f.color as Color]} border-current`
                      : 'text-gray-400 border-transparent hover:text-gray-600'
                  }`}
                >
                  {f.id.toUpperCase()}
                  <span className="ml-1 text-gray-400 font-normal hidden sm:inline">
                    {f.nombre.split('—')[1]?.trim() ?? ''}
                  </span>
                </button>
              ))}
            </div>

            {/* Descripción del escalafón */}
            <div className={`rounded-lg p-3 mb-4 ${BG[escalafon.color as Color]}`}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span className={`text-xs font-bold ${TEXT[escalafon.color as Color]}`}>{escalafon.nombre}</span>
                  <p className="text-xs text-gray-600 mt-0.5">{escalafon.descripcion}</p>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">Norma: {escalafon.norma}</span>
              </div>
            </div>

            {/* Sidebar + contenido tipo */}
            <div className="flex gap-4 min-h-0">

              {/* Sidebar tipos */}
              <div className="w-48 flex-shrink-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Tipos de cargo</p>
                {escalafon.tipos.map((t, i) => (
                  <button
                    key={t.id}
                    onClick={() => setTipoIdx(i)}
                    className={`w-full text-left px-3 py-2 rounded text-xs mb-1 transition-colors ${
                      i === tipoIdx
                        ? `${SIDEBAR_ACTIVE[escalafon.color as Color]} font-semibold`
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-medium">{t.nombre}</div>
                    <div className="text-gray-400 font-mono mt-0.5 text-[10px]">{t.ejemplo}</div>
                  </button>
                ))}
              </div>

              {/* Detalle del tipo */}
              <div className="flex-1 space-y-4">
                <TipoDetalle tipo={tipo} color={escalafon.color as Color} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button className="btn-outline" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}

// ── Ciclo de vida ────────────────────────────────────────────────────────────

function ComoCrearCargos() {
  const [activo, setActivo] = useState(0)

  const OPCIONES = [
    {
      id: 'pof', titulo: 'Ejecución POF', subtitulo: 'Planta Orgánica Funcional', color: 'blue' as Color,
      ruta: '/cargos/alta', boton: '+ Ejecución POF',
      escalafones: ['CPH (Médicos)', 'Carrera de Enfermería', 'CEETPS (Técnicos)', 'Escalafón General'],
      codigos: ['CPH-POF-XXXXXX', 'ENF-XXXXXX', 'TEC-POF-XXXXXX', 'EG-XXXXXX'],
      flujo: [
        'Ir a /cargos/alta y clickear “+ Ejecución POF”',
        'Ingresar el número de expediente y confirmar',
        'Seleccionar Hospital y Escalafón',
        'Seleccionar Puesto (combobox con búsqueda en tiempo real)',
        'Seleccionar Especialidad si el puesto la requiere',
        'Ingresar fecha Desde y cantidad (máx. 50)',
        'Clickear “+ Agregar” → se acumula en el panel derecho',
        'Repetir para más cargos del mismo expediente',
        'Clickear “Registrar (N)” para enviar todos a la API',
      ],
      nota: 'El formulario permanece abierto tras agregar. Hospital, escalafón y fecha se mantienen para agilizar la carga múltiple.',
    },
    {
      id: 'pou', titulo: 'Ejecución POU', subtitulo: 'Planta Orgánica de Urgencia', color: 'orange' as Color,
      ruta: '/cargos/alta', boton: '+ Ejecución POU',
      escalafones: ['CPH (Médicos)', 'CEETPS — solo Radiología, Hemoterapia, Anat. Patol., Instrumentación'],
      codigos: ['CPH-POU-XXXXXX', 'TEC-POU-XXXXXX'],
      flujo: [
        'Ir a /cargos/alta y clickear “+ Ejecución POU”',
        'Ingresar expediente y confirmar',
        'Seleccionar Hospital y Escalafón',
        'Seleccionar Puesto de guardia',
        'Seleccionar Especialidad si aplica',
        'Ingresar fecha Desde y cantidad',
        'Agregar al panel y registrar',
      ],
      nota: 'Para CPH POU los puestos son: Especialista en la Guardia Médico, Profesional Guardia Médico, Biquímico de Guardia, etc.',
    },
    {
      id: 'estructura', titulo: 'Estructura', subtitulo: 'Cargos de conducción y autoridades', color: 'purple' as Color,
      ruta: '/cargos/alta', boton: '+ Estructura',
      escalafones: ['CPH (Jefe de Sección/Unidad/División/Departamento, Director)', 'Escalafón General (Jefe, Director, Gerencial)', 'Régimen Gerencial', 'Autoridades Superiores'],
      codigos: ['CPH-J-POF-XXXXXX', 'CPH-D-XXXXXX', 'EG-J-XXXXXX', 'RG-CG-XXXXXX', 'AS-DG-XXXXXX'],
      flujo: [
        'Ir a /cargos/alta y clickear “+ Estructura”',
        'Ingresar número de decreto y confirmar (campo dice “Decreto”)',
        'Seleccionar Hospital y Escalafón',
        'Seleccionar Puesto de conducción (solo muestra modalidad=ambos)',
        'Ingresar fecha Desde y cantidad',
        'Agregar al panel y registrar',
      ],
      nota: 'Solo muestra puestos con modalidad=“ambos” (cargos de conducción). POF y POU nunca muestran estos puestos.',
    },
    {
      id: 'padron', titulo: 'Padrón SIAL', subtitulo: 'Importación automática semanal', color: 'green' as Color,
      ruta: null, boton: null,
      escalafones: ['Todos los escalafones (automático)'],
      codigos: ['Código generado por prefijoDeCargo()'],
      flujo: [
        'El sistema procesa el Excel semanal del SIAL (Dotaneitor)',
        'Detecta id_sial_rol nuevos que no existen en la BD',
        'Busca cargo por (hospital, escalafón, codigo_repa, literal_puesto)',
        'Si no existe el cargo: lo crea con estado=vigente y crea la ocupación',
        'Si existe el cargo sin ocupación activa: crea la ocupación',
        'Si existe con ocupación activa: actualiza datos de la persona',
      ],
      nota: 'Flujo automático, sin intervención manual. Los cargos creados por el padrón pueden diferir de los manuales si el literal_puesto no coincide exactamente.',
    },
  ]

  const op = OPCIONES[activo]

  return (
    <div>
      <div className="flex gap-1 flex-wrap mb-4">
        {OPCIONES.map((o, i) => (
          <button key={o.id} onClick={() => setActivo(i)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              i === activo
                ? `${NODE_BG[o.color]} ${NODE_BORDER[o.color]} ${TEXT[o.color]}`
                : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600'
            }`}>
            {o.titulo}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className={`rounded-lg border p-3 ${NODE_BG[op.color]} ${NODE_BORDER[op.color]}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className={`text-xs font-bold ${TEXT[op.color]}`}>{op.titulo}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{op.subtitulo}</p>
              </div>
              {op.ruta && (
                <span className={`text-[10px] font-mono px-2 py-1 rounded border ${NODE_BORDER[op.color]} ${TEXT[op.color]} flex-shrink-0`}>
                  {op.ruta}
                </span>
              )}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Pasos</p>
            <ol className="space-y-1.5">
              {op.flujo.map((paso, i) => (
                <li key={i} className="flex gap-2 text-xs text-gray-700">
                  <span className={`flex-shrink-0 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center ${NODE_BG[op.color]} ${TEXT[op.color]}`}>
                    {i + 1}
                  </span>
                  {paso}
                </li>
              ))}
            </ol>
          </div>

          {op.nota && (
            <div className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2">
              <p className="text-[10px] text-yellow-700">⚠️ {op.nota}</p>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Escalafones disponibles</p>
            <div className="space-y-1">
              {op.escalafones.map((e, i) => (
                <div key={i} className="flex gap-1.5 text-xs text-gray-600">
                  <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT[op.color]}`} />
                  {e}
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Códigos generados</p>
            <div className="flex flex-wrap gap-1.5">
              {op.codigos.map((c) => (
                <span key={c} className={`font-mono text-[10px] px-2 py-0.5 rounded-full border ${BADGE[op.color]}`}>{c}</span>
              ))}
            </div>
          </div>

          <div className={`rounded-lg border p-3 ${NODE_BG[op.color]} ${NODE_BORDER[op.color]}`}>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Reglas del formulario</p>
            <ul className="space-y-1">
              {[
                'El select de Escalafón solo muestra los que tienen puestos en la BD.',
                'POF y POU no muestran cargos de conducción (modalidad=ambos).',
                'Estructura solo muestra cargos de conducción.',
                'La Especialidad es obligatoria cuando el puesto la tiene en BD.',
                'Se acumulan varios cargos antes de registrar (panel derecho).',
                'Máximo 50 por grupo. El sistema genera N códigos correlativos.',
              ].map((r, i) => (
                <li key={i} className="flex gap-1.5 text-[10px] text-gray-600">
                  <span className={`mt-1 w-1 h-1 rounded-full flex-shrink-0 ${DOT[op.color]}`} />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

function CicloVida({ activeIdx, onSelect }: { activeIdx: number; onSelect: (i: number) => void }) {
  const tab = CICLO_TABS[activeIdx]
  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 flex-wrap mb-4">
        {CICLO_TABS.map((t, i) => (
          <button
            key={t.id}
            onClick={() => onSelect(i)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              i === activeIdx
                ? `${NODE_BG[t.color]} ${NODE_BORDER[t.color]} ${TEXT[t.color]}`
                : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Izquierda: condición + descripción + campos */}
        <div className="space-y-3">
          <div className={`rounded-lg border p-3 ${NODE_BG[tab.color]} ${NODE_BORDER[tab.color]}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wide mb-1 ${TEXT[tab.color]}`}>Condición SQL</p>
            <code className="text-xs text-gray-700 font-mono break-all">{tab.condicion}</code>
          </div>
          <p className="text-xs text-gray-600">{tab.descripcion}</p>

          {/* Campos involucrados */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Campos involucrados</p>
            <div className="space-y-1">
              {tab.campos.map((c) => (
                <div key={c.campo} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-gray-400 text-[10px]">{c.tabla}.</span>
                  <span className={`font-mono font-semibold ${TEXT[tab.color]}`}>{c.campo}</span>
                  <span className="text-gray-400">=</span>
                  <code className="text-gray-600 font-mono">{c.valor}</code>
                </div>
              ))}
            </div>
          </div>

          {/* Validaciones */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Validaciones del sistema</p>
            <ul className="space-y-1">
              {tab.validaciones.map((v, i) => (
                <li key={i} className="flex gap-1.5 text-[10px] text-gray-600">
                  <span className={`mt-1 w-1 h-1 rounded-full flex-shrink-0 ${DOT[tab.color]}`} />
                  {v}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Derecha: eventos que disparan el cambio */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Eventos que generan este estado</p>
          <div className="space-y-2">
            {tab.origen.map((o, i) => (
              <div key={i} className="rounded-lg border border-gray-100 bg-white p-3">
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT[tab.color]}`} />
                  <div>
                    <div className="text-xs font-semibold text-gray-700">{o.evento}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{o.detalle}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Árbol de estados ──────────────────────────────────────────────────────────

function EstadoTree() {
  return (
    <div className="space-y-3">
      {/* Raíz */}
      <div className="flex items-center gap-3">
        <div className="w-28 flex-shrink-0 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-center">
          <div className="text-xs font-bold text-gray-700">CARGO</div>
          <div className="text-[10px] text-gray-400 mt-0.5">unidad de dotación</div>
        </div>
        <div className="text-gray-300 text-lg">→</div>
        <div className="text-xs text-gray-500">Existe independientemente de si está ocupado o vacante. Tiene un código único que nunca cambia.</div>
      </div>

      {/* Tres ramas principales */}
      <div className="ml-4 pl-4 border-l-2 border-gray-200 space-y-4">

        {/* Rama EN VALIDACIÓN */}
        <div className="flex items-start gap-3">
          <div className="w-28 flex-shrink-0 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-center">
            <div className="text-xs font-bold text-orange-700">EN VALID.</div>
            <div className="text-[10px] text-orange-500 mt-0.5">previo a baja</div>
          </div>
          <div className="flex-1 pt-1">
            <p className="text-xs text-gray-600 mb-2">Estado propio, previo a vigente/no_vigente. Solo se usa en el flujo de alta por baja.</p>
            <div className="flex gap-2 flex-wrap mb-2">
              {ESTADO_TREE.ramas[0].razones.map((r) => (
                <div key={r.label} className="rounded border border-orange-200 bg-white px-3 py-1.5">
                  <div className="text-xs font-semibold text-orange-700">{r.label}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{r.desc}</div>
                </div>
              ))}
            </div>
            <ul className="space-y-0.5">
              {ESTADO_TREE.ramas[0].reglas.map((r, i) => (
                <li key={i} className="flex gap-1.5 text-[10px] text-gray-500">
                  <span className="mt-1 w-1 h-1 rounded-full bg-orange-400 flex-shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Rama NO VIGENTE */}
        <div>
          <div className="flex items-start gap-3">
            <div className="w-28 flex-shrink-0 rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-center">
              <div className="text-xs font-bold text-gray-600">NO VIGENTE</div>
              <div className="text-[10px] text-gray-400 mt-0.5">estado terminal</div>
            </div>
            <div className="flex-1 pt-1">
              <p className="text-xs text-gray-600 mb-2">Estado terminal. El cargo sale de la estructura. No puede volver a vigente.</p>
              <div className="flex gap-2 flex-wrap">
                {ESTADO_TREE.ramas[1].razones.map((r) => (
                  <div key={r.label} className="rounded border border-gray-200 bg-white px-3 py-1.5">
                    <div className="text-xs font-semibold text-gray-600">{r.label}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{r.desc}</div>
                  </div>
                ))}
              </div>
              <ul className="mt-2 space-y-0.5">
                {ESTADO_TREE.ramas[1].reglas.map((r, i) => (
                  <li key={i} className="flex gap-1.5 text-[10px] text-gray-500">
                    <span className="mt-1 w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Rama VIGENTE */}
        <div>
          <div className="flex items-start gap-3">
            <div className="w-28 flex-shrink-0 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-center">
              <div className="text-xs font-bold text-green-700">VIGENTE</div>
              <div className="text-[10px] text-green-500 mt-0.5">activo en estructura</div>
            </div>
            <div className="flex-1 pt-1">
              <p className="text-xs text-gray-600 mb-1">El cargo está activo en la estructura orgánica. Puede estar ocupado o vacante.</p>
              <ul className="space-y-0.5 mb-3">
                {ESTADO_TREE.ramas[2].reglas.map((r, i) => (
                  <li key={i} className="flex gap-1.5 text-[10px] text-gray-500">
                    <span className="mt-1 w-1 h-1 rounded-full bg-green-400 flex-shrink-0" />
                    {r}
                  </li>
                ))}
              </ul>

              {/* Sub-ramas: VACANTE / OCUPADO */}
              <div className="ml-2 pl-3 border-l-2 border-green-100 space-y-4">

                {/* VACANTE */}
                <div className="flex items-start gap-3">
                  <div className="w-24 flex-shrink-0 rounded-lg border border-yellow-300 bg-yellow-50 px-2 py-2 text-center">
                    <div className="text-xs font-bold text-yellow-700">VACANTE</div>
                    <div className="text-[10px] text-yellow-500 mt-0.5">sin persona</div>
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="text-[10px] text-gray-500 mb-1.5">Condición derivada: vigente + sin ocupación activa (hasta IS NULL).</p>
                    <ul className="space-y-0.5 mb-2">
                      {ESTADO_TREE.ramas[2].subramas![0].reglas.map((r, i) => (
                        <li key={i} className="flex gap-1.5 text-[10px] text-gray-500">
                          <span className="mt-1 w-1 h-1 rounded-full bg-yellow-400 flex-shrink-0" />
                          {r}
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-2 flex-wrap">
                      {ESTADO_TREE.ramas[2].subramas![0].hijos!.map((h) => (
                        <div key={h.label} className={`rounded border px-2 py-1.5 ${NODE_BG[h.color]} ${NODE_BORDER[h.color]}`}>
                          <div className={`text-[10px] font-semibold ${TEXT[h.color]}`}>{h.label}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">{h.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* OCUPADO */}
                <div className="flex items-start gap-3">
                  <div className="w-24 flex-shrink-0 rounded-lg border border-blue-300 bg-blue-50 px-2 py-2 text-center">
                    <div className="text-xs font-bold text-blue-700">OCUPADO</div>
                    <div className="text-[10px] text-blue-500 mt-0.5">con persona</div>
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="text-[10px] text-gray-500 mb-1.5">Condición derivada: vigente + existe ocupación activa (hasta IS NULL).</p>
                    <ul className="space-y-0.5 mb-2">
                      {ESTADO_TREE.ramas[2].subramas![1].reglas.map((r, i) => (
                        <li key={i} className="flex gap-1.5 text-[10px] text-gray-500">
                          <span className="mt-1 w-1 h-1 rounded-full bg-blue-400 flex-shrink-0" />
                          {r}
                        </li>
                      ))}
                    </ul>

                    {/* Situaciones de revista */}
                    <div className="ml-2 pl-3 border-l-2 border-blue-100 space-y-2">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Situación de revista (tabla situacion de revista)</p>
                      <p className="text-[10px] text-yellow-600 bg-yellow-50 border border-yellow-200 rounded px-2 py-1 mt-1">
                        ⚠️ Verificar: la situación de revista es un atributo de la <strong>persona</strong> en ese cargo, no del cargo en sí.
                      </p>
                      {ESTADO_TREE.ramas[2].subramas![1].hijos!.map((h) => (
                        <div key={h.label} className={`rounded border px-3 py-2 ${NODE_BG[h.color]} ${NODE_BORDER[h.color]}`}>
                          <div className={`text-xs font-bold ${TEXT[h.color]}`}>{h.label}</div>
                          <p className="text-[10px] text-gray-600 mt-0.5">{h.desc}</p>
                          {h.detalle && (
                            <ul className="mt-1 space-y-0.5">
                              {h.detalle.map((d, i) => (
                                <li key={i} className="flex gap-1.5 text-[10px] text-gray-500">
                                  <span className={`mt-1 w-1 h-1 rounded-full flex-shrink-0 ${DOT[h.color]}`} />
                                  {d}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Detalle por tipo de cargo ─────────────────────────────────────────────────

function TipoDetalle({ tipo, color }: { tipo: TipoCargoFlow; color: Color }) {
  return (
    <div className="space-y-4">

      {/* Cabecera */}
      <div className={`rounded-lg border p-3 ${NODE_BG[color]} ${NODE_BORDER[color]}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={`text-xs font-bold ${TEXT[color]}`}>{tipo.nombre}</div>
            {tipo.modalidad && <div className="text-[10px] text-gray-500 mt-0.5">Modalidad: {tipo.modalidad}</div>}
          </div>
          <div className="text-right flex-shrink-0">
            <div className={`font-mono text-xs font-bold ${TEXT[color]}`}>{tipo.codigo}</div>
            <div className="font-mono text-[10px] text-gray-400">ej: {tipo.ejemplo}</div>
          </div>
        </div>
      </div>

      {/* Cómo se llega a VACANTE → concurso */}
      <div>
        <h5 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">
          Cómo se genera la vacante y el concurso
        </h5>
        <div className="space-y-1.5">
          {tipo.reglas.map((r, i) => (
            <div key={i} className="flex gap-2 text-xs text-gray-700">
              <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT[color]}`} />
              {r}
            </div>
          ))}
        </div>
      </div>

      {/* Flujo de transiciones */}
      <div>
        <h5 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">
          Transiciones del cargo
        </h5>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-gray-100 rounded">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1.5 text-left text-gray-500 font-medium">Desde</th>
                <th className="px-2 py-1.5 text-left text-gray-500 font-medium">Hacia</th>
                <th className="px-2 py-1.5 text-left text-gray-500 font-medium">Condición / Evento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tipo.edges.map((edge, i) => {
                const nodeMap = new Map(tipo.nodes.map((n) => [n.id, n]))
                const fromNode = nodeMap.get(edge.from)
                const toNode = nodeMap.get(edge.to)
                return (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-2 py-1.5 font-medium text-gray-700">{fromNode?.title ?? edge.from}</td>
                    <td className="px-2 py-1.5 text-gray-600">
                      {edge.from === edge.to
                        ? <span className="text-yellow-600">↺ {toNode?.title ?? edge.to}</span>
                        : edge.dashed
                          ? <span className="text-blue-500">⇄ {toNode?.title ?? edge.to}</span>
                          : toNode?.title ?? edge.to
                      }
                    </td>
                    <td className="px-2 py-1.5 text-gray-500">{edge.label}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Puestos válidos */}
      {tipo.puestos && tipo.puestos.length > 0 && (
        <div>
          <h5 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">
            Puestos válidos ({tipo.puestos.length})
          </h5>
          <div className="flex flex-wrap gap-1.5">
            {tipo.puestos.map((p) => (
              <span key={p} className={`text-[10px] px-2 py-0.5 rounded-full border ${BADGE[color]}`}>
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const TAB_ACTIVE: Record<Color, string> = {
  blue: 'text-blue-700', yellow: 'text-yellow-700', green: 'text-green-700',
  red: 'text-red-700', gray: 'text-gray-700', purple: 'text-purple-700', orange: 'text-orange-700',
}
const SIDEBAR_ACTIVE: Record<Color, string> = {
  blue: 'bg-blue-50 text-blue-800', yellow: 'bg-yellow-50 text-yellow-800', green: 'bg-green-50 text-green-800',
  red: 'bg-red-50 text-red-800', gray: 'bg-gray-100 text-gray-800', purple: 'bg-purple-50 text-purple-800', orange: 'bg-orange-50 text-orange-800',
}
const BG: Record<Color, string> = {
  blue: 'bg-blue-50', yellow: 'bg-yellow-50', green: 'bg-green-50',
  red: 'bg-red-50', gray: 'bg-gray-50', purple: 'bg-purple-50', orange: 'bg-orange-50',
}
const TEXT: Record<Color, string> = {
  blue: 'text-blue-800', yellow: 'text-yellow-800', green: 'text-green-800',
  red: 'text-red-800', gray: 'text-gray-700', purple: 'text-purple-800', orange: 'text-orange-800',
}
const DOT: Record<Color, string> = {
  blue: 'bg-blue-500', yellow: 'bg-yellow-500', green: 'bg-green-500',
  red: 'bg-red-500', gray: 'bg-gray-400', purple: 'bg-purple-500', orange: 'bg-orange-500',
}
const BADGE: Record<Color, string> = {
  blue: 'bg-blue-50 border-blue-200 text-blue-700', yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  green: 'bg-green-50 border-green-200 text-green-700', red: 'bg-red-50 border-red-200 text-red-700',
  gray: 'bg-gray-50 border-gray-200 text-gray-600', purple: 'bg-purple-50 border-purple-200 text-purple-700',
  orange: 'bg-orange-50 border-orange-200 text-orange-700',
}
const NODE_BG: Record<Color, string> = {
  blue: 'bg-blue-50', yellow: 'bg-yellow-50', green: 'bg-green-50',
  red: 'bg-red-50', gray: 'bg-gray-50', purple: 'bg-purple-50', orange: 'bg-orange-50',
}
const NODE_BORDER: Record<Color, string> = {
  blue: 'border-blue-200', yellow: 'border-yellow-200', green: 'border-green-200',
  red: 'border-red-200', gray: 'border-gray-200', purple: 'border-purple-200', orange: 'border-orange-200',
}
