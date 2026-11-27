# SPRINT 27 — Modularización y refactoring del frontend

**Estado:** 📋 Planificado
**Autor:** Jorge (backend) + Agustín (frontend)
**Duración estimada:** 1–2 semanas | **Capacidad:** 60h | **Estimado:** ~48h

---

## Objetivo

Transformar el frontend de un conjunto de páginas monolíticas en una arquitectura modular
con componentes reutilizables, hooks especializados y configuración centralizada. El resultado
debe ser código más fácil de mantener, extender y testear, sin cambios visibles para el usuario.

> **Regla de oro de este sprint:** ningún cambio debe alterar el comportamiento visible de la
> aplicación. Cada refactor se valida con un smoke test manual antes de cerrar la tarea.
> Si algo rompe, se revierte antes de avanzar.

---

## Contexto y diagnóstico

El análisis del estado actual del frontend (2026-11) identificó los siguientes problemas:

### Problemas críticos

**1. `AppShell.tsx` — God Component (~300 líneas)**
Todo el sidebar, la lógica de permisos, los badges del header, la navegación y el menú
viven en un solo archivo. Hay 15+ variables de visibilidad calculadas inline, 4 arrays de
subitems hardcodeados, y la función `itemClass` duplicada en múltiples `NavLink`.

**2. `router.tsx` — boilerplate repetitivo (~50 veces)**
Cada ruta lazy repite el mismo patrón `.then((m) => ({ default: m.NombrePage }))`.
Son ~50 líneas de boilerplate que se pueden reducir a un helper de 3 líneas.

**3. Pages con demasiadas responsabilidades**
`CargosPage.tsx` (~350 líneas) mezcla: gestión de URL params, construcción de filtros,
lógica de chips, export a Excel y render de la tabla. Mismo patrón en otras pages.

**4. `useCatalogos.ts` — hook monolítico**
Un solo archivo con 10+ hooks de catálogos distintos. Crece sin límite y dificulta
encontrar qué hook usar para qué.

**5. Duplicación de componentes de selección**
`SearchableSelect`, `MultiSelectDropdown` y `ComboBuscable` resuelven variantes del mismo
problema (dropdown con búsqueda). Hay overlap de funcionalidad y contratos distintos para
el mismo patrón de UI.

### Lo que ya está bien (no tocar)

- Arquitectura por módulos (`modules/[dominio]/pages|hooks|components|lib`) ✅
- Lazy loading de rutas en `router.tsx` ✅
- Hooks de datos separados de la UI ✅
- `shared/` con componentes reutilizables ✅
- Monorepo con `packages/types`, `packages/utils`, `packages/normalizacion` ✅

---

## Alcance del sprint

### Dentro del alcance

- Refactoring de `AppShell.tsx` en componentes más pequeños
- Helper `lazyPage()` para eliminar boilerplate en `router.tsx`
- Extracción de `useCargosFilters` desde `CargosPage.tsx` como caso modelo
- División de `useCatalogos.ts` en hooks individuales por dominio
- Archivo de configuración de navegación `navConfig.ts`

### Fuera del alcance

- Cambios de comportamiento o UX
- Nuevas funcionalidades
- Refactoring del backend
- Unificación de `SearchableSelect`/`ComboBuscable` (requiere análisis de contratos más profundo,
  se deja para un sprint posterior)
- Refactoring de otras pages (se hace `CargosPage` como modelo; el resto en sprints siguientes)

---

## Tareas — Agustín (frontend)

### Bloque A — Router

| # | Tarea | Est. | Prioridad | Estado |
|---|-------|------|-----------|--------|
| S27-A1 | Crear helper `lazyPage(importFn)` en `shared/lib/lazyPage.ts`. Reemplazar los ~50 bloques `.then((m) => ({ default: m.X }))` en `router.tsx` por llamadas al helper. Sin cambios de rutas ni de guards. | 2h | 🔴 Crítico | 📋 |

**Resultado esperado:** `router.tsx` pasa de ~180 líneas de imports lazy a ~50. Comportamiento idéntico.

```ts
// Antes (repetido ~50 veces):
const CargosPage = lazy(() =>
  import('../modules/cargos/pages/CargosPage').then((m) => ({ default: m.CargosPage }))
)

// Después:
const CargosPage = lazyPage(() => import('../modules/cargos/pages/CargosPage'), 'CargosPage')
```

---

### Bloque B — AppShell

