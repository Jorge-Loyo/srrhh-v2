# SPRINT 12 — UX bajas + wizard CPH + permisos UI

**Estado:** ✅ Completo — 2026-09-03
**Autor:** Jorge + Claude

## Objetivo

Pulir la UX del flujo de bajas y el wizard CPH; mejorar la página de permisos.

## Tareas

| #     | Tarea | Estado |
| ----- | ----- | ------ |
| S12-1 | `NuevaBajaPage`: modal buscar cargo sin filtro escalafón, stepper dinámico 2/3 pasos | ✅ |
| S12-2 | `BajaCargosPage`: listado con editar/ver, estados con labels reales, modal detalle | ✅ |
| S12-3 | Wizard CPH: campo Puesto funcional (sin filtro `tipoPuesto`), docs en sidebar | ✅ |
| S12-4 | Wizard CPH: campos bloqueados cuando `pendienteAutorizacion` en etapa baja | ✅ |
| S12-5 | `ConfiguracionPermisosPage`: `MODULO_LABEL` + `ACCION_LABEL` con nombres reales del menú | ✅ |
| S12-6 | `ARRANQUE_LOCAL.md`: bloque ⚡ comandos rápidos, fix path WSL | ✅ |

---

# SPRINT 13 — Panel de autorizaciones + jerarquía de roles

**Estado:** ✅ Backend completo — 2026-09-11 | Frontend pendiente (Agustín)
**Inicio:** 2026-09-11
**Duración:** 2 semanas | **Capacidad:** 120h | **Estimado:** ~50h
**Autores:** Jorge (backend) + Agustín (frontend)

---

## Objetivo

Panel de autorizaciones pendientes filtrado por perfil de usuario + modelo de jerarquía de roles como cimientos para asignación de tareas futura. Reemplaza el flujo ad-hoc de `pendienteAutorizacion`/`aprobadoDirector` en `ConcursoCph` por un modelo genérico y extensible.

---

## Decisiones de diseño (acordadas 2026-09-11)

### Flujos por entidad

| Entidad | Tipo | Quién resuelve | Mecanismo |
| ------- | ---- | -------------- | --------- |
| Concurso CPH — caratulación normal (misma sigla/escalafón) | `concurso_cph` | `sgrasv` | 1 `Autorizacion` |
| Concurso CPH — caratulación con cambio de sigla/escalafón | `concurso_cph` | `director` → `sgrasv` | 2 `Autorizacion` en cadena |
| Alta de cargo | `alta_cargo` | `director` | 1 `Autorizacion` bloqueante |
| Baja de cargo | — | `director` | Solo `Notificacion` informativa (sin bloqueo) |

### Modelo `Autorizacion`

- `resolverPorRolSlug`: string directo (sin FK a `roles`), igual que `Notificacion.rolSlug`
- `referenciaId` + `referenciaTipo`: apunta al objeto origen (`ConcursoCph` o `SolicitudAlta`)
- Para CPH con cambio estructural: se crea solo la de `director`; cuando aprueba, se crea la de `sgrasv` en ese momento (en cadena, no simultáneas)
- Los campos `pendienteAutorizacion`/`aprobadoDirector` en `ConcursoCph` se mantienen como cache de estado para el wizard frontend (S12-4 sigue funcionando sin cambios)

### Modelo `SolicitudAlta` (nuevo — reemplaza `createCargoService` directo)

- Una solicitud **no es un Cargo** hasta ser aprobada por el director
- Al aprobar: se generan los `Cargo` reales con código asignado
- Al rechazar: persiste con estado `rechazada` para trazabilidad
- El código de cargo se genera **al aprobar**, no al crear la solicitud (no se queman códigos)
- `/cargos/alta` muestra `SolicitudAlta`, no `Cargo` directamente

### Modelo `RoleJerarquia`

- Cimientos para asignación de tareas y permisos en cascada (Sprint 14+)
- En Sprint 13 solo se crea la tabla y el seed; la lógica de cascada va después
- Usa slugs (string) en vez de FKs a `roles`

### Badges en el header

- Autorizaciones pendientes y notificaciones son **badges separados**
- `GET /autorizaciones/mis-pendientes` devuelve `{ count }` para el badge de autorizaciones
- El badge de notificaciones (`GET /notificaciones/no-leidas`) no cambia

---

## Flujos completos

### Alta de Cargo

