# SPRINT 24 · S24-1 — Documento de diseño: cargos de conducción derivados del organigrama

**Estado:** ✅ Diseño cerrado (2026-10) — validado contra datos reales de la BD local (organigrama 4.306 nodos, padrón 52.839 cargos). Pendiente de validación final con RRHH antes de implementar S24-3+.
**Decide:** las 7 decisiones abiertas del `SPRINT_24_cargos_conduccion_vacantes.md`.

---

## 0. Datos reales que fundamentan el diseño (medidos 2026-10)

Organigrama local: **4.306 nodos**, **todos con `regimen_empleo`** (0 nulos — buena noticia: la fuente de escalafón nunca falta). Nodos por tipo y presencia en dotación (cargos reales con ese `codigo_reparticion`):

| tipo (nivel)        | nodos | con dotación | sin dotación | ¿genera cargo? |
| ------------------- | ----- | ------------ | ------------ | -------------- |
| SECCION CA          | 1017  | 964          | 53           | ✅ (EG)        |
| UNID                | 921   | 899          | 22           | ✅             |
| SECCION             | 883   | 834          | 49           | ✅             |
| DIV CA              | 527   | 494          | 33           | ✅ (EG)        |
| DIV                 | 319   | 317          | 2            | ✅             |
| DEPT                | 204   | 202          | 2            | ✅             |
| DEPT CA             | 113   | 112          | 1            | ✅ (EG)        |
| SGO                 | 112   | 112          | 0            | ❌ extinción   |
| GO                  | 72    | 72           | 0            | ❌ extinción   |
| SDHOS               | 56    | 41           | 15           | ✅             |
| DHOS                | 39    | 38           | 1            | ✅             |
| DG                  | 30    | 30           | 0            | ✅ (AS-DG)     |
| SSEC/DIREJE         | 5     | 5            | 0            | ✅ (AS-SS)     |
| F/N DG              | 2     | 2            | 0            | ✅ (AS-DG)     |
| F/N DEJE            | 1     | 0            | 1            | ✅ (revisar)   |
| Ministerio          | 1     | 1            | 0            | ❌ agrupador   |
| UAI DG / UAI MSTR   | 2     | 2            | 0            | ⚠️ caso a caso |
| F/N MSTR - GO       | 1     | 1            | 0            | ❌ (es GO)     |
| PLTA TRANS. DOCENTE | 1     | 1            | 0            | ❌ no jefatura |

`regimen_empleo` (11 valores distintos, todos mapeables):

| regimen_empleo                                                 | nodos | escalafón → prefijo base                                                     |
| -------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------- |
| Carrera de Profesionales de la Salud                           | 2270  | CPH → CPH-D/CPH-SD/CPH-J-POF                                                 |
| Carrera de Enfermeria                                          | 907   | ENF → ENF (jefatura ENF)                                                     |
| Escalafon General / Carrera Administrativa                     | 463   | EG → EG-J/EG-D                                                               |
| Carrera de Técnicos de la Salud                                | 399   | CEETPS → TEC-POF (jefatura) ⚠️ el escalafón real se llama "CEETPS", no "TEC" |
| Regimen Gerencial / Escalafon General / Carrera Administrativa | 151   | mayormente GO/SGO → excluir                                                  |
| Autoridades Superiores                                         | 41    | AS → AS-DG/AS-SS/AS-MIN                                                      |
| Direccion Medica                                               | 38    | CPH-D (dirección médica de hospital)                                         |
| Regimen Gerencial / Carrera de Enfermeria                      | 30    | GO/SGO → excluir                                                             |
| Regimen Gerencial / Carrera de Profesionales de la Salud       | 3     | GO/SGO → excluir                                                             |
| **fuera de norma - dejar pendiente**                           | 3     | ⛔ NO generar                                                                |
| Director Docente                                               | 1     | DOC → omitir (no es jefatura de gestión)                                     |

---

## Universo final a generar (cerrado con el usuario, 2026-10)

Tras el análisis caso por caso (abajo) y la **validación manual del usuario de los 101 nodos uno
por uno**, el universo del backfill queda en **exactamente 101 cargos de conducción vacantes** — el
Grupo "con personal activo bajo el mismo `codigo_repa` pero sin jefatura activa modelada". Todos
confirmados como vacantes reales por el usuario. Los otros grupos quedan fuera de la generación
automática (ver hallazgos abajo):

