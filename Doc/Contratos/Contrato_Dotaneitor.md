# Contrato del Dotaneitor — Reglas de negocio del padrón

> Fuente de verdad de las **reglas de negocio** que el Dotaneitor y el pipeline del padrón aplican
> al procesar cada carga. Complementa (no reemplaza) a `Contrato_Padron.md` (flujo técnico de
> importación) y `Contrato_Datos.md` (modelo de datos).
> Última actualización: 2026-10-13 — Primera versión. Consolida las 6 reglas confirmadas en taller.
> Estado: VIGENTE.

> ⚠️ **Precedencia de verdad:** este contrato refleja el **código real** en producción
> (`Dotaneitor.py`, `apps/api/src/modules/padron/`). Donde `DOTANEITOR_DECISIONES.md` §4.bis
> difiera del mapeo de carreras, **manda este contrato** (ver nota en Regla 1): ese doc de taller
> tenía invertidos 83/87 y arrastraba `CEETPS` en el código equivocado.

---

## Alcance

El Dotaneitor es el servicio Python (FastAPI, `http://localhost:5001` interno) que **limpia,
normaliza y enriquece** el Excel del padrón semanal antes de que el backend Node calcule el diff
y lo consolide. Este contrato describe **qué decide** sobre los datos, no cómo se transportan
(eso está en `Contrato_Padron.md`).

Principio rector transversal:

> **Entre un dato vacío y un dato que no corresponde, se prefiere vacío.**
> Ante la duda de si una especialidad, un rol o un `id_sial` corresponde a una persona/cargo,
> NO se asigna. Preferir el hueco a la asignación incorrecta. Esta regla gobierna cada una de
> las 6 reglas de abajo.

---

## Regla 1 — Carreras: cuáles llevan especialidad y cómo se gestionan

El **código de registro** (COD_REG, campo SIAL) determina la carrera y su comportamiento. La
fuente de verdad del mapeo código→escalafón es la tabla `codigos_registro` (FK `escalafon_id`),
no el nombre de `ESCALAFON` del Excel (que trae nombres históricos variables).

### Carreras CON especialidad

El padrón trae especialidad (`LIT_ESP_CARGO`) solo para estos códigos; en el resto se vacía
(paso 9.6 del pipeline):

| COD_REG | Carrera                                      | Rol en el sistema |
| ------- | -------------------------------------------- | ----------------- |
| `37`    | Nueva Carrera Profesional Hospitalaria (CPH) | **Gestionada**    |
| `23`    | Salud · Guardias (Suplentes)                 | **Informativa**   |
| `24`    | Residentes (Residencias)                     | **Informativa**   |

### Carreras SIN especialidad

| COD_REG | Carrera                       | Jefatura (JEFE ESCALAFON) | Rol en el sistema |
| ------- | ----------------------------- | ------------------------- | ----------------- |
| `83`    | Nueva Carrera Administrativa  | `Jefe Administrativo`     | **Gestionada**    |
| `85`    | CEETPS (Técnicos de la Salud) | `Jefe Tecnico`            | **Gestionada**    |
| `87`    | Nueva Carrera Enfermería      | `Jefe Enfermeria`         | **Gestionada**    |

> **Mapeo 83/85/87 — confirmado contra código** (`Dotaneitor._calcular_jefe_escalafon`):
> `83 → Jefe Administrativo`, `85 → Jefe Tecnico`, `87 → Jefe Enfermeria`.
> **Corrige** a `DOTANEITOR_DECISIONES.md` §4.bis, que tenía `83=Enfermería` y `87=CEETPS`
> (invertido). El código del Dotaneitor siempre estuvo bien; el error era de documentación.

**Gestionadas vs informativas:**

- **Gestionadas** (37 / 83 / 85 / 87): el sistema administra activamente el ciclo del cargo
  (alta, modificación, baja, concurso, validación de vacante).
- **Informativas** (23 / 24): se cargan y se muestran, pero su ciclo no se gestiona con el mismo
  flujo (p. ej. las guardias/suplencias y residencias tienen dinámica propia).

### JEFE ESCALAFON — reglas completas

Requiere valor en `JCAT` (y `JCAT = 0` NO cuenta como jefatura):

| Condición                         | JEFE ESCALAFON        |
| --------------------------------- | --------------------- |
| Sin JCAT (o JCAT vacío)           | `null`                |
| COD_REG `37` + **sin** ESCRITORIO | `Jefe CPH POF`        |
| COD_REG `37` + **con** ESCRITORIO | `Jefe CPH POU`        |
| COD_REG `85`                      | `Jefe Tecnico`        |
| COD_REG `87`                      | `Jefe Enfermeria`     |
| COD_REG `83`                      | `Jefe Administrativo` |
| resto                             | `null`                |

---

## Regla 2 — Especialidad: cascada de resolución

La especialidad del cargo (solo carreras 37/23/24, Regla 1) se resuelve por una **cascada** que
prioriza siempre lo que trae el padrón y recurre a deducción solo cuando el dato viene vacío.

