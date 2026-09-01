# PLAN SCRUM — Sprints 8 a 11: Gobierno del Flujo Concursal

# Sistema de Recursos Humanos — Gobierno de la Ciudad de Buenos Aires

> Continuidad del desarrollo de `PLAN_SCRUM_2026.md` (Sprints 0–7). Fuente de verdad para Sprints 8+.
> Última actualización: 2026-09 — Sprints 8 a 11 planificados, pendientes de inicio.
>
> ⬅️ Plan anterior: [`PLAN_SCRUM_2026.md`](./PLAN_SCRUM_2026.md) (Sprints 0–7)

---

## ESTADO ACTUAL

| Sprint                                                  | Estado          | Tareas       |
| ------------------------------------------------------- | --------------- | ------------ |
| Sprint 8 — Corrección de lógica de cargo                | 📋 Planificado  | S8-1 a S8-6  |
| Sprint 9 — Matriz de permisos + Landing/menú/guards     | 📋 Planificado  | S9-1 a S9-11 |
| Sprint 10 — Notificaciones persistidas                  | 📋 Planificado  | S10-1 a S10-5|
| Sprint 11 — Flujo concursal CPH con autorizaciones      | 📋 Planificado  | S11-1 a S11-7|

---

## 1. CONTEXTO DEL EQUIPO

Heredado de `PLAN_SCRUM_2026.md` (sin cambios):

| Parámetro          | Valor                                                |
| ------------------ | ---------------------------------------------------- |
| Equipo             | Jorge (Dev 1 — Backend) + Agustin (Dev 2 — Frontend) |
| Capacidad          | 30h/semana por dev = 60h/semana totales              |
| Duración de sprint | 1–2 semanas según complejidad                        |
| Ceremonia          | Review + Retro semanal (sin daily, async)            |
| Coordinación       | Avisar antes de tocar un módulo compartido (DoD)     |

### Definición de Done (DoD)

Igual que en `PLAN_SCRUM_2026.md`:

- [ ] Funcionalidad implementada y probada manualmente end-to-end
- [ ] Sin regresiones en módulos existentes
- [ ] Migración de Prisma aplicada y verificada contra BD real (cuando aplique)
- [ ] Documentación actualizada (este doc + contratos en `Doc/`)
- [ ] Avisado antes de tocar un módulo que el otro dev pueda estar trabajando

---

## 2. CONTEXTO DE ESTE CICLO

Con Sprint 6 cerrado (MVP con KPIs y deploy listo) y Sprint 7 planificado (trazabilidad del alta manual de cargos), este ciclo vuelve sobre el **flujo concursal CPH** para hacerlo seguro y gobernado. La piedra angular es el flujo: **baja → caratulación → autorización del director → inscripción/examen/OM**.

Antes de construir ese flujo hay dos bases previas indispensables:

1. **Base de datos consistente** (Sprint 8): el modelo de cargos/ocupaciones tiene incumplimientos críticos contra `Doc/Contrato_logica-cargo.md` — el flujo concursal opera sobre cargos y ocupaciones, y si esos datos son inconsistentes, todo lo que se construya encima está roto.
2. **Gobierno de acceso** (Sprints 9–10): hoy los roles están hardcodeados por endpoint y no existe entidad de notificaciones. Sin matriz de permisos central ni notificaciones persistidas no se puede implementar la autorización del director.

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

## 3. ALCANCE (QUÉ ENTRA Y QUÉ NO)

| Dentro del alcance                                   | Fuera del alcance (backlog)                           |
| ---------------------------------------------------- | ----------------------------------------------------- |
| Corrección de lógica de cargo (4 bugs + auditoría)   | Flujo de concursos CEETPS (aún sin pasos definidos)   |
| Matriz de permisos por rol en `packages/types`       | Migración de refresh token a cookie httpOnly (`B-10`) |
| Página `/configuracion/permisos` (solo admin)        | Portal Postulante (`B-1`)                             |
| `InicioPage` (landing portada del legacy)            | Notificaciones por email (`B-7`, segunda fase)        |
| Menú por rol + guards de router                      | Workflow completo multi-aprobación (solo 1 paso)      |
| Entidad `Notificacion` persistida + badge            | Flujo completo CPH hasta designación (fuera de fase)  |
| Entidad `Autorizacion` genérica                      |                                                       |
| Flujo CPH: caratulación → aprobar → inscr./examen/OM |                                                       |

