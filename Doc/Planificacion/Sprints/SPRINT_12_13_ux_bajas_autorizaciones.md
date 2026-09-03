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

# SPRINT 13 (planificado como "Sprint 12 — Panel de autorizaciones") — Panel de autorizaciones + jerarquía de roles

**Estado:** 📋 Planificado
**Duración:** 2 semanas | **Capacidad:** 120h | **Estimado:** 72h

> **Nota:** Este sprint fue planificado con el nombre "Sprint 12" en el documento original pero corresponde al Sprint 13 en la secuencia real (el Sprint 12 de UX ya está completo arriba).

## Objetivo

Panel de autorizaciones pendientes filtrado por perfil de usuario + modelo de jerarquía de roles (jefe/subordinado) como base para asignación de tareas futura.

## Contexto y decisiones de diseño

El sistema ya tiene Autorización planificada en Sprint 11 para el flujo concursal CPH (caratulación → director aprueba). Este sprint generaliza ese concepto: cualquier acción del sistema que requiera aprobación de un superior genera una Autorización tipificada, y cada usuario ve en su panel solo las que le corresponden según su rol.

### Tipos de autorización iniciales

| Tipo | Quien la genera | Quien la resuelve | Descripción |
| ---- | --------------- | ----------------- | ----------- |
| `concurso_cph` | `concursales_cph` al caratular | `director` | Autorización de apertura de concurso CPH (ya planificada en S11-2) |
| `baja_cargo` | `concursales_cph` / `concursales_ceetps` al registrar baja | `director` | Confirmación de baja antes de generar vacante |
| `alta_cargo` | `editor` al crear cargo manual | `director` | Validación de alta de cargo estructural |

### Jerarquía de roles — modelo `RoleJerarquia`

Un rol puede tener un rol superior (`rolPadreId`). Jerarquía inicial:

- `admin` → `editor` → `concursales_cph` / `concursales_ceetps`
- `director`: par del editor, resuelve autorizaciones
- `viewer`: sin subordinados

## Tareas

| #     | Tarea                                                                                                                                                                                                                                           | Dev             | Est. | Prioridad |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---- | --------- |
| S13-1 | Prisma: `model Autorizacion` (tipo, referenciaId, referenciaTipo, estado, solicitadoPorId, resolverPorRolId, resueltoPorId, observaciones) + enum `TipoAutorizacion` + enum `EstadoAutorizacion`. Migración `sprint12_autorizaciones`           | Jorge           | 4h   | 🔴 Crítico |
| S13-2 | Prisma: `model RoleJerarquia` (rolHijoId, rolPadreId) — tabla de relación simple, sin ciclos. Migración `sprint12_role_jerarquia`. Seed inicial con la jerarquía del sistema                                                                    | Jorge           | 3h   | 🔴 Crítico |
| S13-3 | Módulo `autorizaciones/`: `GET /api/v1/autorizaciones` (pendientes del usuario según su rol y jerarquía), `POST /:id/aprobar`, `POST /:id/rechazar`. Helper `crearAutorizacion(tx, tipo, referenciaId, solicitadoPorId)` para llamar desde otros services | Jorge           | 8h   | 🔴 Crítico |
| S13-4 | Integrar `crearAutorizacion` en: `createBajaService` (tipo `baja_cargo`), `createCargoService` (tipo `alta_cargo`). El de `concurso_cph` se integra en S11-2                                                                                    | Jorge           | 4h   | 🔴 Crítico |
| S13-5 | `GET /api/v1/autorizaciones/mis-pendientes`: cuenta de pendientes para el badge del header                                                                                                                                                        | Jorge           | 2h   | 🟡 Medio   |
| S13-6 | Frontend: `AutorizacionesPage` (`/autorizaciones`) — tabla de pendientes filtrada por perfil. Columnas: tipo, referencia (link al objeto), solicitado por, fecha, días pendiente. Botones Aprobar/Rechazar con modal de observaciones           | Agustin         | 10h  | 🔴 Crítico |
| S13-7 | Frontend: badge de pendientes en el header (reutiliza patrón de notificaciones S10-3)                                                                                                                                                           | Agustin         | 3h   | 🟡 Medio   |
| S13-8 | Frontend: `ConfiguracionJerarquiaPage` (`/configuracion/jerarquia`) — visualización del árbol de roles con sus relaciones jefe/subordinado. Solo admin puede editar                                                                             | Agustin         | 8h   | 🟢 Bajo    |
| S13-9 | Verificación end-to-end: `concursales_cph` registra baja → autorización pendiente → director aprueba → baja confirmada. Verificar que `viewer`/`concursales_ceetps` no ven autorizaciones de CPH                                               | Jorge + Agustin | 4h   | 🔴 Crítico |

## Criterio de éxito

- Cada usuario ve en `/autorizaciones` solo las que le corresponden resolver según su rol
- Badge en el header muestra el conteo de pendientes propios
- Registrar una baja o alta de cargo genera automáticamente la autorización correspondiente
- La jerarquía de roles es visible y editable por admin desde `/configuracion/jerarquia`
- Base lista para Sprint 14 (asignación de tareas jefe → subordinado)

## Dependencias

- S13-1 y S13-2 (schema) bloquean todo lo demás
- S13-3 (módulo autorizaciones) bloquea S13-4, S13-5, S13-6, S13-7
- Sprint 11 (S11-2) integra `crearAutorizacion` para concursos CPH — puede hacerse en paralelo con S13-4 una vez que S13-3 esté listo
- S13-8 es independiente, puede hacerse en cualquier momento del sprint

## Nota sobre Sprint 10 (Notificaciones) y Sprint 13

Las notificaciones (S10) y las autorizaciones (S13) son conceptos distintos pero relacionados:

- Una autorización resuelta (aprobada/rechazada) genera una notificación al solicitante
- El badge del header puede unificar ambos conteos o mostrarlos separados — decidir al implementar S13-7
- Por eso Sprint 10 va antes: el sistema de notificaciones es la infraestructura que Sprint 13 usa para avisar al solicitante del resultado
