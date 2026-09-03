# SPRINT 1 — Autenticación + usuarios + seed real

**Estado:** ✅ Completado
**Duración:** 1 semana | **Capacidad:** 60h
**Objetivo:** Login funcional con roles, usuarios reales en BD.

> S1-8 (seed hospitales/escalafones/admin) fue adelantado y completado en Sprint 0 como S0-9.

## Tareas

| #     | Tarea                                                         | Dev     | Est. | Prioridad  |     |
| ----- | ------------------------------------------------------------- | ------- | ---- | ---------- | --- |
| S1-1  | Completar `auth.service.ts`: login con bcrypt + JWT           | Jorge   | 4h   | 🔴 Crítico | ✅  |
| S1-2  | Refresh token: rotación + detección de reutilización          | Jorge   | 6h   | 🔴 Crítico | ✅  |
| S1-3  | Endpoint `POST /api/v1/auth/logout` — revocar token           | Jorge   | 2h   | 🔴 Crítico | ✅  |
| S1-4  | Middleware `authenticate` + `requireRole` integrados en rutas | Jorge   | 3h   | 🔴 Crítico | ✅  |
| S1-5  | CRUD usuarios: listar, crear, activar/desactivar (solo admin) | Agustin | 6h   | 🔴 Crítico | ✅  |
| S1-6  | LoginPage: conectar con API real, manejo de errores           | Agustin | 3h   | 🔴 Crítico | ✅  |
| S1-7  | ProtectedRoute: redirigir a /login si no autenticado          | Agustin | 2h   | 🔴 Crítico | ✅  |
| S1-8  | Seed: hospitales reales + escalafones + usuario admin inicial | Jorge   | 4h   | 🟡 Medio   | ✅  |
| S1-9  | Página Admin/Usuarios: tabla + formulario crear usuario       | Agustin | 6h   | 🟡 Medio   | ✅  |
| S1-10 | Audit log: middleware registra toda escritura automáticamente | Jorge   | 3h   | 🟡 Medio   | ✅  |

## Criterio de éxito

- Login con usuario/contraseña real funciona end-to-end ✅
- Refresh token rota correctamente ✅
- Admin puede crear usuarios con roles ✅
- Toda escritura queda en `audit_logs` ✅

## Hallazgos de revisión (Agustin, 2026-08-24)

| # | Hallazgo | Severidad | Estado |
| - | -------- | --------- | ------ |
| 1 | `audit_log` nunca escribía nada — `auditLog` corría como `preHandler` de raíz antes de que `authenticate` populara `request.user`. | 🔴 Alta | ✅ Corregido — `auditLog` pasó de `preHandler` a `onResponse` |
| 2 | Race condition en rotación de refresh token — `findUnique` + `update` no atómicos. | 🟡 Media | ✅ Corregido — `updateMany WHERE revocado = false` atómico |
| 3 | Timing side-channel en login — sin usuario no corre bcrypt, con usuario incorrecto sí. | 🟢 Baja | ✅ Corregido — siempre corre `bcrypt.compare` contra hash dummy |
| 4 | Multi-tab: dos pestañas refrescando simultáneamente pueden disparar detección de reutilización. | 🟢 Baja | ⏳ Limitación conocida — backlog B-9 |
