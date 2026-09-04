# POST-SPRINT 14 — Auditoría Personas/Cargos + exportables CPH/CEETPS

**Fecha:** 2026-09-04 | **Autor:** Agustin + Claude
**Rama:** — (sin mergear todavía, ver "Estado" en cada punto)

---

## Contexto

Serie de bugs encontrados en una sesión de revisión de los módulos Personas, Cargos y los documentos exportables de Concursos CPH/CEETPS (Validación/Autorización). Varios comparten la misma causa raíz que `POST_SPRINT_12_especialidad_legacy.md`: código que quedó leyendo columnas/campos renombrados o nunca migrados. Se agrupan acá para que Jorge los revise juntos y decida prioridad de deploy.

---

## 1. Filtro "Puesto" + "Especialidad" en Personas — roto

**Causa raíz:** `GET /api/v1/puestos` (alimenta el dropdown de Puesto y las especialidades en cascada de `PersonasPage`) hacía `array_agg(... especialidad ...)` sobre la tabla `cargos` — columna que ya no existe desde la migración `especialidades_fk` (ver POST_SPRINT_12). El endpoint devolvía 500, así que el dropdown de Puesto quedaba vacío y el de Especialidad nunca aparecía.

**Fix:** `apps/api/src/modules/puestos/puestos.routes.ts` — `especialidad` → `especialidad_legacy`.

**Estado:** ✅ Corregido y verificado. **Requiere rebuild del container `api`** (no hot-reload en Docker).

---

## 2. `SearchableSelect` — dropdown tapado por el header de tabla

**Causa raíz:** el panel desplegable del combobox de Puesto usaba `z-10`, mismo valor que el `<thead sticky>` de las tablas de Personas/Cargos. Con el mismo z-index, gana el que está después en el DOM (la tabla) — el dropdown quedaba parcialmente tapado.

**Fix:** `apps/web/src/shared/components/ui/SearchableSelect.tsx` — `z-10` → `z-20` (mismo valor que ya usa el combobox propio de `AltaCargosPage.tsx`).

**Estado:** ✅ Corregido (frontend, hot-reload).

---

## 3. Filtro "Ocupado/Vacante" en Cargos — 500 con cualquier combinación de filtros

**Causa raíz:** `listCargosService` armaba el filtro `ocupado` trayendo con `$queryRaw` **todos** los IDs de cargo ocupados (o vacantes) de **toda la base**, sin acotar por los demás filtros, y los pasaba como `id: { in: [...] }`. Con ~47.000 cargos ocupados, la lista de IDs superaba el máximo de bind variables de Postgres (32.767) y Prisma tiraba `Assertion violation on the database: too many bind variables`.

**Fix:** `apps/api/src/modules/cargos/cargos.service.ts` — reemplazado por el filtro relacional nativo de Prisma (`ocupaciones: { some/none: { hasta: null } }`), que Prisma traduce a `EXISTS`/`NOT EXISTS` sin materializar la lista de IDs.

**Estado:** ✅ Corregido y verificado (con y sin otros filtros, incluyendo el universo completo). **Requiere rebuild del container `api`.**

---

## 4. Especialidad ausente en el módulo Cargos — feature nueva

**Causa raíz:** no era un bug — Cargos nunca tuvo el filtro de Especialidad en cascada con Puesto (sí lo tiene Personas desde Sprint 3), ni columna de Especialidad en la tabla de resultados.

**Fix:**
- Nuevo shape en `GET /api/v1/cargos/puestos`: agrupa por puesto + especialidades reales (`especialidad_legacy`), filtrable por escalafón y/u hospital.
- Nuevo filtro `especialidad` en `GET /api/v1/cargos` (`cargos.schema.ts` + `cargos.service.ts`).
- Frontend (`CargosPage.tsx`): select de Especialidad en cascada, chip de filtro, columna "Especialidad" en la tabla.
- `CargoFilters` (packages/types) — nuevo campo `especialidad?: string`.

**Estado:** ✅ Implementado y verificado end-to-end. **Requiere rebuild del container `api`** (el fix del punto 1 y este comparten el mismo endpoint modificado).

---

## 5. Placeholder incorrecto en "Carga horaria" (Baja de Cargo)

**Causa raíz:** typo — `placeholder="37"` hardcodeado en vez de `"30"` en `NuevaBajaPage.tsx`.

**Fix:** corregido el placeholder.

**Estado:** ✅ Corregido (frontend, hot-reload).

---

## 6. Especialidad en blanco en TODOS los documentos exportables (CPH/CEETPS)

**Causa raíz:** mismo patrón que el punto 1 pero en `exportConcursoDocs.ts` — `getCasoCph`/`getCasoCeetps` leían `cargo?.especialidad` (relación de Prisma, nunca incluida en el payload de la API) en vez de `cargo?.especialidadLegacy`. Resultado: el campo "Especialidad" salía en blanco (`—`) en el 100% de los documentos generados — Word y PDF, Validación y Autorización, CPH y CEETPS.

**Fix:** `apps/web/src/shared/lib/exportConcursoDocs.ts` — `cargo?.especialidad` → `cargo?.especialidadLegacy` (2 ocurrencias).

**Estado:** ✅ Corregido y verificado generando un caso real de punta a punta (Baja + Concurso CPH real vía Wizard).