---

## 4. DEPENDENCIAS ENTRE SPRINTS

```
Sprint 7 (Cargos: trazabilidad alta) ─┐
                                      ├─► Sprint 8 (Corrección lógica cargo)
Sprint 8 ──► Sprint 9 (Permisos + Landing) ──► Sprint 10 (Notificaciones) ──► Sprint 11 (Autorizaciones CPH)
```

- **Sprint 8** es prerequisito de todo lo demás: opera sobre la base de datos de cargos/ocupaciones. No depende de Sprint 7, pero conviene cerrar 7 primero para no tocar `cargos` desde dos frentes a la vez.
- **Sprint 9** Fase Landing usa el helper `can()` de la matriz de permisos (mismo sprint, secuencial internamente).
- **Sprint 10** define `Notificacion` y el helper de creación que usa Sprint 11.
- **Sprint 11** usa el menú por rol (Sprint 9) y la entidad de notificaciones (Sprint 10).

Dentro de cada sprint, Jorge (backend/schema) y Agustin (frontend/UI) trabajan en paralelo con coordinación por aviso antes de tocar módulos compartidos (misma regla que Sprint 3).

---

## 5. SPRINT 8 — Corrección de lógica de cargo

**Duración:** 1 semana | **Capacidad:** 60h | **Estimado:** 14h (margen para verificación con datos reales)
**Objetivo:** Dejar el modelo de cargos/ocupaciones consistente con `Doc/Contrato_logica-cargo.md` antes de construir flujos concursales encima.

### Contexto

Se verificó el código contra el árbol de estados canónico del contrato y se encontraron los siguientes incumplimientos:

| # | Incumplimiento | Severidad |
|---|----------------|-----------|
| 1 | Identidad del cargo: al procesar diff `nuevo`, se crea cargo nuevo por `id_sial` en vez de buscar por `(hospital, escalafon, codigo_repa, literal_puesto)` | 🔴 Crítico |
| 2 | `createBajaService` no cierra la ocupación activa al marcar el cargo `no_vigente` | 🔴 Crítico |
| 3 | `createBajaService` crea el concurso después de marcar `no_vigente` — queda cargo `no_vigente` con concurso activo | 🔴 Crítico |
| 4 | No se valida unicidad de ocupación activa antes de insertar nueva ocupación | 🟡 Medio |

| #    | Tarea | Archivo | Dev | Est. | Prioridad |
|------|-------|---------|-----|------|-----------|
| S8-1 | **Identidad del cargo en el padrón**: en `aprobarSnapshotService`, al procesar diff `nuevo`, buscar cargo existente por `(hospitalId, escalafonId, codigoRepa, literalPuesto)` antes de crear uno nuevo. Si existe → crear ocupación sobre ese cargo. Si no existe → crear cargo nuevo. Eliminar la búsqueda por `idSial` como criterio de identidad estructural. | `padron.service.ts` | Jorge | 4h | 🔴 Crítico |
| S8-2 | **Cerrar ocupación activa en baja manual**: en `createBajaService`, dentro de la misma transacción, antes de marcar `cargo.estado = no_vigente`, ejecutar `ocupacion.updateMany({ where: { cargoId, hasta: null }, data: { hasta: fechaBaja } })`. | `bajas.service.ts` | Jorge | 2h | 🔴 Crítico |
| S8-3 | **Orden de operaciones en baja**: en `createBajaService`, reordenar la transacción para que la creación del concurso ocurra **antes** de marcar el cargo `no_vigente`. Agregar guard: si `cargo.estado === 'no_vigente'` al momento de crear el concurso, lanzar error 409. | `bajas.service.ts` | Jorge | 2h | 🔴 Crítico |
| S8-4 | **Unicidad de ocupación activa**: en `aprobarSnapshotService` (diff `nuevo`), antes de insertar una nueva ocupación, verificar que no exista ya una con `cargoId = X AND hasta IS NULL`. Si existe, cerrarla primero (`hasta = fechaSnapshot`) antes de crear la nueva. | `padron.service.ts` | Jorge | 3h | 🟡 Medio |
| S8-5 | **Verificación de consistencia en BD**: script SQL de auditoría que detecte: (a) cargos `no_vigente` con ocupación activa (`hasta IS NULL`), (b) cargos con más de una ocupación activa simultánea, (c) concursos activos sobre cargos `no_vigente`. Correr contra datos reales y documentar resultado. | `scripts/auditoria-cargos.sql` | Jorge | 2h | 🔴 Crítico |
| S8-6 | **Actualizar `Contrato_logica-cargo.md`**: una vez implementadas las correcciones, marcar cada regla como ✅ implementada con referencia al archivo y función que la garantiza. | `Doc/Contrato_logica-cargo.md` | Jorge | 1h | 🟡 Medio |