Orden de precedencia (se detiene en el primer nivel que produce un valor):

1. **Padrón manda.** Si el Excel trae especialidad (`LIT_ESP_CARGO` / `ESPECIALIDAD`), se respeta
   esa. El padrón es la fuente primaria: si trae especialidad, es importante respetar la que trae.
2. **Deducir por reglas si viene vacío.** Si el padrón NO trae especialidad, se deduce con los
   métodos ya implementados (cruce por CUIL en `ref_especialidades_cuil`, cruce por agrupador/
   puesto en `ref_especialidad_por_puesto`, y la cascada de catálogo `especialidades_puesto`).
3. **Conservar la vieja ante carga parcial.** Si el padrón viene con especialidad incompleta o
   parcial y ya existía una especialidad válida para ese cargo/persona, se conserva la vieja antes
   que degradarla.
4. **Vacío como último recurso.** Si nada de lo anterior da certeza, la especialidad queda vacía.
   Nunca se inventa ni se asigna una que no corresponda (principio rector).

**Normalización:** las especialidades se comparan/guardan sin tilde y en la forma canónica del
catálogo. Regla del paréntesis: al matchear contra el catálogo se ignora la aclaración entre
paréntesis (`Clinica Medica (Medicina Interna)` ≡ `Clinica Medica`), **excepto** `Bioquimica
Clinica`, que tiene subespecialidades reales que no se colapsan. Detalle en
`DATA_CLEANING_ESPECIALIDADES.md`.

> Implementado en el commit de curaduría de especialidad (`especialidades.py`, `decidirEspecialidad`,
> marcador `__especialidad_puesto_id__`). Es un equilibrio aceptado entre "respetar el padrón" y
> "no perder lo ya curado".

---

## Regla 3 — Un solo cargo activo por persona (por regla general)

Una persona tiene, por regla general, **una sola ocupación vigente** (`hasta IS NULL`) a la vez.
El pipeline no debe generar dos ocupaciones vigentes simultáneas para la misma persona salvo que
el modelo de cadena de retención lo contemple explícitamente (cargo base + remplazante, ver
`Contrato_Datos.md`, campos `tipo_origen`/`cargo_retenido_id`).

Invariante de dedup: el paso 9.8 elimina duplicados de `ID SIAL` conservando la fila más completa,
y el 9.9 elimina jefaturas CPH con rol duplicado activo.

**Invariante de persona activa** (`aprobarSnapshotService`, commit `85d8267`): una persona con al
menos una ocupación vigente **no puede** quedar `activo=false`. Un `UPDATE` idempotente al final
de la aprobación reactiva a toda persona inactiva con ocupación vigente (resuelve reingresos).

---

## Regla 4 — Residencias (24) y Docentes (07): desdoblado 1:1 por `id_sial_rol`

Los cargos de **Residencias (COD_REG 24)** y **Docentes Históricos (COD_REG 07)** se modelan
**1:1** (un cargo por persona-rol), NO como cargos compartidos. El identificador de matcheo de
estos roles es **`id_sial_rol`**, no `id_sial`.

- Los cargos desdoblados tienen `id_sial = NULL` a propósito (se matchean por `id_sial_rol`).
- El matcheo de alta/modificación usa las ocupaciones + la tabla `desdoblado_mapeo_cargos`
  (commit `e00db45`): un rol nuevo 24/07 se resuelve por `id_sial_rol`; si no existe, se da de
  **alta 1:1** (cargo nuevo), nunca se mete en un cargo ajeno.
- Los endpoints individuales tienen un guard que impide colapsar dos personas en un cargo 24/07.

**Invariante C.1 (lo valida el usuario por SQL tras cada padrón):**

> **0 cargos compartidos de roles 24/07.** Si la query de invariante C.1 da > 0, hay un desdoblado
> roto y debe corregirse antes de dar por bueno el padrón.

**Blindaje de datos:** cuando un cargo desdoblado 24/07 tiene un `id_sial` que no corresponde a su
titular, ese `id_sial` se nullifica (scripts `fix_nullificar_idsial_*`) para que el fallback por
`id_sial` nunca lo elija. Esto se complementa con la defensa en código (Regla 6, refinamiento A).

> **Mapeo de código:** en este sistema `07` = Docentes Históricos y `24` = Residencias. Ambos son
> carreras **informativas** (Regla 1) pero con modelo de cargo 1:1.

---

## Regla 5 — Baja de cargo: triple confirmación

Un cargo no se cierra (`no_vigente`) de golpe. La baja requiere **tres confirmaciones**
independientes antes de cerrarse; el acto de "Confirmar baja" del usuario es la **tercera**, y
deja el cargo en **validación de vacante**, no cerrado.

Las tres confirmaciones:

1. **Padrón** — el cargo desaparece del padrón (deja de venir en la carga semanal).
2. **SIAL** — la baja aparece en el canal de bajas consolidadas de SIAL (`/bajas-consolidadas`).
3. **Usuario** — confirmación manual explícita (botón "Confirmar baja").

