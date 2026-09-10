# SPRINT 19 — Retenciones: vencimientos, renovación, comisión y vista de conducción

**Estado:** 📋 Planificado
**Fecha estimada de inicio:** 2026-09 (después de merge Sprint 18)
**Autores:** Jorge (backend) + Agustín (frontend)
**Rama:** `jorge` / `agustin` según tarea
**Prerequisito:** Sprint 18 mergeado a `main`

---

## Objetivo

Implementar los flujos 🟡 del `Contrato_Retenciones.md` que quedaron fuera del Sprint 18:

1. **Notificaciones automáticas** 90/30 días antes del vencimiento de períodos de conducción (TTR).
2. **Vista de vencimientos** — tabla dedicada para SGRASV con todos los cargos de conducción
   activos, días restantes, estado y acciones disponibles.
3. **Renovación de período** — SGRASV puede extender el período de un cargo TTR.
4. **Registrar comisión manual** — SGRASV puede registrar una comisión antes de que llegue
   el archivo semanal de Meta4.
5. **Detectar fin de comisión desde Meta4** — cuando el archivo semanal actualiza
   `situacionRevista` a `'Activo'`, el sistema cierra la comisión automáticamente.

---

## Contexto: qué entrega Sprint 18 que este sprint extiende

Sprint 18 deja:
- Campos `periodoDesde`/`periodoHasta`/`periodoRenovado`/`fechaRenovacion` en `cargos`.
- Cargos TTR generados con período asignado al registrar la retención.
- Módulo `retenciones/` con `registrarRetencionService`, `getCadenaRetencionService`,
  `titularCesaService`.
- Sistema de notificaciones existente (`crearNotificacion` con deduplicación por `origenKey`
  y `materializarAlertasEstancamiento` como patrón de referencia).

Este sprint se apoya en todo eso sin modificar lo que ya funciona.

---

## Decisiones de diseño

### Notificaciones de vencimiento — mismo patrón que estancamiento

El sistema ya tiene `materializarAlertasEstancamiento()` que se llama on-demand al listar
notificaciones. Se agrega `materializarAlertasVencimiento()` con el mismo patrón:

- Se llama al listar notificaciones (igual que estancamiento).
- Deduplicación por `origenKey`: `vencimiento_ttr:{cargoId}:90d`, `vencimiento_ttr:{cargoId}:30d`,
  `vencimiento_ttr:{cargoId}:0d`.
- Tipo nuevo en el enum: `vencimiento_conduccion`.
- Rol destinatario: `sgrasv`.

### Renovación — campo `periodoHasta` actualizado + `periodoRenovado = true`

No se crea una entidad nueva. La renovación es una actualización del cargo:
- `periodoHasta` = nueva fecha de vencimiento.
- `periodoRenovado = true`.
- `fechaRenovacion` = hoy.
- Se invalidan las notificaciones de vencimiento anteriores (marcar como leídas las de ese
  `cargoId` con tipo `vencimiento_conduccion`).

### Comisión manual — nueva `ocupacion` con `situacionRevista = 'Comision'`

No es una entidad separada. Registrar una comisión es crear (o actualizar) la ocupación
activa de la persona con `situacionRevista = 'Comision'` + campos `comision`, `repaComision`,
`crComentario`. El cargo de origen sigue ocupado — no se toca `hasta`.

### Fin de comisión desde Meta4 — en `aprobarSnapshotService`

Cuando el pipeline del padrón procesa un `modificado` donde `situacionRevista` cambia de
`'Comision'` a `'Activo'`, el sistema actualiza la ocupación. Este diff ya existe — solo
hay que asegurarse de que el campo `situacionRevista` esté en la lista de campos que
`aprobarSnapshotService` actualiza al procesar `modificado`. Si ya lo hace: solo verificar
y documentar. Si no: agregar el campo al update.

---

## Tareas

