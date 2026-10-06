# Auditoría de estado de la documentación (`Doc/`) — SRRHH-Legacy

> Auditoría de **solo lectura**. No se modificó ningún archivo; este informe recomienda ediciones pero no las aplica.
> Fecha: 2026-10 (sesión posterior al merge jorge/main/deploy que cerró S21/S22 y renumeró nuestro sprint a 24).
> Repo auditado: `c:\Desarrollo\SRH\SRRHH-Legacy`
> Plan maestro: `Doc/Planificacion/PLAN_SCRUM_2026.md`

---

## 1. Resumen (respuesta corta)

El `PLAN_SCRUM_2026.md` quedó **desactualizado en su tabla ESTADO ACTUAL y en su header** respecto del trabajo ya commiteado:

- **Sprint 21** y **Sprint 22** figuran como `📋 Planificado` en el plan, pero sus archivos de sprint dicen `✅ COMPLETO` y no tienen tareas pendientes. **Hay que marcarlos completos.**
- **Sprint 23** cambió de dueño y de alcance: en el plan sigue descrito como un plan a futuro de Jorge/Agustín con estado `📋 Planificado`, pero el archivo real `SPRINT_23_areas_programaticas.md` tiene **las 11 tareas (S23-1..S23-11) marcadas ✅ hechas 2026-10-05**. El header del propio archivo todavía dice `📋 Planificado` — **inconsistencia dentro del propio Sprint 23** (header vs tabla de tareas). Es el sprint de Áreas Programáticas de Agustín.
- **Sprint 24** (nuestro, "Cargos de conducción vacantes", `📋 Planificado`, NO empezado) **no figura en la tabla** del plan maestro. Hay que agregarlo.
- El header `Última actualización` del plan quedó en `2026-09-30` y no menciona los fixes de la sesión 2026-10 (organigrama, especialidad catálogo, padrón reapertura, KPIs, Dotaneitor columnas, spanish_unaccent).
- Tres documentos de referencia/contrato siguen listando la columna **`personas.especialidad_principal`** como viva, cuando fue **eliminada en S21-5** (se deriva en runtime): `Contratos/Contrato_Datos.md`, `Referencias/DATA_CLEANING_ESPECIALIDADES.md`, `Referencias/MAPEO_NORMALIZACION_BD.md`.

Sprints realmente con tareas pendientes (no cerradas): **Sprint 24** (planificado, 0% — es correcto que esté abierto) y, con matices, **Sprint 14** (sigue `📋 Planificado` en el plan). Todo lo demás de la franja 20-23 está cerrado a nivel código; lo único no cerrado son verificaciones visuales en navegador (S23-7/8/9, S21 PDFs) que los propios docs dejan anotadas como pendientes de "paseo visual", no de código.

---

## 2. Tabla comparativa por sprint (header del archivo vs PLAN_SCRUM)

