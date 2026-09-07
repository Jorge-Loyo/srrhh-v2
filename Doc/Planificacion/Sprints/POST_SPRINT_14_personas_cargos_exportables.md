# POST-SPRINT 14 — Auditoría Personas/Cargos + exportables CPH/CEETPS

**Fecha:** 2026-09-04 | **Autor:** Agustin + Claude
**Rama:** `Agustin` — mergeado con `origin/jorge` y pusheado (commit `b9aaeef`). Ver punto 9.

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

## 9. Merge con `origin/jorge` — 2 conflictos, uno de fondo

Se mergeó `origin/jorge` (Sprint 13: módulo `Autorizacion` + `SolicitudAlta`, KPIs de bajas, PWA) sobre esta rama. Dos conflictos:

- **`SearchableSelect.tsx`**: mismo bug del punto 2, arreglado en paralelo por los dos — yo puse `z-20`, Jorge `z-30`. Se tomó `z-30` (Jorge), más conservador.
- **`cargos.service.ts`**: los dos arreglamos en paralelo el crash del punto 3 (bind variables de Postgres en el filtro "Ocupado"), pero de forma distinta:
  - Jorge acota la lista de IDs por `escalafonId`/`puesto`, pero **no por `hospitalId`, ni cuando no hay ningún otro filtro activo**.
  - El fix de este documento (relación nativa de Prisma `ocupaciones.some/none`) elimina el problema de raíz sin depender de qué filtros estén puestos.
  - Se verificó **después del merge** que el caso que el fix de Jorge no cubre (`ocupado=true` solo, sin ningún otro filtro — 46.889 filas, el crash original reproducido en este documento) sigue funcionando en `200` con el fix que quedó. Se mantuvo ese.

Post-merge: `prisma generate` (modelos `Autorizacion`/`SolicitudAlta` nuevos) + `prisma migrate deploy` de las 3 migraciones `s13_*` en DB local. Typecheck limpio en los 3 paquetes. Container `api` reconstruido y verificado.

**Estado:** ✅ Mergeado y pusheado a `origin/Agustin`. No llegó a `deploy`/`main` ni a producción.

---

## 10. `EstadoBaja` — dos estados no tienen forma de alcanzarse desde la UI

Surgió de una pregunta de Agustín sobre qué significan `resolucion_a_la_firma` y `pendiente` en Baja de Cargo / Alta por Baja. Quedó un hallazgo más grande de lo esperado — no es un bug puntual, es una pieza de Sprint 13 que Jorge no llegó a construir.

### Cómo funciona hoy (verificado en código)

Baja de Cargo y Alta por Baja son dos listados que abren **el mismo wizard** (`NuevaBajaPage.tsx`). El estado que queda grabado depende del botón que se aprieta dentro del wizard, no de qué pantalla lo abrió:

```
Paso 1 ──[Guardar borrador]──► resolucion_a_la_firma
  │                              (cargo sigue vigente, no se crea concurso)
  │
  └─[Continuar →]──► Paso 2/3 ──[Registrar baja]──► pendiente
                                  (cargo → no_vigente,
                                   se crea el concurso si corresponde,
                                   TODO ESTO YA PASA ACÁ)
                                        │
                                        ▼
                                   ❌ sin salida
                          (ningún botón de la UI mueve una baja
                           "pendiente" a `confirmada` o `anulada`)
```

`confirmada` y `anulada` existen en el enum de la base y en los filtros de la UI, pero **ningún código los escribe jamás** — verificado con grep sobre todo `bajas.service.ts` y ambas páginas.

### Por qué pasa: es Sprint 13, sin terminar

El plan ya estaba escrito en `SPRINT_12_13_ux_bajas_autorizaciones.md` (Sprint 13, estado `📋 Planificado`): un modelo genérico `Autorizacion` con 3 tipos —`concurso_cph`, `baja_cargo`, `alta_cargo`— donde el `director` aprueba o rechaza y eso resuelve el estado del objeto original.

Jorge implementó el módulo en el merge del punto 9, pero **solo con 2 de los 3 tipos**: `TipoAutorizacion` quedó en `concurso_cph | alta_cargo`. Lo único que tocó de Bajas fue agregar una notificación al director cuando una baja pasa a `pendiente` (`bajas.service.ts`, S13-8) — avisa, pero no hay ningún endpoint ni botón para que el director la resuelva.

### Por qué esto no es "agregar el tipo que falta y listo"

Comparando cómo funciona `alta_cargo` (lo que Jorge sí construyó) contra cómo funcionaría `baja_cargo` calcado igual, hay una asimetría real:

