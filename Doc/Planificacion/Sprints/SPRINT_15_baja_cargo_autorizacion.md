# SPRINT 15 — Autorización de Baja de Cargo

**Estado:** 🔄 En curso
**Fecha:** 2026-09
**Autor:** Jorge (backend) + Agustín (frontend)
**Rama:** `jorge`

---

## Objetivo

Cerrar el flujo de baja de cargo: hoy las bajas quedan en estado `pendiente` para siempre porque
`confirmada` y `anulada` nunca se escriben desde ningún código. Este sprint implementa la
autorización del director como **sello posterior** (Opción A): la baja ya es efectiva al
registrarla (cargo → `no_vigente`, concurso creado si corresponde), y la confirmación del director
es un trámite que deja rastro pero no revierte nada.

---

## Decisión de diseño: sello posterior (Opción A)

La baja produce sus efectos reales en el momento de registrarse (`pendiente`):
- Cargo → `no_vigente`
- Concurso creado si `generaConcurso: true`

La autorización del director es **posterior y no bloqueante**: aprueba o rechaza para dejar
trazabilidad, pero no puede deshacer el efecto ya producido. Si rechaza, la baja queda en
`anulada` como registro histórico y el cargo vuelve a `vigente` (corrección administrativa).

**Por qué esta opción y no el gate previo:**
- El gate previo requeriría mover los efectos reales (cargo + concurso) al momento de aprobación,
  lo que implica reescribir `createBajaService` de forma significativa y romper el flujo actual.
- En la práctica administrativa, la baja ya ocurrió en el mundo real (la persona se fue) — el
  sistema solo la registra. Bloquear el registro hasta que el director apruebe no refleja la
  realidad del proceso.
- El sello posterior es consistente con cómo funciona la notificación informativa que ya existe
  (S13-8): el director ya recibe aviso, solo falta darle la capacidad de resolver.

---

## Flujo completo post-sprint

```
OPERADOR en /cargos/baja/nueva
  └─[Registrar baja]──► Baja.estado = 'pendiente'
                         cargo → no_vigente
                         concurso creado (si generaConcurso)
                         crearAutorizacion('baja_cargo', bajaId, 'baja', 'director')
                         crearNotificacion(autorizacion_pendiente, rolSlug: 'director')

DIRECTOR en /autorizaciones
  ├── APROBAR
  │     ↓ Autorizacion.estado = 'aprobada'
  │     ↓ Baja.estado = 'confirmada'
  │     ↓ crearNotificacion(autorizacion_resuelta, solicitante)
  │
  └── RECHAZAR (corrección administrativa)
        ↓ Autorizacion.estado = 'rechazada'
        ↓ Baja.estado = 'anulada'
        ↓ cargo → vigente (se revierte)
        ↓ crearNotificacion(autorizacion_resuelta, solicitante)
```

---

## Tareas

| #     | Tarea | Dev | Est. | Prioridad |
| ----- | ----- | --- | ---- | --------- |
| S15-1 | Agregar `baja_cargo` a enum `TipoAutorizacion` en schema Prisma. Migración `20260900000000_s15_baja_cargo_autorizacion` | Jorge | 1h | 🔴 Crítico |
| S15-2 | `createBajaService`: al crear la baja (estado `pendiente`), llamar a `crearAutorizacion('baja_cargo', bajaId, 'baja', 'director')`. La notificación informativa de S13-8 se reemplaza por `autorizacion_pendiente` (mismo efecto, más consistente) | Jorge | 2h | 🔴 Crítico |
| S15-3 | `_aprobarBajaCargo(autorizacion, tx)` en `autorizaciones.service.ts`: `Baja.estado = 'confirmada'` | Jorge | 2h | 🔴 Crítico |
| S15-4 | `_rechazarBajaCargo(autorizacion, tx)` en `autorizaciones.service.ts`: `Baja.estado = 'anulada'` + `cargo → vigente` | Jorge | 2h | 🔴 Crítico |
| S15-5 | Conectar S15-3/S15-4 al dispatcher de `POST /autorizaciones/:id/aprobar` y `POST /autorizaciones/:id/rechazar` (mismo patrón que `alta_cargo` y `concurso_cph`) | Jorge | 1h | 🔴 Crítico |
| S15-6 | `BajaCargosPage`: columna **Estado** con badge `Pendiente` (naranja) / `Confirmada` (verde) / `Anulada` (rojo). Hoy los badges existen pero los estados nunca cambian | Agustín | 2h | 🔴 Crítico |
| S15-7 | `AutorizacionesPage`: las autorizaciones de tipo `baja_cargo` muestran en el panel de detalle el cargo, hospital y motivo de la baja (igual que `alta_cargo` muestra los datos de la solicitud) | Agustín | 3h | 🟡 Medio |
| S15-8 | Verificación end-to-end: registrar baja → aparece en `/autorizaciones` del director → aprobar → baja pasa a `confirmada` → rechazar → baja pasa a `anulada` + cargo vuelve a `vigente` | Jorge + Agustín | 2h | 🔴 Crítico |

