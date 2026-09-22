# SPRINT 18 — Retenciones: schema + generación automática de cargos R/TTR

**Estado:** ✅ Completo (integrado en `deploy` — commit `d1c4376`)
**Fecha estimada de inicio:** 2026-09 (después de merge Sprint 17)
**Autores:** Jorge (backend) + Agustín (frontend)
**Rama:** `agustin` → integrado en `deploy`
**Prerequisito:** Sprint 17 mergeado a `main`

> **Implementado (2026-09-22):** módulo `retenciones/` (service + routes + schema),
> helpers R/TTR en `codigoCargo.ts`, migraciones `s18_retenciones` +
> `indice_periodo_hasta`, backfill de cadenas, frontend `CadenaRetencionTree` /
> `ValidacionRetencionesPage` / `CadenaRetencionPanel`, tests unitarios
> (`retenciones.unit.test.ts`, 16 casos). Ver commit `d1c4376`.

---

## Objetivo

Implementar el modelo de retención de cargos definido en `Doc/Contrato_Retenciones.md`:

1. **Schema**: campos nuevos en `cargos` para cadena de retención y períodos de conducción.
2. **Detección automática** de tipo de cargo (ejecución vs conducción) por prefijo del código.
3. **Backfill de `cargoBaseId`**: script que recorre los cargos existentes, detecta cuáles son
   remplazantes (por `situacionRevista = 'Retencion de Cargo'` en sus ocupaciones) y asigna
   `cargoBaseId` a cada nodo de la cadena.
4. **Módulo `retenciones/`** (nuevo): registrar retención, generar cargo R/TTR automáticamente,
   consultar cadena completa.
5. **Frontend**: árbol visual de cadena de retención + alerta de cascada al dar de baja conducción.
6. **Flujo titular cesa**: ocupante del cargo R hereda el cargo titular sin concurso.

Los flujos 🟡 del contrato (notificaciones 90/30 días, renovación de período, comisión manual,
fin de comisión desde Meta4) van al Sprint 19.

---

## Decisiones de diseño

### Detección ejecución vs conducción — por prefijo del código

Se usa el prefijo del código del cargo (`cargo.codigo`) para determinar si es ejecución o
conducción. No requiere join a `PuestoCargo`.

```
CONDUCCIÓN:  CPH-J-POF, CPH-J-POU, CPH-D, CPH-SD, EG-J, EG-D, EG-G, RG-CG, AS-*
EJECUCIÓN:   CPH-POF, CPH-POU, ENF, TEC-POF, TEC-POU, EG
```

Función helper `esConductionPorPrefijo(codigo: string): boolean` en `codigoCargo.ts`.

> Fallback: si el cargo no tiene `codigo` (raro pero posible en datos legacy), se usa
> `literalPuesto` — si contiene "JEFE", "DIRECTOR", "SUB DIRECTOR", "GERENTE" → conducción.

### Detección de remplazantes existentes — por `situacionRevista`

Para el backfill y para la lógica de `registrarRetencion`, la fuente de verdad de qué cargos
ya están retenidos es `ocupaciones.situacionRevista = 'Retencion de Cargo'`. El sistema cruza:

```
ocupacion.situacionRevista = 'Retencion de Cargo'
  → cargo retenido = ocupacion.cargoId
  → buscar cargo remplazante: cargo con mismo hospital + mismo prefijo base + sin ocupacion activa
    (o crearlo si no existe)
```

El backfill (S18-2) hace este cruce una sola vez sobre los datos existentes y asigna
`cargoRetenidoId` + `cargoBaseId` a los cargos remplazantes ya existentes en la BD.

### `periodoDesde`/`periodoHasta` — solo en cargos de conducción

Los campos de período viven en `cargos` (no en `ocupaciones`). Solo se completan para
cargos de conducción (TTR y cargos base de conducción). Para cargos R de ejecución
estos campos quedan `null` — no tienen período fijo.

### Módulo nuevo `retenciones/`

No se infla `ocupaciones.service.ts`. El módulo `retenciones/` es dueño de:

- Registrar retención (cambia `situacionRevista`, genera R/TTR)
- Consultar cadena de un cargo
- Ejecutar paso de titular cesa → ocupante R hereda

---

## Tareas