| Sprint | Estado en header del archivo | Estado en PLAN_SCRUM (tabla ESTADO ACTUAL) | ¿Coincide? | Acción sugerida |
| ------ | ---------------------------- | ------------------------------------------ | ---------- | --------------- |
| **Sprint 20** — Consolidación catálogo (`SPRINT_20_consolidacion_puesto_escalafon_especialidad.md:3`) | `✅ Completo` (con nota de verificación e2e simulada) | `✅ Completado y mergeado` (`PLAN_SCRUM:66`) | **Sí** | Ninguna (ok). Opcional: unificar wording. |
| **Sprint 21** — Consumidores secundarios (`SPRINT_21_consumidores_secundarios_especialidad.md:3`) | `✅ COMPLETO (2026-10)` — verificado e2e con padrón real; S21-5 (eliminación `especialidadPrincipal`) cerrada; S21-3/S21-4 descartadas por cambio de alcance | `📋 Planificado — depende de Sprint 20 ✅` (`PLAN_SCRUM:67`) | **No** | Cambiar fila a `✅ Completado`. |
| **Sprint 22** — Dotaneitor v2 lineal (`SPRINT_22_dotaneitor_catalogo.md:3`) | `✅ COMPLETO (cierre 2026-09-22)` — pipeline lineal `POST /procesar-padron`, JCAT→jefatura, verificado e2e. S22-12 Opción B FK diferida a otro sprint | `📋 Planificado — depende de Sprint 20 ✅ y Sprint 21 ✅` (`PLAN_SCRUM:68`) | **No** | Cambiar fila a `✅ Completado` (anotando S22-12 Opción B como deuda diferida). |
| **Sprint 23** — Áreas Programáticas (`SPRINT_23_areas_programaticas.md:3`) | `📋 Planificado` **(header)** — pero la tabla de tareas tiene **S23-1..S23-11 todas ✅ (2026-10-05)** y la narrativa dice "hecha 2026-10-05" en cada tarea | `📋 Planificado — ... independiente de S20/S21/S22` (`PLAN_SCRUM:69`), descrito como plan a futuro | **No** (dos niveles de desfase) | 1) En el plan: cambiar el dueño/estado a Sprint 23 = Áreas Programáticas de **Agustín**, estado real (código ✅, falta solo verificación visual). 2) En el propio archivo: corregir el **header** `Estado:` a `✅` (o `✅ con verificación visual pendiente`) para que coincida con su propia tabla de tareas. |
| **Sprint 24** — Cargos de conducción vacantes (`SPRINT_24_cargos_conduccion_vacantes.md:3`) | `📋 Planificado` — S24-1..S24-10 todas `📋`, NO empezado | **No existe fila** en la tabla del plan (la tabla termina en Sprint 23, `PLAN_SCRUM:69`) | **No (falta la fila)** | Agregar fila nueva Sprint 24 = `📋 Planificado`, nuestro, dependiente de S20 ✅ / S22 ✅ + fixes organigrama 2026-10. |

Sprints previos (0–19): revisados por encima vía la tabla del plan; todos `✅ Completado` y consistentes con sus archivos. La única fila "vieja" que sigue en `📋 Planificado` es **Sprint 14 — Concurso desde Alta de Cargo** (`PLAN_SCRUM`, fila Sprint 14), que queda fuera del foco de esta sesión pero conviene revisar si realmente sigue pendiente.

---

## 3. Evidencia detallada

### 3.1 Headers de los sprints recientes

- `SPRINT_20_...md:3` → `**Estado:** ✅ Completo, con el pipeline de import de padrón verificado de punta a punta (simulado...)`. Sin tareas sin tildar en su tabla.
- `SPRINT_21_...md:3` → `**Estado:** ✅ COMPLETO (2026-10). Verificado e2e con el padrón real cargado (43.572 cargos / 42.023 personas). S21-3 y S21-4 descartadas por cambio de alcance...`. S21-5 presente y ✅ (`SPRINT_21_...md:59`): "`Persona.especialidadPrincipal` ... se resuelve **en runtime** ... Se elimina la columna". Las únicas marcas ❌ de la tabla son S21-3/S21-4 **DESCARTADAS** (no pendientes).
- `SPRINT_22_...md:3` → `**Estado:** ✅ COMPLETO (cierre 2026-09-22 — pipeline lineal POST /procesar-padron ... S22-12 Opción B FK queda para otro sprint)`. Pipeline lineal confirmado en el cuerpo. Sin tareas `📋` en la tabla.
- `SPRINT_23_...md:3` → `**Estado:** 📋 Planificado` **(desactualizado)**; pero la tabla de tareas (`SPRINT_23_...md:~56-77`) tiene **S23-1 a S23-11 todas con estado ✅** y texto "hecha 2026-10-05", incluyendo módulo Prisma (`areaProgramatica`/`cesac`/`unidadFijaApayC`), seed, backfill, backend `areas-programaticas/`, dimensiones en `/dotacion`, frontend y exposición del "Jefe". Los checkboxes de "Criterio de éxito" siguen en `[ ]` (sin tildar) pero cada criterio está cubierto por su tarea ✅ correspondiente.
- `SPRINT_24_...md:3` → `**Estado:** 📋 Planificado`; tabla S24-1..S24-10 todas `📋` (`SPRINT_24_...md:82-91`). Correctamente sin empezar.

