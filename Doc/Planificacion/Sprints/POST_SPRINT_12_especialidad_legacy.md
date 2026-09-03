# POST-SPRINT 12 — Auditoría especialidad_legacy + pg_trgm + fixes UI

**Fecha:** 2026-09 | **Autor:** Agustin + Claude
**Commit:** `af1c3f1` | **Rama:** deploy → jorge → main (mergeado)

---

## Causa raíz

La migración `20260910000001_especialidades_fk` renombró la columna `especialidad` → `especialidad_legacy` en la tabla `cargos` y agregó `especialidad_id` FK → `especialidades`. Todo el código que leía `cargo.especialidad` directamente devolvía `undefined` en runtime.

---

## Fixes aplicados

| Archivo | Problema | Fix |
| ------- | -------- | --- |
| `apps/api/src/modules/cargos/cargos.service.ts` | `createCargoService` escribía en campo inexistente `especialidad` | Corregido a `especialidadLegacy` |
| `apps/api/src/modules/cargos/cargos.service.ts` | Búsqueda por especialidad no funcionaba (columna renombrada) | Query raw con `LEFT JOIN especialidades e ON e.id = c.especialidad_id` + `similarity(e.nombre, $query) > 0.4` (pg_trgm) |
| `apps/web/src/modules/cargos/pages/CargoDetailPanel.tsx` | 2 ocurrencias de `cargo.especialidad` | `cargo.especialidadLegacy ?? cargo.especialidad` |
| `apps/web/src/modules/personas/pages/PersonaDetailPanel.tsx` | 3 ocurrencias (header, tabla detalle, tabla historial SIAL) | `especialidadLegacy ?? especialidad` |
| `apps/web/src/modules/cargos/pages/CargosPage.tsx` | Export Excel usaba `c.especialidad` | `c.especialidadLegacy ?? c.especialidad` |
| `apps/web/src/modules/concursos-cph/pages/ConcursoCphWizard.tsx` | `useEffect` (×2) + `useMemo` + tipo inline `CargoCph` | `especialidadLegacy ?? especialidad` + `especialidadLegacy?: string` en tipo |
| `apps/web/src/modules/cargos/pages/NuevaBajaPage.tsx` | `derivarDesdeCargo` leía `det.especialidad` (undefined) | `det.especialidadLegacy ?? det.especialidad` |
| `packages/types/src/index.ts` | Tipo `Cargo` sin `especialidadLegacy` ni `especialidadId` | Agregados; `especialidad` marcado `@deprecated` |

---

## Migraciones relacionadas

| Migración | Contenido |
| --------- | --------- |
| `20260910000001_especialidades_fk` | `RENAME COLUMN especialidad → especialidad_legacy` + `ADD COLUMN especialidad_id UUID FK → especialidades` |
| `20260910000002_pg_trgm` | `CREATE EXTENSION IF NOT EXISTS pg_trgm` |

---

## Estado BD post-auditoría

- 16.853 cargos con `especialidad_id` FK activa
- 181 especialidades en tabla `especialidades`
- Columna `especialidad` **no existe** en BD — todo el código usa `especialidad_legacy`

---

## Patrón de fallback (regla permanente)

En todo el frontend: `especialidadLegacy ?? especialidad`. El campo `especialidad` en el tipo `Cargo` de `packages/types` está marcado `@deprecated` y solo existe para compatibilidad de tipos — nunca viene poblado desde la API.

---

## Fix de sintaxis Babel

`CargoDetailPanel.tsx` línea 80: `??` mezclado con `||` sin paréntesis explícitos causaba error de parse en Babel/Vite. Corregido envolviendo el `??` en paréntesis: `(cargo.especialidadLegacy ?? cargo.especialidad)`.

---

## Modal NuevaBajaPage — mejoras UX

- Modal ampliado de `max-w-3xl` a `max-w-5xl`, altura `80vh` → `85vh`
- Columna "Puesto / Especialidad" separada en dos columnas independientes "Puesto" y "Especialidad"
- Búsqueda por especialidad funciona con variantes morfológicas (ej. "cardiologo" → "Cardiologia") gracias a pg_trgm con threshold `> 0.4`
