# SPRINT 24 — Cargos de conducción vacantes derivados del organigrama (mapeo de vacantes reales)

**Estado:** 📋 Planificado
**Autores:** Jorge (full — backend Node + frontend `/organigrama` + `/cargos`).
**Depende de:** Sprint 20 ✅ (catálogo `puestos_cargo`/`especialidades_puesto`, `Cargo.puestoCargoId`), Sprint 22 ✅ (pipeline lineal, `jcat_cargo_jefatura`), y los fixes de organigrama de la sesión 2026-10 (identificación de conducción por JCAT + escalafón gerencial, orden jerárquico de conductores, SSAPAC en Nivel Central).

---

## Problema

El organigrama marca un nodo como **"Vacante"** cuando no encuentra un cargo de conducción
ocupado en esa repartición. Pero hoy eso mezcla dos situaciones muy distintas que se ven igual:

- **Vacante real:** existe el cargo de jefatura (ej. "Director del CEMAR IV") y no tiene a nadie
  asignado → es una vacante genuina que RRHH debería cubrir y gestionar.
- **Falso vacante:** NO existe el cargo de jefatura en el sistema (nadie lo creó), aunque la
  repartición tenga personal de planta trabajando → no es que esté vacante, es que **falta modelar
  el puesto de conducción**.

Causa raíz: **la estructura de cargos se deriva hoy del padrón** (`Cargos_salud.xlsx`), que es una
foto del personal que _está_, no de los puestos que _deberían existir_. Un puesto de conducción
vacante nunca entra por el padrón (nadie lo ocupa), así que no existe como `Cargo` en la BD y el
organigrama lo marca "Vacante" por **ausencia de dato**, sin un cargo real detrás que gestionar.

Caso testigo (sesión 2026-10): **CEMAR IV** (`40011230`) tiene 12 agentes de planta activos
(médicos, farmacéuticos, nutricionistas…) pero ningún cargo de Director/Jefe cargado → el
organigrama lo muestra "Vacante" aunque está lleno de gente, y no hay un cargo real para
registrar que falta cubrir la jefatura.

## Objetivo

Que la **estructura de cargos de conducción** se derive del **organigrama** (que sí define qué
unidades existen y su nivel), no del padrón. Cada nodo del organigrama que corresponda debe tener
su cargo de conducción asociado — exista o no alguien ocupándolo — de modo que:

1. Una **vacante** sea un **cargo real sin ocupante** (mapeable, contable, gestionable), no una
   ausencia de dato.
2. El organigrama distinga "vacante real de conducción" de "unidad con personal sin jefatura
   modelada" de "unidad realmente vacía".
3. Se puedan **contar y listar las vacantes de conducción** del Ministerio (KPI de gestión).

> **Alcance explícito:** este sprint modela los cargos de **CONDUCCIÓN** (jefaturas/direcciones),
> no la dotación de planta. El personal de planta sigue viniendo del padrón; acá solo se crean los
> puestos de jefatura que el organigrama implica.

---

## Precondición — fix de casing de `situacion_revista` (sesión 2026-10)

> ⚠️ **Antes de correr el análisis de datos (S24-2) hay que tener aplicado el fix de casing de
> `situacion_revista`.** La detección de conducción del sistema (`getJefeService`,
> `cadena-mando.service.ts`, `esCargoDeConduccion` del organigrama) filtra las ocupaciones por
> estado "activo". La BD tiene ese campo con casing mezclado — el 99% del padrón está en `'Activo'`
> (mayúscula) y solo ~175 registros en `'activo'` (minúscula). Varias queries comparaban contra el
> literal minúscula, descartando el 99%. **Corregido en la sesión 2026-10** (`lower(unaccent(...))`
> en areas-programaticas / dotacion / kpis / retenciones — ver post-verificación del Sprint 23).
>
> **Por qué importa para este sprint:** el S24-2 mide "cuántos nodos quedan sin cargo de conducción
> hoy" para dimensionar el backfill y separar _vacante real_ de _falso vacante_. Si se corre con la
> detección rota por casing, marca como "sin jefatura modelada" nodos que SÍ tienen jefe (su
> ocupación estaba en mayúscula) → el análisis daría números inflados y falsos. **Correr S24-2
> recién con el fix aplicado.**
>
> **Caso testigo CEMAR IV re-verificado post-fix (2026-10):** `40011230` tiene 12 agentes de planta
> activos (todos cod_reg 37 "de Planta"), **ninguno con `codigo_jefaturas` ni escalafón 25/60** —
> sigue sin jefatura modelada incluso con la detección ya corregida. El caso testigo del sprint es
> genuino, no un artefacto del bug de casing.

## Decisiones a tomar en el diseño (S24-1) — abiertas, resolver antes de implementar

