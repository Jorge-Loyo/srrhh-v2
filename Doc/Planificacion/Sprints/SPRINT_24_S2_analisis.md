# SPRINT 24 · S24-2 — Análisis de datos: dimensionamiento del backfill de cargos de conducción

**Estado:** ✅ Analizado 2026-10 — contra BD local (organigrama 4.306 nodos, padrón 52.839 cargos / 47.646 ocupaciones activas). Solo lectura, nada escrito.
**Precondición cumplida:** detección de conducción con el fix de casing aplicado (`lower(unaccent(situacion_revista)) = 'activo'`); sin él estos números estarían sesgados (ver `SPRINT_23_areas_programaticas.md` → post-verificación).

---

## 1. Clasificación de los nodos de conducción candidatos

Universo de candidatos = 4.306 nodos del organigrama − GO/SGO/F-N-GO (185) − Ministerio/PLTA
DOCENTE (2) − régimen "fuera de norma" (3) − "Director Docente" (1) ≈ **4.116 nodos**.

> **Criterio clave (corregido con RRHH 2026-10):** "jefatura ocupada" = cargo de conducción
> (25/60, o 37/83/85/87 con `codigo_jefaturas`) con ocupación **activa** (`situacion_revista` =
> 'activo'). **Un jefe en "Retención de Cargo" NO cuenta como jefatura ocupada de esa repartición:
> al retener, la persona se va a ejercer otro cargo en otro lado — lo que importa para el
> organigrama es quién está activo en ese puesto AHORA.** (Caso testigo del ajuste: Hospital Sardá
> `40210030`, 282 agentes activos, 3 Jefes de Unidad todos en retención → es un vacante real, no
> una jefatura ocupada.) Lo mismo aplica a comisión.

| Estado                                                               | nodos     | Interpretación                                                                                                                                       |
| -------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Jefatura activa** (no es vacante)                               | 3.678     | Tiene jefe activo. El cargo generado se reconcilia con esa ocupación (S24-6).                                                                        |
| **2. Con personal activo, sin jefatura activa** (falso vacante real) | 101       | El caso CEMAR IV / Sardá. Gente trabajando, nadie conduciendo. Pasa a vacante real contable.                                                         |
| **3. Cargos pero 0 ocupaciones activas**                             | 159       | Reparticiones con cargos cargados pero sin personal activo hoy. Categoría propia — NO es "falso vacante". ¿Unidad inactiva? ¿Dato viejo? → revisión. |
| **4. Sin dotación**                                                  | 178       | Ningún cargo con ese `codigo_repa`. Se genera con flag de revisión.                                                                                  |
| **Total a generar (backfill S24-5)**                                 | **4.116** |                                                                                                                                                      |

> ⚠️ **Corrección respecto de la primera medición:** el "estado 2" original (260) mezclaba dos cosas
> distintas que se separaron: **101 con personal activo** (falso vacante genuino) + **159 con cargos
> pero 0 activos** (reparticiones sin actividad). Solo los 101 son el caso CEMAR IV. El número se
> validó listando los 260 nodos uno por uno (no confiando en el agregado) — ahí aparecieron ambos
> problemas: la mezcla de categorías y el falso positivo del Sardá por el criterio de retención.

## 2. Los 101 "falsos vacantes reales", por tipo de nodo (entregable para RRHH)

Son las jefaturas que _faltan modelar_ — reparticiones con personal **activo** trabajando pero sin
cargo de conducción con ocupante activo. Priorizar la revisión por nivel jerárquico (un hospital
sin director es más grave que una sección sin jefe):

| tipo       | falsos vacantes | nota                                                              |
| ---------- | --------------- | ----------------------------------------------------------------- |
| SECCION CA | 23              | Carrera Administrativa                                            |
| UNID       | 18              |                                                                   |
| DEPT       | 13              |                                                                   |
| DIV        | 13              |                                                                   |
| **SDHOS**  | **11**          | ⚠️ Subdirectores de hospital — revisar, alto nivel                |
| DIV CA     | 9               | Carrera Administrativa                                            |
| SECCION    | 7               |                                                                   |
| DEPT CA    | 5               | Carrera Administrativa                                            |
| **DHOS**   | **2**           | ⚠️ Directores de hospital sin jefatura modelada — revisar primero |

