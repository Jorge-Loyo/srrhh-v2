# SPRINT 17 — Bajas SGRASV: flujo correcto + vinculación automática al padrón

**Estado:** 📋 Planificado
**Fecha estimada de inicio:** 2026-09
**Autores:** Jorge (backend) + Agustín (frontend)
**Rama:** `jorge` / `agustin` según tarea

---

## Objetivo

Corregir el modelo de bajas para reflejar la realidad administrativa:

1. **SGRASV es el dueño del flujo de bajas** — no el director. Quien crea la baja
   ya tiene la potestad, por lo tanto no necesita autorización de nadie.
2. **Una baja cargada en el sistema puede iniciar un concurso de inmediato** — sin
   esperar que el archivo semanal la confirme.
3. **Vinculación automática al padrón** — cuando llega el archivo semanal y detecta
   un `eliminado` para un cargo que ya tiene baja confirmada en el sistema, se vincula
   automáticamente sin pasar por `validacion_vacante`.
4. **Vista de estado de vinculación** — SGRASV puede ver qué bajas ya están
   respaldadas por el archivo oficial y cuáles todavía no.

---

## Contexto: qué está mal hoy

### Problema 1 — Autorización incorrecta

`createBajaService` crea una `Autorizacion` para el rol `director` y deja la baja en
estado `pendiente`. Esto es incorrecto: el director no tiene potestad sobre bajas.
La potestad es de SGRASV (y sus roles hijos). Como SGRASV es quien crea la baja,
no tiene sentido que se autorice a sí mismo — la baja debe nacer `confirmada`.

### Problema 2 — Concurso bloqueado hasta que el director aprueba

Como la baja nace `pendiente`, el concurso asociado queda en un limbo administrativo.
En la práctica, SGRASV ya procesó la documentación y puede iniciar el concurso
inmediatamente — no hay razón para esperar.

### Problema 3 — El padrón no sabe que la baja ya existe

Cuando `aprobarSnapshotService` procesa un `eliminado`, siempre pone el cargo en
`validacion_vacante` para que el operador confirme manualmente. Si SGRASV ya cargó
la baja días o semanas antes, ese paso es redundante e incorrecto — el estado del
cargo ya está definido en el sistema.

### Problema 4 — No hay visibilidad del estado de vinculación

No existe ninguna vista que muestre qué bajas cargadas manualmente ya fueron
respaldadas por el archivo semanal y cuáles todavía están "en trámite" esperando
que el padrón las confirme.

---

## Modelo correcto

### Flujo completo

```
SGRASV carga baja (renuncia / jubilación / otro motivo con documentación)
  → baja nace confirmada (sin autorización — SGRASV ya tiene la potestad)
  → cargo pasa a no_vigente (sin concurso) o vigente (con concurso)
  → si generaConcurso: concurso se puede iniciar de inmediato
  → baja queda sin vincular al padrón (padronVinculadoAt = null)
       ↓
Llega archivo semanal → diff detecta eliminado para ese cargo
  → busca baja confirmada para ese cargoId
  → si existe: vincula (padronVinculadoAt = fecha snapshot, snapshotVinculadoId = id)
               cargo NO pasa por validacion_vacante — ya está definido
  → si no existe: flujo normal → validacion_vacante (operador confirma/rechaza)
```

### Separación de responsabilidades

| Acción | Rol | Cambio |
|--------|-----|--------|
| Crear/gestionar bajas | SGRASV y roles hijos | Sin cambio de rol — sí cambia que nace `confirmada` |
| Autorizar altas de cargo | Director | Sin cambio |
| Autorizar modificaciones de concurso (sigla/puesto) | Director | Sin cambio |
| Confirmar/rechazar `validacion_vacante` | Operador | Solo para eliminados sin baja previa |
| Ver estado de vinculación de bajas | SGRASV | Nueva vista |

### Estados de `Baja` después del sprint

| Estado | Significado |
|--------|-------------|
| `resolucion_a_la_firma` | Borrador — no toca el cargo ni crea concurso |
| `confirmada` | SGRASV la procesó — cargo ya cambió de estado, concurso puede iniciarse |
| `anulada` | Baja anulada (caso excepcional, a evaluar a futuro) |

`pendiente` **se elimina del flujo normal** — ya no se usa para bajas creadas por
SGRASV. Se mantiene en el enum por compatibilidad con datos existentes hasta que
se defina la migración.

---

## Tareas

| # | Tarea | Dev | Est. | Prioridad |
|---|-------|-----|------|-----------|
| S17-1 | Schema: campo `padronVinculadoAt` (Date nullable) + `snapshotVinculadoId` (FK nullable → `PadronSnapshot`) en `Baja`. Migración. | Jorge | 1h | 🔴 |
| S17-2 | Fix `createBajaService`: eliminar `crearAutorizacion` a `director`. Baja nace `confirmada` directamente (no `pendiente`). Borrador (`resolucion_a_la_firma`) sin cambios. | Jorge | 1h | 🔴 |
| S17-3 | Fix `aprobarSnapshotService` (paso 5 — eliminados): antes de poner `validacion_vacante`, buscar baja `confirmada` para ese `cargoId`. Si existe → vincular (`padronVinculadoAt`, `snapshotVinculadoId`) y saltear `validacion_vacante`. Si no existe → flujo normal. | Jorge | 2h | 🔴 |
| S17-4 | Fix `updateBajaService`: mismo ajuste que S17-2 para el path de confirmación desde borrador. | Jorge | 0.5h | 🔴 |
| S17-5 | Backend: endpoint `GET /bajas/vinculacion` — listado de bajas `confirmada` con estado de vinculación (`vinculada` / `sin_vincular`), días transcurridos desde creación, datos del snapshot vinculado si existe. | Jorge | 1.5h | 🔴 |
| S17-6 | Frontend: vista "Estado de vinculación de bajas" para SGRASV — tabla con filtros (vinculada / sin vincular / hospital), badge de días sin vincular, link al concurso asociado si existe. | Agustín | 4h | 🔴 |
| S17-7 | Fix guards en módulos que bloquean por `baja.estado === 'pendiente'`: revisar `concursos.service.ts`, `autorizaciones.service.ts` y cualquier guard que dependa del estado de la baja para permitir o bloquear acciones. | Jorge | 1h | 🟡 |
| S17-8 | Verificación end-to-end: SGRASV carga baja → concurso iniciado → padrón llega → vinculación automática → vista muestra estado correcto. | Jorge + Agustín | 2h | 🔴 |