1. **Regla tipo-de-nodo → cargo de conducción.** Mapear cada `tipo` de nodo del organigrama al
   cargo de jefatura que le corresponde y su literal:
   - `SSEC/DIREJE` → Subsecretario · `DG` / `F/N DG` → Director General · `DHOS` → Director ·
     `SDHOS` → Subdirector · `DEPT` → Jefe de Departamento · `DIV` → Jefe de División ·
     `UNID` → Jefe de Unidad · `SECCION` → Jefe de Sección · `GO`/`SGO` → Gerente/Subgerente
     Operativo (en extinción Dto 259/26 — ¿se generan o no?).
   - Sufijo `CA` (DEPT CA, DIV CA, SECCION CA) → rama Escalafón General / Carrera Administrativa.
2. **Escalafón / código de registro del cargo generado.** ¿Se infiere del **personal existente**
   de la repartición (ej. CEMAR IV con médicos CPH → jefatura CPH-J), o hay una regla fija por
   `regimen_empleo` del nodo del organigrama (que ya trae "Carrera de Profesionales de la Salud",
   "Carrera de Enfermería", "Escalafón General", etc.)? → el `regimen_empleo` del organigrama es la
   fuente más limpia (no depende de que haya personal).
3. **JCAT del cargo generado.** Derivar el `codigo_jefaturas` desde el nivel del nodo usando la
   tabla `jcat_cargo_jefatura` al revés (nivel → JCAT por familia P/G/Z según escalafón). Define
   que el organigrama lo reconozca como conducción (hoy requiere JCAT para 37/83/85/87).
4. **Código de cargo.** Reusar `prefijoDeCargo()` + `siguienteCodigoCargo()` de
   `shared/codigoCargo.ts` (ya mapea escalafón+nivel → CPH-D/CPH-J-POF/EG-J/AS-DG/RG-CG/etc.).
   Definir el `id_sial` de un cargo sin ocupante (¿sintético tipo `VAC-<codigo_repa>`? no puede
   chocar con los del padrón).
5. **Qué nodos aplican.** ¿Todos los nodos de conducción, o se excluyen tipos que no tienen jefatura
   real (AREA, REGIMEN, agrupadores)? ¿Se genera para GO/SGO en extinción?
6. **Reconciliación con el padrón (crítico).** Cuando un padrón futuro trae a alguien ocupando ese
   puesto, la aprobación del snapshot debe **vincular la ocupación al cargo vacante ya generado**,
   NO crear un cargo duplicado. Regla de match: `codigo_repa` + nivel/puesto de conducción.
7. **Idempotencia / re-generación.** El árbol se recarga semanal (Excel de Liquidaciones, Sprint
   22 bis). Al cambiar el organigrama, los cargos de conducción vacantes se deben re-sincronizar
   (altas de nodos nuevos, no duplicar los existentes, ¿baja de los de nodos eliminados?).

## Tareas

| #      | Tarea                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Dev   | Est. | Prioridad | Estado |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---- | --------- | ------ |
| S24-1  | ~~Documento de diseño~~ — **cerrado 2026-10** en `SPRINT_24_S1_diseno.md`. Las 7 decisiones resueltas y validadas contra datos reales (organigrama 4.306 nodos, todos con `regimen_empleo`; ~254 nodos de conducción sin dotación detectados y tratados con flag de revisión; GO/SGO excluidos; reuso de `codigoCargo.ts`; `id_sial=VAC-{codigo_repa}` + `origen='organigrama'`). Falta validación final con RRHH antes de implementar.                                                                                                                                       | Jorge | 4h   | 🔴        | ✅     |
| S24-2  | ~~Análisis de datos~~ — **hecho 2026-10** en `SPRINT_24_S2_analisis.md` (con el fix de casing aplicado, si no los números salen sesgados). Resultado: **4.116 cargos a generar** = 3.678 con jefatura activa (se reconcilian) + **101 falsos vacantes reales** (personal activo sin jefatura activa, tipo CEMAR IV/Sardá) + 159 con cargos pero 0 activos (categoría aparte) + 178 sin dotación. Criterio corregido con RRHH: retención/comisión NO cuenta como jefatura activa. ~500 nodos quedan para revisión. Hallazgo: escalafón de técnicos se llama "CEETPS" no "TEC". | Jorge | 2h   | 🔴        | ✅     |
| S24-3  | **Schema/migración**: marcar los cargos de conducción generados (ej. flag `origen = 'organigrama'` en `Cargo`, o `id_sial` sintético distinguible) para separarlos de los que vienen del padrón y poder re-sincronizarlos sin tocar los reales. Migración.                                                                                                                                                                                                                                                                                                                    | Jorge | 2h   | 🔴        | 📋     |
| S24-4  | **Servicio de derivación**: función que recorre el organigrama y, por cada nodo aplicable sin cargo de conducción, genera el `Cargo` vacante (escalafón, puesto, JCAT, código via `codigoCargo.ts`, `codigo_repa`, `estado='vigente'` sin ocupación). Idempotente (no duplica).                                                                                                                                                                                                                                                                                               | Jorge | 5h   | 🔴        | 📋     |
| S24-5  | **Backfill inicial**: correr la derivación una vez contra el organigrama actual. Verificar con el caso CEMAR IV (debe quedar un cargo "Director/Jefe" vacante real) y una muestra por cada tipo de nodo.                                                                                                                                                                                                                                                                                                                                                                      | Jorge | 2h   | 🔴        | 📋     |
| S24-6  | **Reconciliación en aprobar-snapshot** (`padron.service.ts`): cuando un padrón trae una ocupación cuya repartición+nivel matchea un cargo de conducción generado vacante, vincular la ocupación a ese cargo en vez de crear uno nuevo. Evita duplicados. Tests.                                                                                                                                                                                                                                                                                                               | Jorge | 4h   | 🔴        | 📋     |
| S24-7  | **Re-sincronización al cargar organigrama** (hook en `reemplazarOrganigramaService`): al subir un árbol nuevo, altas de cargos de conducción para nodos nuevos; no duplicar; decidir qué hacer con los de nodos que desaparecen.                                                                                                                                                                                                                                                                                                                                              | Jorge | 3h   | 🟡        | 📋     |
| S24-8  | **Organigrama — distinguir estados**: en el nodo, diferenciar "vacante de conducción real" (hay cargo generado sin ocupante) de "unidad con personal sin jefatura" de "vacía". Ajustar `esCargoDeConduccion`/`cargosVacantesMap` para reconocer los cargos generados.                                                                                                                                                                                                                                                                                                         | Jorge | 3h   | 🔴        | 📋     |
| S24-9  | **Vista/KPI de vacantes de conducción**: listar y contar las vacantes de conducción (por efector/sección/nivel). Reusa el modal de Vacantes del organigrama + un contador. Permite a RRHH ver "qué jefaturas faltan cubrir".                                                                                                                                                                                                                                                                                                                                                  | Jorge | 3h   | 🟡        | 📋     |
| S24-10 | **Verificación e2e**: subir un padrón, confirmar que las ocupaciones de jefatura se vinculan al cargo generado (no duplican), que CEMAR IV muestra su vacante real, y que el conteo de vacantes es coherente. Documentar.                                                                                                                                                                                                                                                                                                                                                     | Jorge | 3h   | 🔴        | 📋     |

