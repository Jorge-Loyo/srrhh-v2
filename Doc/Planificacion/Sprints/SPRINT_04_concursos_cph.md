# SPRINT 4 — Concursos CPH

**Estado:** ✅ Completo — verificado end-to-end con datos reales 2026-08-26
**Duración:** 2 semanas | **Capacidad:** 120h
**Objetivo:** Módulo de seguimiento CPH completamente funcional.

## Tareas

| #     | Tarea                                                         | Dev     | Est. | Prioridad  |     |
| ----- | ------------------------------------------------------------- | ------- | ---- | ---------- | --- |
| S4-1  | `GET /api/v1/concursos-cph` paginado con filtros              | Jorge   | 5h   | 🔴 Crítico | ✅  |
| S4-2  | `GET /api/v1/concursos-cph/:id` detalle completo              | Jorge   | 3h   | 🔴 Crítico | ✅  |
| S4-3  | `PATCH /api/v1/concursos-cph/:id` actualizar campos por fase  | Jorge   | 6h   | 🔴 Crítico | ✅  |
| S4-4  | Lógica `calcSubEstado`: 18 niveles calculados automáticamente | Jorge   | 8h   | 🔴 Crítico | ✅  |
| S4-5  | `POST /api/v1/concursos-cph/:id/suspender`                    | Jorge   | 2h   | 🟡 Medio   | ✅  |
| S4-6  | `POST /api/v1/concursos` crear concurso desde baja            | Jorge   | 4h   | 🔴 Crítico | ✅  |
| S4-7  | ConcursosCphPage: tabla con sub-estado, filtros, alertas      | Agustin | 10h  | 🔴 Crítico | ✅  |
| S4-8  | ConcursoCphDetail: formulario completo por fases              | Agustin | 12h  | 🔴 Crítico | ✅  |
| S4-9  | Timeline visual del sub-estado (barra de progreso)            | Agustin | 6h   | 🟡 Medio   | ✅  |
| S4-10 | Alertas: concursos sin movimiento > 30/60/90 días             | Agustin | 4h   | 🟡 Medio   | ✅  |
| S4-11 | `GET /api/v1/kpis/concursos-cph` para tablero                 | Jorge   | 4h   | 🟡 Medio   | ✅  |

## Criterio de éxito

- Sub-estado calculado automáticamente, no editable manualmente ✅
- Alexis/CPH puede ver y actualizar todos sus concursos ✅
- Alertas visibles para concursos estancados ✅
- KPIs disponibles para el tablero ✅

## Notas de implementación

- `calcSubEstado` es puerto TypeScript de `calcEstado`/`calcSubEstado`/`calcSubEstado3` del legacy (`dotacion-rrhh`), mismos 19 niveles y nombres (`Q-DESIERTO` ... `NO INICIADO`).
- Backend es única fuente de verdad: schema Zod con `.strict()` — `estado`/`subEstado`/`subEstado3` no aceptados en el body del PATCH.
- `subEstado3` tiene dos ramas que comparan contra la fecha de hoy — se recalcula en vivo con `SUB_ESTADO_3_SQL_PG` en listado y KPIs.
- Partial unique index en BD: `CREATE UNIQUE INDEX ... WHERE estado NOT IN ('finalizado', 'desierto')` — evita dos concursos CPH abiertos para el mismo cargo.

## Hallazgos de revisión (backend)

| # | Hallazgo | Severidad | Fix |
| - | -------- | --------- | --- |
| 1 | `suspenderConcursoCphService` podía "des-finalizar" un concurso cerrado | 🔴 Alta | Guard explícito: 409 si `estado` es `finalizado` o `desierto` |
| 2 | Bypass de rol en `POST /concursos` — `concursales_ceetps` podía crear concurso CPH | 🔴 Alta | Validación en handler: 403 si tipo no corresponde al rol |
| 3 | Race condition en guard de duplicados CPH — `findFirst` + `create` no atómicos | 🟡 Media | Partial unique index en BD como backstop atómico |
| 4 | `sorteoJurado` es fecha pero no arranca con `fecha` — heurística de conversión fallaba | 🟢 Baja (runtime) | `Set` explícito de los 14 campos de fecha del PATCH |