> **Total: 101.** Casos testigo: **CEMAR IV** (`40011230`, DIV, 12 agentes CPH, sin jefatura) y
> **Hospital Sardá** (`40210030`, DHOS, 282 agentes activos, 3 Jefes de Unidad todos en retención
> de cargo → vacante real porque ninguno está activo ahí).

## 3. Triangulación régimen (organigrama) ↔ escalafón real del personal

Valida la Decisión 2 del diseño (usar `regimen_empleo` como fuente, pero señalar inconsistencias).

**Mapeos consistentes (el régimen predice bien el escalafón del personal):**

| regimen_empleo (organigrama)               | escalafón mayoritario del personal | nodos |
| ------------------------------------------ | ---------------------------------- | ----- |
| Carrera de Profesionales de la Salud       | Nueva Carrera Prof. Hosp           | 2036  |
| Carrera de Enfermeria                      | Nueva Carrera Enfermería           | 802   |
| Escalafon General / Carrera Administrativa | Nueva Carrera Administrativa       | 435   |
| Carrera de Técnicos de la Salud            | **CEETPS**                         | 271   |
| Autoridades Superiores                     | Autoridades Superiores             | 17    |
| Direccion Medica                           | Nueva Carrera Prof. Hosp           | 26    |

> ⚠️ **Hallazgo que corrige el diseño:** el escalafón de técnicos en la BD se llama **"CEETPS"**,
> no "TEC". El mapeo del S24-1 se corrigió a `Carrera de Técnicos de la Salud → CEETPS → TEC-POF`.
> `prefijoDeCargo()` ya resuelve CEETPS correctamente (`esc.includes('CEETPS')` → TEC-*), así que
> no hay cambio de código, solo de la tabla de mapeo documental.

**Inconsistencias genuinas (el flag `revisionDato` las capturará):**

| regimen_empleo                       | escalafón del personal       | nodos | lectura                              |
| ------------------------------------ | ---------------------------- | ----- | ------------------------------------ |
| Carrera de Técnicos de la Salud      | Nueva Carrera Prof. Hosp     | 85    | técnicos conducidos por rama médica  |
| Carrera de Profesionales de la Salud | CEETPS                       | 31    | médicos con personal técnico         |
| Carrera de Profesionales de la Salud | Nueva Carrera Administrativa | 16    |                                      |
| Carrera de Profesionales de la Salud | Nueva Carrera Enfermería     | 9     |                                      |
| Direccion Medica                     | Nueva Carrera Enfermería     | 7     |                                      |
| Autoridades Superiores               | (9 escalafones distintos)    | ~23   | esperable: AS conduce todo escalafón |

**Decisión reforzada:** para **Autoridades Superiores** el escalafón del cargo de conducción sale
del **régimen** (AS → AS-DG/AS-SS/AS-MIN), NO del personal (que es heterogéneo por naturaleza). Para
el resto, el régimen manda y la inconsistencia se marca con `revisionDato=true` sin bloquear.

## 4. Conclusiones para la implementación

- **Backfill dimensionado:** 4.116 cargos de conducción a generar, en 4 categorías:
  - **3.678** con jefatura activa → se reconciliarán con el jefe existente (S24-6), no son vacante.
  - **101** falsos vacantes reales (personal activo, sin jefatura activa) → el núcleo del sprint,
    pasan a vacante contable (CEMAR IV, Sardá).
  - **159** con cargos pero 0 ocupaciones activas → categoría propia a revisar: ¿unidad inactiva o
    dato viejo del árbol? NO se mezclan con los falsos vacantes.
  - **178** sin dotación → se generan con flag de revisión.
