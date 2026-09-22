# SPRINT 19 — Etapa 5 CPH: estado completo de la persona designada + validación contra padrón

**Estado:** 📋 Planificado — ejecutar hoy
**Fecha:** 2026-09-22
**Depende de:** Etapa 4 (reserva por `inscriptoReservadoId`) ✅ · Sprint 18 designación/especialidad (parcial) ✅
**NO depende de:** Sprint 18 retenciones/cadena R-TTR (ver §0)

---

## 0. Decisión sobre "hacer el Sprint 18 de retenciones primero"

Hay dos documentos "Sprint 18":

| Documento                                   | Qué cubre                                                                                                                | ¿Bloquea Etapa 5?                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `SPRINT_18_designacion_cph_especialidad.md` | Búsqueda mejorada + validación especialidad + selector ID SIAL Rol + aviso `MANUAL-`                                     | Ya implementado en su mayoría en sesiones previas |
| `SPRINT_18_retenciones_cadena_cargos.md`    | Modelo de retención: cadena R/TTR, generación automática de cargos remplazantes, `titular-cesa`, schema nuevo en `Cargo` | **NO bloquea**                                    |

**Conclusión:** el Sprint 18 de retenciones **no es prerequisito** de lo que se pide para la
Etapa 5. La retención que el usuario quiere ver ("si tenía un cargo, si va a retener ese cargo")
es **informativa** y ya está disponible hoy en `ocupaciones.situacionRevista = 'Retencion de Cargo'`
(+ `estadoPersona`). Podemos **mostrar** la retención sin implementar la generación automática de
cadenas R/TTR.

El Sprint 18 de retenciones se necesita solo cuando querramos que la designación _administre_
la cadena (generar el cargo R/TTR, ejecutar titular-cesa). Eso queda fuera de este alcance y se
hace después, si se decide.

Este documento (Sprint 19) implementa **solo** la Etapa 5 pedida, con la retención en modo lectura.

---

## 1. Objetivo

En la Etapa 5 del wizard CPH, resolver al ganador (reservado en Etapa 4 por `inscriptoReservadoId`,
o ya designado por `personaDesignadaId`) y, arriba del panel, mostrar **todo lo que tengamos** de esa
persona si existe en la base, más el estado del proceso de asignación contra el padrón:

1. **Identificación por CUIL**: buscar a la persona en `personas` por el CUIL del ganador.
   - Existe → traer y mostrar todos sus datos.
   - No existe → estado "a la espera del padrón".
2. **Cargo actual / retención (informativo)**: si tiene ocupación vigente (`hasta IS NULL`),
   mostrar cargo, `idSialRol`, `situacionRevista` (incluye "Retencion de Cargo"), `estadoPersona`,
   escalafón, especialidad y estado del cargo. Si no tiene vigente, mostrar la **última** ocupación
   cerrada (el último id SIAL rol que tuvo).
3. **Validación contra el padrón semanal**: determinar si la persona ya aparece con un **nuevo**
   id SIAL rol cuyo cargo coincide en **carrera (escalafón)** y **especialidad** con el concurso:
   - `sin_persona` — el CUIL no está en `personas` todavía.
   - `esperando_padron` — está en `personas` pero no tiene un rol que coincida con el concurso.
   - `rol_no_coincide` — tiene rol(es) nuevos pero ninguno coincide en carrera+especialidad.
   - `validado` — tiene un id SIAL rol cuyo cargo coincide en carrera+especialidad → asignación
     completa.
4. **Datos completos de la persona** visibles arriba en la Etapa 5.

**Alcance de retención en este sprint:** solo lectura/visualización. NO se genera cadena R/TTR
ni se administra `situacionRevista` (eso es el Sprint 18 de retenciones).

---

## 2. Estado actual (verificado en código)

- `ConcursoCph.inscriptoReservadoId` (Etapa 4) y `personaDesignadaId` (Etapa 5) existen.
- `getPersonaDesignadaService` resuelve por 3 fuentes pero su `select` de persona trae solo 7
  campos y **no** incluye `especialidadCph` (el front lo lee con cast y hoy da null).
- `getPersonaSialRolesService` (`GET /personas/:id/sial-roles`) trae solo ocupaciones **activas**
  (`hasta IS NULL`). No trae la última cerrada.