---

## 7. Colores y estructura de los exportables no coincidían con el Word oficial

**Causa raíz:** `exportConcursoDocs.ts` es un puerto deliberado de `dotacion-rrhh/frontend/src/utils/exportReport.js` — pero **el legacy JS tampoco usaba los colores del Word oficial** (`FORMULARIOS X CASO.docx`). Confirmado por muestreo de píxeles de las capturas reales embebidas en ese docx, consistente en 5 casos distintos (CPH y CEETPS):

| Elemento | Legacy JS (y nuestro puerto) | Word oficial (real) |
|---|---|---|
| Banner | `rgb(42,113,133)` | `rgb(69,129,142)` = `#45818E` |
| Caja roja | `rgb(220,38,38)` | `rgb(204,0,0)` = `#CC0000` |
| Caja verde | `rgb(5,150,105)` | `rgb(56,118,29)` = `#38761D` |

Además: el legacy JS aplicaba franjas alternadas por fila y bordes gris claro; el Word oficial usa filas blanco liso y bordes negros. Los valores de campo dentro de la caja roja van en rojo (mismo color del header); en la caja verde van en negro.

**Fix:** `exportConcursoDocs.ts` — paleta, bordes y color de texto actualizados para igualar el Word oficial (no el legacy JS). Afecta PDF (jsPDF) y Word (docx) por igual.

**Estado:** ✅ Corregido y verificado visualmente contra las capturas de `FORMULARIOS X CASO.docx` y contra un PDF real generado desde el Wizard.

---

## 8. Migración faltante: `puestos_cargo.tipo_puesto` — probablemente rota también en producción

**Causa raíz:** el modelo `PuestoCargo` en `schema.prisma` tiene el campo `tipoPuesto` (`@map("tipo_puesto")`, enum `TipoPuesto` ejecucion/conduccion) — pero **nunca se escribió la migración** que agrega esa columna. `prisma migrate status` decía "up to date" (compara contra el historial de migraciones que existen como archivo, no contra `schema.prisma`), así que este drift es invisible a los chequeos habituales.

Rompía con 500 (`P2022 — column puestos_cargo.tipo_puesto does not exist`) los endpoints `GET /api/v1/puestos-cargo` y `GET /api/v1/puestos-cargo/especialidades` — el selector de Puesto/Especialidad en la etapa de Designación de los Wizards de Concursos CPH/CEETPS, y el botón "Estructura" de Alta de Cargos.

**Fix:** nueva migración `20260904120000_puestos_cargo_tipo_puesto` — crea el enum + columna (default `ejecucion`) y hace backfill a `conduccion` de los 10 puestos de conducción sembrados en `20260903_puestos_faltantes` ("Jefe de Sección/Unidad/División/Departamento", "Director") que habían quedado con el default equivocado.

**Estado:** ✅ Aplicada y verificada en DB local. **⚠️ Como `migrate status` nunca lo iba a detectar solo, es muy probable que producción tenga exactamente el mismo problema — hay que correr `prisma migrate deploy` ahí también.** Esto es lo más urgente de todo este documento: es la única falla de esta lista con chance real de estar afectando usuarios reales ahora mismo.

---

## Pendiente — para que Jorge decida prioridad

### A. "Cantidad de Cargos" hardcodeado en `'1'` en los exportables
En el caso de Ampliación con más de un cargo, el Word oficial lista varios expedientes en líneas separadas dentro de la misma celda y dice "Cantidad de Cargos: 2" (o más). `exportConcursoDocs.ts` siempre pone `'1'` fijo y un solo expediente (`data.eeConcurso`, string único). No se tocó — antes de arreglarlo hay que confirmar si el modelo de datos de `ConcursoCph`/`ConcursoCeetps` siquiera contempla múltiples expedientes/cargos por registro, o si en la práctica esto no pasa en la app nueva (podría ser un caso legacy que ya no aplica).

### B. Exports Excel "consolidados" del legacy — ¿gap real o ya no hace falta?
El legacy (`exportReport.js`) tenía `exportBajasToExcel` (24 columnas) y `exportSeguimientoToExcel` (~45 columnas) para las vistas "Bajas Consolidadas" y "Seguimiento CPH". No se encontró un equivalente portado en la app nueva. Puede que `BajasPage`/`ConcursosCphPage` ya cubran esa necesidad de otra forma (export más acotado, u otro flujo), o puede ser un gap real de funcionalidad.

### C. Datos de prueba en la base local
Para verificar el punto 6/7 con un caso real se creó una Baja + Concurso CPH real sobre el cargo `CPH-POF-020591` (Martino, Carlos) — quedó con `estado: no_vigente`. Por decisión de Agustín se deja así por ahora (útil para seguir probando el Wizard). Si se quiere limpiar, son 3 `DELETE` + 1 `UPDATE` (detalle en el historial de la sesión).

---

## Resumen para deploy

| # | Fix | Requiere |
|---|---|---|
| 1, 3, 4 | Backend (`apps/api`) | Rebuild container `api` (local) — en producción, redeploy normal |
| 8 | Migración de base | **`prisma migrate deploy` en producción — urgente, probablemente ya roto ahí** |
| 2, 5, 6, 7 | Frontend (`apps/web`) | Ninguno especial — build/deploy normal de Vite |