- **Casos a flaggear (`revisionDato=true`):** 178 (sin dotación) + 159 (cargos sin activos) + ~171
  (inconsistencias de triangulación de §3) ≈ **~500 nodos** para revisión manual de RRHH. El resto
  (~3.600) es consistente y se genera sin flag.
- **Prioridad de revisión RRHH:** primero los DHOS (2) y SDHOS (11) sin jefatura activa — alto nivel
  (p.ej. Sardá, con 282 agentes y la dirección solo en retención); después el resto de los 101.
- **Lección de criterio (RRHH, 2026-10):** "jefatura ocupada" cuenta solo ocupaciones **activas**.
  Retención de cargo / comisión = la persona ejerce otro puesto en otro lado → NO ocupa esa
  jefatura. Esto define también la regla de reconciliación del S24-6: solo una ocupación activa
  sobre la jefatura cierra la vacante; una en retención la deja abierta.
- **Sin cambios de código respecto del S24-1** salvo la corrección documental TEC→CEETPS.
- **Siguiente paso (S24-3):** migración para `Cargo.origen` + `Cargo.revisionDato`/`revisionMotivo`.

## 5. Análisis de reparticiones con >1 cargo de conducción (hallazgo 2026-10)

Al verificar el detalle de cargo surgió una inquietud: ¿un `codigo_repa` puede tener más de un
cargo de conducción vigente? Regla de negocio del usuario: **un `codigo_repa` tiene un solo titular
de conducción vigente** (la jefatura máxima); los jefes inferiores que cuelgan deberían tener su
propio código, y los cargos de ejecución sí pueden ser muchos.

Se encontraron **179 `codigo_repa` con >1 cargo de conducción vigente/validación**, TODOS
`origen='padron'` (ninguno generado por el S24). Desglose tras análisis con datos reales:

| Patrón                                                | Repas | Explicación                                                                                                                                                                                                                           | ¿Problema?              |
| ----------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Solo jefes inferiores (sin titular máximo)            | 116   | El `codigo_repa` del SIAL agrupa una repartición entera (dirección + sus jefes de unidad que no tienen código propio). Normal del SIAL.                                                                                               | No                      |
| 1 titular máximo + jefes inferiores                   | 28    | La regla del usuario tal cual: un director + jefes que cuelgan.                                                                                                                                                                       | No                      |
| 1 titular vigente + salientes en `validacion_vacante` | 23    | Rotación normal: uno se va (queda en validación), otro entra.                                                                                                                                                                         | No                      |
| **9 directores con doble rol SIAL**                   | 9     | La MISMA persona ocupa 2 cargos `CPH-D` del mismo hospital. Clave: **uno tiene JCAT (la jefatura real), el otro NO** (segundo rol SIAL de la persona). Ej. Elizalde: Indart en `CPH-D-000006` (JCAT P60) + `CPH-D-000007` (sin JCAT). | El sin-JCAT no interesa |

**Conclusión — el JCAT define la jefatura.** Tal como la regla de Enfermería (el jefe se identifica
por el JCAT, no por el escalafón), la **jefatura máxima de un `codigo_repa` es el cargo de conducción
con JCAT**. Un cargo de conducción ocupado SIN JCAT que tiene un gemelo (misma persona, mismo
`codigo_repa`) CON JCAT es un **rol redundante** del SIAL — no es una segunda dirección.

**Decisión (usuario):** esos cargos de conducción sin JCAT con gemelo-con-JCAT **se ocultan del
sistema** (listado de cargos, organigrama) — no interesan. Son 9 hoy. Se filtran dinámicamente (no
se persiste marca ni se borran): un cargo de conducción ocupado sin JCAT que tenga otro cargo de
conducción de la misma persona en el mismo `codigo_repa` con JCAT, no se muestra.

**El dato del padrón NO tiene basura que limpiar** — los 179 son todos legítimos o roles redundantes
del SIAL que simplemente no se muestran. El S24 no los causó.