| # | Tarea | Est. | Prioridad | Estado |
|---|-------|------|-----------|--------|
| S27-B1 | Crear `shared/components/layout/navConfig.ts` con los arrays `CARGOS_GESTION_SUBITEMS`, `BAJAS_SUBITEMS`, `IMPORTACION_SUBITEMS`, `CONFIGURACION_SUBITEMS` y la constante `CARGOS_VER_PERMISO`. Tipar con interfaces `NavItem` y `NavGroup`. | 1h | 🔴 Crítico | 📋 |
| S27-B2 | Extraer `SidebarItem` como componente en `shared/components/layout/SidebarItem.tsx`. Recibe `to`, `icon`, `label`, `collapsed`, y la lógica de `itemClass` actualmente duplicada. Reemplazar todos los `NavLink` del sidebar por `SidebarItem`. | 3h | 🔴 Crítico | 📋 |
| S27-B3 | Extraer `HeaderBadge` en `shared/components/layout/HeaderBadge.tsx`. Recibe `to`, `icon`, `count`, `colorClass`, `title`. Reemplazar los 3 badges del header (autorizaciones, tareas, notificaciones). | 2h | 🟡 Medio | 📋 |
| S27-B4 | Extraer `SidebarNav` en `shared/components/layout/SidebarNav.tsx`. Contiene el `<nav>` completo con los 3 grupos. `AppShell` queda solo con el layout externo (aside + header + main) y la lógica de permisos de visibilidad. | 4h | 🔴 Crítico | 📋 |

**Resultado esperado:** `AppShell.tsx` pasa de ~300 líneas a ~100. Los componentes extraídos
son testeables de forma independiente.

---

### Bloque C — CargosPage (caso modelo)

| # | Tarea | Est. | Prioridad | Estado |
|---|-------|------|-----------|--------|
| S27-C1 | Extraer `useCargosFilters` en `modules/cargos/hooks/useCargosFilters.ts`. Encapsula toda la lógica de `useSearchParams`: lectura de params, `setParam`, `setPage`, construcción del objeto `CargoFilters`, y las funciones `agregarUnion`/`quitarGrupo`. `CargosPage` solo consume el hook. | 4h | 🔴 Crítico | 📋 |
| S27-C2 | Extraer `CargosTable` en `modules/cargos/components/CargosTable.tsx`. Recibe `data`, `isFetching`, `searchParams` como props. Contiene la tabla, el estado vacío y la paginación. | 3h | 🟡 Medio | 📋 |
| S27-C3 | Extraer `FilterChips` como componente genérico en `shared/components/FilterChips.tsx`. Recibe `chips: { label: string; onRemove: () => void }[]` y `onClearAll`. Reemplazar el IIFE de chips en `CargosPage`. | 2h | 🟡 Medio | 📋 |

**Resultado esperado:** `CargosPage.tsx` pasa de ~350 líneas a ~80. El patrón queda documentado
para replicar en `PersonasPage`, `ConcursosCphPage`, etc. en sprints siguientes.

---

### Bloque D — useCatalogos

| # | Tarea | Est. | Prioridad | Estado |
|---|-------|------|-----------|--------|
| S27-D1 | Crear directorio `shared/hooks/catalogos/`. Mover cada hook de `useCatalogos.ts` a su propio archivo: `useHospitales.ts`, `useEscalafones.ts`, `useCodigosRegistro.ts`, `usePuestosCargo.ts`, `useEspecialidades.ts`. Re-exportar todo desde `shared/hooks/catalogos/index.ts` para no romper imports existentes. | 3h | 🟡 Medio | 📋 |

**Resultado esperado:** cada hook de catálogo es localizable por nombre de archivo. El archivo
`useCatalogos.ts` original queda como re-exportador (barrel) para compatibilidad hacia atrás,
sin borrar imports existentes.

---

## Tareas — Jorge (backend / infraestructura)

| # | Tarea | Est. | Prioridad | Estado |
|---|-------|------|-----------|--------|
| S27-J1 | Activar `strict: true` en `apps/api/tsconfig.json` (deuda registrada en `SPRINT_LIMPIEZA_Y_ARQUITECTURA.md` §2). Corregir los errores de tipo que aparezcan. Verificar con `pnpm --filter @srrhh/api build` limpio. | 4h | 🟡 Medio | 📋 |
| S27-J2 | Revisar y documentar en `SPRINT_LIMPIEZA_Y_ARQUITECTURA.md` el estado actual de las tablas `ref_*` huérfanas (§1.2) para preparar su eliminación en un sprint de limpieza posterior. Sin borrar nada todavía. | 2h | 🟢 Bajo | 📋 |

