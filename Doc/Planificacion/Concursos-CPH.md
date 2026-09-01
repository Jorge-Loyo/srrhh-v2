# PLAN INTERMEDIO — Permisos, Notificaciones y Flujo Concursal CPH

# Sistema de Recursos Humanos — Gobierno de la Ciudad de Buenos Aires

> Documento de planificación dedicada al desarrollo intermedio entre Sprint 5 y Sprint 6.
> Fuente de verdad para tareas de este bloque. Complementa (no reemplaza) `PLAN_SCRUM_2026.md`.
> Última actualización: 2026-08-31 — Planificado completo, pendiente de estimación por tareas.

---

## CONTEXTO DE ESTE PLAN

Volvemos sobre CPH después de Sprint 5 (cerrado y mergeado a main) con dos bloques previos necesarios para un flujo concursal seguro y gobernado:

1. **Permisos por rol con matriz central** (hoy hay listas hardcodeadas de roles por endpoint)
2. **Notificaciones persistidas** (hoy no existe entidad)

Solo con eso en pie se puede definir el flujo completo de CPH con **autorizaciones del director** entre pasos. La piedra angular es el flujo concursal CPH: baja → caratulación → autorización → inscripción/examen/OM.

> **Decisiones ya tomadas con Jorge (no consultar de nuevo):**
>
> - Modelo de permisos: **roles fijos + matriz central en `packages/types`** (no tabla de permisos flexible)
> - Menú lateral **izquierdo** (AppShell) con items filtrados por matriz; página "Sin acceso"
> - Página de inicio: **puerto del `landing.html` del legacy** (`dotacion-rrhh/frontend/public/landing.html`) con la línea Obelisco/Tailwind. Hub de accesos en 3 columnas (Enlaces directos / Presentaciones y PowerBI / Planillas de datos — títulos adaptables) + buscador inteligente
> - Autorizaciones: **entidad genérica `Autorizacion`** (tipo + referenciaId), item de menú "Configuración" en Admin con sub-sección "Permisos"
> - Notificaciones: **entidad `Notificacion` persistida + badge no leídas en el header** (no computadas en vivo)
> - Solicitud de autorización: **automática al caratular el concurso CPH** (al completar todos los campos de la fase "baja/apertura")
> - Guardas del router por rol (en vez de gates sueltos por página) — como en el legacy

---

## ALCANCE (QUÉ ENTRA Y QUÉ NO)

| Dentro del alcance                                   | Fuera del alcance (Sprint 6 o backlog)                |
| ---------------------------------------------------- | ----------------------------------------------------- |
| Matriz de permisos por rol en `packages/types`       | Flujo de concursos CEETPS (aún sin pasos definidos)   |
| Página `/configuracion/permisos` (solo admin)        | Deploy producción (`S6-7`)                            |
| Endpoint `/kpis/dotacion` (stubs actuales S6-1)      | Alertas computadas client-side (ya existen)           |
| `InicioPage` (landing portada del legacy)            | Migración de refresh token a cookie httpOnly (`B-10`) |
| Menú por rol + guards de router                      | Portal Postulante (`B-1`)                             |
| Entidad `Notificacion` persistida + badge            | Notificaciones por email (`B-7`, segunda fase)        |
| Entidad `Autorizacion` genérica                      | Workflow completo multi-aprobación por CPH (solo 1)   |
| Flujo CPH: caratulación → aprobar → inscr./examen/OM | Flujo completo CPH hasta designación (fuera de fase)  |

---

## MODELO DE PERMISOS — MATRIZ (fuente de verdad en `packages/types`)

Definida como constante exportada (`MODULOS`, `ACCIONES`, `MATRIZ_PERMISOS`). Acciones: `ver`, `crear`, `editar`, `aprobar` (concursos) / `aprobar_padron` (padrón). El código en backend (`requirePermiso`) y frontend (`can(usuario, modulo, accion)`) consulta esa matriz, no listas sueltas.