| Grupo                                                  | Nodos   | Decisión                                                           |
| ------------------------------------------------------ | ------- | ------------------------------------------------------------------ |
| Falsos vacantes reales (personal activo, sin jefatura) | **101** | ✅ **se generan** — validados uno por uno                          |
| Sin dotación (nodos fantasma del árbol)                | 178     | ❌ informe de depuración del árbol, no se generan                  |
| Escalafón "inconsistente" régimen≠personal             | ~192    | ❌ falso problema (el JCAT marca la jefatura) — 166 ya tienen jefe |
| GO/SGO (en extinción Dto 259/26)                       | 184     | ❌ no se generan                                                   |

**Clave:** los 101 tienen `codigo_repa` **real** (hay personal activo bajo ese mismo código), así
que la reconciliación con el padrón (S24-6) va a funcionar — cuando aparezca el jefe en un padrón
futuro con ese código, se vincula al cargo generado en vez de duplicar.

---

## Hallazgo del análisis (2026-10) — el Grupo "sin dotación" son nodos fantasma del árbol, NO vacantes

Al revisar caso por caso los 178 nodos de conducción "sin dotación" (los que el cruce
`organigramas.codigo_reparticion = cargos.codigo_repa` no encuentra), con el usuario:

- **El código de repartición del organigrama NO coincide 1:1 con el del padrón.** El árbol (Excel)
  tiene nodos paralelos para el mismo rol conceptual, con un `codigo_reparticion` distinto del código
  bajo el que realmente cuelga la gente. Ejemplos verificados:
  - **Hospital Ferrer (HRRMF):** el director real (Lombardi, `CPH-D-000037`) está en `40221600`
    (nodo "Hospital…"), pero el árbol además tiene `40221617` "Dirección Asist. Atención Medica" —
    vacío. No falta el director: está en el otro código.
  - **HNJTB:** la subdirectora real (Montanari, `CPH-POF-000461`) está en `40230028` "Subdirección
    Médica"; el árbol además lista `40297400` "SDHOS Atención Médica" — vacío.
- **Los 178 nodos sin dotación pertenecen, el 100%, a hospitales que SÍ tienen dotación** en otros
  códigos (ninguno es un efector entero vacío). Es la firma de "nodo paralelo/fantasma del árbol",
  no de "jefatura real sin cubrir".

**Conclusión / cambio de estrategia:** generar un cargo vacante para los 178 crearía **vacantes
fantasma** de puestos que en realidad ya están ocupados bajo otro código — y además nunca
reconciliarían con el padrón (código distinto), produciendo justo el duplicado que el sprint quiere
evitar. Por lo tanto:

- **El Grupo "sin dotación" NO se genera automáticamente.** Deja de ser un caso de `revisionDato`
  masivo; pasa a ser un **informe de depuración del árbol** para RRHH/estructura (nodos del Excel que
  no mapean a ningún código real del padrón — candidatos a corregir o eliminar del árbol, no a
  convertir en cargo).
- **El sprint genera cargo vacante SOLO para el Grupo "con personal activo, sin jefatura activa"**
  (los 101 falsos vacantes reales: hay gente trabajando bajo ese mismo `codigo_repa` pero sin
  jefatura modelada — ahí el código SÍ es real y el puesto SÍ falta). Ese es el núcleo seguro.
- Pendiente de confirmar con RRHH: si quieren además una pasada manual sobre el informe de nodos
  fantasma para depurar el árbol (fuera del alcance de la generación automática).

> Esto reduce el universo a generar de ~4.116 a los **101 falsos vacantes reales** + eventualmente
> algún caso puntual que RRHH valide del informe de fantasmas. Mucho más chico y seguro.

---

## Decisión 1 — Regla tipo-de-nodo → cargo de conducción + literal

Mapeo `tipo` del organigrama → nivel de jefatura y literal del puesto. El **escalafón** sale de
`regimen_empleo` (Decisión 2); el `tipo` define el **nivel** (Director / Jefe de Depto / etc.):

| tipo                | nivel de conducción        | literal del cargo generado              |
| ------------------- | -------------------------- | --------------------------------------- |
| SSEC/DIREJE         | Subsecretario / Dir. Ejec. | "Subsecretario/a — {desc_rep}"          |
| DG, F/N DG, UAI DG  | Director General           | "Director/a General — {desc_rep}"       |
| DHOS                | Director (de hospital)     | "Director/a — {desc_rep}"               |
| SDHOS               | Subdirector                | "Subdirector/a — {desc_rep}"            |
| DEPT, DEPT CA       | Jefe de Departamento       | "Jefe/a de Departamento — {desc_rep}"   |
| DIV, DIV CA         | Jefe de División           | "Jefe/a de División — {desc_rep}"       |
| UNID                | Jefe de Unidad             | "Jefe/a de Unidad — {desc_rep}"         |
| SECCION, SECCION CA | Jefe de Sección            | "Jefe/a de Sección — {desc_rep}"        |
| F/N DEJE            | Fuera de nivel (revisar)   | "Jefatura — {desc_rep}" + flag revisión |

