# SPRINT 8 — Estado `validacion_vacante` + Validación de Bajas + Triangulación histórica

**Estado:** ✅ Completo — S8A, S8B y S8C implementados, build limpio
**Autor:** Jorge (8A/8B) + Agustin (8C)

---

## Sprint 8-A — Migración y lógica

**Objetivo:** Implementar el estado intermedio `validacion_vacante` en el flujo del padrón.

### Reglas de negocio definitivas

**Estados del cargo:**

```
vigente            → cargo activo en la estructura
no_vigente         → estado terminal, solo por acto administrativo manual
validacion_vacante → estado intermedio, solo generado por el padrón semanal
```

| Evento | Estado resultante | Quién lo hace |
| ------ | --------------- | ------------- |
| Alta de cargo (manual o padrón) | `vigente` | Sistema |
| Padrón detecta "eliminado" | `validacion_vacante` | Padrón automático |
| Operador confirma la baja desde Validación de Bajas | `no_vigente` | Manual |
| Operador rechaza desde Validación de Bajas | `vigente` (vuelve) | Manual |
| Baja manual sin concurso | `no_vigente` | Manual |
| Reemplazo de persona | `vigente` (se mantiene) | Manual |

### Tareas 8-A

| #     | Tarea | Estado |
| ----- | ----- | ------ |
| S8A-1 | Migración enum: `EstadoCargo` extendido con `validacion_vacante` + columna `estado_desde DATE` en `cargos` | ✅ |
| S8A-2 | Padrón: "eliminados" pasan a `validacion_vacante` + `estadoDesde = fechaAsignada` | ✅ |
| S8A-3 | Padrón: alerta bloqueante — `getConflictosValidacionService`, endpoint `GET /snapshots/:id/conflictos-validacion`, panel naranja en `PadronDiffPage` | ✅ |
| S8A-4 | `/cargos/baja/nueva`: incluir `validacion_vacante` — 2 queries paralelas, badge "En validación" | ✅ |
| S8A-5 | `CargosPage`: badge naranja "En Validación", opción en filtro de estado, columna "Días" | ✅ |

---

## Sprint 8-B — Página Validación de Bajas

| #     | Tarea | Estado |
| ----- | ----- | ------ |
| S8B-1 | Ruta nueva `/bajas/validacion` + link "⚠️ Validación de Bajas" en menú lateral | ✅ |
| S8B-2 | Backend: `GET /api/v1/bajas/validacion` — lista cargos en `validacion_vacante` con última ocupación cerrada y días en estado | ✅ |
| S8B-3 | Backend: `POST /api/v1/bajas/validacion/:cargoId/confirmar` — cargo → `no_vigente`, acto administrativo opcional | ✅ |
| S8B-4 | Backend: `POST /api/v1/bajas/validacion/:cargoId/rechazar` — cargo → `vigente`, reabre ocupación | ✅ |
| S8B-5 | Frontend: `ValidacionBajasPage` — tabla con días coloreados (verde/naranja/rojo según umbral 14/30 días), modales confirmar/rechazar | ✅ |

### Criterio de éxito Sprint 8-A/B

- El padrón ya no marca cargos directamente como `no_vigente` — pasan por `validacion_vacante` ✅
- La aprobación del padrón se bloquea si hay cargos en `validacion_vacante` que reaparecen ✅
- El operador puede confirmar o rechazar cada baja desde `/bajas/validacion` ✅
- `CargosPage` muestra el estado `validacion_vacante` con badge naranja y días en estado ✅
- Build limpio: `pnpm --filter @srrhh/api build` y `pnpm --filter web build` sin errores ✅

---

## Sprint 8-C — Triangulación histórica

**Fecha:** 2026-09-03 | **Autor:** Agustin

| #     | Tarea | Estado |
| ----- | ----- | ------ |
| S8C-1 | `CargoDetailPanel`: secciones "Concursos CPH" y "Concursos CEETPS" — `getCargoByIdService` fetcha ambos en paralelo vía `Promise.all` | ✅ |
| S8C-2 | `PersonaDetailPanel`: sección collapsible "Historial padrón semanal" — `getPersonaByIdService` incluye `padronHistorico` completo | ✅ |
| S8C-3 | Endpoint triangulación implementado embebido en `GET /cargos/:id` y `GET /personas/:id` | ✅ |

### Regla de negocio — triangulación baja SIAL en ocupaciones

Una ocupación puede tener `situacionRevista = Activo` y `hasta = null`, pero existir una baja registrada en SIAL para ese mismo `idSialRol`. La fuente de verdad de la baja es `bajasSial`.

- En `PersonaDetailPanel`, cada ocupación cruza su `idSialRol` base contra `bajasSial`
- Si hay match: badge "Baja", `Situacion de revista` muestra "Baja", fila separada con borde rojo con Fecha/Motivo/Doc de baja

---

## Archivos modificados (Sprint 8 completo)

| Archivo | Cambio |
| ------- | ------ |
| `prisma/schema.prisma` | `EstadoCargo` enum con `validacion_vacante`. `Cargo.estadoDesde DateTime?` |
| `prisma/migrations/20260819000000_s8a_validacion_vacante/migration.sql` | `ALTER TYPE + ADD COLUMN` |
| `packages/types/src/index.ts` | `EstadoCargo.VALIDACION_VACANTE`, `Cargo.estadoDesde`, `PadronHistoricoItem`, `PersonaDetail.padronHistorico`, `CargoDetail.concursosCph/ceetps` |
| `apps/api/src/modules/padron/padron.service.ts` | Paso 4 usa `validacion_vacante`. Nueva `getConflictosValidacionService` |
| `apps/api/src/modules/bajas/bajas.service.ts` | 3 nuevas funciones: `listValidacionService`, `confirmarValidacionService`, `rechazarValidacionService` |
| `apps/api/src/modules/cargos/cargos.service.ts` | `getCargoByIdService`: `Promise.all` para concursos CPH + CEETPS |
| `apps/api/src/modules/personas/personas.service.ts` | `getPersonaByIdService`: include `padronHistorico` con `snapshot` |
| `apps/web/src/modules/bajas/pages/ValidacionBajasPage.tsx` | Página nueva completa |
| `apps/web/src/modules/padron/pages/PadronDiffPage.tsx` | Panel bloqueante, query conflictos, badge botón Aprobar |
| `apps/web/src/modules/cargos/pages/CargoDetailPanel.tsx` | Secciones CPH y CEETPS con tablas, badges, links |
| `apps/web/src/modules/personas/pages/PersonaDetailPanel.tsx` | Sección collapsible padrón histórico; triangulación baja SIAL |