### 3.2 Tabla ESTADO ACTUAL del plan maestro (`PLAN_SCRUM_2026.md`)

- Header: `PLAN_SCRUM_2026.md:6` → `Última actualización: 2026-09-30 (Sprint 18 ... ; Sprint 19 ...)` — no menciona 20/21/22/23/24 ni los fixes 2026-10.
- `PLAN_SCRUM_2026.md:66` Sprint 20 → `✅ Completado y mergeado`. OK.
- `PLAN_SCRUM_2026.md:67` Sprint 21 → `📋 Planificado — depende de Sprint 20 ✅`. **Desactualizado** (archivo dice ✅).
- `PLAN_SCRUM_2026.md:68` Sprint 22 → `📋 Planificado — depende de Sprint 20 ✅ y Sprint 21 ✅`. **Desactualizado** (archivo dice ✅).
- `PLAN_SCRUM_2026.md:69` Sprint 23 → `📋 Planificado — ... Catálogo oficial de Áreas Programáticas y CeSACs ... independiente de S20/S21/S22`. **Desactualizado**: el trabajo está hecho (Agustín, 2026-10-05).
- No hay fila Sprint 24: la tabla termina en la fila Sprint 23 (`PLAN_SCRUM_2026.md:69`), seguida de `---` y `## 1. CONTEXTO DEL EQUIPO`.

### 3.3 git log (confirmación de que el trabajo está commiteado)

`git log --oneline` sobre `jorge` (= `origin/main` = `origin/deploy` = `origin/jorge`, HEAD `60e58ff`) muestra, entre otros:

- `60e58ff docs: renumerar nuestro sprint a 24 (el 23 lo ocupa Areas Programaticas de Agustin)`
- `f4b922c feat(dotaneitor): excluir columnas internas del Excel descargable + plan Sprint 23`
- `5d963ca feat(kpis): excluir Residencias y Docentes de la dotacion por carrera`
- `c9fd421 fix(padron): reabrir ocupacion de un rol que reaparece en el padron`
- `3019568 fix(organigrama): sacar el sufijo "- AP {hospital}" repetido en los CeSAC`
- `9f3dfcc fix(especialidad): usar la especialidad del catalogo, no la legacy`
- `1ce9687 feat(organigrama): nombre real de hospital en los nodos de Area Programatica`
- `0bbd8f7 fix(organigrama): mostrar personas, conductores correctos y arreglos de vista`
- `2e6fc35 fix(personas): recrear config de texto spanish_unaccent para la busqueda`
- `76721d9 docs(S23-9) ...`, `76130ed feat(S23-11) ...` (Sprint 23 cerrado)

Es decir, los sprints 21/22/23 y todos los fixes 2026-10 están en las ramas principales. Los docs de planificación son lo que no se actualizó.

---

## 4. Ediciones concretas a hacer en `PLAN_SCRUM_2026.md`

Prioridad alta (desfases de estado):