```
POST /solicitudes-alta
  → crea SolicitudAlta (estado: pendiente)
  → crearAutorizacion('alta_cargo', solicitudId, 'solicitud_alta', 'director')
  → crearNotificacion(autorizacion_pendiente, rolSlug: 'director')

POST /autorizaciones/:id/aprobar  (director)
  → Autorizacion.estado = aprobada
  → por cada cantidad: siguienteCodigoCargo() + cargo.create(estado: vigente)
  → SolicitudAlta.estado = aprobada, cargosCreadosIds = [...]
  → crearNotificacion(autorizacion_resuelta, solicitante)

POST /autorizaciones/:id/rechazar  (director)
  → Autorizacion.estado = rechazada
  → SolicitudAlta.estado = rechazada
  → crearNotificacion(autorizacion_resuelta, solicitante)
```

### Concurso CPH — caratulación normal

```
PATCH /concursos-cph/:id  (sin cambio estructural)
  → crearAutorizacion('concurso_cph', cphId, 'concurso_cph', 'sgrasv')
  → ConcursoCph.pendienteAutorizacion = true
  → crearNotificacion(autorizacion_pendiente, rolSlug: 'sgrasv')

POST /autorizaciones/:id/aprobar  (sgrasv)
  → Autorizacion.estado = aprobada
  → ConcursoCph.pendienteAutorizacion = false, aprobadoDirector = false
  → crearNotificacion(autorizacion_resuelta, solicitante)
```

### Concurso CPH — cambio de sigla/escalafón

```
PATCH /concursos-cph/:id  (cambio estructural)
  → crearAutorizacion('concurso_cph', cphId, 'concurso_cph', 'director')
  → ConcursoCph.pendienteAutorizacion = true
  → crearNotificacion(autorizacion_pendiente, rolSlug: 'director')

POST /autorizaciones/:id/aprobar  (director)
  → Autorizacion.estado = aprobada
  → ConcursoCph.aprobadoDirector = true
  → crearAutorizacion('concurso_cph', cphId, 'concurso_cph', 'sgrasv')  ← segunda en cadena
  → crearNotificacion(autorizacion_pendiente, rolSlug: 'sgrasv')
  → crearNotificacion(autorizacion_resuelta, solicitante del paso 1)

POST /autorizaciones/:id/aprobar  (sgrasv)
  → Autorizacion.estado = aprobada
  → ConcursoCph.pendienteAutorizacion = false, aprobadoDirector = false
  → crearNotificacion(autorizacion_resuelta, solicitante)
```

### Baja — solo notificación

```
PATCH /bajas/:id  (resolucion_a_la_firma → pendiente)
  → crearNotificacion(baja_pendiente, rolSlug: 'director',
      mensaje: "Baja procesada: cargo X — hospital Y")
  → sin Autorizacion, sin bloqueo
```

---

## Tareas — Jorge (backend)

| # | Tarea | Est. | Estado |
| - | ----- | ---- | ------ |
| S13-1 | Migración: `model Autorizacion` + enums `TipoAutorizacion`/`EstadoAutorizacion`. Migr. `20260911000000_s13_autorizaciones` | 3h | ✅ 2026-09-11 |
| S13-2 | Migración: `model SolicitudAlta` + enum `SolicitudAltaEstado`. Migr. `20260911000001_s13_solicitudes_alta` | 2h | ✅ 2026-09-11 |
| S13-3 | Migración: `model RoleJerarquia` + seed jerarquía inicial. Migr. `20260911000002_s13_role_jerarquia` | 1h | ✅ 2026-09-11 |
| S13-4 | `packages/types`: enums `TipoAutorizacion`, `EstadoAutorizacion`, `SolicitudAltaEstado` + interfaces `Autorizacion`, `SolicitudAlta`, `RoleJerarquia` + DTOs | 1h | ✅ 2026-09-11 |
| S13-5 | Módulo `autorizaciones/`: helper `crearAutorizacion`, `GET /` (pendientes del rol), `GET /mis-pendientes` (count badge), `POST /:id/aprobar`, `POST /:id/rechazar` | 7h | ✅ 2026-09-11 |
| S13-6 | Módulo `solicitudes-alta/`: `POST /` (crea solicitud + autoriza), `GET /` (historial), `GET /:id`. Al aprobar: genera cargos + código | 5h | ✅ 2026-09-11 |
| S13-7 | Integrar en CPH: reemplazar `aprobarAutorizacionCphService` + `patchConcursoCphService` para usar `crearAutorizacion` | 3h | ✅ 2026-09-11 |
| S13-8 | Integrar en Bajas: `updateBajaService` agrega `crearNotificacion` al procesar (resolucion_a_la_firma → pendiente) | 1h | ✅ 2026-09-11 |