| #      | Tarea                                                                         | Dev             | Est. | Prioridad |
| ------ | ----------------------------------------------------------------------------- | --------------- | ---- | --------- |
| S18-1  | Schema + migración                                                            | Jorge           | 1.5h | 🔴        |
| S18-2  | Backfill: script de mapeo de cadenas existentes                               | Jorge           | 2h   | 🔴        |
| S18-3  | `codigoCargo.ts`: helpers para R/TTR + detección conducción                   | Jorge           | 0.5h | 🔴        |
| S18-4  | `retenciones.service.ts` (nuevo): `registrarRetencionService`                 | Jorge           | 3h   | 🔴        |
| S18-5  | `retenciones.routes.ts` (nuevo): 3 endpoints                                  | Jorge           | 1h   | 🔴        |
| S18-6  | `packages/types`: tipos nuevos                                                | Jorge           | 0.5h | 🔴        |
| S18-7  | Frontend: `CadenaRetencionTree` + integración en PersonaModal y detalle cargo | Agustín         | 3h   | 🔴        |
| S18-8  | Frontend: alerta cascada al dar de baja conducción                            | Agustín         | 2h   | 🔴        |
| S18-9  | `titularCesaService`: ocupante R hereda cargo titular                         | Jorge           | 2h   | 🔴        |
| S18-10 | Verificación e2e                                                              | Jorge + Agustín | 2h   | 🔴        |

**Total estimado**: ~17.5h

---

## Dependencias entre tareas

```
S18-1 ──► S18-4 ──► S18-5
S18-3 ──► S18-4
S18-6 ──► S18-7, S18-8
S18-2 ──► S18-4 (backfill debe correr antes de que el service asuma cadenas limpias)
S18-4 ──► S18-9
Todo ──────► S18-10
```

---

## S18-1 — Schema: campos nuevos en `cargos`

```prisma
model Cargo {
  // ... campos existentes ...

  // Retención y cadena
  tipoOrigen      String?   @map("tipo_origen") @db.VarChar(5)
  // 'R'   = remplazante de ejecución
  // 'TTR' = remplazante de conducción (Titular Transitorio por Reemplazo)
  // null  = cargo normal (no es remplazante)

  cargoRetenidoId String?   @map("cargo_retenido_id") @db.Uuid
  // FK al cargo que este cargo está remplazando
  // null si no es un cargo remplazante

  cargoBaseId     String?   @map("cargo_base_id") @db.Uuid
  // FK al cargo base de la cadena (desnormalizado para trazabilidad rápida)
  // null si este cargo ES el cargo base

  // Período de conducción (solo TTR y cargos base de conducción)
  periodoDesde    DateTime? @map("periodo_desde") @db.Date
  periodoHasta    DateTime? @map("periodo_hasta") @db.Date
  periodoRenovado Boolean   @default(false) @map("periodo_renovado")
  fechaRenovacion DateTime? @map("fecha_renovacion") @db.Date

  // Relaciones auto-referenciadas
  cargoRetenido Cargo?  @relation("CargoRemplazante", fields: [cargoRetenidoId], references: [id])
  remplazantes  Cargo[] @relation("CargoRemplazante")
  cargoBase     Cargo?  @relation("CadenaCargo", fields: [cargoBaseId], references: [id])
  cadena        Cargo[] @relation("CadenaCargo")
}
```

Índices adicionales en la migración SQL:

```sql
CREATE INDEX idx_cargos_cargo_base_id      ON cargos (cargo_base_id);
CREATE INDEX idx_cargos_cargo_retenido_id  ON cargos (cargo_retenido_id);
CREATE INDEX idx_cargos_periodo_hasta      ON cargos (periodo_hasta)
  WHERE periodo_hasta IS NOT NULL AND estado = 'vigente';
```

> **Migración manual** (shadow database roto): `prisma migrate resolve --applied` +
> `prisma db execute --url`.

---

## S18-2 — Backfill: script de mapeo de cadenas existentes

Script `scripts/backfill_cadenas_retencion.mjs`.

**Lógica**:

1. Buscar todas las ocupaciones con `situacionRevista = 'Retencion de Cargo'` que tengan
   `hasta IS NULL` (activas).
2. Para cada una: el `cargoId` es el cargo retenido. Buscar en `cargos` el cargo remplazante
   candidato: mismo `hospitalId` + prefijo del código contiene `-R-` o `-TTR-` + sin ocupación
   activa (vacante).
3. Si se encuentra: asignar `cargoRetenidoId = cargo_retenido.id` en el remplazante.
4. Calcular `cargoBaseId`: recorrer la cadena hacia atrás hasta encontrar el cargo sin
   `cargoRetenidoId` — ese es el base. Asignar ese id a todos los nodos de la cadena.
5. Loguear los casos ambiguos (más de un remplazante candidato) para revisión manual.

> El script es idempotente: si `cargoRetenidoId` ya está asignado, lo saltea.

---

## S18-3 — `codigoCargo.ts`: helpers para R/TTR + detección conducción

