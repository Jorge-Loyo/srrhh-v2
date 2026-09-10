# SPRINT 16 — Flujo completo: Vacante → Concurso → Designación

**Estado:** 📋 Planificado
**Fecha estimada de inicio:** 2026-09
**Autores:** Jorge (backend) + Agustín (frontend)
**Rama:** `jorge` / `agustin` según tarea

---

## Objetivo

Mapear, auditar y completar el flujo completo desde que un cargo queda vacante hasta que una nueva persona es designada y aparece en el sistema. Incluye cada pantalla, cada decisión, cada actor y cada estado intermedio. El sprint cubre tanto el flujo por padrón SIAL como el flujo manual (baja registrada por operador).

---

## Contexto: por qué este sprint

El sistema tiene los módulos construidos por separado (Bajas, Concursos CPH, Concursos CEETPS, Autorizaciones, Padrón) pero nunca se auditó el flujo de punta a punta como una sola cadena. Hay gaps conocidos:

- **B-13**: el acto administrativo de baja (expediente + resolución) no está modelado como entidad propia — vive como campos sueltos en `bajas` y `concursos_cph`.
- **B-14**: el expediente de alta de un cargo nuevo no tiene vínculo formal con el expediente de baja del cargo que reemplaza.
- **Flujo de designación**: cuando un concurso finaliza y hay un ganador, no existe ningún endpoint ni pantalla que registre la designación y cree la ocupación. El campo `persona_designada_id` en `concursos_cph`/`concursos_ceetps` se guarda pero nunca dispara la creación de la `Ocupacion`.
- **Visibilidad por rol**: no está claro qué ve cada rol en cada etapa del flujo. El director ve autorizaciones pero no el estado del concurso. El equipo CPH/CEETPS ve el concurso pero no puede registrar la designación final.

---

## Mapa del flujo completo

### Origen A — Padrón SIAL detecta baja

```
Padrón semanal aprobado
  └─ diff tipo "eliminado"
       └─ cargo → validacion_vacante
            ├─ [Operador confirma] → cargo → no_vigente
            │    └─ si genera_concurso → Concurso creado automáticamente
            └─ [Operador rechaza] → cargo → vigente (reabre ocupación)
```

### Origen B — Operador registra baja manual

```
Operador en /cargos/baja/nueva
  └─ Registrar baja (estado: pendiente)
       └─ cargo → no_vigente
            └─ si genera_concurso → Concurso creado automáticamente
                 └─ Autorización pendiente para Director
                      ├─ [Director aprueba] → baja → confirmada
                      └─ [Director rechaza] → baja → anulada, cargo → vigente
```

### Flujo concursal CPH (desde vacante hasta designación)

```
Concurso creado (sub_estado: VACANTE)
  └─ Operador CPH carga expediente (ee_concurso) → A-CARATULADO
       └─ Director autoriza → A-AUTZN
            └─ SGRASV aprueba → B-SORTEO JUR
                 └─ ... (19 sub-estados hasta N-DESIGNADO)
                      └─ [GAP] Registrar designación → crear Ocupacion
                           └─ O-ALTA SIAL (persona aparece en padrón siguiente)
```

### Flujo concursal CEETPS (desde vacante hasta designación)

```
Concurso creado (estado: sin_autorizar)
  └─ Operador CEETPS carga expediente → autorizado
       └─ ... → en_proceso → finalizado
            └─ [GAP] Registrar designación → crear Ocupacion
```

---

## Actores y permisos por etapa

| Etapa | Actor | Rol | Pantalla |
|-------|-------|-----|----------|
| Aprobar padrón con eliminados | Operador | `editor` / `admin` | `/padron/:id` |
| Confirmar/rechazar baja en validación | Operador | `editor` / `admin` | `/bajas/validacion` |
| Registrar baja manual | Operador | `editor` / `admin` | `/cargos/baja/nueva` |
| Autorizar baja (sello posterior) | Director | `director` | `/autorizaciones` |
| Cargar expediente de concurso CPH | Equipo CPH | `concursales_cph` | `/concursos/cph/:id/wizard` |
| Autorizar concurso CPH | Director + SGRASV | `director`, `sgrasv` | `/autorizaciones` |
| Avanzar sub-estados CPH | Equipo CPH | `concursales_cph` | `/concursos/cph/:id/wizard` |
| **[GAP] Registrar designación CPH** | Equipo CPH | `concursales_cph` | `/concursos/cph/:id/wizard` |
| Cargar expediente CEETPS | Equipo CEETPS | `concursales_ceetps` | `/concursos/ceetps/:id` |
| **[GAP] Registrar designación CEETPS** | Equipo CEETPS | `concursales_ceetps` | `/concursos/ceetps/:id` |
| Ver estado del cargo post-designación | Todos | todos | `/cargos/:id` |
| Ver persona designada | Todos | todos | `/personas/:id` |

