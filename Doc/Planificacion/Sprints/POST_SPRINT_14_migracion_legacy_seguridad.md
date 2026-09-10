# POST-SPRINT 14 — Migración de funcionalidad legacy: Seguridad (Tokens + Auditoría)

**Fecha:** 2026-09-09 | **Autor:** Agustín + Claude
**Rama:** `deploy` (sin commitear todavía)

---

## Contexto

Cuarto ítem migrado de `dotacion-rrhh` a v2. El módulo legacy "Seguridad" tenía 5 pantallas
(`frontend/src/pages/seguridad/`); de las 4 en alcance (Auditoría, Tokens, Usuarios, Permisos —
"Carga de Datos" quedó afuera), **Usuarios y Permisos ya estaban migrados** en v2 (más avanzados
que el legacy: roles/permisos dinámicos vía `apps/web/src/modules/usuarios/` y
`apps/web/src/modules/configuracion/`) — **no se tocaron**. Este documento cubre los dos gaps
reales: **Tokens** y **Auditoría**, ambos en 0% antes de esta sesión (sin endpoint de lectura, sin
pantalla).

---

## Etapa 1 — Tokens

Lista de refresh tokens de sesión (confirmado en ambos lados: no hay ni hubo API keys/tokens de
integración en este proyecto).

- **Backend** `apps/api/src/modules/tokens/` — `GET /`, `PATCH /:id/revocar`,
  `PATCH /usuario/:usuarioId/revocar-todos`. Reutiliza el permiso `configuracion.gestionar_usuarios`
  ya existente (gestionar sesiones es la misma responsabilidad que gestionar usuarios) — **no se
  creó ningún permiso nuevo para esta etapa**.
- **Frontend** `apps/web/src/modules/tokens/` — `TokensPage.tsx`, ruta `/configuracion/tokens`
  (mismo `RequirePermiso` que ya envuelve `/configuracion/usuarios`), subitem "Tokens" en el grupo
  Configuración del sidebar.
- **Simplificación consciente**: `RefreshToken` en v2 no tiene campo de "último uso" (el legacy sí)
  — se omitió en vez de agregar una migración solo para esto.

## Etapa 2 — Auditoría

- **Middleware enriquecido** (`apps/api/src/shared/middleware/audit.middleware.ts`, decisión
  explícita del usuario: hacerlo ahora, no dejarlo para después):
  - `accion` pasó de ser el verbo HTTP crudo (`post`/`patch`/`put`/`delete`) a nombres de negocio
    (`login_success`/`login_fail`/`logout`/`refresh`/`create`/`update`/`delete`/`token_revoke`/
    `purge`), igual que el legacy.
  - `cambios` (antes siempre `null`) ahora guarda `{status, body}` con el body de la request
    enmascarado (`password`/`passwordHash`/`token`/`refreshToken`/`authorization` → `***`) y
    truncado a 4000 caracteres — mismo criterio que el middleware legacy.
  - **Cambio de comportamiento importante**: antes el middleware solo grababa si `request.user`
    estaba poblado, así que `login`/`logout`/`refresh` (rutas de `auth`, sin `authenticate`) **nunca
    se auditaban**. Ahora esas 3 rutas se auditan igual con `usuarioId: null` (el intento de login
    importa tanto como lo que hace un usuario ya adentro) — el resto de las rutas de escritura sigue
    exigiendo usuario autenticado.
  - Se agregó `try/catch` alrededor del `prisma.auditLog.create` — antes no existía, un fallo ahí
    podía propagarse. Ahora es best-effort silencioso, mismo criterio que el legacy.
- **Backend nuevo** `apps/api/src/modules/auditoria/` — `GET /` (filtros: `accion`, `entidad`,
  `usuarioId`, rango `desde`/`hasta`) y `POST /purgar` (body `{dias}`, default 180 — el legacy tenía
  una inconsistencia entre 180 días en la purga manual y 30 en el scheduler automático; v2 usa un
  solo número y **no tiene scheduler automático todavía**, solo purga manual).
- **2 permisos nuevos** (a propósito separados, ver vs. destruir historial son capacidades
  distintas): `configuracion.ver_auditoria` y `configuracion.purgar_auditoria` —
  `scripts/seed_auditoria_permisos.sql`. **No corrido todavía en ningún entorno.**
- **Frontend** `apps/web/src/modules/auditoria/` — `AuditoriaPage.tsx`: tabla con filas expandibles
  (muestra `cambios` como JSON crudo, sin reconstruir el diff visual campo-por-campo del legacy —
  mejora futura opcional si hace falta), filtros por acción/entidad/rango de fechas, botón "Purgar
  logs" gateado por `purgar_auditoria`. Ruta `/configuracion/auditoria`, subitem nuevo en
  Configuración.

---

## Verificación hecha

- `tsc --noEmit` limpio en `apps/api` y `apps/web` después de cada etapa.
- **No se corrió contra datos reales ni se probó la UI en navegador** — no se levantó el stack en
  esta sesión. Solo verificación de tipos.

---

## Pendiente (para Jorge, antes/durante el merge)

| # | Pendiente | Bloqueante |
|---|---|---|
| 1 | Correr `scripts/seed_auditoria_permisos.sql` en local y en Neon/producción, y asignar `ver_auditoria`/`purgar_auditoria` a los roles que corresponda desde Configuración → Permisos | Sí para Auditoría — sin esto nadie ve esa pantalla ni puede purgar |
| 2 | Tokens **no necesita ningún seed nuevo** (reusa `gestionar_usuarios`, ya asignado a los roles que ya administran usuarios) | — |
| 3 | Probar contra datos reales / UI real en Docker — en particular confirmar que `login_success`/`login_fail` quedan bien registrados ahora que `auth.*` se audita sin `request.user` (camino nuevo, no ejercitado con Postgres real todavía) | No bloqueante para mergear, sí para darlo por terminado |
| 4 | Decidir si se quiere un scheduler automático de purga de auditoría (como tenía el legacy, cada 24h) o si la purga manual alcanza por ahora | Decisión de producto, no bloqueante |
| 5 | Commitear y mergear — mismo cuidado que en `POST_SPRINT_14_migracion_legacy_dotacion.md`: separar de cualquier otro trabajo sin commitear que haya quedado en `deploy` ajeno a esta tarea | Sí |
| 6 | No hizo falta ninguna migración de Prisma (solo se agregó lógica sobre `AuditLog`/`RefreshToken`, ya existentes) | — |