> Sprint casi íntegro de backend (Jorge). Agustin queda disponible para destrabar tareas de Sprint 7 (S7-7/S7-8/S7-9) o para adelantar el maquetado de `InicioPage` (S9-7) con datos mock.

**Criterio de éxito:**

- El caso Cattaneo/Barreiro Machado produce una sola ocupación nueva sobre `RG-CG-000047`, no un cargo nuevo `RG-CG-000194`
- Al registrar una baja manual, la ocupación activa queda cerrada (`hasta = fechaBaja`) en la misma transacción
- No existe ningún cargo `no_vigente` con concurso activo en la BD
- No existe ningún cargo con más de una ocupación activa simultánea
- `scripts/auditoria-cargos.sql` devuelve 0 filas en los 3 checks

---

## 6. SPRINT 9 — Matriz de permisos + Landing/menú/guards

**Duración:** 1 semana | **Capacidad:** 60h | **Estimado:** 42h
**Objetivo:** Reemplazar listas hardcodeadas de roles por una matriz central, y montar la página de inicio con la lógica del legacy (hub de accesos + buscador inteligente), menú por rol y guardas unificadas en el router.

### Modelo de permisos — matriz (fuente de verdad en `packages/types`)

Definida como constante exportada (`MODULOS`, `ACCIONES`, `MATRIZ_PERMISOS`). Acciones: `ver`, `crear`, `editar`, `aprobar` (concursos) / `aprobar_padron` (padrón). El código en backend (`requirePermiso`) y frontend (`can(usuario, modulo, accion)`) consulta esa matriz, no listas sueltas.

| Módulo           | Acción               | admin | editor | director | viewer | concursales_cph | concursales_ceetps |
| ---------------- | -------------------- | ----- | ------ | -------- | ------ | --------------- | ------------------ |
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

> **Nota:** `director` actuaba como "read-only inútil" hasta acá — con las autorizaciones (Sprint 11) pasa a tener una acción concreta: `autorizar` en concursos-cph. Se puede extender después a CEETPS.

### Tareas