**Total estimado:** ~31h

## Dependencias entre tareas

```
S24-1 (diseño) ──► S24-2 (análisis) ──► S24-3 (schema) ──► S24-4 (derivación) ──► S24-5 (backfill)
S24-4 ──► S24-6 (reconciliación padrón)
S24-4 ──► S24-7 (re-sync organigrama)
(S24-5 + S24-6) ──► S24-8 (organigrama estados) ──► S24-9 (KPI vacantes)
(S24-6 + S24-8) ──► S24-10 (e2e)
```

## Criterio de éxito

- [ ] Cada nodo de conducción del organigrama tiene un `Cargo` de jefatura asociado (ocupado o
      vacante), con su código generado por `codigoCargo.ts`.
- [ ] El CEMAR IV (y casos análogos) muestra una **vacante de conducción real** (cargo sin ocupante),
      no un "Vacante" por ausencia de dato.
- [ ] Un padrón que trae a alguien ocupando una jefatura **vincula** la ocupación al cargo generado,
      sin crear duplicados.
- [ ] El organigrama distingue los tres estados: vacante de conducción / con personal sin jefatura /
      vacía.
- [ ] Se puede listar y contar las vacantes de conducción por efector/sección.
- [ ] Re-cargar el organigrama no duplica cargos de conducción.

## Notas

- **No reemplaza el padrón.** El personal de planta sigue viniendo del padrón; este sprint solo
  modela los puestos de conducción que el organigrama implica.
- **Fuente del escalafón:** el `regimen_empleo` del nodo del organigrama (ya normalizado:
  "Carrera de Profesionales de la Salud", "Carrera de Enfermería", "Escalafón General / Carrera
  Administrativa", "Autoridades Superiores", "Dirección Médica", etc.) es candidato a fuente de
  verdad para el escalafón/prefijo del cargo, por no depender de que haya personal.
- **Reusar lo que ya existe:** `shared/codigoCargo.ts` (`prefijoDeCargo`, `siguienteCodigoCargo`),
  la tabla `jcat_cargo_jefatura` (Sprint 22) para el mapeo nivel↔JCAT, y la detección de conducción
  del organigrama ya afinada en la sesión 2026-10 (`esCargoDeConduccion` por JCAT + escalafón
  gerencial, `rangoConduccion`).
- **Riesgo principal:** la reconciliación con el padrón (S24-6). Si se hace mal, se duplican cargos
  o se pierde el vínculo ocupación↔cargo. Es la tarea que más test necesita.
- **Decisión de producto pendiente (S24-1):** si los nodos GO/SGO (gerencias operativas suprimidas
  por Dto 259/26) deben generar cargo o se omiten por estar en extinción.
- Referencia del caso testigo y del modelo de conducción actual: fixes de organigrama de la sesión
  2026-10 (identificación por JCAT, orden jerárquico, Carrera Gerencial sin JCAT).