| # | Tarea | Dev | Est. | Prioridad |
|---|-------|-----|------|-----------|
| S19-1 | Enum `TipoNotificacion`: agregar `vencimiento_conduccion`. Schema + migración. | Jorge | 0.5h | 🔴 |
| S19-2 | `materializarAlertasVencimiento()` en `notificaciones.service.ts`: busca cargos TTR con `periodoHasta` en ≤90 días, crea notificaciones con deduplicación. | Jorge | 1.5h | 🔴 |
| S19-3 | Integrar `materializarAlertasVencimiento()` en el endpoint `GET /notificaciones` (igual que `materializarAlertasEstancamiento`). | Jorge | 0.5h | 🔴 |
| S19-4 | `renovarPeriodoService` en `retenciones.service.ts`: actualiza `periodoHasta`, `periodoRenovado`, `fechaRenovacion`. Invalida notificaciones de vencimiento previas del cargo. | Jorge | 1h | 🔴 |
| S19-5 | Endpoint `PATCH /retenciones/:cargoId/renovar` — body: `{ periodoHasta: Date }`. | Jorge | 0.5h | 🔴 |
| S19-6 | `registrarComisionService` en módulo nuevo `comisiones/`: crea/actualiza ocupación con `situacionRevista = 'Comision'`. Valida que el cargo esté ocupado y que no haya comisión activa ya. | Jorge | 1.5h | 🟡 |
| S19-7 | Endpoint `POST /comisiones` + `DELETE /comisiones/:ocupacionId` (fin manual de comisión). | Jorge | 0.5h | 🟡 |
| S19-8 | Verificar `aprobarSnapshotService`: confirmar que `modificado` con cambio de `situacionRevista` de `'Comision'` → `'Activo'` actualiza la ocupación correctamente. Ajustar si no lo hace. | Jorge | 1h | 🟡 |
| S19-9 | Frontend: vista "Vencimientos de conducción" (`/retenciones/vencimientos`) — tabla con filtros, días restantes, badge de urgencia, acciones Renovar / Ver cadena. | Agustín | 4h | 🔴 |
| S19-10 | Frontend: formulario de renovación de período (modal inline en la vista de vencimientos). | Agustín | 1.5h | 🔴 |
| S19-11 | Frontend: formulario de comisión manual (modal en PersonaModal o en detalle de cargo). | Agustín | 2h | 🟡 |
| S19-12 | `packages/types`: `VencimientoCargo`, `ComisionInput`, tipo `vencimiento_conduccion` en `TipoNotificacion`. | Jorge | 0.5h | 🔴 |
| S19-13 | Verificación e2e | Jorge + Agustín | 2h | 🔴 |

**Total estimado**: ~17h

---

## Dependencias entre tareas

```
S19-1 ──► S19-2 ──► S19-3
S19-4 ──► S19-5
S19-2 ──► S19-4  (renovar invalida notificaciones del mismo tipo)
S19-6 ──► S19-7
S19-12 ──► S19-9, S19-10, S19-11
S19-9 ──► S19-10
Todo ──────► S19-13
```

S19-6/S19-7/S19-8/S19-11 (comisión) son independientes del bloque de vencimientos —
pueden desarrollarse en paralelo.

---

## S19-1 — Enum `TipoNotificacion`

```prisma
enum TipoNotificacion {
  concurso_estancado
  baja_pendiente
  autorizacion_pendiente
  autorizacion_resuelta
  concurso_iniciado
  vencimiento_conduccion   // ← nuevo
}
```

> Migración manual (shadow database roto).

---

## S19-2 — `materializarAlertasVencimiento()`

```typescript
const UMBRALES_VENCIMIENTO = [
  { dias: 90, sufijo: '90d', urgencia: 'aviso' },
  { dias: 30, sufijo: '30d', urgencia: 'recordatorio' },
  { dias: 0,  sufijo: '0d',  urgencia: 'critico' },
]

export async function materializarAlertasVencimiento() {
  const ahora = new Date()
  const en90dias = new Date(ahora.getTime() + 90 * 86_400_000)

  // Cargos TTR con período activo que vencen en ≤90 días
  const cargos = await prisma.cargo.findMany({
    where: {
      estado: 'vigente',
      tipoOrigen: { in: ['TTR'] },
      periodoHasta: { lte: en90dias, gte: ahora },
    },
    select: {
      id: true, codigo: true, periodoHasta: true, literalPuesto: true,
      hospital: { select: { sigla: true } },
    },
  })

  for (const cargo of cargos) {
    const diasRestantes = Math.floor(
      (cargo.periodoHasta!.getTime() - ahora.getTime()) / 86_400_000
    )
    const codigo = cargo.codigo ?? cargo.id.slice(0, 8)
    const sigla  = cargo.hospital.sigla

    for (const { dias, sufijo, urgencia } of UMBRALES_VENCIMIENTO) {
      if (diasRestantes > dias) continue
      await crearNotificacion({
        tipo: 'vencimiento_conduccion',
        rolSlug: 'sgrasv',
        titulo: `Vencimiento de período TTR (${diasRestantes === 0 ? 'HOY' : diasRestantes + ' días'})`,
        mensaje: `El cargo ${codigo} — ${sigla} vence ${diasRestantes === 0 ? 'hoy' : `en ${diasRestantes} días`}. Acción requerida: renovar o iniciar cascada.`,
        origenTipo: 'cargo',
        origenId: cargo.id,
        origenKey: `vencimiento_ttr:${cargo.id}:${sufijo}`,
      })
    }
  }
}
```