| #     | Tarea                                                                                                                           | Dev     | Est. | Prioridad  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- | ------- | ---- | ---------- |
| S9-1  | Definir matriz en `packages/types`: `MODULOS`, `ACCIONES`, `MATRIZ_PERMISOS` + tipo `Permiso`                                   | Jorge   | 3h   | 🔴 Crítico |
| S9-2  | Backend: nuevo middleware `requirePermiso(modulo, accion)` que consulta la matriz y reemplaza `requireRole` en los endpoints    | Jorge   | 4h   | 🔴 Crítico |
| S9-3  | Frontend: helper `can(usuario, modulo, accion)` en `shared/lib/can.ts` (usa la matriz)                                          | Agustin | 2h   | 🔴 Crítico |
| S9-4  | Menú con sección "Configuración" (admin-only) + sub-item "Permisos"; ruta `/configuracion/permisos` con guard de router         | Agustin | 3h   | 🟡 Medio   |
| S9-5  | Página `ConfiguracionPermisosPage`: renderiza la matriz en cascada (módulo → acción → checkbox por rol, solo lectura por ahora) | Agustin | 6h   | 🟡 Medio   |
| S9-6  | Migración: reemplazar todos los `requireRole([...])` por `requirePermiso(...)`; limpiar gates por página que ya cubre el router | Jorge   | 4h   | 🔴 Crítico |
| S9-7  | `InicioPage`: estructura con las 3 columnas del `landing.html` (Enlaces directos / Presentaciones y PowerBI / Planillas en datos mock) | Agustin | 10h  | 🔴 Crítico |
| S9-8  | Filtro de tarjetas en `InicioPage` por `can(usuario, ...)`; buscador inteligente (filtra nombre/acceso, con sinónimos como en el legacy) | Agustin | 4h   | 🟡 Medio   |
| S9-9  | Router: `ProtectedRoute` acepta `rol?: RolUsuario[]`; página "Sin acceso" (componente compartido); gates movidos a router       | Agustin | 4h   | 🔴 Crítico |
| S9-10 | AppShell: items filtrados por matriz usando `can`; sub-items de "Cargos" y el nuevo "Configuración" controlados por permiso `crear` | Agustin | 3h   | 🔴 Crítico |
| S9-11 | Migración de las páginas existentes: quitar gates internos (`AdminUsuariosPage`, `PadronPage`) — dejan de chequear, el router protege | Agustin | 3h   | 🟡 Medio   |

**Criterio de éxito:**

- Los endpoints de escritura usan el nuevo middleware (sin listas hardcodeadas)
- La página `/configuracion/permisos` renderiza la matriz para admin; oculta para el resto
- `/` muestra `InicioPage` con 3 columnas (no redirect a `/padron`)
- Menú izquierdo sin items visibles para roles sin permiso; sub-items de Cargos controlados igual
- Acceso prohibido por URL da "Sin acceso" (en router, no dentro de la página)

---

## 7. SPRINT 10 — Notificaciones persistidas

**Duración:** 1 semana | **Capacidad:** 60h | **Estimado:** 25h
**Objetivo:** Entidad `Notificacion` persistida + badge de no leídas en el header + bandeja.

| #     | Tarea                                                                                                                                            | Dev     | Est. | Prioridad |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ---- | --------- |
| S10-1 | Prisma: `model Notificacion` + enum `TipoNotificacion`; migración `sprint10_notificaciones`                                                      | Jorge   | 3h   | 🟡 Medio  |
| S10-2 | Endpoint module `notificaciones/`: `GET /` (paginado, propias), `PATCH /:id/leer`, `PATCH /leer-todas`; helpers de creación emitidos por eventos | Jorge   | 6h   | 🟡 Medio  |
| S10-3 | Frontend: badge con contador de no leídas en el header (a la izquierda del usuario; ocupa el lugar del badge de padrón cuando hay)               | Agustin | 4h   | 🟡 Medio  |
| S10-4 | Bandeja `/notificaciones` (listado paginado, filtros por tipo/leídas, marcar como leídas); link a `referenciaId` (concurso, baja, etc.)          | Agustin | 6h   | 🟡 Medio  |
| S10-5 | Backend: materializar alertas de estancamiento de concursos (>30/60/90 días, anti-duplicados por `origenKey`) según rol con permiso de ver       | Jorge   | 6h   | 🟢 Bajo   |

**Criterio de éxito:**

- `Notificacion` se crea desde eventos del backend (baja nueva, autorización pedida, etc.)
- Badge de no leídas visible; la bandeja marca de a una o todas
- Las alertas de estancamiento de concursos generan notificación a dueños + admin/editor

---

## 8. SPRINT 11 — Flujo concursal CPH con autorizaciones

**Duración:** 1–2 semanas | **Capacidad:** 60–120h | **Estimado:** 38h
**Objetivo:** Punto de corte "caratulación" → autorización del director → verificación CPH → paso **Inscripción/Examen/OM**.