**Sufijo `CA`** (DEPT CA, DIV CA, SECCION CA) = rama Carrera Administrativa → fuerza escalafón
Escalafón General aunque el régimen diga otra cosa (ver Decisión 2).

## Decisión 2 — Escalafón del cargo generado: por régimen del nodo, el JCAT marca la jefatura

**Fuente del escalafón: `regimen_empleo` del nodo del organigrama** (nunca es nulo — 4.306/4.306).
Se mapea a escalafón con la tabla de arriba y se obtiene el prefijo via `prefijoDeCargo()` de
`shared/codigoCargo.ts` (reutilizar, no reimplementar).

> **Revisión 2026-10 (análisis con el usuario) — el Grupo 3 "escalafón inconsistente" se disolvió.**
> La idea original era comparar el régimen del nodo contra el escalafón del personal y marcar las
> diferencias para que RRHH decidiera el escalafón del jefe. El análisis mostró que **esa
> comparación no es el criterio correcto**: lo que define una jefatura NO es un escalafón "de jefe"
> aparte, sino el **JCAT** (ver Decisión 3). Aporte clave del usuario: en **Enfermería no existe el
> cargo de jefe como escalafón propio** — el jefe es un enfermero con un **plus salarial marcado por
> el JCAT**; la única forma de saber quién es jefe en enfermería es el valor del JCAT. Verificado:
> de 907 nodos de enfermería, 789 tienen alguien con JCAT (jefe real) y 118 no.
>
> Consecuencia: las ~192 "inconsistencias régimen≠personal" se explican y **no requieren decisión de
> RRHH**:
>
> - **166 de 192 YA tienen jefe** (JCAT presente) → no son vacantes, no se genera nada. Ej.: los
>   "DEPT Técnico" de hospital tienen jefe `P62` (profesional) — un departamento de personal técnico
>   conducido por un jefe médico es la estructura real correcta del GCBA, no un error.
> - **Solo 26 quedan sin jefe** como candidatos a vacante. Para ellos el escalafón del cargo generado
>   sale del régimen del nodo + el JCAT del nivel (Decisión 3), no de una comparación con el personal.
>
> **Regla final:** el escalafón del cargo de conducción se toma del `regimen_empleo` del nodo; el
> JCAT (por nivel, Decisión 3) es lo que lo marca como jefatura. No se compara contra el personal de
> planta ni se marca `revisionDato` por "inconsistencia de escalafón" (ese caso no existe como tal).

**Único caso que sigue marcándose `revisionDato = true`:** nodos **sin dotación** (ver Grupo 2 / §0)
— no es por escalafón, es porque no hay personal que confirme que la unidad existe hoy. Motivo:
`"sin presencia en dotación"`.

**Sufijo `CA`** (DEPT CA, DIV CA, SECCION CA) = Carrera Administrativa → escalafón Escalafón General
(Nueva Carrera Administrativa) con JCAT de familia G.

> El `CA` (Carrera Administrativa) en el `tipo` **pisa** el régimen hacia Escalafón General:
> una `SECCION CA` es administrativa aunque cuelgue de una rama de salud.

## Decisión 3 — JCAT del cargo generado

Derivar `codigo_jefaturas` desde el nivel del nodo usando `jcat_cargo_jefatura` (Sprint 22) **al
revés**: nivel de conducción + familia de escalafón (P = profesional, G = general, Z = …) → código
JCAT. Esto es lo que hace que el organigrama reconozca el cargo como conducción (hoy exige JCAT
para los códigos de registro 37/83/85/87). Para 25/60 (conducción pura) y Autoridades Superiores
el JCAT no es imprescindible. **Pendiente de implementación (S24-4):** confirmar que
`jcat_cargo_jefatura` tiene fila para cada (nivel, familia) que vamos a generar — si falta alguna
combinación, se completa la tabla antes del backfill.

## Decisión 4 — Código de cargo

Reusar **exactamente** la cadena existente de `shared/codigoCargo.ts`:
`prefijoDeCargo({escalafon, unificadorPuesto, agrupador})` → prefijo (CPH-D, EG-J, AS-DG, …) y
`siguienteCodigoCargo(prefijo, tx)` → secuencial atómico `{prefijo}-{000001}`. Es la misma lógica
que usa el import del padrón y el alta manual, así que los códigos generados son indistinguibles en
formato de los reales (deseable: entran al mismo espacio de numeración, sin colisión).