---

## Archivos a crear / modificar

| Archivo | Cambio |
|---------|--------|
| `apps/web/src/shared/lib/lazyPage.ts` | Helper nuevo |
| `apps/web/src/app/router.tsx` | Reemplazar imports lazy por `lazyPage()` |
| `apps/web/src/shared/components/layout/navConfig.ts` | Configuración de navegación extraída |
| `apps/web/src/shared/components/layout/SidebarItem.tsx` | Componente nuevo |
| `apps/web/src/shared/components/layout/HeaderBadge.tsx` | Componente nuevo |
| `apps/web/src/shared/components/layout/SidebarNav.tsx` | Componente nuevo |
| `apps/web/src/shared/components/layout/AppShell.tsx` | Reducido a layout + lógica de permisos |
| `apps/web/src/modules/cargos/hooks/useCargosFilters.ts` | Hook nuevo extraído de CargosPage |
| `apps/web/src/modules/cargos/components/CargosTable.tsx` | Componente nuevo extraído de CargosPage |
| `apps/web/src/shared/components/FilterChips.tsx` | Componente genérico nuevo |
| `apps/web/src/modules/cargos/pages/CargosPage.tsx` | Reducida a composición de los anteriores |
| `apps/web/src/shared/hooks/catalogos/index.ts` | Barrel re-exportador |
| `apps/web/src/shared/hooks/catalogos/useHospitales.ts` | Extraído de useCatalogos |
| `apps/web/src/shared/hooks/catalogos/useEscalafones.ts` | Extraído de useCatalogos |
| `apps/web/src/shared/hooks/catalogos/useCodigosRegistro.ts` | Extraído de useCatalogos |
| `apps/web/src/shared/hooks/catalogos/usePuestosCargo.ts` | Extraído de useCatalogos |
| `apps/web/src/shared/hooks/catalogos/useEspecialidades.ts` | Extraído de useCatalogos |
| `apps/web/src/shared/hooks/useCatalogos.ts` | Convertido en barrel (re-exporta desde catalogos/) |
| `apps/api/tsconfig.json` | `strict: true` |

---

## Dependencias entre tareas

```
S27-A1 (lazyPage helper) — independiente, puede arrancar en cualquier momento

S27-B1 (navConfig) ──► S27-B2 (SidebarItem) ──► S27-B4 (SidebarNav) ──► AppShell reducido
                   └──► S27-B3 (HeaderBadge) ──► AppShell reducido

S27-C1 (useCargosFilters) ──► S27-C2 (CargosTable) ──► CargosPage reducida
S27-C3 (FilterChips) — puede hacerse en paralelo con C1/C2

S27-D1 (catalogos/) — independiente, puede arrancar en cualquier momento

S27-J1 (strict: true) — independiente del frontend
S27-J2 (doc ref_*) — independiente
```

---

## Criterio de éxito

- [ ] `router.tsx` sin bloques `.then((m) => ({ default: m.X }))` repetidos
- [ ] `AppShell.tsx` < 120 líneas
- [ ] `CargosPage.tsx` < 100 líneas
- [ ] `useCatalogos.ts` convertido en barrel; cada hook en su propio archivo
- [ ] `FilterChips` reutilizable (sin lógica específica de cargos)
- [ ] `tsc --noEmit` limpio en `apps/web` y `apps/api`
- [ ] Smoke test manual: login → navegar por todas las rutas del sidebar → sin errores de consola
- [ ] `pnpm --filter @srrhh/api build` limpio con `strict: true`

---

## Notas de implementación

- **No cambiar contratos de API ni tipos en `packages/types`** — este sprint es solo frontend.
- **Re-exportar siempre** al mover hooks/componentes para no romper imports existentes en otros módulos.
- **Un commit por bloque** (A, B, C, D, J) para facilitar el rollback si algo falla.
- **`FilterChips` genérico**: no debe importar nada de `modules/cargos`. Recibe solo `chips[]` y callbacks.
- **`SidebarItem`**: la lógica de "activo" para rutas con subitems (Bajas, Importación, Configuración)
  usa `location.pathname.startsWith(prefix)` — encapsular ese patrón en el componente con una prop
  `matchPrefix?: string` opcional.
- **`navConfig.ts`**: tipar con interfaces explícitas, no `as const`, para que TypeScript infiera
  correctamente los tipos de `permiso` en los filtros de `can()`.