### Función `esConductionPorPrefijo`

```typescript
const PREFIJOS_CONDUCCION = new Set([
  'CPH-J-POF',
  'CPH-J-POU',
  'CPH-D',
  'CPH-SD',
  'EG-J',
  'EG-D',
  'EG-G',
  'RG-CG',
  'AS-MIN',
  'AS-SS',
  'AS-DG',
  'AS-DGA',
])

export function esConduccionPorPrefijo(codigo: string | null | undefined): boolean {
  if (!codigo) return false
  // Extraer prefijo base (sin el secuencial final -NNNNNN)
  const partes = codigo.split('-')
  // Probar desde el prefijo más largo al más corto
  for (let i = partes.length - 1; i >= 1; i--) {
    const candidato = partes.slice(0, i).join('-')
    if (PREFIJOS_CONDUCCION.has(candidato)) return true
  }
  return false
}
```

Fallback por `literalPuesto` cuando `codigo` es null:

```typescript
export function esConduccionPorLiteral(literalPuesto: string | null | undefined): boolean {
  const lit = normStr(literalPuesto)
  return (
    lit.includes('JEFE') ||
    lit.includes('DIRECTOR') ||
    lit.includes('SUB DIRECTOR') ||
    lit.includes('GERENTE')
  )
}
```

### Función `prefijoRemplazante`

```typescript
export function prefijoRemplazante(prefijoCargo: string, tipo: 'R' | 'TTR'): string {
  return `${prefijoCargo}-${tipo}`
}
// CPH-POF     → CPH-POF-R
// CPH-J-POF   → CPH-J-POF-TTR
```

`maxSecuencialCargo` ya funciona para estos prefijos — el regex `[0-9]{6}$` y el
`LIKE` con `-%` al final son agnósticos al prefijo. No requiere cambios.

---

## S18-4 — `retenciones.service.ts`

### `registrarRetencionService`

```typescript
// Input
type RegistrarRetencionInput = {
  cargoId: string // cargo que se retiene
  srDocRespaldo: string // documento obligatorio
  srComentario?: string
  // Solo para conducción (TTR):
  periodoDesde?: Date
  periodoHasta?: Date
}
```

**Pasos dentro de una transacción**:

1. Cargar el cargo con su ocupación activa (`hasta IS NULL`). Validar que existe y está ocupado.
2. Determinar si es ejecución o conducción: `esConduccionPorPrefijo(cargo.codigo)` con fallback
   a `esConduccionPorLiteral(cargo.literalPuesto)`.
3. Validar regla R-01: si es ejecución y la persona ya tiene otro cargo de ejecución activo
   → error (no puede retener ejecución→ejecución, debe cesar).
4. Cambiar `ocupacion.situacionRevista = 'Retencion de Cargo'`, `srDocRespaldo`, `srComentario`.
5. Determinar `tipoOrigen`: conducción → `'TTR'`, ejecución → `'R'`.
6. Generar código del remplazante: `prefijoRemplazante(prefijoDeCargo({...}), tipoOrigen)` +
   `siguienteCodigoCargo(prefijoRemplazante, tx)`.
7. Calcular `cargoBaseId` del nuevo remplazante:
   - Si el cargo retenido tiene `cargoBaseId` → usar ese mismo.
   - Si el cargo retenido NO tiene `cargoBaseId` → el cargo retenido ES el base → usar su `id`.
8. Crear el cargo remplazante en `cargos` con:
   - Mismos `hospitalId`, `escalafonId`, `codigoRegistroId`, `literalPuesto`, `agrupador`,
     `unificadorPuesto`, `regimen`, `codigoRepa` que el cargo retenido.
   - `tipoOrigen`, `cargoRetenidoId = cargoId`, `cargoBaseId` calculado.
   - `periodoDesde`/`periodoHasta` solo si `tipoOrigen = 'TTR'`.
   - `estado = 'vigente'`, `idSial = 'SISTEMA-{uuid corto}'` (no viene del padrón).
9. Retornar cargo remplazante creado + cadena actualizada.

### `getCadenaRetencionService`

Dado un `cargoId`, busca el `cargoBaseId` (o usa el propio id si es el base) y devuelve
todos los cargos de la cadena ordenados desde el base hasta el más reciente:

```typescript
// Query: todos los cargos donde cargoBaseId = baseId OR id = baseId
// Ordenados por profundidad (recorriendo cargoRetenidoId)
```

### `titularCesaService`

Ver S18-9.

---

## S18-5 — `retenciones.routes.ts`

