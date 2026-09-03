# SPRINT 9 — Matriz de permisos + Landing/menú/guards

**Estado:** ✅ Completo — 2026-09-02 (S9-1 superado por RBAC dinámico; S9-8 deliberadamente no implementado)
**Duración:** 1 semana | **Capacidad:** 60h | **Estimado:** 42h
**Objetivo:** Reemplazar listas hardcodeadas de roles por una matriz central, montar la página de inicio, menú por rol y guardas unificadas en el router.

## Decisión clave: RBAC dinámico (2026-09-01)

S9-1 planificaba una matriz estática en `packages/types`. Se implementó RBAC dinámico en su lugar: roles y permisos viven en tablas (`roles`, `permisos`, `role_permisos`), editables en caliente por el admin desde `/configuracion/permisos`. `requirePermiso(modulo, accion)` reemplaza `requireRole([...])` en todos los endpoints.

## Tareas

| #     | Tarea | Dev | Est. | Prioridad | Estado |
| ----- | ----- | --- | ---- | --------- | ------ |
| S9-1  | Definir matriz en `packages/types` | Jorge | 3h | 🔴 Crítico | ⛔ Superado por RBAC dinámico |
| S9-2  | Backend: middleware `requirePermiso(modulo, accion)` | Agustin | 4h | 🔴 Crítico | ✅ `apps/api/src/shared/middleware/permisos.middleware.ts` |
| S9-3  | Frontend: helper `can(usuario, modulo, accion)` en `shared/lib/can.ts` | Agustin | 2h | 🔴 Crítico | ✅ |
| S9-4  | Menú con sección "Configuración" (admin-only) + sub-item "Permisos" | Agustin | 3h | 🟡 Medio | ✅ |
| S9-5  | `ConfiguracionPermisosPage`: el admin crea roles y tilda/destilda permisos en vivo | Agustin | 6h | 🟡 Medio | ✅ (más alcance del planeado — no quedó solo-lectura) |
| S9-6  | Migración páginas existentes: reemplazar `requireRole([...])` por `requirePermiso(...)` | Agustin | 4h | 🔴 Crítico | ✅ 8 módulos migrados |
| S9-7  | `InicioPage`: estructura con las 3 columnas del `landing.html` con contenido real | Agustin | 10h | 🔴 Crítico | ✅ `modules/inicio/pages/InicioPage.tsx` + `data/hubLinks.ts` (~40 links reales) |
| S9-8  | Filtro de tarjetas en `InicioPage` por `can(usuario, ...)` | Agustin | 4h | 🟡 Medio | 🟡 Parcial — buscador inteligente portado; filtro de tarjetas no implementado (los ~40 links son recursos externos sin permiso natural asociado) |
| S9-9  | Router: `RequirePermiso` genérico; `SinAccesoPage` | Agustin | 4h | 🔴 Crítico | ✅ |
| S9-10 | AppShell: 13 ítems/grupos del menú filtrados por `can()` | Agustin | 3h | 🔴 Crítico | ✅ |
| S9-11 | Migración páginas existentes: quitar gates internos | Agustin | 3h | 🟡 Medio | ✅ 7 sitios migrados a `can()` |

## Criterio de éxito

- Endpoints de escritura usan el nuevo middleware (sin listas hardcodeadas) ✅
- `/configuracion/permisos` renderiza la matriz para admin; oculta para el resto ✅
- `/` muestra `InicioPage` con 3 columnas (contenido real) ✅
- Menú sin items visibles para roles sin permiso ✅
- Acceso prohibido por URL da "Sin acceso" (`SinAccesoPage`) ✅

---

## Post-Sprint 9 — Normalización escalafones + deploy Render + sincronización Neon

**Fecha:** 2026-09-02/03 | **Autor:** Jorge

### Normalización de escalafones (`20260902000001_escalafon_normalizacion`)

- Nueva tabla `escalafon_codigos_registro` (CODIGO DE REGISTRO del Excel → escalafón canónico)
- 13 escalafones canónicos con código corto (`22`, `83`, `85`, `87`, etc.)
- `padron.service.ts` paso 2b reescrito para usar `escalafon_codigos_registro` como fuente de verdad

### Escalafón 16T (`20260902000002_escalafon_16T`)

- Nuevo escalafón `"Plantas Transitorias Modulo Operativo"` (código `16T`) detectado en dotación nueva

### Unificación Docentes (`20260902000003_unificar_docentes`)

- `"Docentes"` (inactivo) fusionado en `"Docentes Históricos"` (canónico, cod `7`)
- Migración sin UUIDs hardcodeados — usa `WHERE nombre = 'Docentes Históricos'`

### Fix RBAC — permisos del rol admin (`20260902000004_rbac_permisos_roles`)

- Rol `admin` tenía 0 permisos — la migración RBAC original usaba `nombre` en vez de `slug` en el `WHERE`
- Fix: migración idempotente (`ON CONFLICT DO NOTHING`) que asigna permisos por `slug`

### Fix permiso `bajas-sial.ver` (`20260902090000_bajas_sial_ver`)

- Permiso faltaba en el catálogo — el menú no mostraba "Bajas Consolidadas" para ningún rol

### Puestos CPH faltantes

- Tabla `especialidades_puesto` creada y sembrada: 95 especialidades médicas para puestos CPH
- 8 puestos CPH faltantes del Art. 6 Ley 6035 (Fisioterapeuta, Lic. en Estadísticas, etc.)
- 5 puestos de conducción CPH (Jefe de Sección/Unidad/División/Departamento, Director)

### Deploy Render — fix enums TypeScript

- Node 22 en Render usa strip-only mode — no transpila `enum` TypeScript
- Todos los `export enum` convertidos a `export const X = {...} as const` + `export type X`
- Afecta: `EstadoCargo`, `EstadoSnapshot`, `TipoDiff`, `TipoConcurso`, `EstadoConcursoCph`, `EstadoConcursoCeetps`, `EstadoBaja`

### Sincronización Neon (testing)

- Columnas `cuil` y `unificador_puesto` faltaban en `padron_historico` de Neon — aplicadas manualmente
- Script Python (`gen_sync_neon_v3.py`) generó SQL portable resolviendo FKs por `id_sial`/`cuil`
- Resultado final en Neon: `vigente` 47.721 cargos · `validacion_vacante` 114 cargos · schema 100% idéntico a local

### `EvolucionDotacionChart` — rediseño dashboard ejecutivo

- Dashboard ejecutivo completo: KPI cards + small multiples SVG por 6 macro-grupos (CPH · CEETPS · Escalafón General · Residentes · Docentes · Otros)
- Toggle "Por mes / Por subida" mantenido