- **Alta (`SolicitudAlta`)** es un gate preventivo genuino: mientras no la aprueba el director, **no existe ningún `Cargo`** — es una fila aparte. Si el director rechaza, no hay que deshacer nada porque nunca se creó nada real.
- **Baja, como está hoy**, ya produce sus efectos reales *antes* de que exista cualquier autorización: en `createBajaService`, en el mismo paso donde queda `pendiente` (no en uno posterior), el cargo pasa a `no_vigente` y el concurso **ya se crea**.

Si se agrega `baja_cargo` calcando el circuito de Jorge tal cual —crear la `Autorizacion` cuando la baja pasa a `pendiente`, director aprueba/rechaza después— el director estaría aprobando algo que **ya pasó**. Si rechaza, ¿qué se hace? ¿Se revierte el cargo a `vigente`? ¿Se cancela un concurso que ya pudo tener movimiento? Es un caso mucho más difícil de deshacer que el de Alta.

### Dos caminos, según cuál sea la intención real del proceso administrativo

| Si la intención es... | Qué hay que construir |
|---|---|
| **Auditoría/sello posterior** — la baja ya es efectiva al registrarla, la confirmación del director es un trámite que deja rastro pero no bloquea nada | Alcanza con calcar el circuito de Jorge tal cual: agregar `baja_cargo` a `TipoAutorizacion` y crear la `Autorizacion` en paralelo a la notificación que ya existe, sin tocar el timing actual. Cambio chico. |
| **Gate real** — el director tiene que aprobar *antes* de que el cargo quede vacante y se abra el concurso, igual que con Alta | Hay que mover el efecto (cargo → `no_vigente` + creación del concurso) del punto donde pasa hoy (`pendiente`, en `createBajaService`) al punto donde se aprueba (`confirmada`). Cambio más grande: registrar la baja no debería tocar nada hasta que el director la apruebe. |

**No hay forma de saber cuál es la correcta sin el dato real de cómo funciona el trámite fuera del sistema** — es una decisión de negocio, no algo que se pueda inferir del código. Se deja documentado acá para que Jorge lo lea y decida antes de que se toque nada de esto.

**Estado:** 🔲 Sin implementar, sin decidir. No es un bug — es un sprint (13) a medio terminar, con una pregunta de diseño abierta encima.

---

## Pendiente — para que Jorge decida prioridad

### A. "Cantidad de Cargos" hardcodeado en `'1'` en los exportables
En el caso de Ampliación con más de un cargo, el Word oficial lista varios expedientes en líneas separadas dentro de la misma celda y dice "Cantidad de Cargos: 2" (o más). `exportConcursoDocs.ts` siempre pone `'1'` fijo y un solo expediente (`data.eeConcurso`, string único). No se tocó — antes de arreglarlo hay que confirmar si el modelo de datos de `ConcursoCph`/`ConcursoCeetps` siquiera contempla múltiples expedientes/cargos por registro, o si en la práctica esto no pasa en la app nueva (podría ser un caso legacy que ya no aplica).

### B. Exports Excel "consolidados" del legacy — ¿gap real o ya no hace falta?
El legacy (`exportReport.js`) tenía `exportBajasToExcel` (24 columnas) y `exportSeguimientoToExcel` (~45 columnas) para las vistas "Bajas Consolidadas" y "Seguimiento CPH". No se encontró un equivalente portado en la app nueva. Puede que `BajasPage`/`ConcursosCphPage` ya cubran esa necesidad de otra forma (export más acotado, u otro flujo), o puede ser un gap real de funcionalidad.

### C. Datos de prueba en la base local
Para verificar el punto 6/7 con un caso real se creó una Baja + Concurso CPH real sobre el cargo `CPH-POF-020591` (Martino, Carlos) — quedó con `estado: no_vigente`. Por decisión de Agustín se deja así por ahora (útil para seguir probando el Wizard). Si se quiere limpiar, son 3 `DELETE` + 1 `UPDATE` (detalle en el historial de la sesión).

### D. `baja_cargo` sin autorización — ver punto 10
Bajas registradas quedan en `pendiente` para siempre, sin forma de llegar a `confirmada`/`anulada` desde la UI. Hay una decisión de diseño abierta (¿la confirmación es previa o posterior al efecto real de la baja?) antes de poder implementarlo — ver detalle completo en el punto 10.

---

## Resumen para deploy

| # | Fix | Requiere |
|---|---|---|
| 1, 3, 4 | Backend (`apps/api`) | Rebuild container `api` (local) — en producción, redeploy normal |
| 8 | Migración de base | **`prisma migrate deploy` en producción — urgente, probablemente ya roto ahí** |
| 2, 5, 6, 7 | Frontend (`apps/web`) | Ninguno especial — build/deploy normal de Vite |
| 9 | Merge `origin/jorge` → `Agustin` | Ya pusheado a `origin/Agustin` — falta promoverlo a `deploy`/`main` |
| 10 | `baja_cargo` sin autorización | Nada que deployar — requiere decisión de Jorge antes de escribir código |
