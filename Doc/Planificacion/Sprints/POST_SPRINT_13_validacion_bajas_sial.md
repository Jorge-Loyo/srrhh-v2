# POST-SPRINT 13 — Validación de Bajas: triangulación SIAL + filtros

**Fecha:** 2026-09 | **Autor:** Agustín
**Estado:** ✅ Completado

---

## Contexto

La página `/bajas/validacion` existía desde Sprint 8B mostrando solo los cargos en `validacion_vacante` detectados por el padrón. Este post-sprint la amplió para cruzar con el archivo SIAL de bajas y detectar inconsistencias que el padrón solo no puede ver.

---

## Cambios implementados

### 1. Reorganización de la página con sub-tabs

`ValidacionBajasPage.tsx` pasó de una tabla plana a 5 sub-tabs:

| Tab | Contenido |
|---|---|
| **Todos** | Tabla unificada con filas de validación + solo SIAL |
| **Triangulados ⚡** | Cargos en `validacion_vacante` con origen `ambos` (padrón + SIAL) |
| **Solo padrón** | Cargos en `validacion_vacante` con origen `padron` |
| **Solo baja SIAL ⚠** | Personas en SIAL activas en el padrón |
| **📁 Histórico** | Bajas ya confirmadas (últimos 200) |

Cards de resumen en el header: Triangulados / Solo padrón / Solo SIAL / Total.

### 2. Triangulación padrón + SIAL (`listValidacionService`)

Reescrito para cruzar con `BajaSialRegistro` del snapshot SIAL más reciente. Devuelve:
- `origen: 'padron' | 'baja_sial' | 'baja_manual' | 'ambos' | 'desconocido'`
- `tienePersonaActiva`, `enSial`, `sialFecha`

**Fix crítico:** `BajaSialSnapshot.estado` es `varchar` en BD (no enum). Cualquier query Prisma con `{ in: ['pendiente','aprobado'] }` falla con `operator does not exist: character varying = "EstadoSnapshot"`. Solución: `$queryRaw` con SQL directo.

### 3. Pestaña "Solo baja SIAL" (`listSoloBajaSialService`)

Personas en el archivo SIAL que siguen activas en el padrón. 320 registros encontrados en el snapshot pendiente `9e5e0c4d` (14.970 registros, fecha 06/09/2026).

**Cruce por CUIL normalizado:** `baja_sial_registros.cuil` tiene guiones (`27-38327821-5`), `padron_historico.cuil` no los tiene (`27383278215`). Join: `REPLACE(bsr.cuil, '-', '') = ph.cuil`.

**Join `cargos`:** `cargos.id_sial = bsr.cargo` (formato corto `001006950-2`), no `padron_historico.id_sial_rol` (formato largo `001006950-2-20084429091-2`). 203 de 320 tienen cargo matcheado.

Columnas: Apellido/Nombre, Hospital, Escalafón, Puesto, Cargo SIAL, Motivo, Código cargo, Estado cargo, botón "Dar de baja".

### 4. Tab "Todos" unificado

`CargoValidacion` y `CargoSoloBaja` normalizados a tipo `FilaUnificada` para una sola tabla con paginación unificada. Filas purple para triangulados, amber para solo SIAL.

### 5. Filtro por escalafón

`<select>` con los 20 escalafones de la BD junto al buscador de texto. Filtra en los tres arrays (`filtradosActivos`, `filtradosHistorico`, `filtradosSoloBaja`). Botón "Limpiar" cuando hay filtros activos. Se resetea al cambiar de tab.

**20 escalafones disponibles:** CEETPS, Nueva Carrera Administrativa, Nueva Carrera Enfermería, Nueva Carrera Profesional Hospitalaria, Salud - Guardias, Escalafón General, Carrera Gerencial, Cuerpo Especialistas Profesionales, Docentes, Docentes Históricos, Médicos, Planta Transitoria, Planta de Gabinete, Plantas Transitorias Acta 06/2014, Plantas Transitorias Modulo Operativo, Residentes, Régimen Modular Extraordinario PG, Autoridades Superiores, Gabinete, y uno con nombre vacío.

### 6. Fix menú lateral

`NavLink` de "Bajas" (`/bajas`) no tenía prop `end`, por lo que se marcaba activo en cualquier subruta incluyendo `/bajas/validacion`. Fix: agregar `end` al NavLink en `AppShell.tsx`.

---

## Bugs corregidos durante el desarrollo

| Bug | Causa | Fix |
|---|---|---|
| `busqueda is not defined` | Estado `busqueda` eliminado por error al refactorizar | Restaurado como `useState('')` |
| `Objects are not valid as React child {nombre}` | La tabla genérica renderizaba `CargoSoloBaja` que tiene objetos anidados | Tabla separada para solo SIAL con columnas explícitas |
| Tablas duplicadas en el JSX | Copia residual del JSX al reorganizar sub-tabs | Eliminadas |
| Bajas y Validación de Bajas se sombreaban juntos en el menú | `NavLink /bajas` sin `end` | Agregado `end` |

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `apps/api/src/modules/bajas/bajas.service.ts` | `listValidacionService` reescrito con triangulación SIAL. Nuevos: `listSoloBajaSialService`, `listValidacionHistoricoService` |
| `apps/api/src/modules/bajas/bajas.routes.ts` | Rutas `/solo-baja` e `/historico` antes de `/:cargoId`. Total: 5 rutas de validación |
| `apps/web/src/modules/bajas/pages/ValidacionBajasPage.tsx` | Reorganización completa: sub-tabs, cards resumen, tabla unificada, filtro escalafón, 3 queries |
| `apps/web/src/shared/components/layout/AppShell.tsx` | `end` en NavLink de Bajas |

---

## Datos reales (snapshot SIAL `9e5e0c4d`)

| Métrica | Valor |
|---|---|
| Registros en snapshot SIAL | 14.970 |
| Fecha del snapshot | 06/09/2026 |
| Personas en SIAL con cargo activo en padrón | 320 |
| De esas 320, con cargo matcheado en tabla `cargos` | 203 |