- `Ocupacion` tiene `situacionRevista`, `estadoPersona`, `idSialRol`, `desde`, `hasta`.
- `Cargo` tiene `escalafonId`, `especialidadLegacy`, `literalPuesto`, `estado`, `codigo`, `idSial`,
  `codigoRegistroId`.
- El escalafón/especialidad del concurso: `ConcursoCph.especialidadSolicitada` +
  `codigoRegistroSolicitado→escalafon` (o `cargo.escalafon`).
- El padrón semanal (aprobarSnapshotService) hace match de persona por CUIL y crea Ocupacion nueva
  = "nuevo id SIAL rol". No hay vínculo automático con ConcursoCph (validaremos por lectura, no por
  automatización).

---

## 3. Diseño

### 3.1 Nuevo endpoint backend

`GET /api/v1/concursos-cph/:id/designacion-estado`

Servicio `getDesignacionEstadoService(id)` en `concursos-cph.service.ts`. Pasos:

1. Cargar el concurso con: `inscriptoReservadoId`, `personaDesignadaId`, `cargoSial`,
   `especialidadSolicitada`, `cargo{escalafonId, escalafon{codigo,nombre}}`,
   `codigoRegistroSolicitado{escalafon{...}}`, y el inscripto reservado (para su CUIL/nombre).
2. **Resolver CUIL del ganador**:
   - Si `personaDesignadaId` → tomar esa persona (y su CUIL).
   - Sino, si `inscriptoReservadoId` → tomar el CUIL del inscripto reservado.
   - Normalizar CUIL a 11 dígitos (`replace(/\D/g,'')`) — `personas.cuil` es 11 dígitos sin guiones.
3. **Buscar persona por CUIL** (`personas.findFirst({ where: { cuil } })`) con **select ampliado**
   (todos los campos mostrables, ver 3.2).
4. Si existe persona:
   - Traer ocupación vigente (`hasta IS NULL`) con su cargo (escalafón, especialidad, estado,
     código, idSial, situacionRevista, estadoPersona, idSialRol, desde). Si hay más de una, la más
     reciente por `desde`.
   - Si no hay vigente, traer la **última cerrada** (mayor `hasta`) para "el último id SIAL rol que
     tuvo".
   - Traer **todos** los roles (para la validación): reutilizar lógica de sial-roles pero sin filtro
     `hasta IS NULL` cuando haga falta, o traer vigentes + la última cerrada.
5. **Calcular validación** comparando cada ocupación (preferentemente vigentes) contra el concurso:
   - `carreraCoincide` = `cargo.escalafonId === escalafonConcursoId` (escalafón del concurso: del
     `codigoRegistroSolicitado.escalafon` o `cargo.escalafonId`).
   - `especialidadCoincide` = normalizar y comparar `cargo.especialidadLegacy` (y/o
     `persona.especialidadCph`) contra `concurso.especialidadSolicitada`.
   - `estado`:
     - sin persona → `sin_persona`
     - persona sin ningún rol que coincida → `esperando_padron`
     - tiene rol(es) pero ninguno coincide en carrera+especialidad → `rol_no_coincide`
     - existe un rol con carrera+especialidad coincidentes → `validado` (incluir ese `idSialRol`).
6. Responder un objeto tipado `DesignacionEstado` (ver 3.3).

> No muta nada. Es de solo lectura. La designación oficial sigue siendo `POST /designar` (Etapa 5).

### 3.2 Ampliar `select` de persona

Agregar al `sel` reutilizado (o crear `selPersonaCompleta`): `especialidadCph`, `mailPersonal`,
`domicilio`, `localidad`, `provincia`, `fechaNacimiento`, `sexo`, `antiguedadDesde`, `activo`,
`tipoDoc`. (Confirmar nombres exactos contra el modelo `Persona` al implementar.)

### 3.3 Tipos compartidos (`packages/types`)