**Total backend estimado: ~23h**

## Tareas — Agustín (frontend) — espera S13-5 y S13-6

| # | Tarea | Dep. | Est. | Estado |
| - | ----- | ---- | ---- | ------ |
| S13-A | `AutorizacionesPage` (`/autorizaciones`) — tabla pendientes con Aprobar/Rechazar + modal observaciones | S13-5 | 10h | 🔴 Pendiente |
| S13-B | Badge autorizaciones en header (separado del de notificaciones) | S13-5 | 3h | 🔴 Pendiente |
| S13-C | Reemplazar `POST /concursos-cph/:id/autorizar` por `POST /autorizaciones/:id/aprobar` en wizard CPH | S13-5+S13-7 | 2h | 🔴 Pendiente |
| S13-D | Integrar `SolicitudAlta` en `/cargos/alta`: formulario crea solicitud (no cargo directo), historial muestra estado pendiente/aprobada/rechazada | S13-6 | 4h | 🔴 Pendiente |
| S13-E | `ConfiguracionJerarquiaPage` (`/configuracion/jerarquia`) — árbol de roles con relaciones jefe/subordinado. Solo admin puede editar | S13-3 | 8h | 🔴 Pendiente |

**Total frontend estimado: ~27h**

---

## Criterio de éxito

- Cada usuario ve en `/autorizaciones` solo las que le corresponden resolver según su rol
- Badge de autorizaciones en el header separado del de notificaciones
- Alta de cargo crea `SolicitudAlta` — el director aprueba y recién ahí se genera el `Cargo` con código
- Baja procesada genera notificación informativa al director (sin bloqueo)
- Flujo CPH usa `Autorizacion` genérico en vez de campos ad-hoc en `ConcursoCph`
- La jerarquía de roles es visible y editable por admin desde `/configuracion/jerarquia`
- Base lista para Sprint 14 (asignación de tareas jefe → subordinado)

## Dependencias

- S13-1/2/3/4 (schema + types) ✅ — bloquean todo lo demás
- S13-5 (módulo autorizaciones) bloquea S13-A, S13-B, S13-C
- S13-6 (módulo solicitudes-alta) bloquea S13-D
- S13-7 (integrar CPH) bloquea S13-C
- S13-E (jerarquía frontend) solo depende de S13-3 ✅ — puede arrancar cuando Agustín esté listo

## Nota sobre el flujo CPH existente

`aprobarAutorizacionCphService` en `concursos-cph.service.ts` implementa el flujo director → sgrasv directamente sobre `ConcursoCph` (campos `pendienteAutorizacion`/`aprobadoDirector`/`siglaSolicitada`). S13-7 **reemplaza** esa lógica por llamadas al módulo genérico de autorizaciones. Los campos en `ConcursoCph` se mantienen como cache de estado para el wizard frontend — se actualizan desde el service de autorizaciones al resolver, no se eliminan.

## Nota sobre Sprint 10 (Notificaciones) y Sprint 13

- Una autorización resuelta (aprobada/rechazada) genera una `Notificacion` al solicitante
- Los badges son separados: 🔔 notificaciones (ya existe) + nuevo badge de autorizaciones pendientes
- `crearNotificacion()` se reutiliza desde `autorizaciones.service.ts` — no se duplica lógica

---

## Migraciones aplicadas

| Migración | Descripción | Local | Neon |
| --------- | ----------- | ----- | ---- |
| `20260911000000_s13_autorizaciones` | Tabla `autorizaciones` + enums `TipoAutorizacion`/`EstadoAutorizacion` + permiso `autorizaciones.resolver_sgrasv` | ✅ | ✅ |
| `20260911000001_s13_solicitudes_alta` | Tabla `solicitudes_alta` + enum `SolicitudAltaEstado` + permisos `solicitudes-alta.ver/crear` | ✅ | ✅ |
| `20260911000002_s13_role_jerarquia` | Tabla `role_jerarquias` + seed: director→admin, editor→director, concursales_cph/ceetps→editor | ✅ | ✅ |
| `scripts/seed_autorizaciones_permisos.sql` | Permisos `autorizaciones.ver/resolver_director/resolver_sgrasv` + asignación a roles | ✅ | ✅ |