1. **Fila Sprint 21** (`:67`): cambiar `📋 Planificado — depende de Sprint 20 ✅` → `✅ Completado (2026-10) — verificado e2e con padrón real (43.572 cargos / 42.023 personas); S21-5 eliminó la columna `especialidad_principal` (derivada en runtime); S21-3/S21-4 descartadas por cambio de alcance`.
2. **Fila Sprint 22** (`:68`): cambiar `📋 Planificado — depende de Sprint 20 ✅ y Sprint 21 ✅` → `✅ Completado (cierre 2026-09-22) — reescritura lineal `POST /procesar-padron`, resolución contra catálogo, JCAT→jefatura (texto, Opción A), `jcat_cargo_jefatura`; S22-12 Opción B FK diferida a sprint futuro`.
3. **Fila Sprint 23** (`:69`): mantener el título "Áreas Programáticas y CeSACs" pero cambiar estado a `✅ Completado (2026-10-05, Agustín) — módulos Prisma `areaProgramatica`/`cesac`/`unidadFijaApayC`, seed Anexo III (52 CeSACs) + Decreto 306-26 (7 unidades fijas), backfill `cesacId`/`unidadFijaId`, backend `areas-programaticas/`, dimensiones en `/dotacion`, UI dentro de Organigrama, "Jefe" en runtime. Falta solo verificación visual en navegador`. Ajustar la columna "Tareas" a `S23-1 a S23-11` (ya existe) y dejar claro que es de Agustín.
4. **Agregar fila Sprint 24** (nueva, después de la de Sprint 23): `Sprint 24 — Cargos de conducción vacantes derivados del organigrama` | `📋 Planificado — depende de Sprint 20 ✅, Sprint 22 ✅ y los fixes de organigrama 2026-10 (JCAT + escalafón gerencial, orden jerárquico de conductores, SSAPAC en Nivel Central). Mapea vacantes reales de conducción (caso testigo CEMAR IV: 12 agentes, 0 jefatura modelada)` | `S24-1 a S24-10` | `Sprints/SPRINT_24_cargos_conduccion_vacantes.md`.
5. **Header `Última actualización`** (`:6`): actualizar a `2026-10` y agregar los hitos de la sesión: Sprint 21 ✅, Sprint 22 ✅ (Dotaneitor v2 lineal), Sprint 23 ✅ (Áreas Programáticas, Agustín), Sprint 24 planificado; y los fixes: organigrama (personas por JCAT, conductores jerárquicos, SSAPAC en Nivel Central, selector hospitales, color GO, agrupador DGA), especialidad usa catálogo (`especialidadPuesto.nombre`) en vez de `especialidad_legacy`, padrón reapertura de ocupaciones, KPIs excluyen Residencias/Docentes, Dotaneitor columnas internas fuera del Excel, migración `spanish_unaccent` recreada.

Prioridad media:

6. Revisar la **fila Sprint 14** (`📋 Planificado`): confirmar si sigue realmente pendiente o si quedó absorbido/obsoleto; hoy es la única fila vieja en estado planificado.
7. Donde el plan haga referencia a "Sprints 20/21/22 consolidados (taller Dotaneitor)" en el header de revisión 2026-09-28, dejar la nota de que ya se cerraron (21 y 22), no solo planificados.

---

## 5. Otros documentos de `Doc/` a actualizar por el trabajo reciente

Desactualizaciones evidentes (no se buscó exhaustividad):

1. **`Doc/Contratos/Contrato_Datos.md:74`** — lista `especialidad_principal` (VARCHAR(200)) como columna viva de `personas` ("Especialidad médica del cargo actual del padrón, si aplica"). **Eliminada en S21-5**; ahora se deriva en runtime (`COALESCE(ep.nombre, c.especialidad_legacy)`). Acción: quitar la fila de la columna o marcarla como "derivada en runtime, ya no es columna persistida". La fila `especialidad_cph` (`:75`) la referencia como distinta, revisar el texto de contraste. El header del contrato (`:4`) ya advierte "en reescritura (Sprints 20-22)", pero conviene cerrar esa advertencia ahora que 20/21/22 terminaron y reflejar el schema final.
2. **`Doc/Referencias/DATA_CLEANING_ESPECIALIDADES.md:35`** — tabla de fuentes lista `personas` → `especialidad_cph`, `especialidad_principal`. Acción: quitar `especialidad_principal` de las columnas vivas (o anotar que fue eliminada). El propio PLAN_SCRUM ya marca este doc como "limpieza retroactiva obsoleta por migrate reset del S20".
3. **`Doc/Referencias/MAPEO_NORMALIZACION_BD.md:48`** — fila `personas.especialidad_principal` (23.664 valores). Acción: anotar que la columna fue eliminada (S21-5) y la métrica es histórica/pre-eliminación.

Sin cambios necesarios (verificados):