Al darse la tercera confirmación, el cargo pasa a **`validacion_vacante`** (habilitado para
concursos / validación de vacante), **NO** directamente a `no_vigente`. El cierre definitivo a
`no_vigente` ocurre más adelante en el ciclo. El rechazo (`rechazarValidacionService`) reabre el
cargo correctamente.

> **Estado del código:** hoy `confirmarValidacionService` cierra el cargo en el acto
> (`estado = 'no_vigente'`). La corrección a `validacion_vacante` es parte del fix en curso
> (rama `fix-bajas-reglas`). Comportamiento objetivo documentado aquí por adelantado.

> Comportamiento al aprobar un diff (ver `Contrato_Padron.md`): un cargo en `validacion_vacante`
> que **reaparece** en el siguiente padrón vuelve automáticamente a `vigente`.

---

## Regla 6 — Casos de defensa del pipeline (fixes conocidos)

Dos agujeros detectados y cerrados/en-cierre en el subsistema padrón/bajas. Documentados para que
no se reintroduzcan.

### Bug B — baja de 24/07 no consumida

`calcularDiff` detecta cargos **eliminados** keyando un `actualesMap` por `cargo.id_sial` y
filtrando `id_sial IS NOT NULL`. Como los cargos desdoblados 24/07 tienen `id_sial = NULL`, su
desaparición del padrón **no se detecta por esa vía** → la baja no se consume.

**Regla:** la baja por desaparición de cargos 24/07 debe detectarse por **`id_sial_rol`** (el
mismo identificador por el que se matchean en alta/modificación), no por `id_sial`. Alineado con
el matcheo del commit `e00db45`. Si no hay certeza de que el cargo desapareció, **no** se marca
la baja (principio rector).

### Refinamiento A — verificar titular antes del fallback por `id_sial`

Cuando un rol nuevo 24/07 no se encuentra por `id_sial_rol`, el pipeline caía a un fallback que
lo matcheaba por `cargo.id_sial`. Si ese `id_sial` no correspondía al titular (dato desajustado),
el rol nuevo se metía en el cargo equivocado → **cargo compartido** (pasó con Pose/DOC y Guirao
Saez/RES al subir el padrón 18-10).

**Regla:** antes de usar el fallback por `id_sial`, **verificar** que ese `id_sial` corresponde al
titular esperado (que el `id_sial_rol` del cargo coincida con el titular, o que el cargo no esté
ya ocupado por otra persona). Si no hay certeza, **no** usar el fallback: tratar el rol como alta
1:1 o dejarlo sin matchear. Preferir alta nueva / sin matchear antes que meter el rol en un cargo
que quizás no le corresponde (principio rector). Objetivo: garantizar el invariante C.1 (Regla 4).

> **Estado del código:** ambos fixes (Bug B + refinamiento A) están en la rama `fix-bajas-reglas`
> junto con la Regla 5. Hasta su merge, el blindaje de datos (nullificar `id_sial` desajustado)
> sostiene el invariante C.1.

---

## Normalización de situación de revista

`situacion_revista` se guarda **minúscula sin tilde**, en un **catálogo CERRADO de 3 estados**:
`activo`, `comision`, `retencion de cargo`. La normaliza el productor activo (`pipeline.py`, paso
9.75 — baja a minúscula-sin-tilde todas las columnas salvo las identificadoras), no un mapeo
hardcodeado; un 4º valor inesperado se conserva como su normalizado, nunca se fuerza.

El **desglose de dotación por situación de revista** en `/reportes` (una serie por estado + línea
total, series NO disjuntas) **depende de esta normalización**: si la columna volviera a traer
variantes de casing/acento (`Activo`, `Comisión`, `Retencion de Cargo`), las series y las tarjetas
dejarían de reconciliar. Por eso `situacion_de_revista` **no** se agrega a
`_COLUMNAS_NO_MINUSCULA` (candado comentado en `pipeline.py` + test
`services/dotaneitor/tests/test_situacion_revista_normaliza.py`).

> Esta regla NO modifica la Regla 2 (especialidad) ni la regla de cálculo de `ESTADO`. Detalle del
> flujo de normalización en `Contrato_Padron.md` (sección «Normalización de texto»).

---

## Referencias

- `Doc/Contratos/Contrato_Padron.md` — flujo técnico de importación (pipeline, diff, endpoints).
- `Doc/Contratos/Contrato_Datos.md` — modelo de datos (tablas `cargos`, `ocupaciones`, etc.).
- `Doc/Referencias/DOTANEITOR_DECISIONES.md` — decisiones del taller de rediseño (⚠️ mapeo 83/87
  invertido en §4.bis; este contrato lo corrige).
- `Doc/Planificacion/DATA_CLEANING_ESPECIALIDADES.md` — regla del paréntesis y normalización de
  especialidad.
- Código: `dotacion-rrhh/app/python-service/Dotaneitor.py`, `especialidades.py`;
  `apps/api/src/modules/padron/`, `apps/api/src/modules/bajas/`.
