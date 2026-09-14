# POST-SPRINT — Filtro conFaltantes + Tests + Modales flujo CPH

**Estado:** ✅ Completado
**Fecha:** 2026-09
**Autores:** Jorge
**Rama:** `jorge`

---

## Resumen

Tres mejoras independientes sobre módulos existentes:

1. **Filtro "Con documentación faltante"** en `ConcursosCphPage`
2. **Tests unitarios e HTTP** para concursos CPH y bajas
3. **Actualización de modales de flujo** del concurso CPH con las 16 etapas reales del `subEstado`

---

## 1. Filtro `conFaltantes`

### Problema

No había forma de filtrar rápidamente los concursos que tienen campos vacíos según su sub-estado actual (ej: un concurso en `B-SORTEO JUR` sin `sorteoJurado` registrado).

### Implementación

**Backend:**

- `concursos-cph.schema.ts` — campo `conFaltantes` con `z.enum(['true','false']).transform(v => v === 'true')`.
  - **Fix importante**: `z.coerce.boolean()` no parsea `'false'` correctamente (lo convierte a `true` porque es un string no vacío). Se usa `z.enum` + transform.
- `concursos-cph.service.ts` — `listConcursosCphService` con `$queryRaw` que verifica campos vacíos según sub-estado.
- `packages/types/src/index.ts` — `ConcursoCphFilters.conFaltantes?: boolean`.

**Frontend:**

- `ConcursosCphPage.tsx` — estado `conFaltantes`, botón toggle naranja "⚠️ Con documentación faltante".

### Diagnóstico previo

Query SQL reveló 1035 concursos activos/no_iniciados con campos vacíos:
- `sorteoJurado` vacío en casi todos (se implementará en el sistema — normal que esté vacío)
- 24 concursos `O-ALTA SIAL` sin `resolucionDesignacion` — sin fuente para matchear automáticamente

---

## 2. Tests

### `concursosCph.calc.test.ts` — 47 tests unitarios

Cubre `calcConcursoCph` completo:
- Todos los sub-estados (VACANTE → O-ALTA SIAL)
- `subEstado3` con fechas (ramas que dependen de la fecha actual)
- Invariantes (estado calculado, no editable)

### `concursos-bajas.http.test.ts` — 36 tests HTTP

Cubre endpoints de concursos-cph y bajas:
- Autenticación (401 sin token, 403 sin permiso)
- Listado con filtros (hospital, estado, subEstado, conFaltantes)
- Detalle
- Rendimiento (< 500ms)

### Fix `vitest.config.ts`

Agregado `esbuild.tsconfigRaw` para resolver problema de `extends` en Docker (el tsconfig base no se resuelve correctamente en el entorno de contenedor).

Nuevo `apps/api/tsconfig.test.json` — tsconfig autosuficiente para tests (sin `extends`).

**Total: 183 tests pasando.**

---

## 3. Actualización modales flujo CPH

### Problema

`concursoFlowData.ts` usaba etapas A-G abstractas (`subEstado3`) que no coincidían con las 16 etapas reales del campo `subEstado` en BD. El modal mostraba "A — Validación vacante", "B — Autorizado", etc. en lugar de los sub-estados reales del proceso.

### Cambios en `concursoFlowData.ts`

Reescrito completamente:

- `ETAPAS_CPH`: 9 etapas abstractas → 17 entradas (VACANTE + 16 sub-estados reales). Cada etapa tiene campo `subEstado` con el valor exacto del campo en BD.
- `TRANSICIONES_CPH`: actualizadas con nombres reales. El rellamado vuelve a `C-DISPO DE LLAMADO` (no a `B-AUTORIZADO`).
- `DOCS_CPH`: etapas actualizadas con sub-estados reales (ej: `sorteoJurado` → `B-SORTEO JUR`, `ifacs` → `F-IFACS`).
- `ACTORES_CPH`: acciones del área de concursos actualizadas con sub-estados reales.
- Eliminado campo `origen?: string[]` de `EtapaFlujo` (ya no aplica). Agregado `subEstado: string`.

### Cambios en `FlujoConcursoModal.tsx`

Cambios mínimos sobre la estructura existente:

- Tab "Etapas A–G" → "Etapas"
- Sidebar: muestra label + `subEstado` en mono debajo, ancho 52 (era 44)
- Detalle de etapa: badge con `subEstado` en código antes del label
- Línea de tiempo: 17 nodos con sub-estados reales (era 9 abstractos)
- Nota al pie: rellamado vuelve a `C-DISPO DE LLAMADO`

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/modules/concursos-cph/concursos-cph.schema.ts` | `conFaltantes` con fix `z.enum` |
| `apps/api/src/modules/concursos-cph/concursos-cph.service.ts` | Filtro `conFaltantes` con `$queryRaw` |
| `packages/types/src/index.ts` | `ConcursoCphFilters.conFaltantes` |
| `apps/web/src/modules/concursos-cph/pages/ConcursosCphPage.tsx` | Botón toggle naranja |
| `apps/api/vitest.config.ts` | `esbuild.tsconfigRaw` |
| `apps/api/tsconfig.test.json` | Nuevo tsconfig autosuficiente |
| `apps/api/src/__tests__/concursosCph.calc.test.ts` | 47 tests unitarios |
| `apps/api/src/__tests__/concursos-bajas.http.test.ts` | 36 tests HTTP |
| `apps/web/src/modules/concursos-cph/components/concursoFlowData.ts` | Reescrito con 17 etapas reales |
| `apps/web/src/modules/concursos-cph/components/FlujoConcursoModal.tsx` | Tab, sidebar, línea de tiempo actualizados |

---

## Notas técnicas

- **`z.coerce.boolean()` bug**: `z.coerce.boolean().parse('false')` devuelve `true` porque coerce convierte el string a boolean con `Boolean('false')` = `true`. Siempre usar `z.enum(['true','false']).transform(v => v === 'true')` para booleans en query params.
- **`sorteoJurado`**: campo que se implementará en el sistema — normal que esté vacío en todos los concursos actuales. No se incluye en el filtro `conFaltantes` como faltante bloqueante.
- **Sub-estados reales**: los 16 sub-estados (VACANTE → O-ALTA SIAL) son del proceso real del GCBA, no definidos por el equipo. Son los valores que aparecen en el campo `subEstado` de la tabla `concursos_cph`.