---

## S19-4 — `renovarPeriodoService`

```typescript
type RenovarPeriodoInput = {
  cargoId: string
  periodoHasta: Date
  renovadoPorId: string
}
```

**Pasos**:
1. Cargar el cargo. Validar que `tipoOrigen = 'TTR'` y `estado = 'vigente'`.
2. Validar que `periodoHasta` > `cargo.periodoHasta` actual (no se puede acortar).
3. Actualizar: `periodoHasta`, `periodoRenovado = true`, `fechaRenovacion = hoy`.
4. Marcar como leídas todas las notificaciones de tipo `vencimiento_conduccion` con
   `origenId = cargoId` (ya no son relevantes — el período se extendió).
5. Retornar cargo actualizado.

---

## S19-6 — `registrarComisionService`

Módulo nuevo `apps/api/src/modules/comisiones/`.

```typescript
type ComisionInput = {
  ocupacionId: string   // ocupación activa de la persona en el cargo de origen
  comision: string      // descripción del motivo
  repaComision: string  // hospital/repartición de destino
  crComentario?: string
}
```

**Pasos**:
1. Cargar la ocupación. Validar que `hasta IS NULL` (activa) y `situacionRevista = 'Activo'`.
2. Validar que no haya otra comisión activa para la misma persona (otra ocupación con
   `situacionRevista = 'Comision'` y `hasta IS NULL`).
3. Actualizar la ocupación: `situacionRevista = 'Comision'`, `comision`, `repaComision`,
   `crComentario`.
4. El cargo de origen NO se toca — sigue ocupado.

**Fin manual** (`DELETE /comisiones/:ocupacionId`):
- Actualizar `situacionRevista = 'Activo'`, limpiar `comision`/`repaComision`/`crComentario`.
- Solo disponible si Meta4 no lo actualizó primero (para evitar conflicto).

---

## S19-8 — Verificar fin de comisión desde Meta4

En `aprobarSnapshotService`, el paso de `modificado` actualiza campos de la ocupación.
Verificar que `situacionRevista` está en la lista de campos que se actualizan.

Si el diff detecta `situacionRevista: 'Comision' → 'Activo'`:
- La ocupación se actualiza normalmente.
- Los campos `comision`/`repaComision`/`crComentario` se limpian (o se dejan como historial
  — a definir con el equipo).

> Si `aprobarSnapshotService` ya actualiza `situacionRevista` en `modificado`: solo
> documentar y agregar test e2e. Si no: agregar el campo al update.

---

## S19-9 — Vista "Vencimientos de conducción"

Nueva página `/retenciones/vencimientos` accesible para `sgrasv`.

**Columnas de la tabla**:

| Columna | Descripción |
|---------|-------------|
| Cargo | Código + literal puesto |
| Hospital | Sigla |
| Ocupante | Nombre + CUIL |
| Período hasta | Fecha de vencimiento |
| Días restantes | Número + badge de color |
| Estado | `vigente` / `⚠️ por vencer (≤90d)` / `🔴 por vencer (≤30d)` / `💀 vencido` |
| Cadena | Link a la cadena completa |
| Acciones | Renovar / Iniciar cascada |

**Filtros**: hospital, estado de urgencia (todos / ≤90d / ≤30d / vencidos).

**Badge de días restantes**:
- > 90 días: gris
- ≤ 90 días: amarillo
- ≤ 30 días: naranja
- 0 o vencido: rojo

---

## S19-12 — `packages/types`: tipos nuevos

```typescript
export type VencimientoCargo = {
  id: string
  codigo: string | null
  literalPuesto: string | null
  hospitalSigla: string
  ocupanteNombre?: string
  ocupanteCuil?: string
  periodoHasta: string
  diasRestantes: number
  urgencia: 'ok' | 'aviso' | 'recordatorio' | 'critico' | 'vencido'
  periodoRenovado: boolean
}

export type ComisionInput = {
  ocupacionId: string
  comision: string
  repaComision: string
  crComentario?: string
}
```

---