- **`Doc/Referencias/AUDITORIA_ESPECIALIDAD.md`** — YA refleja correctamente que `especialidad_principal` fue eliminada en S21-5 y que no hay riesgo runtime (su §4 lo documenta explícitamente, `:210-223`). Es el doc de auditoría de la especialidad al catálogo. No requiere corrección.
- **Dotaneitor README**: no existe un README del Dotaneitor dentro de `Doc/` (el código vive en `services/dotaneitor/*.py`, sin `.md` de doc en Doc/). `Doc/Referencias/DOTANEITOR_EVALUACION.md` / `DOTANEITOR_DECISIONES.md` / `dotaneitor_evaluacion.html` describen el **estado previo y las decisiones del taller**; son históricos de diseño que alimentaron S20/21/22 — no hace falta corregirlos, pero conviene anotar al tope que el rediseño ya se implementó (S22 cerrado) si se quiere mantenerlos como vigentes y no solo como registro del taller.

No revisados en profundidad (sin desfase evidente a simple vista): `Doc/Normas/*` (PDFs de leyes/decretos, no cambian con el código), `Doc/Contratos_Paginas/`, resto de `Doc/Contratos/*` (Back, Front, Docker, Padron, Retenciones, etc.), `Doc/Desarrollo/ARRANQUE_LOCAL.md` y `DEPLOY_PRODUCCION.md`. Si se quiere exhaustividad, el candidato más probable a tener residuos de `especialidad_legacy`/`especialidad_principal` o del modelo de sesión viejo del Dotaneitor es `Contrato_Padron.md`.

---

## 6. Sprints con tareas realmente pendientes (no cerradas)

- **Sprint 24 — Cargos de conducción vacantes:** `📋 Planificado`, S24-1..S24-10 todas sin empezar. Pendiente real y correcto (recién creado). Es el próximo trabajo nuestro.
- **Sprint 14 — Concurso desde Alta de Cargo:** sigue `📋 Planificado` en el plan. Conviene verificar si es pendiente real o quedó obsoleto; no es foco de esta sesión.
- **Verificaciones no-código pendientes** (no son sprints abiertos, pero quedan anotadas en los docs): paseo visual en navegador de Sprint 23 (S23-7/S23-8/S23-9) y la generación visual de los 4 PDF/Word de Sprint 21 (jsPDF en el navegador). El código y los datos ya están verificados; falta solo la verificación visual, a cargo de quien tenga herramienta de browser.
- **Deuda diferida explícita:** S22-12 Opción B (FK de jefatura, hoy en Opción A texto) — documentada como "queda para otro sprint", no como tarea abierta de S22.

Todo el resto de la franja 20-23 está cerrado a nivel código y mergeado en jorge/main/deploy.

---

## 7. Conclusiones y recomendaciones

1. El desfase principal es de **documentación de planificación**, no de código: el trabajo (S21, S22, S23 + fixes 2026-10) ya está commiteado y mergeado. Lo que falta es sincronizar el `PLAN_SCRUM_2026.md` y tres docs de datos.
2. **Acción mínima recomendada** (una sola pasada de edición sobre `PLAN_SCRUM_2026.md`): marcar 21 y 22 como ✅, corregir la fila 23 al sprint real de Áreas Programáticas de Agustín (✅), agregar la fila Sprint 24 (📋), y actualizar el header `Última actualización` con los hitos y fixes de 2026-10 (puntos §4.1–§4.5).
3. **Corregir el header del propio `SPRINT_23_areas_programaticas.md`** (línea 3): dice `📋 Planificado` mientras sus 11 tareas están ✅ — es una inconsistencia interna del archivo, no solo contra el plan.
4. **Depurar la columna eliminada** `especialidad_principal` de `Contrato_Datos.md`, `DATA_CLEANING_ESPECIALIDADES.md` y `MAPEO_NORMALIZACION_BD.md` (§5.1–§5.3) para que ningún doc de datos siga afirmando que existe como columna persistida.
5. Opcional: cerrar la advertencia "en reescritura (Sprints 20-22)" del header de `Contrato_Datos.md` ahora que esos sprints terminaron, dejando el schema de puesto/especialidad como estado final.

> Recordatorio: este informe es solo diagnóstico. Las ediciones de §4 y §5 no fueron aplicadas.