```typescript
export type EstadoValidacionDesignacion =
  'sin_persona' | 'esperando_padron' | 'rol_no_coincide' | 'validado'

export interface OcupacionResumen {
  idSialRol: string
  cargoCodigo: string | null
  cargoIdSial: string
  literalPuesto: string | null
  escalafonId: string
  escalafonNombre: string | null
  especialidadLegacy: string | null
  situacionRevista: string | null // incluye 'Retencion de Cargo'
  estadoPersona: string | null
  cargoEstado: string // vigente | no_vigente | validacion_vacante
  hospitalSigla: string | null
  desde: string | null
  hasta: string | null // null = vigente
  carreraCoincide: boolean
  especialidadCoincide: boolean
}

export interface DesignacionEstado {
  fuente: 'persona_designada' | 'inscripto_reservado' | null
  cuil: string | null
  existeEnPadron: boolean
  persona: PersonaDesignadaDetalle | null // todos los campos mostrables
  ocupacionVigente: OcupacionResumen | null
  ultimaOcupacion: OcupacionResumen | null // última cerrada si no hay vigente
  concurso: {
    escalafonId: string | null
    escalafonNombre: string | null
    especialidadSolicitada: string | null
  }
  validacion: {
    estado: EstadoValidacionDesignacion
    idSialRolValidado: string | null
    mensaje: string
  }
}
```

### 3.4 Frontend — panel Etapa 5

En `ConcursoCphWizard.tsx`, dentro del bloque `campo.key === 'personaDesignada'` (arriba del panel
actual), agregar un bloque nuevo alimentado por un hook `useDesignacionEstado(id)` (enabled solo en
`etapaActiva === 'designacion'`):

1. **Cabecera de estado** (badge grande según `validacion.estado`):
   - `validado` → verde "✅ Asignación completa — rol {idSialRol} coincide con carrera y especialidad".
   - `esperando_padron` / `sin_persona` → azul/ámbar "⏳ A la espera del padrón semanal".
   - `rol_no_coincide` → ámbar "⚠️ La persona tiene rol nuevo pero no coincide con carrera/especialidad".
2. **Datos completos de la persona** (si `persona != null`): apellido y nombre, CUIL, DNI/tipoDoc,
   fecha de nacimiento, sexo, especialidad CPH, especialidad principal, mail laboral/personal,
   teléfono, domicilio/localidad/provincia, antigüedad, activo.
3. **Cargo actual / retención** (si `ocupacionVigente`): cargo (código/idSial), literal puesto,
   escalafón, especialidad, `situacionRevista` (resaltar "Retención de cargo" con badge ámbar),
   `estadoPersona`, estado del cargo, id SIAL rol, desde. Chips "carrera ✓/✗" y "especialidad ✓/✗".
4. **Último cargo** (si no hay vigente pero sí `ultimaOcupacion`): mismos datos + "hasta {fecha}".
5. Mantener intacto el panel de designación oficial existente (botón Designar, badge de especialidad).

No se toca el flujo `POST /designar`.

---

## 4. Tareas (ejecutables hoy)

| #     | Tarea                                                                                                                                       | Área  | Est. |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---- |
| S19-1 | `packages/types`: `DesignacionEstado`, `OcupacionResumen`, `EstadoValidacionDesignacion`, `PersonaDesignadaDetalle`                         | types | 0.5h |
| S19-2 | Backend: ampliar `select` de persona (campos completos) reutilizable                                                                        | api   | 0.5h |
| S19-3 | Backend: `getDesignacionEstadoService` (resolver CUIL, buscar persona, ocupación vigente + última cerrada, validación carrera+especialidad) | api   | 3h   |
| S19-4 | Backend: ruta `GET /concursos-cph/:id/designacion-estado`                                                                                   | api   | 0.3h |
| S19-5 | Frontend: hook `useDesignacionEstado(id)` (TanStack Query, enabled en etapa designacion)                                                    | web   | 0.5h |
| S19-6 | Frontend: bloque nuevo arriba de Etapa 5 — estado + datos completos persona + cargo actual/retención + último cargo                         | web   | 3h   |
| S19-7 | Verificación: tsc api/web/types + prueba manual con caso reservado sin padrón y con padrón coincidente                                      | ambos | 1h   |

**Total estimado:** ~9h

### Dependencias

```
S19-1 ─► S19-3, S19-5
S19-2 ─► S19-3
S19-3 ─► S19-4 ─► S19-5 ─► S19-6 ─► S19-7
```