## Archivos a crear / modificar

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | `vencimiento_conduccion` en `TipoNotificacion` |
| `prisma/migrations/20260925000000_s19_vencimiento_notif/` | Migración (manual) |
| `apps/api/src/modules/notificaciones/notificaciones.service.ts` | `materializarAlertasVencimiento()` + integración en `listNotificacionesService` |
| `apps/api/src/modules/notificaciones/notificaciones.schema.ts` | `vencimiento_conduccion` en el enum del schema Zod |
| `apps/api/src/modules/retenciones/retenciones.service.ts` | `renovarPeriodoService` |
| `apps/api/src/modules/retenciones/retenciones.routes.ts` | `PATCH /:cargoId/renovar` |
| `apps/api/src/modules/comisiones/comisiones.service.ts` | Nuevo — `registrarComisionService`, `finComisionService` |
| `apps/api/src/modules/comisiones/comisiones.routes.ts` | Nuevo — `POST /comisiones`, `DELETE /comisiones/:ocupacionId` |
| `apps/api/src/modules/comisiones/comisiones.schema.ts` | Nuevo — schemas Zod |
| `apps/api/src/modules/padron/padron.service.ts` | Verificar/ajustar `aprobarSnapshotService` para `situacionRevista` en `modificado` |
| `packages/types/src/index.ts` | `VencimientoCargo`, `ComisionInput`, `vencimiento_conduccion` |
| `apps/web/src/modules/retenciones/pages/VencimientosPage.tsx` | Nuevo |
| `apps/web/src/modules/retenciones/hooks/useVencimientos.ts` | Nuevo |
| `apps/web/src/modules/comisiones/components/ComisionModal.tsx` | Nuevo |
| `apps/web/src/modules/retenciones/components/RenovarPeriodoModal.tsx` | Nuevo |

---

## S19-13 — Verificación e2e

| # | Escenario | Resultado esperado |
|---|-----------|-------------------|
| 1 | Cargo TTR con `periodoHasta` en 25 días → listar notificaciones | Notificaciones `vencimiento_conduccion` creadas para 30d y 0d |
| 2 | Cargo TTR con `periodoHasta` en 85 días → listar notificaciones | Notificación `vencimiento_conduccion` creada para 90d |
| 3 | Renovar período de un TTR → nueva fecha | `periodoHasta` actualizado, `periodoRenovado = true`, notificaciones previas marcadas leídas |
| 4 | Registrar comisión manual → ocupación actualizada | `situacionRevista = 'Comision'`, cargo sigue ocupado, sin remplazante generado |
| 5 | Fin de comisión manual → ocupación actualizada | `situacionRevista = 'Activo'`, campos comisión limpios |
| 6 | Padrón con `modificado` `situacionRevista: Comision → Activo` → aprobar snapshot | Ocupación actualizada automáticamente |
| 7 | Vista vencimientos muestra badges correctos por urgencia | ✓ |
| 8 | Sin regresiones en notificaciones de estancamiento existentes | ✓ |

---

## Criterio de éxito

- [ ] Notificaciones `vencimiento_conduccion` se crean automáticamente al listar notificaciones
- [ ] Deduplicación funciona: listar dos veces no duplica notificaciones
- [ ] Renovación actualiza `periodoHasta` e invalida notificaciones previas
- [ ] Comisión manual crea ocupación con `situacionRevista = 'Comision'` sin tocar el cargo
- [ ] Fin de comisión desde Meta4 actualiza la ocupación al aprobar el snapshot
- [ ] Vista de vencimientos muestra todos los TTR activos con días restantes y badges correctos
- [ ] Sin regresiones en el módulo de notificaciones existente

---

## Notas

- **`origenKey` de vencimiento**: incluye el `cargoId` y el umbral (`90d`/`30d`/`0d`).
  Si el período se renueva y luego vuelve a acercarse al vencimiento, las `origenKey`
  anteriores ya están marcadas como leídas — se crearán nuevas al volver a entrar en el
  umbral. Esto es correcto: cada ciclo de vencimiento genera sus propias notificaciones.

- **Cargos base de conducción** (ley anterior): también tienen `periodoHasta`. El mismo
  `materializarAlertasVencimiento()` los cubre — la query filtra por `periodoHasta IS NOT NULL`
  sin distinguir `tipoOrigen`. Ajustar el filtro si se quiere separar TTR de bases.

- **Comisión sin fecha de vencimiento**: el sistema no almacena `periodoHasta` para comisiones.
  No hay notificación de vencimiento de comisión — el fin llega desde Meta4 o lo registra
  SGRASV manualmente. Esto es intencional según el contrato (§5.2).

- **Sprint 20 (pendiente de definir)**: vista de dotación real vs estructural (N cargos de
  planta + M cargos R activos), reportes diferenciados por `tipoOrigen`, exportación Excel
  con columna de tipo de cargo.