| Método | Path                           | Descripción                               | Permiso  |
| ------ | ------------------------------ | ----------------------------------------- | -------- |
| `POST` | `/retenciones`                 | Registrar retención + generar R/TTR       | `sgrasv` |
| `GET`  | `/retenciones/cadena/:cargoId` | Cadena completa desde el base             | `editor` |
| `GET`  | `/retenciones/cargo/:cargoId`  | Detalle: cargo + su remplazante si existe | `editor` |
| `POST` | `/retenciones/titular-cesa`    | Ocupante R hereda cargo titular           | `sgrasv` |

---

## S18-6 — `packages/types`: tipos nuevos

```typescript
export type TipoOrigen = 'R' | 'TTR' | null

export type NodoCadena = {
  id: string
  codigo: string | null
  literalPuesto: string | null
  tipoOrigen: TipoOrigen
  estado: EstadoCargo
  estaOcupado: boolean
  ocupanteNombre?: string
  ocupanteCuil?: string
  periodoDesde?: string | null
  periodoHasta?: string | null
  cargoRetenidoId?: string | null
}

export type CadenaRetencion = {
  cargoBaseId: string
  nodos: NodoCadena[] // ordenados base → más reciente
}
```

Campos nuevos en tipo `Cargo`:

```typescript
tipoOrigen?: TipoOrigen
cargoRetenidoId?: string | null
cargoBaseId?: string | null
periodoDesde?: string | null
periodoHasta?: string | null
periodoRenovado?: boolean
fechaRenovacion?: string | null
```

---

## S18-7 — Frontend: `CadenaRetencionTree`

Componente `CadenaRetencionTree` que recibe `CadenaRetencion` y renderiza el árbol:

```
[E1 — CPH-POF-000042]  ← cargo base (ejecución)
  └─ retenido por → [C2 — CPH-J-POF-000015]  (conducción)
       └─ retenido por → [C3 — CPH-D-000003]  (conducción, período hasta 2028-03)
            └─ remplazante → [TTR — CPH-D-TTR-000001]  🟡 vacante
```

Cada nodo muestra: código, literal puesto, estado (badge), ocupante si existe, días
restantes del período si aplica.

**Integración**:

- `PersonaModal`: nueva tab "Cadena" que aparece solo si la persona tiene alguna
  ocupación con `situacionRevista = 'Retencion de Cargo'`.
- Página de detalle de cargo (`/cargos/:id`): sección "Cadena de retención" si el cargo
  tiene `cargoBaseId` o tiene remplazantes.

---

## S18-8 — Frontend: alerta cascada al dar de baja conducción

Al intentar confirmar una baja de un cargo de conducción (en el flujo de bajas existente),
antes de confirmar mostrar un modal de advertencia:

```
⚠️ Este cargo tiene una cadena de retención activa.
Al confirmar la baja, los siguientes cargos quedarán afectados:

  C3 — CPH-D-000003  (este cargo)
  C2 — CPH-J-POF-000015  → persona vuelve a este cargo
  E1 — CPH-POF-000042  → cargo base final

La cascada debe ejecutarse paso a paso con documentación en cada nivel.
¿Confirmar baja de C3?
```

**Lógica**: al abrir el modal de confirmación de baja, si `cargo.tipoOrigen` es null y
el cargo es de conducción, llamar `GET /retenciones/cadena/:cargoId`. Si la cadena tiene
más de un nodo → mostrar el modal de advertencia. Si no → flujo normal.

---

## S18-9 — `titularCesaService`

Cuando el titular de un cargo original (sin `tipoOrigen`, el cargo base o un cargo de
conducción normal) cesa definitivamente:

**Input**: `{ cargoId: string, ocupanteRId: string, docRespaldo: string }`

**Pasos**:

1. Buscar el cargo R asociado: `cargos WHERE cargoRetenidoId = cargoId AND tipoOrigen = 'R'`.
2. Validar que el cargo R tiene ocupante activo (`ocupanteRId`).
3. En transacción:
   a. Cerrar la ocupación del titular en el cargo original (`hasta = hoy`).
   b. Cerrar la ocupación del ocupante en el cargo R (`hasta = hoy`).
   c. Crear nueva ocupación del ocupante en el cargo original (`desde = hoy`, `situacionRevista = 'Activo'`).
   d. Poner el cargo R en `estado = 'no_vigente'`.
4. Retornar el nuevo estado.

> Regla R-07 del contrato: el ocupante del R pasa al cargo titular SIN concurso.

---

## S18-10 — Verificación e2e

Escenarios a verificar manualmente:

| #   | Escenario                                                                                               | Resultado esperado                                               |
| --- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | Ejecución → conducción: SGRASV registra retención en CPH-POF                                            | Se genera CPH-POF-R-XXXXXX, cadena tiene 2 nodos                 |
| 2   | Conducción → conducción: SGRASV registra retención en CPH-J-POF                                         | Se genera CPH-J-POF-TTR-XXXXXX con período, cadena tiene 3 nodos |
| 3   | Ejecución → ejecución: intento de retener CPH-POF cuando persona ya tiene otro CPH-POF                  | Error: "no puede retener dos cargos de ejecución"                |
| 4   | Cadena de 3 niveles: árbol visual muestra los 3 nodos correctamente                                     | ✓                                                                |
| 5   | Titular cesa: ocupante del R hereda el cargo titular, R pasa a no_vigente                               | ✓                                                                |
| 6   | Alerta cascada: baja de cargo de conducción con cadena activa muestra modal                             | ✓                                                                |
| 7   | Backfill: cargos existentes con `situacionRevista = 'Retencion de Cargo'` tienen `cargoBaseId` asignado | ✓                                                                |

---

## Archivos a crear / modificar

| Archivo                                                               | Cambio                                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `prisma/schema.prisma`                                                | 6 campos + relaciones auto-ref en `Cargo`                                |
| `prisma/migrations/20260924000000_s18_retenciones/`                   | Migración nueva (manual)                                                 |
| `apps/api/src/shared/codigoCargo.ts`                                  | `esConduccionPorPrefijo`, `esConduccionPorLiteral`, `prefijoRemplazante` |
| `apps/api/src/modules/retenciones/retenciones.service.ts`             | Nuevo — 3 services                                                       |
| `apps/api/src/modules/retenciones/retenciones.routes.ts`              | Nuevo — 4 endpoints                                                      |
| `apps/api/src/modules/retenciones/retenciones.schema.ts`              | Nuevo — schemas Zod                                                      |
| `packages/types/src/index.ts`                                         | `TipoOrigen`, `NodoCadena`, `CadenaRetencion`, campos en `Cargo`         |
| `apps/web/src/modules/retenciones/components/CadenaRetencionTree.tsx` | Nuevo                                                                    |
| `apps/web/src/modules/retenciones/hooks/useRetenciones.ts`            | Nuevo — hooks TanStack Query                                             |
| `apps/web/src/modules/personas/components/PersonaModal.tsx`           | Tab "Cadena" condicional                                                 |
| `apps/web/src/modules/bajas/components/ConfirmarBajaModal.tsx`        | Alerta cascada                                                           |
| `scripts/backfill_cadenas_retencion.mjs`                              | Nuevo — script de backfill                                               |

---

## Criterio de éxito

- [ ] Schema migrado, campos visibles en BD
- [ ] Backfill corrió sin errores, cargos existentes con `cargoBaseId` asignado
- [ ] `registrarRetencionService` genera R para ejecución y TTR para conducción
- [ ] Código del remplazante sigue el formato `{prefijo}-R-NNNNNN` / `{prefijo}-TTR-NNNNNN`
- [ ] `getCadenaRetencionService` devuelve la cadena completa ordenada
- [ ] `CadenaRetencionTree` renderiza el árbol correctamente en PersonaModal
- [ ] Alerta de cascada aparece al intentar dar de baja un cargo de conducción con cadena activa
- [ ] `titularCesaService` transfiere al ocupante R al cargo titular sin concurso
- [ ] Sin regresiones en bajas, concursos ni padrón

---

## Notas

- **`idSial` de cargos R/TTR**: los cargos generados por el sistema no tienen id SIAL real.
  Se usa `'SISTEMA-{uuid corto 8 chars}'` como placeholder. El campo tiene `@unique` en el
  schema — el uuid corto garantiza unicidad sin colisionar con los ids reales del SIAL.

- **Dotación real vs estructural**: los cargos R/TTR se cuentan en dotación. El badge
  `tipoOrigen` permite filtrarlos en los reportes. Ver nota §10 del contrato.

- **`cargoBaseId` desnormalizado**: se copia al crear el remplazante. Si el cargo retenido
  ya tiene `cargoBaseId` → se copia ese mismo. Si no tiene → el cargo retenido es el base
  y se usa su `id`. Esto garantiza que todos los nodos de la cadena apuntan al mismo base
  sin recorrer el árbol.

- **Conducción con cargo base de conducción** (ley anterior): si el cargo base ya es de
  conducción, el flujo es idéntico — se genera TTR igual. La distinción ejecución/conducción
  aplica al cargo que se retiene, no al cargo base.

- **Sprint 19 (flujos 🟡)**: notificaciones 90/30 días antes del vencimiento de TTR,
  renovación de período, registrar comisión manual, detectar fin de comisión desde Meta4.