| Módulo           | Acción               | admin | editor | director | viewer | concursales_cph | concursales_ceetps | Seguimiento |
| ---------------- | -------------------- | ----- | ------ | -------- | ------ | --------------- | ------------------ | ----------- |
| padron           | ver                  | ✅    | ✅     | ✅       | ✅     | ✅              | ✅                 |
|                  | subir                | ✅    | ✅     | —        | —      | —               | —                  |
|                  | aprobar_padron       | ✅    | ✅     | —        | —      | —               | —                  |
|                  | eliminar_snap        | ✅    | —      | —        | —      | —               | —                  |
| personas         | ver                  | ✅    | ✅     | ✅       | ✅     | ✅              | ✅                 |
| cargos           | ver                  | ✅    | ✅     | ✅       | ✅     | ✅              | ✅                 |
|                  | crear                | ✅    | ✅     | —        | —      | —               | —                  |
| bajas            | ver                  | ✅    | ✅     | ✅       | ✅     | ✅              | ✅                 |
|                  | crear                | ✅    | ✅     | —        | —      | ✅              | ✅                 |
| concursos-cph    | ver                  | ✅    | ✅     | ✅       | ✅     | ✅              | —                  |
|                  | crear                | ✅    | ✅     | —        | —      | ✅              | —                  |
|                  | editar               | ✅    | ✅     | —        | —      | ✅              | —                  |
|                  | autorizar (director) | —     | —      | ✅       | —      | —               | —                  |
| concursos-ceetps | ver                  | ✅    | ✅     | ✅       | ✅     | —               | ✅                 |
|                  | crear                | ✅    | ✅     | —        | —      | —               | ✅                 |
|                  | editar               | ✅    | ✅     | —        | —      | —               | ✅                 |
| kpis             | ver                  | ✅    | ✅     | ✅       | ✅     | ✅              | ✅                 |
| configuracion    | ver                  | ✅    | —      | —        | —      | —               | —                  |
| notificaciones   | ver (propias)        | ✅    | ✅     | ✅       | ✅     | ✅              | ✅                 |
| autorizaciones   | crear (sistema)      | ✅    | ✅     | —        | —      | ✅              | ✅                 |
|                  | resolver (director)  | —     | —      | ✅       | —      | —               | —                  |

> **Nota:** `director` actuaba como "read-only inútil" hasta acá — con las autorizaciones pasa a tener una acción concreta: `autorizar` en concursos-cph. Se puede extender después a CEETPS.

---

## FASES

---

### FASE 1 — Matriz de permisos

Objetivo: reemplazar listas hardcodeadas por una matriz central y una **pantalla de configuración visible para admin**.

| #   | Tarea                                                                                                                           | Dev     | Est. | Prioridad  |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ------- | ---- | ---------- |
| P-1 | Definir matriz en `packages/types`: `MODULOS`, `ACCIONES`, `MATRIZ_PERMISOS` + tipo `Permiso`                                   | Jorge   | 3h   | 🔴 Crítico |
| P-2 | Backend: nuevo middleware `requirePermiso(modulo, accion)` que consulta la matriz y reemplaza `requireRole` en los endpoints    | Jorge   | 4h   | 🔴 Crítico |
| P-3 | Frontend: helper `can(usuario, modulo, accion)` en `shared/lib/can.ts` (usa la matriz)                                          | Agustin | 2h   | 🔴 Crítico |
| P-4 | Menú con sección "Configuración" (admin-only) + sub-item "Permisos"; ruta `/configuracion/permisos` con guard de router         | Agustin | 3h   | 🟡 Medio   |
| P-5 | Página `ConfiguracionPermisosPage`: renderiza la matriz en cascada (módulo → acción → checkbox por rol, solo lectura por ahora) | Agustin | 6h   | 🟡 Medio   |
| P-6 | Migración: reemplazar todos los `requireRole([...])` por `requirePermiso(...)`; limpiar gates por página que ya cubre el router | Jorge   | 4h   | 🔴 Crítico |

**Criterio de éxito:**

