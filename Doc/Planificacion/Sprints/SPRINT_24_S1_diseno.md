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

## Decisión 2 — Escalafón del cargo generado: triangulación régimen ↔ dotación

**Fuente primaria: `regimen_empleo` del nodo del organigrama** (nunca es nulo — 4.306/4.306).
Se mapea a escalafón con la tabla de arriba y se obtiene el prefijo via `prefijoDeCargo()` de
`shared/codigoCargo.ts` (reutilizar, no reimplementar).

**Triangulación obligatoria contra la dotación (requisito del usuario):** por cada nodo con
dotación, comparar el escalafón derivado del `regimen_empleo` contra el escalafón mayoritario del
personal real de esa repartición (`cargos` → `escalafones.nombre`). Tres resultados:

1. **Consistente** (régimen del organigrama ≈ escalafón del personal) → generar normal.
2. **Inconsistente** (régimen dice CPH pero el personal es mayormente ENF, p.ej.) → generar con el
   régimen del organigrama **pero marcar `revisionDato = true`** para que RRHH lo revise. No se
   descarta el dato: se señala.
3. **Sin dotación** (254 nodos, ver tabla §0) → no se puede triangular. Es el caso que el usuario
   pidió detectar explícitamente. **Se genera igual** (el régimen alcanza), pero con
   `revisionDato = true` + motivo `"sin presencia en dotación"`. Un nodo de conducción sin dotación
   es el candidato más fuerte a vacante real, pero también puede ser un error de carga del árbol —
   por eso se señala en vez de asumir.

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