**`id_sial` sintético:** `VAC-{codigo_reparticion}` (ej. `VAC-40011230` para CEMAR IV). Único por
repartición, no choca con los `id_sial` del padrón (que tienen formato `{idSial}-{cuil}-{seq}`).

## Decisión 5 — Qué nodos aplican

**Generan cargo:** SSEC/DIREJE, DG, F/N DG, DHOS, SDHOS, DEPT(/CA), DIV(/CA), UNID,
SECCION(/CA), F/N DEJE, UAI DG/MSTR (caso a caso).

**NO generan cargo:**

- **GO / SGO / F/N MSTR - GO** (184 + 1 nodos) — gerencias operativas suprimidas por Dto 259/26,
  en extinción. No tiene sentido crear vacantes de puestos que se eliminan. (Confirmado por el
  usuario.)
- **Ministerio** (1) — agrupador raíz, no es un cargo.
- **PLTA TRANS. DOCENTE** (1) y **Director Docente** (régimen) — docencia, no jefatura de gestión;
  fuera del alcance de "conducción".
- **`regimen_empleo = 'fuera de norma - dejar pendiente'`** (3 nodos) — marcados explícitamente en
  el dato para no procesar. Se saltean y se listan en el reporte del backfill.

## Decisión 6 — Reconciliación con el padrón (crítico)

Cuando un snapshot futuro trae una ocupación de jefatura en una repartición que ya tiene su cargo
de conducción generado (vacante), **vincular la ocupación al cargo generado**, no crear uno nuevo.

- **Regla de match:** `codigo_repa` igual + el cargo entrante es de conducción (prefijo en
  `PREFIJOS_CONDUCCION` o `esConduccionPorLiteral`) + mismo nivel/escalafón.
- Al vincular: la ocupación pasa a apuntar al cargo generado; el `id_sial` sintético `VAC-*` se
  reemplaza por el real del padrón y `origen` pasa de `'organigrama'` a `'padron'` (o se conserva
  el flag para trazabilidad — decidir en S24-6). El cargo deja de ser vacante.
- Es la tarea de mayor riesgo (duplicación / pérdida de vínculo) → la que más tests necesita.

## Decisión 7 — Idempotencia / re-generación

- El servicio de derivación (S24-4) es **idempotente**: solo crea cargo para un nodo de conducción
  que NO tenga ya un cargo de conducción vigente con ese `codigo_repa`. Correrlo N veces no duplica.
- **Al recargar el organigrama** (`reemplazarOrganigramaService`, S24-7): altas para nodos nuevos;
  los nodos que desaparecen del árbol → sus cargos generados **vacantes** (sin ocupación) se marcan
  `estado='deprecado'` (no delete físico — principio de histórico inmutable del Contrato de Datos);
  los que ya tienen ocupante real NO se tocan (los gestiona el padrón).

---

## Marca de los cargos generados (define S24-3)

- `Cargo.origen`: enum/string `'padron' | 'organigrama' | 'manual'` (default `'padron'`). Los
  generados por este sprint = `'organigrama'`. Permite re-sincronizar sin tocar los reales.
- `Cargo.revisionDato` (boolean) + `Cargo.revisionMotivo` (texto nullable): señalan los casos de la
  triangulación (inconsistente / sin dotación) para que RRHH los revise. No bloquean la generación.

## Dimensionamiento del backfill (adelanta S24-2)

- Candidatos a generar ≈ **3.900 nodos** (4.306 − 184 GO/SGO − ~5 agrupadores/docentes − 3 fuera de
  norma). El número exacto sale del S24-2 ejecutado con el fix de casing aplicado.
- **~254 nodos sin dotación** → se generan con `revisionDato=true, motivo='sin presencia en dotación'`.
  Es el set que el usuario quiere ver señalado. SDHOS (15/56) es el tipo con mayor proporción
  relativa — vale un vistazo manual en S24-2.
- Caso testigo **CEMAR IV** (`40011230`, régimen "Carrera de Profesionales de la Salud", 12 agentes
  de planta CPH, 0 jefatura): generará `CPH-D` "Director/a — CEMAR IV", `id_sial=VAC-40011230`,
  `origen='organigrama'`, `revisionDato=false` (tiene dotación consistente CPH). Pasa a ser una
  vacante real contable.