- Los endpoints de escritura usan el nuevo middleware (sin listas hardcodeadas)
- La página `/configuracion/permisos` renderiza la matriz para admin; oculta para el resto
- Menú con "Configuración" solo visible para admin

---

### FASE 2 — Landing, menú y guards de router

Objetivo: página de inicio con la lógica del legacy (hub de accesos + buscador inteligente), menú por rol y guardas unificadas en el router.

| #    | Tarea                                                                                                                                    | Dev     | Est. | Prioridad  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---- | ---------- |
| P-7  | `InicioPage`: estructura con las 3 columnas del `landing.html` (Enlaces directos / Presentaciones y PowerBI / Planillas en datos mock)   | Agustin | 10h  | 🔴 Crítico |
| P-8  | Filtro de tarjetas en `InicioPage` por `can(usuario, ...)`; buscador inteligente (filtra nombre/acceso, con sinónimos como en el legacy) | Agustin | 4h   | 🟡 Medio   |
| P-9  | Router: `ProtectedRoute` acepta `rol?: RolUsuario[]`; página "Sin acceso" (componente compartido); gates movidos a router                | Agustin | 4h   | 🔴 Crítico |
| P-10 | AppShell: items filtrados por matriz usando `can`; sub-items de "Cargos" y el nuevo "Configuración" controlados por permiso `crear`      | Agustin | 3h   | 🔴 Crítico |
| P-11 | Migración de las páginas existentes: quitar gates internos (`AdminUsuariosPage`, `PadronPage`) — dejan de chequear, el router protege    | Agustin | 3h   | 🟡 Medio   |

**Criterio de éxito:**

- `/` muestra `InicioPage` con 3 columnas (no redirect a `/padron`)
- Menú izquierdo sin items visibles para roles sin permiso; sub-items de Cargos controlados igual
- Acceso prohibido por URL da "Sin acceso" (en router, no dentro de la página)

---

### FASE 3 — Notificaciones

Objetivo: entidad persistida + badge de no leídas en el header.

| #    | Tarea                                                                                                                                            | Dev     | Est. | Prioridad |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ---- | --------- |
| P-12 | Prisma: `model Notificacion` + enum `TipoNotificacion`; migración `sprint_i_notificaciones`                                                      | Jorge   | 3h   | 🟡 Medio  |
| P-13 | Endpoint module `notificaciones/`: `GET /` (paginado, propias), `PATCH /:id/leer`, `PATCH /leer-todas`; helpers de creación emitidos por eventos | Jorge   | 6h   | 🟡 Medio  |
| P-14 | Frontend: badge con contador de no leídas en el header (a la izquierda del usuario; ocupa el lugar del badge de padrón cuando hay)               | Agustin | 4h   | 🟡 Medio  |
| P-15 | Bandeja `/notificaciones` (listado paginado, filtros por tipo/leídas, marcar como leídas); link a `referenciaId` (concurso, baja, etc.)          | Agustin | 6h   | 🟡 Medio  |
| P-16 | Backend: materializar alertas de estancamiento de concursos (>30/60/90 días, anti-duplicados por `origenKey`) según rol con permiso de ver       | Jorge   | 6h   | 🟢 Bajo   |

**Criterio de éxito:**

- `Notificacion` se crea desde eventos del backend (baja nueva, autorización pedida, etc.)
- Badge de no leídas visible; la bandeja marca de a una o todas
- Las alertas de estancamiento de concursos generan notificación a dueños + admin/editor

---

### FASE 4 — Flujo concursal CPH con autorizaciones

Objetivo: punto de corte "caratulación" → autorización del director → verificación CPH → paso **Inscripción/Examen/OM**.