---

## 5. Reglas de negocio (validación carrera + especialidad)

- **Carrera (escalafón)**: el rol del padrón coincide si `cargo.escalafonId` del nuevo rol es igual
  al escalafón solicitado del concurso (`codigoRegistroSolicitado.escalafon.id`, fallback
  `concurso.cargo.escalafonId`).
- **Especialidad**: comparación normalizada (NFD, sin acentos, lowercase, trim) de
  `cargo.especialidadLegacy` del nuevo rol (y/o `persona.especialidadCph`) contra
  `concurso.especialidadSolicitada`.
- **Validado** requiere **ambas** coincidencias (carrera Y especialidad) en un mismo rol vigente.
- **Persistencia + notificación (decisión del usuario):** cuando el estado calculado es `validado`,
  el concurso queda marcado con el flag `validado = true` (columna nueva en `ConcursoCph`) y se
  dispara una **notificación** (destinatarios a definir; por defecto `concursales_cph`). El seteo
  del flag + la notificación se hacen desde el backend cuando se detecta la coincidencia (al pedir
  el estado y/o al aprobar el padrón), de forma idempotente (no re-notifica si ya estaba `validado`).

### 5.1 Flag `validado` en `ConcursoCph`

- Nueva columna `validado Boolean @default(false)` + `validadoAt DateTime?` + `validadoIdSialRol String?`
  (el rol que validó). Migración manual (shadow DB rota) con `migrate deploy`.
- Se setea en `getDesignacionEstadoService` cuando `validacion.estado === 'validado'` y todavía no
  estaba marcado: update + `crearNotificacion` con `origenKey` estable `cph_validado:${id}` (dedup:
  una sola notificación por concurso).
- Notificación: `tipo: 'autorizacion_resuelta'` (reutilizado, es un aviso informativo), `rolSlug:
'concursales_cph'`, título "Concurso validado — {cargoCodigo}", mensaje con persona + idSialRol.

### 5.2 Filtro en el listado (`/concursos/cph` → filtros avanzados)

Dos filtros combinables en el drawer de filtros avanzados:

- **"Persona del orden de mérito"** (tri-estado: todos / con persona / sin persona): "con persona"
  = `inscriptoReservadoId != null OR personaDesignadaId != null`.
- **"Validado"** (tri-estado: todos / validados / sin validar): usa el flag `validado`.
  Backend: ambos como `z.enum(['true','false']).transform(...)` (patrón `suspendido`) → where Prisma
  directo (`{ validado: true }` y `{ OR: [{inscriptoReservadoId:{not:null}}, {personaDesignadaId:{not:null}}] }`).
  Front: dos `<select>` nuevos en el drawer + estado + spread en `filters` + chips + contador.

---

## 6. Criterio de éxito

- [ ] `GET /concursos-cph/:id/designacion-estado` responde el objeto `DesignacionEstado` completo.
- [ ] Persona reservada en Etapa 4 sin estar en padrón → estado `sin_persona`/`esperando_padron`,
      panel muestra CUIL y datos del inscripto, sin errores.
- [ ] Persona existente en padrón → se muestran todos sus datos + cargo actual + id SIAL rol.
- [ ] Persona con ocupación en retención → badge "Retención de cargo" visible (informativo).
- [ ] Persona sin ocupación vigente → se muestra la última ocupación (último id SIAL rol).
- [ ] Rol nuevo que coincide en carrera + especialidad → estado `validado` con el idSialRol.
- [ ] `tsc --noEmit` limpio en api, web y types. Sin regresiones en el flujo de designación oficial.

---

## 7. Notas

- **No se implementa** generación de cadena R/TTR ni `titular-cesa` (Sprint 18 retenciones). La
  retención es solo lectura acá.
- **`personas.cuil`** son 11 dígitos sin guiones; `inscriptos_concurso.cuil` puede venir con
  guiones/20 chars → normalizar a dígitos antes de comparar.
- El endpoint nuevo no reemplaza a `persona-designada`; convive con él (ese sigue para el panel de
  designación oficial existente).
- La "espera del padrón" es pasiva: el padrón semanal ya crea la ocupación por CUIL; este panel
  simplemente refleja si ya apareció el rol correcto al recargar.
