import { createRequire } from 'node:module'
import type { Prisma } from '@prisma/client'
import { normalizarTexto } from '@srrhh/normalizacion'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { SECCION_UNIVERSOS, type OrganigramaQuery } from './organigrama.schema.js'
import { PREFIJOS_CONDUCCION, esConduccionPorPrefijo } from '../../shared/codigoCargo.js'
import { cargoIdsOcultosPorRolRedundante } from '../../shared/cargosOcultos.js'
import { derivarCargosConduccionService } from '../../shared/derivarCargosConduccion.js'

// xlsx es CJS — mismo patrón que bajas-sial.service.ts (createRequire porque
// este proyecto es ESM).
const require = createRequire(import.meta.url)
const XLSX = require('xlsx') as {
  read: (
    data: Buffer,
    opts: Record<string, unknown>,
  ) => { SheetNames: string[]; Sheets: Record<string, unknown> }
  utils: {
    sheet_to_json: (ws: unknown, opts: Record<string, unknown>) => Record<string, unknown>[]
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Migración legacy (dotacion-rrhh -> v2). Puerto de `organigramaRoutes.js` de
// la app vieja, con dos diferencias deliberadas (decisión tomada antes de
// escribir esto — ver Doc/Planificacion/Sprints/POST_SPRINT_14_migracion_legacy_organigrama.md):
//
// 1. Sin selector de período: siempre muestra quién ocupa cada puesto HOY
//    (Ocupacion.hasta = null), no un snapshot histórico — v2 no tiene guardado
//    el equivalente de la tabla `roles` por período con estos campos.
// 2. El cruce "código de repartición -> cargo" se hace solo por
//    `Cargo.codigoRepa`, sin re-filtrar además por sigla/hospital: en la app
//    vieja el join agregaba `AND o.sigla = s.sigla` pero `codigo_reparticion`
//    ya es único en toda la tabla `organigramas` (verificado al importar los
//    4.310 nodos, cero duplicados) — filtrar además por sigla sería
//    redundante, y además muchos nodos (Ministerio, Direcciones Generales)
//    no corresponden a ningún `Hospital` real en v2.
// ─────────────────────────────────────────────────────────────────────────────

interface PersonaNodo {
  personaId: string
  cargoId: string | null
  idSialRol: string | null
  codigoCargo: string | null
  nombre: string
  cargo: string | null
  cuil: string
  sexo: string | null
  especialidadPersona: string | null
  mailLaboral: string | null
  telefono: string | null
  fechaNacimiento: string | null
  antiguedadDesde: string | null
  cargoDesde: string | null
  cargoHasta: string | null
  especialidadCargo: string | null
  escalafon: string | null
  hospital: string | null
}

interface CargoVacanteNodo {
  cargoId: string
  codigoCargo: string | null
}

// Razón por la que un nodo no tiene persona de conducción asignada
// (solo se popula cuando cargoVacante es null)
type RazonSinCargo = 'guardia_residencia_docente' | 'dato_incompleto' | 'sin_cargo'

interface OrganigramaNodo {
  id: string
  nombre: string | null
  tipo: string
  nivel: number
  padre: string | null
  regimenEmpleo: string
  persona: PersonaNodo | null
  cargoVacante: CargoVacanteNodo | null
  razonSinCargo: RazonSinCargo | null
  hijos: OrganigramaNodo[]
}

// ── Reglas de negocio de "puesto de conducción válido" ──────────────────────
// Puerto literal de CONDICION_CARGOS (organigramaRoutes.js) — los mismos 4
// criterios sobre codigoRegistro + unificadorPuesto (+ codigoJefaturas para
// jefaturas). Filtrado en memoria en vez de en el WHERE de Prisma: son pocas
// decenas de cargos por árbol (los que matchean codigoRepa de esta jerarquía
// puntual), no vale la pena un where anidado con 4 ramas de OR distintas.
//
// ── Identificación de jefatura por JCAT (reemplaza unificador_puesto) ────────
// El pipeline v2 del Dotaneitor (Sprint 22) ELIMINÓ `unificador_puesto`, que es
// lo que esta función usaba antes para decidir si un cargo es de conducción.
// Ahora se usa el JCAT (`ocupaciones.codigo_jefaturas`), que es el identificador
// real de la jefatura y el que el pipeline v2 sí conserva (lo mapea a
// `cargo_jefatura` vía la tabla `jcat_cargo_jefatura`). Las familias:
//   P = Carrera Profesional de la Salud (cod_reg 37)
//   G = Régimen Gerencial sobre carrera profesional (cod_reg 37)
//   Z = Jefaturas operativas: enfermería/administrativo/técnicos (cod_reg 83/85/87)
// Dentro de cada familia el segundo dígito es el nivel (00/01 dirección,
// 02 depto, 03 subdir, 04 división, 05 unidad, 06 sección). Un JCAT con valor
// (distinto de '0'/vacío) ya implica que el cargo encabeza una unidad.
const CODIGOS_JEFATURAS_OPERATIVAS = new Set(['83', '85', '87'])

function tieneJcatDeJefatura(codigoJefaturas: string | null): boolean {
  if (!codigoJefaturas) return false
  const j = codigoJefaturas.trim().toUpperCase()
  if (j === '' || j === '0') return false
  // Familias de jefatura conocidas (coinciden con la tabla jcat_cargo_jefatura).
  return /^[PGZ]\d{2}$/.test(j)
}

function esCargoDeConduccion(
  codigoRegistro: string | undefined,
  codigoJefaturas: string | null,
  escalafon: string | null,
  codigoCargo?: string | null,
): boolean {
  // El CÓDIGO del cargo manda cuando ya es un prefijo de conducción (CPH-D,
  // CPH-J-*, CPH-SD, TEC-J, EG-J/D/G, RG-CG, AS). El padrón a veces trae a un
  // jefe en un cargo de jefatura (código CPH-J-*) pero SIN JCAT en la ocupación
  // (dato incompleto del SIAL) — ese cargo es jefatura igual, lo dice su código.
  // (Caso testigo: Martínez Montes, CPH-J-POF-001577 sin JCAT en 40221196, única
  // jefa del nodo — sin esto el nodo salía Vacante pese a estar ocupado.) Esta
  // vía es coherente con el filtro "Solo jefes" de cargos.service.ts.
  if (esConduccionPorPrefijo(codigoCargo)) return true

  // Carrera Gerencial: gerentes/subgerentes operativos. NO traen código de
  // registro ni JCAT (verificado: cod_reg y jcat vacíos), pero son conducción
  // por definición — ocupan los nodos GO/SGO del organigrama. Se identifican
  // por escalafón. (Sin esto, p. ej. "GO Planificación y Control de RRHH"
  // salía Vacante aunque tuviera un Gerente Operativo asignado.)
  if (escalafon && escalafon.toLowerCase().includes('gerencial')) return true

  if (!codigoRegistro) return false

  // Autoridades Superiores (25) y Gerencias (60) son conducción por definición
  // y NO usan JCAT (verificado: 0 de sus ocupaciones vigentes lo traen).
  if (codigoRegistro === '25') return true
  if (codigoRegistro === '60') return true

  // Carrera Profesional de la Salud (37) y jefaturas operativas (83/85/87):
  // son conducción cuando la ocupación vigente trae un JCAT de jefatura.
  if (codigoRegistro === '37' || CODIGOS_JEFATURAS_OPERATIVAS.has(codigoRegistro)) {
    return tieneJcatDeJefatura(codigoJefaturas)
  }
  return false
}

// Rango jerárquico de un cargo de conducción: menor = más alto en la pirámide.
// Cuando una misma repartición tiene VARIOS cargos de conducción (ej. un
// Subsecretario y un Jefe de División conviviendo en el mismo nodo), gana el de
// menor rango para que el titular del nodo sea la autoridad, no una jefatura
// subordinada. Antes se tomaba el primero por orden de query y podía quedar el
// Jefe de División en vez del Subsecretario.
function rangoConduccion(
  codigoRegistro: string | undefined,
  codigoJefaturas: string | null,
  escalafon: string | null,
  codigoCargo?: string | null,
): number {
  if (codigoRegistro === '25') return 0 // Autoridades Superiores (ministro/subsecretario/DG)
  if (codigoRegistro === '60') return 1 // Gerencias

  // El JCAT manda la jerarquía REAL por sobre el escalafón: el 2º dígito es el
  // nivel (00/01 dirección, 02 depto, 03 subdir, 04 división, 05 unidad, 06
  // sección). Se evalúa ANTES que la vía gerencial-por-escalafón, porque un
  // cargo puede ser escalafón "Carrera Gerencial" pero traer un JCAT de nivel
  // alto (ej. Director P60) que NO debe quedar debajo de un Jefe de Depto, ni
  // al revés. Base 10 para no pisar a Autoridades/Gerencias.
  const j = (codigoJefaturas ?? '').trim().toUpperCase()
  if (/^[PGZ]\d{2}$/.test(j)) return 10 + Number(j.slice(1))

  // Sin JCAT pero con CÓDIGO de conducción: derivar el nivel del prefijo del
  // código (mismo criterio que el JCAT: dirección < depto < subdir < división <
  // unidad < sección). Alinea el rango con la escala del JCAT (base 10) para que
  // un Director sin JCAT no quede debajo de un Jefe de Unidad con JCAT.
  const rangoPrefijo = rangoPorPrefijoCodigo(codigoCargo)
  if (rangoPrefijo !== null) return rangoPrefijo

  // Carrera Gerencial SIN JCAT: gerente/subgerente operativo puro (nodos GO/SGO).
  // Va después de los cargos con JCAT de dirección pero sigue siendo conducción.
  if (escalafon && escalafon.toLowerCase().includes('gerencial')) return 50

  return 99
}

// Nivel jerárquico derivado del prefijo del código de cargo, en la MISMA escala
// que el JCAT (base 10: 10=dirección … 16=sección), para cargos de conducción
// sin JCAT. Devuelve null si el código no es de conducción.
function rangoPorPrefijoCodigo(codigoCargo: string | null | undefined): number | null {
  if (!esConduccionPorPrefijo(codigoCargo)) return null
  const c = codigoCargo!
  if (c.startsWith('AS-')) return 0
  if (c.startsWith('RG-CG')) return 1
  if (c.startsWith('CPH-D') || c.startsWith('EG-D')) return 10 // dirección
  if (c.startsWith('CPH-SD')) return 13                        // subdirección
  if (c.startsWith('EG-G')) return 10                          // gerencial ≈ dirección
  // Jefaturas (depto/división/unidad/sección) — el código no distingue el
  // sub-nivel, así que se usa el de jefe de unidad (05) como representativo.
  if (c.startsWith('CPH-J') || c.startsWith('TEC-J') || c.startsWith('EG-J')) return 15
  return 20
}

// ── Orden jerárquico por tipo de unidad — puerto literal de `ordenTipos` ────
const ORDEN_TIPOS: Record<string, number> = {
  Ministerio: 0,
  AREA: 1,
  'SSEC/DIREJE': 2,
  GO: 3,
  SGO: 4,
  DG: 5,
  'F/N DG': 6,
  DHOS: 7,
  SDHOS: 8,
  'UAI DG': 8.5,
  'F/N DEJE': 8.6,
  'UAI MSTR': 8.7,
  'PLTA TRANS. DOCENTE': 8.8,
  'F/N MSTR - GO': 8.9,
  REGIMEN: 9,
  DEPT: 10,
  'DEPT CA': 10.5,
  DIV: 11,
  'DIV CA': 11.5,
  UNID: 12,
  SECCION: 13,
  SECC: 13,
  'SECCION CA': 13.5,
}

function ordenarHijos(nodo: OrganigramaNodo) {
  if (!nodo.hijos.length) return
  nodo.hijos.sort((a, b) => {
    const oa = ORDEN_TIPOS[a.tipo] ?? 999
    const ob = ORDEN_TIPOS[b.tipo] ?? 999
    if (oa !== ob) return oa - ob
    return a.id.localeCompare(b.id)
  })
  nodo.hijos.forEach(ordenarHijos)
}

export async function getOrganigramaService(query: OrganigramaQuery): Promise<{
  data: OrganigramaNodo
  sigla?: string
  seccion?: string
}> {
  const { sigla, seccion } = query

  // === 1. Estructura del árbol ===
  // mode: 'insensitive' porque el dump MySQL legacy puede tener cualquier casing
  // en universo_totalizador (ej. 'Nivel Central' vs 'NIVEL CENTRAL').
  const rows = await prisma.organigrama.findMany({
    where: sigla
      ? { sigla }
      : {
          // Una sección puede tener varias etiquetas equivalentes de universo
          // (ej. APS vive como 'APS' y 'ATENCION PRIMARIA'). Se matchea
          // cualquiera, case-insensitive.
          OR: SECCION_UNIVERSOS[seccion!].map((u) => ({
            universoTotalizador: { equals: u, mode: 'insensitive' as const },
          })),
        },
    orderBy: [{ lvl: 'asc' }, { codigoReparticion: 'asc' }],
  })

  // Nivel Central: incluir los hijos DIRECTOS del Ministerio aunque tengan otro
  // universo (ej. la SS de Atención Primaria vive en universo 'APS', pero
  // cuelga del Ministerio y debe verse como un cajón más del Nivel Central).
  // Se trae el SUBÁRBOL COMPLETO de cada hijo faltante (no solo el nodo), para
  // que al navegar esa subsecretaría en Nivel Central se vean sus DG,
  // departamentos, etc. — la misma estructura que su propia sección, vista
  // desde otro punto de entrada. Se identifican por padre = raíz del Nivel Central.
  if (seccion === 'nivel-central' && rows.length > 0) {
    const ministerio = rows.find((r) => !r.padre || r.padre.trim() === 'ROOT')
    if (ministerio) {
      const yaIncluidos = new Set(rows.map((r) => r.codigoReparticion))
      // Descendientes de los hijos directos del Ministerio que no estén ya en
      // el recorte, vía recursión por `padre` (un solo query recursivo).
      const subarbol = await prisma.$queryRaw<Array<{ codigo_reparticion: string }>>`
        WITH RECURSIVE desc_tree AS (
          SELECT codigo_reparticion, padre
          FROM organigramas
          WHERE padre = ${ministerio.codigoReparticion}
          UNION ALL
          SELECT o.codigo_reparticion, o.padre
          FROM organigramas o
          JOIN desc_tree d ON o.padre = d.codigo_reparticion
        )
        SELECT codigo_reparticion FROM desc_tree
      `
      const codigosFaltantes = subarbol
        .map((r) => r.codigo_reparticion)
        .filter((c) => !yaIncluidos.has(c))
      if (codigosFaltantes.length > 0) {
        const nodosFaltantes = await prisma.organigrama.findMany({
          where: { codigoReparticion: { in: codigosFaltantes } },
        })
        for (const n of nodosFaltantes) rows.push(n)
      }
    }
  }

  if (rows.length === 0) {
    throw AppError.notFound(
      sigla
        ? `No se encontró organigrama para la sigla: ${sigla}`
        : `No se encontró organigrama para la sección: ${seccion}`,
    )
  }

  // === 2. Personas asignadas HOY a los nodos de este árbol ===
  const codigosReparticion = rows.map((r) => r.codigoReparticion)

  // S24: cargos de conducción con rol redundante del SIAL (sin JCAT pero con
  // gemelo-con-JCAT de la misma persona en el mismo codigo_repa). Se ocultan
  // del organigrama para que un nodo no muestre a la persona por su cargo
  // redundante en vez de por el que tiene la jefatura real (JCAT). Filtrado
  // dinámico — ver shared/cargosOcultos.ts y SPRINT_24_S2_analisis.md §5.
  const idsOcultos = await cargoIdsOcultosPorRolRedundante(prisma)

  const cargosCandidatos = await prisma.cargo.findMany({
    where: {
      codigoRepa: { in: codigosReparticion },
      ...(idsOcultos.length > 0 && { id: { notIn: idsOcultos } }),
      // Candidatos a conducción: por código de registro (25/60/37/83/85/87) o
      // por escalafón Carrera Gerencial (gerente/subgerente operativo, que no
      // traen código de registro). El filtro fino lo hace esCargoDeConduccion.
      OR: [
        { codigoRegistro: { codigo: { in: ['25', '60', '37', '83', '85', '87'] } } },
        { escalafon: { nombre: { contains: 'erencial', mode: 'insensitive' } } },
      ],
      // situacion de revista 'activo' case-insensitive: la BD tiene el valor
      // mezclado (padrones viejos 'Activo' / nuevos 'activo' por la
      // normalización en curso), así que un literal exacto se perdería la mitad.
      ocupaciones: { some: { hasta: null, situacionRevista: { equals: 'activo', mode: 'insensitive' } } },
    },
    select: {
      codigoRepa: true,
      id: true,
      codigo: true,
      literalPuesto: true,
      unificadorPuesto: true,
      especialidadLegacy: true,
      especialidadPuesto: { select: { nombre: true } },
      escalafon: { select: { nombre: true } },
      hospital: { select: { nombre: true } },
      codigoRegistro: { select: { codigo: true } },
      ocupaciones: {
        where: { hasta: null },
        take: 1,
        select: {
          codigoJefaturas: true,
          idSialRol: true,
          cargoDesdeFecha: true,
          cargoHastaFecha: true,
          persona: {
            select: {
              id: true,
              apellidoNombre: true,
              cuil: true,
              sexo: true,
              mailLaboral: true,
              telefono: true,
              fechaNacimiento: true,
              antiguedadDesde: true,
            },
          },
        },
      },
    },
    // Mismo orden que la app vieja (codigo_reparticion, codigo_registro, unificador_puesto)
    // para que, si dos cargos matchean el mismo nodo, gane siempre el mismo.
    orderBy: [{ codigoRepa: 'asc' }, { unificadorPuesto: 'asc' }],
  })

  // Ordenar por rango jerárquico de conducción: cuando una repartición tiene
  // varios cargos de conducción, el primero en el loop (que gana el nodo) debe
  // ser el de mayor jerarquía (ej. Subsecretario sobre Jefe de División).
  const candidatosOrdenados = [...cargosCandidatos].sort((a, b) => {
    const ra = rangoConduccion(
      a.codigoRegistro?.codigo,
      a.ocupaciones[0]?.codigoJefaturas ?? null,
      a.escalafon?.nombre ?? null,
      a.codigo,
    )
    const rb = rangoConduccion(
      b.codigoRegistro?.codigo,
      b.ocupaciones[0]?.codigoJefaturas ?? null,
      b.escalafon?.nombre ?? null,
      b.codigo,
    )
    return ra - rb
  })

  const personasMap = new Map<string, PersonaNodo>()
  for (const cargo of candidatosOrdenados) {
    if (!cargo.codigoRepa || personasMap.has(cargo.codigoRepa)) continue
    const ocup = cargo.ocupaciones[0]
    if (!ocup) continue
    if (
      !esCargoDeConduccion(
        cargo.codigoRegistro?.codigo,
        ocup.codigoJefaturas,
        cargo.escalafon?.nombre ?? null,
        cargo.codigo,
      )
    )
      continue

    personasMap.set(cargo.codigoRepa, {
      personaId: ocup.persona.id,
      cargoId: cargo.id,
      idSialRol: ocup.idSialRol ?? null,
      codigoCargo: cargo.codigo ?? null,
      nombre: ocup.persona.apellidoNombre,
      cargo: cargo.literalPuesto,
      cuil: ocup.persona.cuil,
      sexo: ocup.persona.sexo ?? null,
      // S21-5: la especialidad "de la persona" se deriva del cargo vigente
      // (catálogo especialidad_puesto, con fallback al snapshot
      // especialidad_legacy) en vez de la columna especialidad_principal
      // eliminada, que quedaba stale.
      especialidadPersona: cargo.especialidadPuesto?.nombre ?? cargo.especialidadLegacy ?? null,
      mailLaboral: ocup.persona.mailLaboral ?? null,
      telefono: ocup.persona.telefono ?? null,
      fechaNacimiento: ocup.persona.fechaNacimiento?.toISOString() ?? null,
      antiguedadDesde: ocup.persona.antiguedadDesde?.toISOString() ?? null,
      cargoDesde: ocup.cargoDesdeFecha?.toISOString() ?? null,
      cargoHasta: ocup.cargoHastaFecha?.toISOString() ?? null,
      especialidadCargo: cargo.especialidadLegacy ?? null,
      escalafon: cargo.escalafon?.nombre ?? null,
      hospital: cargo.hospital?.nombre ?? null,
    })
  }

  // === 3. Cargos vacantes (nodos sin persona pero con cargo vigente sin ocupar) ===
  const nodosOcupados = new Set(personasMap.keys())
  const nodosLibres = codigosReparticion.filter((c) => !nodosOcupados.has(c))
  // Cargo de conducción VACANTE: cargo vigente sin ocupante en un nodo libre.
  // Con el unificador eliminado (v2) ya no se puede distinguir un cargo de
  // conducción 37/83/85/87 vacante de uno común (el JCAT que lo distingue vive
  // en la ocupación, que acá no existe). Solo 25 (Autoridades Superiores) y 60
  // (Gerencias) son conducción por su código de registro, sin depender de JCAT.
  // Vacante de conducción = cargo vigente sin ocupante que es conducción por
  // su código de registro (25 Autoridades Superiores / 60 Gerencias) O por su
  // escalafón (Carrera Gerencial: gerente/subgerente operativo, nodos GO/SGO).
  // Son los únicos identificables sin ocupante (el JCAT que distingue a los
  // 37/83/85/87 vive en la ocupación, que acá no existe).
  const cargosVacantesRaw = await prisma.cargo.findMany({
    where: {
      codigoRepa: { in: nodosLibres },
      ...(idsOcultos.length > 0 && { id: { notIn: idsOcultos } }),
      deletedAt: null,
      // Un nodo vacante muestra el código del cargo que espera ocupante. Ese
      // cargo puede estar 'vigente' sin ocupante O en 'validacion_vacante'
      // (cargo de jefatura real que vino del padrón sin ocupante activo, ej. el
      // director del Sardá CPH-D-000010). Antes solo 'vigente', por eso esos
      // nodos salían "Vacante" sin código pese a tener un cargo real detrás.
      estado: { in: ['vigente', 'validacion_vacante'] },
      OR: [
        { codigoRegistro: { codigo: { in: ['25', '60'] } } },
        { escalafon: { nombre: { contains: 'erencial', mode: 'insensitive' } } },
        // S24: cargos de conducción generados desde el organigrama (vacantes de
        // jefatura por definición).
        { origen: 'organigrama' },
        // Conducción por el PREFIJO del código de cargo (CPH-D, CPH-J-*, EG-J,
        // TEC-J, etc.) — cubre los cargos de jefatura que ya vinieron del padrón,
        // sin importar su código de registro (ej. el director del Sardá
        // CPH-D-000010, cod_reg 37, en validacion_vacante). Regla: si tiene
        // código de cargo de conducción, es jefatura y se muestra.
        { OR: [...PREFIJOS_CONDUCCION].map((p) => ({ codigo: { startsWith: `${p}-` } })) },
      ],
    },
    select: {
      id: true,
      codigoRepa: true,
      codigo: true,
      origen: true,
      codigoRegistro: { select: { codigo: true } },
      escalafon: { select: { nombre: true } },
    },
    orderBy: { codigoRepa: 'asc' },
  })
  // Rango jerárquico por prefijo de código: cuando un nodo tiene varios cargos
  // de conducción con el mismo codigo_repa (ej. el raíz de un hospital con
  // director + jefes), el nodo muestra el de MAYOR rango (Director antes que
  // Jefe de Unidad). Menor número = más jerárquico.
  const rangoPrefijo = (codigo: string | null): number => {
    if (!codigo) return 99
    if (codigo.startsWith('AS-')) return 0
    if (codigo.startsWith('CPH-D-')) return 1
    if (codigo.startsWith('CPH-SD-')) return 2
    if (codigo.startsWith('RG-CG-')) return 3
    if (codigo.startsWith('EG-D-')) return 3
    if (codigo.startsWith('CPH-J-') || codigo.startsWith('TEC-J-') || codigo.startsWith('EG-J-') || codigo.startsWith('EG-G-')) return 4
    return 50
  }
  const cargosVacantesMap = new Map<string, CargoVacanteNodo>()
  for (const cv of cargosVacantesRaw) {
    if (!cv.codigoRepa) continue
    // Es conducción si: lo generó el organigrama (S24), O su CÓDIGO tiene
    // prefijo de conducción (CPH-D, CPH-J-*, EG-J, TEC-J... — cubre los cargos
    // de jefatura del padrón como el director del Sardá), O lo valida el
    // criterio clásico por código de registro / escalafón.
    const esConduccion =
      cv.origen === 'organigrama' ||
      esConduccionPorPrefijo(cv.codigo) ||
      esCargoDeConduccion(cv.codigoRegistro?.codigo, null, cv.escalafon?.nombre ?? null)
    if (!esConduccion) continue
    // Si el nodo ya tiene un cargo mapeado, quedarse con el de mayor rango.
    const existente = cargosVacantesMap.get(cv.codigoRepa)
    if (existente && rangoPrefijo(existente.codigoCargo) <= rangoPrefijo(cv.codigo)) continue
    cargosVacantesMap.set(cv.codigoRepa, { cargoId: cv.id, codigoCargo: cv.codigo ?? null })
  }

  // === 3b. Clasificar nodos sin cargo de conducción (para mostrar razón en UI) ===
  // Query liviana: solo los nodos que no tienen persona ni cargo vacante mapeado.
  // Detecta si tienen cargos de guardia/residencia/docente (códigos 23/24/07),
  // que no son de conducción, para distinguirlos de un nodo realmente sin cargo.
  const nodosSinMapeo = nodosLibres.filter((c) => !cargosVacantesMap.has(c))
  const razonSinCargoMap = new Map<string, RazonSinCargo>()
  if (nodosSinMapeo.length > 0) {
    const cargosClasif = await prisma.cargo.findMany({
      where: { codigoRepa: { in: nodosSinMapeo }, deletedAt: null },
      select: {
        codigoRepa: true,
        codigoRegistro: { select: { codigo: true } },
      },
    })
    // Agrupar por codigoRepa para clasificar
    const porRepa = new Map<string, { codigos: Set<string> }>()
    for (const c of cargosClasif) {
      if (!c.codigoRepa) continue
      if (!porRepa.has(c.codigoRepa)) porRepa.set(c.codigoRepa, { codigos: new Set() })
      const entry = porRepa.get(c.codigoRepa)!
      if (c.codigoRegistro?.codigo) entry.codigos.add(c.codigoRegistro.codigo)
    }
    for (const cod of nodosSinMapeo) {
      const entry = porRepa.get(cod)
      if (!entry) {
        razonSinCargoMap.set(cod, 'sin_cargo')
        continue
      }
      const { codigos } = entry
      if (codigos.has('23') || codigos.has('24') || codigos.has('07')) {
        razonSinCargoMap.set(cod, 'guardia_residencia_docente')
      } else {
        razonSinCargoMap.set(cod, 'sin_cargo')
      }
    }
  }

  // === 3c. Nombre real de los nodos "Área Programática" (S23) ===
  // El árbol legacy trae el desc_rep genérico "DEPT Área Programática de
  // Salud" para las 13 AP (un texto idéntico que no distingue una de otra) —
  // se pisa acá con el nombre del hospital real del catálogo nuevo
  // (AreaProgramatica.codigoReparticion, cargado en S23-2/S23-3), sin tocar
  // el dato crudo importado. Ej.: "DEPT Área Programática de Salud" (40220613)
  // -> "Área Programática (Durand)".
  const areasReales = await prisma.areaProgramatica.findMany({
    where: { codigoReparticion: { not: null } },
    select: { codigoReparticion: true, hospital: { select: { nombre: true } } },
  })
  const nombreApPorCodigo = new Map(
    areasReales
      .filter((a): a is typeof a & { codigoReparticion: string } => !!a.codigoReparticion)
      .map((a) => [
        a.codigoReparticion,
        `Área Programática (${a.hospital.nombre.replace(/^Hospital\s+/i, '')})`,
      ]),
  )

  // El legacy también arrastra el mismo dato repetido como sufijo "- AP
  // {NOMBRE}" en los 55 nodos hijos (CeSACs) de las 13 AP — ahora redundante
  // porque el padre ya lo muestra. Se recorta solo ese sufijo, dejando el
  // resto del desc_rep intacto (ej. "CeSAC N° 9 - AP ARGERICH" -> "CeSAC N° 9").
  const SUFIJO_AP = /\s*-\s*AP\s+.+$/i
  const limpiarSufijoAp = (desc: string | null): string | null =>
    desc ? desc.replace(SUFIJO_AP, '') : desc

  // === 4. Mapa de nodos ===
  // Pre-cargar padres que no estén en el recorte (ej. SS de APS vive bajo NC)
  const codigosEnRecorte = new Set(rows.map((r) => r.codigoReparticion))
  const codigosPadresFuera = [
    ...new Set(
      rows
        .map((r) => r.padre?.trim() || null)
        .filter((p): p is string => !!p && !codigosEnRecorte.has(p)),
    ),
  ]
  const padresFuera =
    codigosPadresFuera.length > 0
      ? await prisma.organigrama.findMany({
          where: { codigoReparticion: { in: codigosPadresFuera } },
        })
      : []

  const mapa = new Map<string, OrganigramaNodo>()
  // Agregar padres externos al mapa para que los hijos puedan linkearse
  for (const r of padresFuera) {
    mapa.set(r.codigoReparticion, {
      id: r.codigoReparticion,
      nombre: nombreApPorCodigo.get(r.codigoReparticion) ?? limpiarSufijoAp(r.descRep),
      tipo: r.tipo,
      nivel: r.lvl,
      padre: r.padre?.trim() || null,
      regimenEmpleo: r.regimenEmpleo || '',
      persona: null,
      cargoVacante: null,
      razonSinCargo: null,
      hijos: [],
    })
  }
  for (const r of rows) {
    mapa.set(r.codigoReparticion, {
      id: r.codigoReparticion,
      nombre: nombreApPorCodigo.get(r.codigoReparticion) ?? limpiarSufijoAp(r.descRep),
      tipo: r.tipo,
      nivel: r.lvl,
      padre: r.padre,
      regimenEmpleo: r.regimenEmpleo || 'Sin Régimen',
      persona: personasMap.get(r.codigoReparticion) ?? null,
      cargoVacante: !personasMap.has(r.codigoReparticion)
        ? (cargosVacantesMap.get(r.codigoReparticion) ?? null)
        : null,
      razonSinCargo:
        !personasMap.has(r.codigoReparticion) && !cargosVacantesMap.has(r.codigoReparticion)
          ? (razonSinCargoMap.get(r.codigoReparticion) ?? null)
          : null,
      hijos: [],
    })
  }

  // === 5. Identificar SDHOS ===
  let sdhosCod: string | null = null
  if (sigla) {
    for (const r of rows) {
      if (r.tipo === 'SDHOS' && r.descRep?.includes('Subdirección Médica'))
        sdhosCod = r.codigoReparticion
    }
  }

  // === 6. Relaciones padre-hijo ===
  // Normalizar padre vacío a null (el seed puede haber insertado '' en vez de NULL)
  // Solo iterar rows (no padresFuera) para identificar raíces del recorte.
  const raices: OrganigramaNodo[] = []
  for (const r of rows) {
    const nodo = mapa.get(r.codigoReparticion)!
    const padreCod = r.padre?.trim() || null
    const padreNodo = padreCod ? mapa.get(padreCod) : undefined
    if (padreNodo) padreNodo.hijos.push(nodo)
    else raices.push(nodo)
  }

  // Caso normal (la inmensa mayoría de los hospitales): el nodo tope del
  // hospital (DHOS) tiene un `padre` que SÍ existe pero está fuera de este
  // recorte (ej. 40016000 "DG Hospitales", el paraguas administrativo que
  // agrupa a TODOS los hospitales) — por eso DHOS nunca llega a `raices`
  // (su padreNodo se resuelve contra el ancla externa ya en el paso 6) y
  // `raices` queda vacío. Antes acá se promovía el ancla externa completo
  // como raíz visual para no romper con un 404 — pero eso mostraba "DG
  // Hospitales" como caja tope arriba de CADA hospital, algo que la app
  // legacy nunca hacía (ver captura: la raíz visual siempre es el hospital
  // mismo). Como ese ancla es puro trámite (un solo hijo, sin nada más que
  // agrupar), la raíz real es directamente ese único hijo.
  //
  // Caso roto (ej. HGADS): además del hospital, el recorte trae una fila con
  // `padre` que no existe en NINGÚN lado de la tabla (dato de origen
  // incompleto) — un huérfano total que sí cae en `raices`. Ahí el ancla
  // aporta algo que `raices` no tiene (el hospital real), así que conviene
  // usarla como raíz visual y colgarle el huérfano al lado, para no perder
  // esa fila silenciosamente ni tapar el árbol real.
  const anclaExterna =
    padresFuera.length === 1 ? mapa.get(padresFuera[0]!.codigoReparticion) : undefined

  let raiz: OrganigramaNodo | null = null

  // Prioridad máxima: si el recorte tiene un nodo con padre 'ROOT', ese es la
  // raíz natural de la sección (ej. el Ministerio de Salud en Nivel Central).
  // Se evalúa ANTES que el ancla externa para cubrir el dato inconsistente del
  // Excel semanal donde un nodo de esta sección cuelga de un padre de OTRO
  // universo (ej. "Unidad Red de Odontología", universo NIVEL CENTRAL, cuyo
  // padre es la SSAPAC/APS). Sin esto, ese huérfano promovía la SSAPAC como
  // ancla externa y el Ministerio quedaba colgando debajo (árbol invertido).
  const raizRoot = raices.find((n) => !n.padre || n.padre === 'ROOT')
  if (!sigla && raizRoot) {
    for (const otra of raices) {
      if (otra !== raizRoot) raizRoot.hijos.push(otra)
    }
    // Si además hay un ancla externa con hijos propios en el recorte, se cuelgan
    // de la raíz natural para no perderlos.
    if (anclaExterna && anclaExterna.hijos.length > 0) {
      for (const h of anclaExterna.hijos) {
        if (h !== raizRoot && !raizRoot.hijos.includes(h)) raizRoot.hijos.push(h)
      }
    }
    raiz = raizRoot
  }

  if (!raiz && anclaExterna && anclaExterna.hijos.length > 0) {
    const huerfanosReales = raices.filter((r) => !anclaExterna.hijos.includes(r))
    if (anclaExterna.hijos.length === 1 && huerfanosReales.length === 0) {
      raiz = anclaExterna.hijos[0]!
    } else {
      anclaExterna.hijos.push(...huerfanosReales)
      raiz = anclaExterna
    }
  } else if (raices.length === 1) {
    raiz = raices[0]!
  } else if (raices.length > 1) {
    // (La raíz natural con padre 'ROOT' ya se resolvió con prioridad más
    // arriba.) Acá quedan huérfanos que comparten un mismo padre fuera de este
    // recorte (ej. la SS de Atención Primaria vive bajo un nodo de Nivel
    // Central) -> se busca ese nodo ancla en la base para usarlo de raíz visual.
    const padres = new Set(
      raices.map((n) => n.padre).filter((p): p is string => !!p && p !== 'ROOT'),
    )
    if (!raiz && padres.size === 1) {
      const anchorCod = [...padres][0]!
      const anchor = await prisma.organigrama.findUnique({
        where: { codigoReparticion: anchorCod },
      })
      if (anchor) {
        raiz = {
          id: anchor.codigoReparticion,
          nombre: anchor.descRep,
          tipo: anchor.tipo,
          nivel: anchor.lvl,
          padre: anchor.padre,
          regimenEmpleo: anchor.regimenEmpleo || '',
          persona: personasMap.get(anchor.codigoReparticion) ?? null,
          cargoVacante: !personasMap.has(anchor.codigoReparticion)
            ? (cargosVacantesMap.get(anchor.codigoReparticion) ?? null)
            : null,
          razonSinCargo:
            !personasMap.has(anchor.codigoReparticion) &&
            !cargosVacantesMap.has(anchor.codigoReparticion)
              ? (razonSinCargoMap.get(anchor.codigoReparticion) ?? null)
              : null,
          hijos: raices,
        }
      }
    }
    // Caso 2: múltiples raíces sin padre común (ej. nodos generados desde cargos
    // sin jerarquía) — crear nodo virtual que las agrupe todas.
    if (!raiz) {
      const label =
        seccion === 'nivel-central'
          ? 'Nivel Central'
          : seccion === 'atencion-primaria'
            ? 'Atención Primaria'
            : (seccion ?? sigla ?? 'Organigrama')
      raiz = {
        id: `ROOT_${seccion ?? sigla}`,
        nombre: label,
        tipo: 'ROOT',
        nivel: 0,
        padre: null,
        regimenEmpleo: '',
        persona: null,
        cargoVacante: null,
        razonSinCargo: null,
        hijos: raices,
      }
    }
  }

  if (!raiz) {
    throw AppError.notFound(
      `No se encontró nodo raíz para ${sigla ? `el hospital ${sigla}` : `la sección ${seccion}`}`,
    )
  }

  // === 7. Agrupar hijos de SDHOS por régimen de empleo ===
  if (sdhosCod) {
    const sdhos = mapa.get(sdhosCod)
    if (sdhos && sdhos.hijos.length > 0) {
      const grupos = new Map<string, OrganigramaNodo[]>()
      for (const hijo of sdhos.hijos) {
        const reg = hijo.regimenEmpleo || 'Sin Régimen'
        if (!grupos.has(reg)) grupos.set(reg, [])
        grupos.get(reg)!.push(hijo)
      }
      sdhos.hijos = [...grupos.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([nombreRegimen, hijos]) => ({
          id: `REGIMEN_${nombreRegimen.replace(/\s+/g, '_')}`,
          nombre: nombreRegimen,
          tipo: 'REGIMEN',
          nivel: sdhos.nivel + 1,
          padre: sdhosCod,
          regimenEmpleo: nombreRegimen,
          persona: null,
          cargoVacante: null,
          razonSinCargo: null,
          hijos,
        }))
    }
  }

  // === 8. Orden jerárquico ===
  ordenarHijos(raiz)

  return { data: raiz, ...(sigla ? { sigla } : { seccion }) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Carga de estructura (módulo "Árbol", solo admin) — reemplaza toda la tabla
// `organigramas` desde un Excel subido por UI. Header flexible: no importa
// mayúsculas ni espacios extra, y además tolera el formato de exportación
// legacy real (ej. "Arbol Salud Nuevo.xlsx": `COD_REP` en vez de
// `codigo_reparticion`, `UNIVERSO TOTALIZADOR` con espacio en vez de `_`) vía
// ALIASES_HEADER — se adapta el parser al Excel que manda la fuente, no al
// revés, para no obligar a editar el archivo a mano antes de cada carga.
// Alternativa "self-service" a apps/api/scripts/import-organigrama.ts (que
// lee directo el dump legacy) — ese script sigue siendo el que se usó para la
// carga inicial; esto es para poder actualizar la estructura sin un dev.
// ─────────────────────────────────────────────────────────────────────────────

const LOTE_UPLOAD = 500

// Sinónimos de headers legacy -> nombre de columna que espera el resto del
// parser (snake_case, igual al modelo Prisma). Se aplica después de normalizar
// espacios a "_", así que solo hace falta mapear los que cambian de palabra
// (no los que solo difieren en mayúsculas o separador de espacio/guión bajo).
const ALIASES_HEADER: Record<string, string> = {
  cod_rep: 'codigo_reparticion',
}

function normalizarHeader(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, '_')
}

function celda(norm: Record<string, unknown>, key: string): string | null {
  const v = norm[key]
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function normalizarClavesFila(row: Record<string, unknown>): Record<string, unknown> {
  const norm: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    const header = normalizarHeader(k)
    norm[ALIASES_HEADER[header] ?? header] = v
  }
  return norm
}

// ─────────────────────────────────────────────────────────────────────────────
// Soporte al "Árbol Salud" ORIGINAL (sin curar a mano) — análisis 2026-09-14
// comparando el Excel original contra "Arbol Salud Nuevo.xlsx" (el que sí
// tiene UNIVERSO TOTALIZADOR / REGIMEN EMPLEO) fila por fila y contra la
// tabla `hospitales`:
//
// 1. TIPO="AREA" (siempre "<algo> - Residentes" / "<algo> - Sup. Guardia"):
//    67/67 filas verificadas, CERO excepciones — nunca representan un puesto
//    de conducción real (mismo criterio que ya excluye guardia/residencia en
//    esCargoDeConduccion), así que se descartan directo, ni se insertan.
//
// 2. REGIMEN EMPLEO no es deducible de TIPO/DESC_REP (ej. "SECCION CA" se
//    reparte en 3 regímenes distintos sin ningún patrón textual) — es una
//    clasificación curada código por código. Pero el 98%+ de los códigos de
//    cada carga nueva ya existen en la tabla de la carga anterior, así que se
//    hereda por codigo_reparticion. Solo los códigos GENUINAMENTE nuevos (sin
//    historial) quedan sin poder resolverse solos → cortan la carga (ver
//    reemplazarOrganigramaService) pidiendo que se complete a mano esa columna
//    puntual para esos códigos.
//
// 3. UNIVERSO TOTALIZADOR también se hereda por historial cuando existe. Para
//    códigos nuevos se sugiere automáticamente: si la sigla es una de
//    `hospitales.tipo` (agudos/monovalente/salud mental/niños) se usa esa
//    categoría (matchea 1 a 1 contra el Excel curado, ver HOSPITAL_TIPO_A_UNIVERSO
//    — el campo `hospitales.universo_totalizador`, ojo, es un concepto
//    DISTINTO — Nivel Central/APS/Hospitales/SAME/Bienestar — y NO debe
//    usarse acá). Si no es un hospital, el valor por defecto es NIVEL CENTRAL,
//    con una única excepción real detectada: todo lo que cuelga bajo la
//    Subsecretaría de Atención Primaria (sigla SSAPAC) es ATENCION PRIMARIA,
//    salvo el nodo de la propia subsecretaría (TIPO=SSEC/DIREJE).
// ─────────────────────────────────────────────────────────────────────────────

const HOSPITAL_TIPO_A_UNIVERSO: Record<string, string> = {
  'hospitales de agudos': 'HOSPITALES DE AGUDOS',
  'hospitales monovalentes': 'HOSPITALES MONOVALENTES',
  'hospitales de salud mental': 'HOSPITALES SALUD MENTAL',
  'hospitales de ninos': 'HOSPITALES DE NIÑOS',
}

// Única excepción real detectada (ver punto 3 arriba): la Subsecretaría de
// Atención Primaria en sí misma es Nivel Central, pero todo lo que cuelga
// debajo es Atención Primaria.
const SIGLA_SUBSECRETARIA_ATENCION_PRIMARIA = 'SSAPAC'

// A21-11: normalizarTexto se movió a @srrhh/normalizacion (fuente de verdad
// única). La versión del paquete MANTIENE la ñ (la local acá la borraba con
// \p{Diacritic}); es el comportamiento correcto del proyecto (§9.1).

export function esFilaArea(tipo: string | null | undefined): boolean {
  return normalizarHeader(tipo ?? '') === 'area'
}

const TIPOS_AUTORIDADES_SUPERIORES = new Set(['ministerio', 'ssec/direje', 'f/n dg', 'f/n ssec'])

export function inferirRegimenEmpleoPorTipo(tipo: string): string | null {
  if (TIPOS_AUTORIDADES_SUPERIORES.has(tipo.trim().toLowerCase())) return 'Autoridades Superiores'
  return null
}

// Universo totalizador canónico para la INFERENCIA de régimen: distintas cargas
// usan nombres equivalentes para el mismo universo —"APS" ⇔ "ATENCION PRIMARIA"
// ⇔ "ATENCION PRIMARIA DE SALUD" (APS = Atención Primaria de la Salud)—. Si no
// se unifican, una repartición nueva con universo "ATENCION PRIMARIA" no matchea
// las existentes guardadas como "APS" y el régimen no se puede inferir. Solo se
// usa para construir las claves de inferencia; el valor que se guarda es el que
// trae/infiere el Excel sin tocar.
//
// IMPORTANTE: normalizarTexto (@srrhh/normalizacion, A21-8/A21-11) devuelve el
// texto en MINÚSCULA y sin tilde. Las variantes equivalentes y el valor
// canónico que devuelve esta función van en minúscula para coincidir con esa
// salida — comparar/devolver en MAYÚSCULA dejaba el match muerto y rompía la
// inferencia de régimen (sigla|universo|tipo) de las reparticiones nuevas.
export function canonUniverso(universo: string | null | undefined): string {
  const n = normalizarTexto(universo ?? '')
  if (
    n === 'aps' ||
    n === 'atencion primaria' ||
    n === 'atencion primaria de salud' ||
    n === 'atencion primaria salud'
  )
    return 'atencion primaria'
  return n
}

export function inferirUniversoTotalizador(
  sigla: string,
  tipo: string,
  hospitalTipoPorSigla: Map<string, string | null>,
): string {
  const hospitalTipo = hospitalTipoPorSigla.get(sigla)
  if (hospitalTipo) {
    const universo = HOSPITAL_TIPO_A_UNIVERSO[normalizarTexto(hospitalTipo)]
    if (universo) return universo
  }
  if (
    sigla === SIGLA_SUBSECRETARIA_ATENCION_PRIMARIA &&
    tipo.trim().toUpperCase() !== 'SSEC/DIREJE'
  )
    // 'APS' es la etiqueta histórica predominante del universo de Atención
    // Primaria (110 nodos + la tabla hospitales). Se usa esa, no 'ATENCION
    // PRIMARIA', para que un nodo nuevo herede el valor consistente y no genere
    // una rama con etiqueta divergente que la vista de sección no agrupe.
    return 'APS'
  return 'NIVEL CENTRAL'
}

function normalizarFilaExcel(
  norm: Record<string, unknown>,
  numeroFila: number,
): Prisma.OrganigramaCreateManyInput {
  const lvlRaw = celda(norm, 'lvl')
  const tipo = celda(norm, 'tipo')
  const codigoReparticion = celda(norm, 'codigo_reparticion')
  const sigla = celda(norm, 'sigla')
  const path = celda(norm, 'path')
  const pathNombres = celda(norm, 'path_nombres')

  const faltantes = [
    ['lvl', lvlRaw],
    ['tipo', tipo],
    ['codigo_reparticion', codigoReparticion],
    ['sigla', sigla],
    ['path', path],
    ['path_nombres', pathNombres],
  ]
    .filter(([, v]) => v === null)
    .map(([k]) => k)
  if (faltantes.length) {
    throw AppError.badRequest(
      `Fila ${numeroFila}: faltan columnas obligatorias (${faltantes.join(', ')})`,
    )
  }
  const lvl = Number(lvlRaw)
  if (!Number.isFinite(lvl))
    throw AppError.badRequest(`Fila ${numeroFila}: "lvl" no es un número (${lvlRaw})`)

  return {
    lvl,
    tipo: tipo!,
    codigoReparticion: codigoReparticion!,
    universoTotalizador: celda(norm, 'universo_totalizador'),
    regimenEmpleo: celda(norm, 'regimen_empleo'),
    descRep: celda(norm, 'desc_rep'),
    sigla: sigla!,
    padre: celda(norm, 'padre'),
    path: path!,
    pathNombres: pathNombres!,
  }
}

export async function reemplazarOrganigramaService(
  buffer: Buffer,
  usuarioId?: string,
  filename?: string,
): Promise<{ filas: number; cargosConduccion?: { creados: number; errores: number } }> {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  if (!wb.SheetNames.length) throw AppError.badRequest('El archivo no tiene ninguna hoja')
  const hoja = wb.Sheets[wb.SheetNames[0]]
  const filasCrudas = XLSX.utils.sheet_to_json(hoja, { defval: '' })
  if (filasCrudas.length === 0) throw AppError.badRequest('El archivo no tiene filas de datos')

  // La fila 1 del Excel es el header; sheet_to_json devuelve solo las de datos.
  // TIPO=AREA se descarta antes de normalizar (ver comentario arriba de
  // esFilaArea) — el numeroFila de error sigue contando sobre el archivo
  // original (i+2) para que tenga sentido si el usuario lo abre a corregir.
  const filas = filasCrudas
    .map((row, i) => ({ norm: normalizarClavesFila(row), numeroFila: i + 2 }))
    .filter(({ norm }) => !esFilaArea(celda(norm, 'tipo')))
    .map(({ norm, numeroFila }) => normalizarFilaExcel(norm, numeroFila))

  const vistos = new Set<string>()
  for (const f of filas) {
    if (vistos.has(f.codigoReparticion)) {
      throw AppError.badRequest(
        `codigo_reparticion duplicado en el archivo: ${f.codigoReparticion}`,
      )
    }
    vistos.add(f.codigoReparticion)
  }

  // ── Completar UNIVERSO TOTALIZADOR / REGIMEN EMPLEO cuando el Excel no las
  // trae (formato "Árbol Salud" original) — ver comentario extenso arriba. Se
  // hereda por codigo_reparticion de la carga anterior; si el código es nuevo
  // se sugiere el universo y se corta la carga pidiendo el régimen a mano.
  const historial = new Map<
    string,
    { regimenEmpleo: string | null; universoTotalizador: string | null }
  >()
  for (const r of await prisma.organigrama.findMany({
    select: { codigoReparticion: true, regimenEmpleo: true, universoTotalizador: true },
  })) {
    historial.set(r.codigoReparticion, {
      regimenEmpleo: r.regimenEmpleo,
      universoTotalizador: r.universoTotalizador,
    })
  }
  const hospitalTipoPorSigla = new Map<string, string | null>()
  for (const h of await prisma.hospital.findMany({ select: { sigla: true, tipo: true } })) {
    hospitalTipoPorSigla.set(h.sigla, h.tipo)
  }

  // Mapa sigla|universo -> regimenEmpleo: si todos los nodos existentes de esa
  // combinación tienen el mismo régimen, se puede inferir para nodos nuevos.
  const regimenSetPorSiglaUniverso = new Map<string, Set<string>>()
  // Mapa más fino sigla|universo|tipo -> regimenEmpleo. Necesario porque hay
  // siglas (ej. SSSAME) donde sigla|universo mezcla varios regímenes, pero
  // dentro de un mismo TIPO (ej. "DIV CA") el régimen es consistente. Se usa
  // como fallback cuando sigla|universo no alcanza (ver loop de pendientes).
  const regimenSetPorSiglaUniversoTipo = new Map<string, Set<string>>()
  for (const r of await prisma.organigrama.findMany({
    select: { sigla: true, universoTotalizador: true, regimenEmpleo: true, tipo: true },
    where: { regimenEmpleo: { not: '' } },
  })) {
    const key = `${r.sigla}|${canonUniverso(r.universoTotalizador)}`
    if (!regimenSetPorSiglaUniverso.has(key)) regimenSetPorSiglaUniverso.set(key, new Set())
    regimenSetPorSiglaUniverso.get(key)!.add(r.regimenEmpleo)

    const keyTipo = `${r.sigla}|${canonUniverso(r.universoTotalizador)}|${normalizarHeader(r.tipo ?? '')}`
    if (!regimenSetPorSiglaUniversoTipo.has(keyTipo))
      regimenSetPorSiglaUniversoTipo.set(keyTipo, new Set())
    regimenSetPorSiglaUniversoTipo.get(keyTipo)!.add(r.regimenEmpleo)
  }
  const regimenPorSiglaUniverso = new Map<string, string>()
  for (const [key, set] of regimenSetPorSiglaUniverso) {
    if (set.size === 1) regimenPorSiglaUniverso.set(key, [...set][0])
  }
  const regimenPorSiglaUniversoTipo = new Map<string, string>()
  for (const [key, set] of regimenSetPorSiglaUniversoTipo) {
    if (set.size === 1) regimenPorSiglaUniversoTipo.set(key, [...set][0])
  }

  const pendientes: Array<{
    codigoReparticion: string
    tipo: string
    descRep: string | null
    sigla: string
    universoSugerido: string
  }> = []
  for (const f of filas) {
    const hist = historial.get(f.codigoReparticion)
    if (!f.universoTotalizador) {
      f.universoTotalizador =
        hist?.universoTotalizador ??
        inferirUniversoTotalizador(f.sigla, f.tipo, hospitalTipoPorSigla)
    }
    if (!f.regimenEmpleo) {
      if (hist?.regimenEmpleo) {
        f.regimenEmpleo = hist.regimenEmpleo
      } else {
        // Orden de inferencia (de más específico a más general):
        //   1. sigla|universo|tipo — régimen consistente dentro del mismo tipo
        //      (cubre casos como SSSAME donde la sigla mezcla regímenes pero
        //      cada TIPO —ej. "DIV CA"— es homogéneo).
        //   2. sigla|universo — régimen único para toda la sigla en ese universo.
        //   3. por tipo — solo Autoridades Superiores.
        const inferido =
          regimenPorSiglaUniversoTipo.get(
            `${f.sigla}|${canonUniverso(f.universoTotalizador)}|${normalizarHeader(f.tipo)}`,
          ) ??
          regimenPorSiglaUniverso.get(`${f.sigla}|${canonUniverso(f.universoTotalizador)}`) ??
          inferirRegimenEmpleoPorTipo(f.tipo)
        if (inferido) {
          f.regimenEmpleo = inferido
        } else {
          pendientes.push({
            codigoReparticion: f.codigoReparticion,
            tipo: f.tipo,
            descRep: f.descRep,
            sigla: f.sigla,
            universoSugerido: f.universoTotalizador,
          })
        }
      }
    }
  }
  if (pendientes.length > 0) {
    // Tope de items listados en el mensaje: si `organigramas` está vacía (ambiente
    // nuevo, post-reset) TODAS las filas del archivo original caerían acá — sin
    // tope el mensaje sería una lista de miles de items, inútil para leer. En ese
    // caso real, lo que corresponde es cargar primero el histórico ya clasificado
    // (apps/api/scripts/import-organigrama.ts o un Excel "Nuevo" curado) y usar
    // este endpoint después, para altas puntuales — no para la carga inicial.
    const TOPE_DETALLE = 25
    const detalle = pendientes
      .slice(0, TOPE_DETALLE)
      .map(
        (p) =>
          `${p.codigoReparticion} (${p.tipo}, "${p.descRep ?? 'sin descripción'}", sigla ${p.sigla}, universo sugerido: ${p.universoSugerido})`,
      )
      .join('; ')
    const resto =
      pendientes.length > TOPE_DETALLE ? ` ... y ${pendientes.length - TOPE_DETALLE} más.` : ''
    const sugerenciaVacio =
      historial.size === 0
        ? ' La tabla "organigramas" está vacía — si es una carga inicial, cargá primero el histórico ya clasificado (script import-organigrama.ts o un Excel ya curado con REGIMEN EMPLEO) antes de usar este endpoint para altas puntuales.'
        : ''
    throw AppError.badRequest(
      `${pendientes.length} repartición(es) nueva(s) sin REGIMEN EMPLEO (no se puede inferir solo): ${detalle}.${resto} ` +
        `Agregá la columna "REGIMEN EMPLEO" con el valor correspondiente para estos códigos puntuales y volvé a subir el archivo.${sugerenciaVacio}`,
      // details estructurado para que el front liste cada repartición pendiente
      // de forma legible (no un párrafo corrido). `tablaVacia` dispara la ayuda
      // de carga inicial en la UI.
      {
        tipo: 'regimen_pendiente',
        tablaVacia: historial.size === 0,
        pendientes: pendientes.map((p) => ({
          codigoReparticion: p.codigoReparticion,
          tipo: p.tipo,
          descRep: p.descRep,
          sigla: p.sigla,
          universoSugerido: p.universoSugerido,
        })),
      },
    )
  }

  // Swap atómico via transacción interactiva con timeout extendido:
  // TRUNCATE + inserts en lotes dentro de una sola transacción — si cualquier
  // lote falla, el ROLLBACK automático deja la tabla intacta con los datos
  // anteriores. Se usa $transaction con timeout=120s para cubrir archivos
  // grandes (4.000+ filas en lotes de 500 = ~9 roundtrips).
  await prisma.$transaction(
    async (tx) => {
      await tx.organigrama.deleteMany()
      for (let i = 0; i < filas.length; i += LOTE_UPLOAD) {
        await tx.organigrama.createMany({ data: filas.slice(i, i + LOTE_UPLOAD) })
      }
    },
    { timeout: 120_000 },
  )

  await prisma.organigramaUpload.create({
    data: {
      filename: filename ?? 'desconocido',
      filas: filas.length,
      subidoPorId: usuarioId ?? null,
    },
  })

  // S24-7: re-sincronizar los cargos de conducción vacantes con el árbol nuevo.
  // Da de alta cargos para los nodos de conducción nuevos que no tengan jefatura
  // modelada; es idempotente (no duplica los existentes). Se corre FUERA de la
  // transacción del swap y de forma tolerante a fallos: el árbol ya quedó
  // guardado, y si la derivación fallara no debe tumbar la carga (RRHH puede
  // re-correr el backfill manual). Los cargos de nodos que desaparecen del árbol
  // NO se dan de baja automáticamente (decisión conservadora: un cargo puede
  // tener historial/ocupaciones; su baja la decide RRHH, no un re-upload).
  let cargosConduccion: { creados: number; errores: number } | undefined
  try {
    const r = await derivarCargosConduccionService(prisma)
    cargosConduccion = { creados: r.creados, errores: r.errores.length }
    console.info(
      `[organigrama] re-sync cargos conducción: candidatos=${r.candidatos} creados=${r.creados} saltados=${r.saltados}`,
    )
    if (r.errores.length > 0) {
      console.warn(`[organigrama] re-sync con ${r.errores.length} nodo(s) sin mapeo:`, r.errores.slice(0, 10))
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[organigrama] re-sync de cargos de conducción falló (el árbol ya se guardó):', msg)
  }

  return { filas: filas.length, cargosConduccion }
}

export async function listOrganigramaUploadsService() {
  return prisma.organigramaUpload.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      filename: true,
      filas: true,
      createdAt: true,
      subidoPor: { select: { username: true } },
    },
  })
}

// ── S24-9: KPI y listado de vacantes de conducción ──────────────────────────
//
// Una "vacante de conducción" es un cargo de conducción SIN ocupante activo que
// el organigrama muestra como nodo vacante: cargo de conducción por código
// (prefijos CPH-D/CPH-J/.../AS) o generado desde el organigrama
// (origen='organigrama'), en estado vigente/validacion_vacante, sin ocupación
// vigente activa, y que NO esté en el set de ocultos (rol redundante sin JCAT).
//
// Devuelve el total, un desglose por hospital y por nivel jerárquico (derivado
// del prefijo del código), y el listado para el modal de Vacantes. Permite a
// RRHH ver "qué jefaturas faltan cubrir".

interface VacanteConduccion {
  cargoId: string
  codigo: string
  codigoRepa: string | null
  descripcionRepa: string | null
  hospitalSigla: string
  hospitalNombre: string
  escalafon: string | null
  nivel: string
  frio: boolean // nodo sin personal activo (revisionDato)
}

// Nivel legible a partir del prefijo del código de conducción.
function nivelDeCodigo(codigo: string): string {
  if (codigo.startsWith('AS-')) return 'Autoridad Superior'
  if (codigo.startsWith('RG-CG')) return 'Gerencia'
  if (codigo.startsWith('CPH-D') || codigo.startsWith('EG-D')) return 'Dirección'
  if (codigo.startsWith('CPH-SD')) return 'Subdirección'
  if (codigo.startsWith('EG-G')) return 'Gerencia'
  if (codigo.startsWith('CPH-J') || codigo.startsWith('TEC-J') || codigo.startsWith('EG-J')) return 'Jefatura'
  return 'Otro'
}

export async function getVacantesConduccionService(opts: { sigla?: string } = {}) {
  const idsOcultos = await cargoIdsOcultosPorRolRedundante(prisma)

  const PREFIJO_REGEX = '^(AS|CPH-D|CPH-SD|CPH-J|RG-CG|EG-D|EG-G|EG-J|TEC-J)'

  const cargos = await prisma.cargo.findMany({
    where: {
      deletedAt: null,
      estado: { in: ['vigente', 'validacion_vacante'] },
      ...(idsOcultos.length > 0 && { id: { notIn: idsOcultos } }),
      ...(opts.sigla && { hospital: { sigla: opts.sigla } }),
      // Conducción: generado desde el organigrama O prefijo de conducción.
      OR: [{ origen: 'organigrama' }, { codigo: { not: null } }],
      // Sin ocupante activo = vacante.
      ocupaciones: {
        none: { hasta: null, situacionRevista: { equals: 'activo', mode: 'insensitive' } },
      },
    },
    select: {
      id: true,
      codigo: true,
      codigoRepa: true,
      descripcionRepa: true,
      origen: true,
      revisionDato: true,
      escalafon: { select: { nombre: true } },
      hospital: { select: { sigla: true, nombre: true } },
    },
    orderBy: [{ hospital: { sigla: 'asc' } }, { codigo: 'asc' }],
  })

  // Filtro fino en memoria: dejar solo los que son conducción por código
  // (el OR del where trae también cargos con código no-conducción; acá se
  // acota con el prefijo real) O los generados desde el organigrama.
  const prefijoRe = new RegExp(PREFIJO_REGEX)
  const lista: VacanteConduccion[] = []
  for (const c of cargos) {
    if (!c.codigo) continue
    const esConduccion = c.origen === 'organigrama' || prefijoRe.test(c.codigo)
    if (!esConduccion) continue
    lista.push({
      cargoId: c.id,
      codigo: c.codigo,
      codigoRepa: c.codigoRepa,
      descripcionRepa: c.descripcionRepa,
      hospitalSigla: c.hospital.sigla,
      hospitalNombre: c.hospital.nombre,
      escalafon: c.escalafon?.nombre ?? null,
      nivel: nivelDeCodigo(c.codigo),
      frio: c.revisionDato,
    })
  }

  // Desgloses
  const porHospital = new Map<string, { sigla: string; nombre: string; total: number }>()
  const porNivel = new Map<string, number>()
  for (const v of lista) {
    const h = porHospital.get(v.hospitalSigla) ?? { sigla: v.hospitalSigla, nombre: v.hospitalNombre, total: 0 }
    h.total++
    porHospital.set(v.hospitalSigla, h)
    porNivel.set(v.nivel, (porNivel.get(v.nivel) ?? 0) + 1)
  }

  return {
    total: lista.length,
    conPersonalActivo: lista.filter((v) => !v.frio).length, // unidad con gente, sin jefatura
    frias: lista.filter((v) => v.frio).length, // nodo sin personal activo
    porHospital: [...porHospital.values()].sort((a, b) => b.total - a.total),
    porNivel: [...porNivel.entries()].map(([nivel, total]) => ({ nivel, total })).sort((a, b) => b.total - a.total),
    vacantes: lista,
  }
}
