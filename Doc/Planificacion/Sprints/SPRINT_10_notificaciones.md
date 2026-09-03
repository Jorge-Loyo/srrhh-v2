# SPRINT 10 — Notificaciones persistidas

**Estado:** ✅ Completo — 2026-09-04
**Duración:** 1 semana | **Capacidad:** 60h | **Estimado:** 25h

## Objetivo

Entidad `Notificacion` persistida + badge de no leídas en el header + bandeja.

## Decisiones de diseño

| Pregunta | Decisión |
| -------- | --------- |
| Tipos de `TipoNotificacion` | `concurso_estancado`, `baja_pendiente`, `autorizacion_pendiente`, `autorizacion_resuelta` |
| Destinatarios | Por rol (`rolSlug`) — cada tipo va al rol que corresponde según el flujo de autorización |
| S10-5 alertas de estancamiento | On-demand: se materializan al listar notificaciones, sin cron job |

## Tareas

| #     | Tarea                                                                                                              | Dev     | Est. | Prioridad | Estado |
| ----- | ------------------------------------------------------------------------------------------------------------------ | ------- | ---- | --------- | ------ |
| S10-1 | Prisma: `model Notificacion` + enum `TipoNotificacion`; migración `sprint10_notificaciones`                        | Jorge   | 3h   | 🟡 Medio  | ✅ |
| S10-2 | Módulo `notificaciones/`: `GET /` (paginado, propias), `PATCH /:id/leer`, `PATCH /leer-todas`; helpers de creación | Jorge   | 6h   | 🟡 Medio  | ✅ |
| S10-3 | Frontend: badge con contador de no leídas en el header                                                             | Agustin | 4h   | 🟡 Medio  | ✅ |
| S10-4 | Bandeja `/notificaciones` (listado paginado, filtros por tipo/leídas, marcar como leídas)                          | Agustin | 6h   | 🟡 Medio  | ✅ |
| S10-5 | Backend: materializar alertas de estancamiento de concursos (>30/60/90 días, anti-duplicados por `origenKey`)      | Jorge   | 6h   | 🟢 Bajo   | ✅ |

## Archivos modificados

| Archivo | Cambio |
| ------- | ------ |
| `prisma/schema.prisma` | Enum `TipoNotificacion` + `model Notificacion` con `origenKey` único para deduplicación |
| `prisma/migrations/20260904000000_sprint10_notificaciones/migration.sql` | `CREATE TYPE` + `CREATE TABLE notificaciones` + índices |
| `packages/types/src/index.ts` | `TipoNotificacion`, `Notificacion`, `NotificacionFilters` |
| `apps/api/src/modules/notificaciones/notificaciones.service.ts` | `crearNotificacion`, `listNotificacionesService`, `countNoLeidasService`, `marcarLeidaService`, `marcarTodasLeidasService`, `materializarAlertasEstancamiento` |
| `apps/api/src/modules/notificaciones/notificaciones.schema.ts` | Zod schema para query params |
| `apps/api/src/modules/notificaciones/notificaciones.routes.ts` | 4 endpoints: `GET /`, `GET /no-leidas`, `PATCH /leer-todas`, `PATCH /:id/leer` |
| `apps/api/src/app.ts` | Registro del módulo en `/api/v1/notificaciones` |
| `apps/web/src/modules/notificaciones/hooks/useNotificaciones.ts` | `useNotificacionesNoLeidas`, `useNotificaciones`, `useMarcarLeida`, `useMarcarTodasLeidas` |
| `apps/web/src/modules/notificaciones/pages/NotificacionesPage.tsx` | Bandeja con filtros, paginación, marcar leídas |
| `apps/web/src/shared/components/layout/AppShell.tsx` | Badge 🔔 en el header con contador de no leídas, link a `/notificaciones` |
| `apps/web/src/app/router.tsx` | Ruta `/notificaciones` |

## Regla de negocio — destinatarios por tipo

| Tipo | Rol destinatario | Cuándo se crea |
| ---- | ---------------- | -------------- |
| `concurso_estancado` | `concursales_cph` / `concursales_ceetps` | Al listar notificaciones (on-demand), si el concurso lleva >30/60/90 días sin movimiento |
| `baja_pendiente` | `concursales_cph` / `concursales_ceetps` | Al registrar una baja con `generaConcurso: false` y estado `pendiente` |
| `autorizacion_pendiente` | `director` | Al crear una autorización que requiere resolución del director |
| `autorizacion_resuelta` | Solicitante original | Al aprobar o rechazar una autorización |

## Criterio de éxito

- `Notificacion` se crea desde eventos del backend ✅
- Badge de no leídas visible en el header; la bandeja marca de a una o todas ✅
- Alertas de estancamiento generan notificación al rol correspondiente ✅
- Anti-duplicados por `origenKey` ✅