---

## Dependencias

```
S15-1 (migración enum) ──► S15-2 (createBajaService)
                        ──► S15-3 (_aprobarBajaCargo)
                        ──► S15-4 (_rechazarBajaCargo)
S15-3 + S15-4 ──► S15-5 (dispatcher)
S15-5 ──► S15-8 (verificación)
S15-2 ──► S15-6 (frontend estado)
S15-5 ──► S15-7 (frontend detalle autorizacion)
Todo ──► S15-8
```

---

## Archivos a modificar

| Archivo | Cambio |
| ------- | ------ |
| `prisma/schema.prisma` | `TipoAutorizacion` enum: agregar `baja_cargo` |
| `prisma/migrations/20260900000000_s15_baja_cargo_autorizacion/` | `ALTER TYPE` |
| `apps/api/src/modules/bajas/bajas.service.ts` | `createBajaService`: agregar `crearAutorizacion` |
| `apps/api/src/modules/autorizaciones/autorizaciones.service.ts` | `_aprobarBajaCargo`, `_rechazarBajaCargo`, dispatcher |
| `packages/types/src/index.ts` | `TipoAutorizacion.BAJA_CARGO` |
| `apps/web/src/modules/bajas/pages/BajaCargosPage.tsx` | Badges de estado reales |
| `apps/web/src/modules/autorizaciones/pages/AutorizacionesPage.tsx` | Panel detalle para `baja_cargo` |

---

## Criterio de éxito

- [ ] Una baja registrada genera automáticamente una autorización pendiente para el director
- [ ] El director ve la baja en `/autorizaciones` con datos del cargo y motivo
- [ ] Aprobar → baja pasa a `confirmada`
- [ ] Rechazar → baja pasa a `anulada` + cargo vuelve a `vigente`
- [ ] `BajaCargosPage` muestra los estados reales (no siempre `pendiente`)
- [ ] El flujo existente de baja (cargo → `no_vigente`, concurso) no se rompe

---

## Notas

- `packages/types`: `TipoAutorizacion` es un `const` object (no enum TS) desde el fix de Node 22
  en Post-Sprint 9 — agregar `BAJA_CARGO: 'baja_cargo'` siguiendo el mismo patrón.
- El rechazo revierte el cargo a `vigente` pero **no cancela el concurso** si ya se creó. Si el
  director rechaza una baja que ya generó concurso, ese concurso queda huérfano. Decisión: dejarlo
  así por ahora — es un caso edge que requiere una decisión de negocio aparte (¿se cancela el
  concurso automáticamente? ¿se notifica al equipo CPH/CEETPS?). Documentar en el código con un
  `// TODO: si hay concurso asociado, notificar o cancelar según regla de negocio`.
- La notificación informativa de S13-8 (`baja_pendiente` al director) se reemplaza por
  `autorizacion_pendiente` — mismo destinatario, más consistente con el resto del flujo.
  Verificar que no queden dos notificaciones al director por la misma baja.