---

## Gaps identificados (lo que falta construir)

### GAP 1 — Registrar designación CPH y crear Ocupacion (🔴 Crítico)

Hoy `persona_designada_id` se guarda en `concursos_cph` pero no dispara nada. El cargo sigue apareciendo como vacante hasta que el padrón SIAL de la semana siguiente lo detecta como "nuevo" y crea la ocupación automáticamente.

**Problema**: hay una ventana de días/semanas donde el sistema dice que el cargo está vacante aunque ya hay una persona designada. El organigrama, los KPIs y la vista de cargos muestran información incorrecta.

**Lo que hay que construir**:
- Endpoint `POST /api/v1/concursos-cph/:id/designar` — recibe `personaId`, `fechaDesde`, `idSialRol` (opcional, se puede dejar vacío hasta que llegue el padrón). Crea la `Ocupacion` con `hasta = null` y avanza el sub-estado a `N-DESIGNADO`.
- Paso en el Wizard CPH: "Registrar designación" — selector de persona (búsqueda por nombre/CUIL), fecha de inicio, campo opcional para `idSialRol`.
- Validación: no puede designarse si el cargo ya tiene ocupación activa.

### GAP 2 — Registrar designación CEETPS y crear Ocupacion (🔴 Crítico)

Mismo problema que GAP 1 pero para CEETPS. `persona_designada_id` se guarda pero no crea `Ocupacion`.

**Lo que hay que construir**:
- Endpoint `POST /api/v1/concursos-ceetps/:id/designar` — mismo contrato que CPH.
- Sección en `ConcursoCeetpsDetail`: "Registrar designación" — visible cuando `estado = en_proceso` y `persona_designada_id` es null.

### GAP 3 — Vínculo expediente alta ↔ baja (B-14) (🟡 Medio)

Cuando se crea un cargo nuevo como contrapartida de una baja ("Vacante a No Vigente"), no hay ningún campo que vincule el `alta_id` con el `baja_id`. El operador tiene que buscar manualmente los dos registros.

**Lo que hay que construir**:
- Campo `baja_origen_id` (FK nullable → `bajas`) en `solicitudes_alta` / `cargos` (según dónde viva el alta).
- En `AltaCargosPage`: selector opcional "¿Esta alta reemplaza una baja?" que filtra bajas `confirmada` sin alta vinculada.
- En `CargoDetailPanel` y `BajaCargosPage`: mostrar el vínculo si existe.

### GAP 4 — Visibilidad del flujo para el Director (🟡 Medio)

El Director ve autorizaciones pendientes pero no tiene una vista del estado del concurso asociado. Cuando aprueba una autorización de baja, no sabe si ya se abrió el concurso ni en qué etapa está.

**Lo que hay que construir**:
- En `AutorizacionesPage`, panel de detalle de `baja_cargo`: agregar link al concurso asociado si existe (`concurso_id` en `bajas` → `concursos`).
- En `AutorizacionesPage`, panel de detalle de `concurso_cph`: mostrar sub-estado actual además de los datos del cargo.

### GAP 5 — Estado del cargo post-designación en CargoDetailPanel (🟡 Medio)

`CargoDetailPanel` muestra si el cargo está vacante u ocupado, pero no muestra el concurso abierto asociado ni el estado del proceso concursal.

**Lo que hay que construir**:
- En `CargoDetailPanel`: sección "Proceso concursal activo" — visible si existe un `concurso` con estado no terminal. Muestra tipo (CPH/CEETPS), sub-estado, link al concurso.

---

## Tareas