| #     | Tarea                                                                                                                                                                                                                                                         | Dev             | Est. | Prioridad  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---- | ---------- |
| S11-1 | Prisma: `model Autorizacion` + enum `EstadoAutorizacion`; migración `sprint11_autorizaciones`                                                                                                                                                                 | Jorge           | 4h   | 🔴 Crítico |
| S11-2 | Servicio `autorizaciones/`: al patch `concursos-cph/:id` que completa la caratulación (todos los campos `eeBaja`+`fechaBaja`+`eeConcurso`+`fechaEeConcurso`), crear `Autorizacion` si no existe pendiente (idem por `referenciaId`), y notificar a `director` | Jorge           | 6h   | 🔴 Crítico |
| S11-3 | Endpoint module `autorizaciones/`: `GET /` (pendientes propias para director), `POST /:id/aprobar`, `POST /:id/rechazar` (con comentarios); al resolver, notificar a `concursales_cph`                                                                        | Jorge           | 6h   | 🔴 Crítico |
| S11-4 | Wizard CPH: badge "En espera de autorización del director" en fase Autorización si existe `Autorizacion` pendiente; bloqueo del campo `fechaAutorizacion` hasta aprobar; al aprobar la fase habilita                                                          | Agustin         | 8h   | 🔴 Crítico |
| S11-5 | Portal del director: ruta `/autorizaciones` con tabla de pendientes (detalle del concurso, comentarios, aprobar/rechazar); link desde la notificación                                                                                                         | Agustin         | 6h   | 🔴 Crítico |
| S11-6 | Integración del wizard: al resolver la autorización, el CPH puede avanzar a sub-estado `A-AUTZN`/`B-SORTEO JUR` (solo se mapea la fase **Inscripción/Examen/OM**); resto del wizard sigue igual                                                               | Jorge + Agustin | 4h   | 🟡 Medio   |
| S11-7 | Prueba end-to-end con usuario director de prueba: caratular → autorización pendiente → director aprueba → notificación a CPH → CPH puede completar fase Inscripción/Examen/OM                                                                                 | Jorge + Agustin | 4h   | 🔴 Crítico |

**Criterio de éxito:**

- Caratular genera automáticamente la `Autorizacion` y notificación al director (sin duplicados)
- El wizard muestra "En espera de autorización" y bloquea `fechaAutorizacion` hasta aprobar
- Director resuelve desde `/autorizaciones` y el siguiente paso del wizard se habilita
- Alcance del maquetado: hasta Inscripción/Examen/OM; el resto del wizard queda como en Sprint 4

---

## 9. REGISTRO DE DECISIONES

| Fecha   | Decisión | Motivo |
| ------- | -------- | ------ |
| 2026-09 | Sprints 8–11 se documentan en archivo propio como continuidad de `PLAN_SCRUM_2026.md` | El plan maestro cubre Sprints 0–7 (ciclo MVP); este ciclo nuevo (gobierno del flujo concursal) arranca en Sprint 8 con numeración continua |
| 2026-09 | Sprint 8 (corrección lógica cargo) es prerequisito de todo el ciclo | El flujo concursal (Sprint 11) opera sobre cargos y ocupaciones: si esos datos son inconsistentes, las autorizaciones y notificaciones se construyen sobre una base rota |
| 2026-09 | `S10-5` (alertas como notificaciones persistidas) cierra `B-7` solo parcialmente | Queda notificación por email para segunda fase |
| 2026-09 | Con las autorizaciones de director, el rol `director` deja de ser "pantalla" | Pasa a tener una acción concreta (`autorizar` en concursos-cph) funcionando al flujo CPH real |

---

## 10. BACKLOG DEL CICLO (fuera de estos sprints)

Heredado de `PLAN_SCRUM_2026.md` — sin cambios salvo los que este ciclo activa:

- `B-7` (notificaciones por email): queda parcialmente cerrado por S10-5; el email sigue en segunda fase
- `B-10` (refresh token a cookie httpOnly): sigue sin priorizar
- Flujo CEETPS con pasos: pendiente de definición funcional con el equipo concursales
- Flujo CPH completo hasta designación: fuera de fase por ahora (Sprint 11 llega hasta Inscripción/Examen/OM)