| #    | Tarea                                                                                                                                                                                                                                                         | Dev             | Est. | Prioridad  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---- | ---------- |
| P-17 | Prisma: `model Autorizacion` + enum `EstadoAutorizacion`; migración `sprint_i_autorizaciones`                                                                                                                                                                 | Jorge           | 4h   | 🔴 Crítico |
| P-18 | Servicio `autorizaciones/`: al patch `concursos-cph/:id` que completa la caratulación (todos los campos `eeBaja`+`fechaBaja`+`eeConcurso`+`fechaEeConcurso`), crear `Autorizacion` si no existe pendiente (idem por `referenciaId`), y notificar a `director` | Jorge           | 6h   | 🔴 Crítico |
| P-19 | Endpoint module `autorizaciones/`: `GET /` (pendientes propias para director), `POST /:id/aprobar`, `POST /:id/rechazar` (con comentarios); al resolver, notificar a `concursales_cph`                                                                        | Jorge           | 6h   | 🔴 Crítico |
| P-20 | Wizard CPH: badge "En espera de autorización del director" en fase Autorización si existe `Autorizacion` pendiente; bloqueo del campo `fechaAutorizacion` hasta aprobar; al aprobar la fase habilita                                                          | Agustin         | 8h   | 🔴 Crítico |
| P-21 | Portal del director: ruta `/autorizaciones` con tabla de pendientes (detalle del concurso, comentarios, aprobar/rechazar); link desde la notificación                                                                                                         | Agustin         | 6h   | 🔴 Crítico |
| P-22 | Integración del wizard: al resolver la autorización, el CPH puede avanzar a sub-estado `A-AUTZN`/`B-SORTEO JUR` (solo se mapea la fase **Inscripción/Examen/OM**); resto del wizard sigue igual                                                               | Jorge + Agustin | 4h   | 🟡 Medio   |
| P-23 | Prueba end-to-end con usuario director de prueba: caratear → autorización pendiente → director aprueba → notificación a CPH → CPH puede completar fase Inscripción/Examen/OM                                                                                  | Jorge + Agustin | 4h   | 🔴 Crítico |

**Criterio de éxito:**

- Caratear genera automáticamente la `Autorizacion` y notificación al director (sin duplicados)
- El wizard muestra "En espera de autorización" y bloquea `fechaAutorizacion` hasta aprobar
- Director resuelve desde `/autorizaciones` y el siguiente paso del wizard se habilita
- Alcance del maquetado: hasta Inscripción/Examen/OM; el resto del wizard queda como en Sprint 4

---

## DEPENDENCIAS ENTRE FASES

```
Fase 1 (Permisos) → Fase 2 (Landing/menú/guards) → Fase 3 (Notificaciones) → Fase 4 (Autorizaciones)
```

Las fases son secuenciales porque:

- Fase 2 usa el helper `can()` de Fase 1 para filtrar menú/tarjetas
- Fase 3 define `Notificacion` y el helper de creación que usa Fase 4
- Fase 4 usa tanto el menú por rol (Fase 2) como la entidad de notificaciones (Fase 3)

Dentro de cada fase, Carlos (Jorge: backend/schema) y Belén (Agustin: frontend/UI) trabajan en paralelo con coordinación por aviso antes de tocar módulos compartidos (misma regla que Sprint 3).

---

## POST-ENTREGA — reincorporar a `PLAN_SCRUM_2026.md`

Cuando las 4 fases cierren, se vuelve a meter este bloque en la sección de "Sprint intermedio" del plan principal con las tareas verificadas. Se retoman los hallazgos backlogs pendientes de activar:

- `P-16` (alertas como notificaciones persistidas) cerraía `B-7` solo parcialmente (queda email para segunda fase)
- Con las autorizaciones de director, el `director` deja de ser un rol "pantalla" funcionando al flujo CPH real

---

## FASE 5 — Corrección de lógica de cargo (previo a Fase 1)

> **Prerequisito de todo lo demás.** Antes de construir flujos concursales con autorizaciones, el modelo de datos de cargos debe ser consistente con el contrato definido en `Doc/Contrato_logica-cargo.md`. Las 4 correcciones son independientes entre sí y pueden hacerse en paralelo.

### Contexto

Se verificó el código contra el árbol de estados canónico del contrato (`Doc/Contrato_logica-cargo.md`) y se encontraron los siguientes incumplimientos:

| # | Incumplimiento | Severidad |
|---|---|---|
| 1 | Identidad del cargo: al procesar diff `nuevo`, se crea cargo nuevo por `id_sial` en vez de buscar por `(hospital, escalafon, codigo_repa, literal_puesto)` | 🔴 Crítico |
| 2 | `createBajaService` no cierra la ocupación activa al marcar el cargo `no_vigente` | 🔴 Crítico |
| 3 | `createBajaService` crea el concurso después de marcar `no_vigente` — queda cargo `no_vigente` con concurso activo | 🔴 Crítico |
| 4 | No se valida unicidad de ocupación activa antes de insertar nueva ocupación | 🟡 Medio |

---

| #   | Tarea | Archivo | Dev | Est. | Prioridad |
|-----|---|---|---|---|---|
| C-1 | **Identidad del cargo en el padrón**: en `aprobarSnapshotService`, al procesar diff `nuevo`, buscar cargo existente por `(hospitalId, escalafonId, codigoRepa, literalPuesto)` antes de crear uno nuevo. Si existe → crear ocupación sobre ese cargo. Si no existe → crear cargo nuevo. Eliminar la búsqueda por `idSial` como criterio de identidad estructural. | `padron.service.ts` | Jorge | 4h | 🔴 Crítico |
| C-2 | **Cerrar ocupación activa en baja manual**: en `createBajaService`, dentro de la misma transacción, antes de marcar `cargo.estado = no_vigente`, ejecutar `ocupacion.updateMany({ where: { cargoId, hasta: null }, data: { hasta: fechaBaja } })`. | `bajas.service.ts` | Jorge | 2h | 🔴 Crítico |
| C-3 | **Orden de operaciones en baja**: en `createBajaService`, reordenar la transacción para que la creación del concurso ocurra **antes** de marcar el cargo `no_vigente`. Agregar guard: si `cargo.estado === 'no_vigente'` al momento de crear el concurso, lanzar error 409. | `bajas.service.ts` | Jorge | 2h | 🔴 Crítico |
| C-4 | **Unicidad de ocupación activa**: en `aprobarSnapshotService` (diff `nuevo`), antes de insertar una nueva ocupación, verificar que no exista ya una con `cargoId = X AND hasta IS NULL`. Si existe, cerrarla primero (`hasta = fechaSnapshot`) antes de crear la nueva. | `padron.service.ts` | Jorge | 3h | 🟡 Medio |
| C-5 | **Verificación de consistencia en BD**: script SQL de auditoría que detecte: (a) cargos `no_vigente` con ocupación activa (`hasta IS NULL`), (b) cargos con más de una ocupación activa simultánea, (c) concursos activos sobre cargos `no_vigente`. Correr contra datos reales y documentar resultado. | `scripts/auditoria-cargos.sql` | Jorge | 2h | 🔴 Crítico |
| C-6 | **Actualizar `Contrato_logica-cargo.md`**: una vez implementadas las correcciones, marcar cada regla como ✅ implementada con referencia al archivo y función que la garantiza. | `Doc/Contrato_logica-cargo.md` | Jorge | 1h | 🟡 Medio |

**Criterio de éxito:**

- El caso Cattaneo/Barreiro Machado produce una sola ocupación nueva sobre `RG-CG-000047`, no un cargo nuevo `RG-CG-000194`
- Al registrar una baja manual, la ocupación activa queda cerrada (`hasta = fechaBaja`) en la misma transacción
- No existe ningún cargo `no_vigente` con concurso activo en la BD
- No existe ningún cargo con más de una ocupación activa simultánea
- `scripts/auditoria-cargos.sql` devuelve 0 filas en los 3 checks

**Dependencias:**

```
Fase 5 (Corrección lógica cargo) → Fase 1 (Permisos) → Fase 2 → Fase 3 → Fase 4
```

Fase 5 no depende de ninguna otra fase — puede arrancarse inmediatamente. Es prerequisito de todo lo que sigue porque el flujo concursal (Fase 4) opera sobre cargos y ocupaciones: si esos datos son inconsistentes, las autorizaciones y notificaciones se construyen sobre una base rota.