**Total estimado**: ~13h

---

## Dependencias entre tareas

```
S17-1 ──► S17-3
S17-2 ──► S17-4
S17-2 + S17-4 ──► S17-7
S17-1 + S17-5 ──► S17-6
Todo ──► S17-8
```

---

## Cambios en el schema

```prisma
model Baja {
  // ... campos existentes ...

  // S17: vinculación al archivo semanal
  padronVinculadoAt   DateTime?      @map("padron_vinculado_at") @db.Timestamptz
  snapshotVinculadoId String?        @map("snapshot_vinculado_id") @db.Uuid

  snapshotVinculado   PadronSnapshot? @relation(fields: [snapshotVinculadoId], references: [id])
}
```

Y en `PadronSnapshot`:
```prisma
model PadronSnapshot {
  // ... campos existentes ...
  bajasVinculadas Baja[]
}
```

---

## Lógica de vinculación en `aprobarSnapshotService`

Paso 5 actual (eliminados) — pseudocódigo del cambio:

```typescript
// Para cada cargo que quedaría sin ocupación vigente:
const bajasConfirmadas = await tx.baja.findMany({
  where: {
    cargoId: { in: cargosAValidacion },
    estado: 'confirmada',
    snapshotVinculadoId: null,  // aún no vinculada
  },
  select: { id: true, cargoId: true },
})

const cargosBajaConfirmada = new Set(bajasConfirmadas.map(b => b.cargoId))

// Vincular bajas existentes — estos cargos saltan validacion_vacante
await tx.baja.updateMany({
  where: { id: { in: bajasConfirmadas.map(b => b.id) } },
  data: { padronVinculadoAt: new Date(), snapshotVinculadoId: id },
})

// Solo van a validacion_vacante los que NO tienen baja confirmada
const cargosRealmenteAValidacion = cargosAValidacion
  .filter(cid => !cargosBajaConfirmada.has(cid))

// Los que tienen baja confirmada ya están en no_vigente o vigente — no tocar
```

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | `padronVinculadoAt`, `snapshotVinculadoId` en `Baja`; relación en `PadronSnapshot` |
| `prisma/migrations/20260923000000_s17_baja_vinculacion/` | Migración nueva |
| `apps/api/src/modules/bajas/bajas.service.ts` | `createBajaService` sin `crearAutorizacion`, baja nace `confirmada`; `updateBajaService` ídem; nuevo `listVinculacionService` |
| `apps/api/src/modules/bajas/bajas.routes.ts` | `GET /vinculacion` |
| `apps/api/src/modules/padron/padron.service.ts` | `aprobarSnapshotService` paso 5 — lógica de vinculación automática |
| `packages/types/src/index.ts` | Tipo `BajaVinculacion`, campo `padronVinculadoAt`/`snapshotVinculadoId` en `Baja` |
| `apps/web/src/modules/bajas/pages/BajaCargosPage.tsx` o nueva página | Vista de estado de vinculación |
| `apps/web/src/modules/bajas/hooks/useBajas.ts` | Hook para `GET /bajas/vinculacion` |

---

## Criterio de éxito

- [ ] Baja creada por SGRASV nace `confirmada` — sin autorización pendiente
- [ ] Concurso puede iniciarse inmediatamente después de crear la baja
- [ ] Padrón con `eliminado` para cargo con baja confirmada → vincula automáticamente, no crea `validacion_vacante`
- [ ] Padrón con `eliminado` para cargo sin baja previa → flujo normal `validacion_vacante`
- [ ] Vista de vinculación muestra correctamente bajas vinculadas vs sin vincular
- [ ] Director no recibe autorizaciones de bajas
- [ ] Sin regresiones en autorizaciones de altas de cargo y modificaciones de concurso

---

## Notas

- **`pendiente` en el enum `EstadoBaja`** se mantiene por compatibilidad con datos
  existentes. Las bajas que hoy están en `pendiente` (creadas con el flujo viejo)
  se migran a `confirmada` si el director ya las aprobó, o se evalúan caso a caso.
  No se elimina el valor del enum en este sprint.
- **Bajas desde `validacion_vacante`** (confirmadas por el operador desde la pantalla
  de validación) no pasan por `createBajaService` — ese flujo usa
  `confirmarValidacionService` directamente. No se toca en este sprint.
- **Roles hijos de SGRASV**: la restricción de visibilidad (solo SGRASV y roles hijos
  ven bajas) se implementa en un sprint posterior cuando se mapee la jerarquía de
  roles completa. En este sprint solo se corrige el flujo de autorización.
- **`anulada`**: el caso de anular una baja ya confirmada (error del operador) se
  evalúa a futuro — no está en scope de este sprint.
- **Vinculación por `cargoId`**: la clave de vinculación es `cargoId` (no `personaId`
  ni `cuil`) porque el cargo es la entidad estructural estable. Una persona puede
  tener múltiples cargos; el cargo identifica unívocamente la vacante.