| # | Tarea | Dev | Est. | Prioridad |
|---|-------|-----|------|-----------|
| S16-1 | Backend: `POST /concursos-cph/:id/designar` — crea `Ocupacion`, avanza sub-estado a `N-DESIGNADO`, notifica al equipo CPH | Jorge | 3h | 🔴 |
| S16-2 | Backend: `POST /concursos-ceetps/:id/designar` — ídem para CEETPS, avanza estado a `finalizado` | Jorge | 2h | 🔴 |
| S16-3 | Frontend CPH: paso "Registrar designación" en Wizard — selector persona, fecha, idSialRol opcional | Agustín | 4h | 🔴 |
| S16-4 | Frontend CEETPS: sección "Registrar designación" en `ConcursoCeetpsDetail` | Agustín | 3h | 🔴 |
| S16-5 | Backend + Frontend: `CargoDetailPanel` — sección "Proceso concursal activo" con link y sub-estado | Agustín | 3h | 🟡 |
| S16-6 | Frontend: `AutorizacionesPage` — link al concurso en panel detalle de `baja_cargo` | Agustín | 2h | 🟡 |
| S16-7 | Schema + migración: campo `baja_origen_id` en `solicitudes_alta` o `cargos` (decidir en implementación) | Jorge | 1h | 🟡 |
| S16-8 | Frontend: `AltaCargosPage` — selector "¿Reemplaza una baja?" + vínculo en `CargoDetailPanel` y `BajaCargosPage` | Agustín | 3h | 🟡 |
| S16-9 | Verificación end-to-end: flujo completo Origen A (padrón) y Origen B (manual) hasta designación visible en `/cargos/:id` y organigrama | Jorge + Agustín | 3h | 🔴 |

**Total estimado**: ~24h

---

## Dependencias entre tareas

```
S16-1 ──► S16-3
S16-2 ──► S16-4
S16-7 ──► S16-8
S16-1 + S16-2 + S16-5 + S16-6 + S16-8 ──► S16-9
```

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/modules/concursos-cph/concursos-cph.service.ts` | `designarConcursoCphService` |
| `apps/api/src/modules/concursos-cph/concursos-cph.routes.ts` | `POST /:id/designar` |
| `apps/api/src/modules/concursos-ceetps/concursos-ceetps.service.ts` | `designarConcursoCeetpsService` |
| `apps/api/src/modules/concursos-ceetps/concursos-ceetps.routes.ts` | `POST /:id/designar` |
| `apps/web/src/modules/concursos-cph/pages/ConcursoCphWizard.tsx` | Paso designación |
| `apps/web/src/modules/concursos-ceetps/pages/ConcursoCeetpsDetail.tsx` | Sección designación |
| `apps/web/src/modules/cargos/pages/CargoDetailPanel.tsx` | Sección concurso activo |
| `apps/web/src/modules/autorizaciones/pages/AutorizacionesPage.tsx` | Link a concurso en detalle baja |
| `prisma/schema.prisma` | Campo `bajaOrigenId` en `SolicitudAlta` o `Cargo` |
| `prisma/migrations/20260900000001_s16_baja_origen/` | Migración nueva |
| `apps/web/src/modules/cargos/pages/AltaCargosPage.tsx` | Selector baja origen |
| `apps/web/src/modules/bajas/pages/BajaCargosPage.tsx` | Mostrar alta vinculada |

---

## Criterio de éxito

- [ ] Registrar designación CPH → cargo aparece como OCUPADO en `/cargos/:id` y en el organigrama sin esperar el padrón siguiente
- [ ] Registrar designación CEETPS → ídem
- [ ] `CargoDetailPanel` muestra el concurso activo con sub-estado y link
- [ ] Director ve link al concurso desde el panel de autorización de baja
- [ ] Alta de cargo puede vincularse a una baja como contrapartida
- [ ] Flujo Origen A (padrón) verificado end-to-end
- [ ] Flujo Origen B (manual) verificado end-to-end
- [ ] Sin regresiones en módulos existentes (bajas, concursos, autorizaciones, padrón)

---

## Notas

- **GAP 1 y 2 son los más urgentes**: son los únicos que producen datos incorrectos visibles para el usuario final (cargo vacante cuando ya hay designado).
- **GAP 3 (B-14)** es trazabilidad administrativa — no afecta la corrección de los datos, solo la navegabilidad entre registros relacionados.
- **GAP 4 y 5** son mejoras de UX para el Director y el equipo concursal — no bloquean ningún flujo.
- Al registrar la designación, si `idSialRol` no se conoce todavía (el padrón no llegó), se crea la ocupación con un `idSialRol` sintético (`MANUAL-{cargoId}-{fecha}`) que el padrón siguiente sobreescribirá al detectar el "nuevo" real. Esto evita la restricción UNIQUE de `idSialRol` sin dejar el campo vacío.
- La designación **no cancela el concurso** — lo lleva a estado `finalizado` (CPH) o `finalizado` (CEETPS). El historial del proceso queda intacto.
- **Modelo de desierto**: durante el desarrollo de este sprint se detectó que `desierto` estaba modelado incorrectamente como estado terminal. El fix completo está documentado en `Sprints/POST_SPRINT_16_desierto_cph.md` y debe ejecutarse antes o en paralelo con S16-3/S16-4.
