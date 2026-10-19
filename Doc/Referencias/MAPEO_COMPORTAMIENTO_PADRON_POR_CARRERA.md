# Mapeo de comportamiento por carrera — procesamiento del padrón (qué hace vs. qué debe hacer)

> **Fecha:** 2026-10
> **Estado:** 🟡 BORRADOR / EN REVISIÓN
> **Tipo:** documento de diagnóstico y especificación (NO plan de implementación).
> **Alcance:** READ-ONLY. Todas las afirmaciones de "qué hace hoy" están respaldadas con cita
> `archivo:línea`. Donde el código no permite determinar algo, se dice explícitamente.
> **Queries SQL:** la sección 7 deja las queries EXACTAS para que el usuario las corra en WSL.
> Este documento **no ejecuta** SQL ni modifica código.

---

## 1. Resumen ejecutivo

El usuario definió **4 carreras GESTIONADAS** por código de registro (COD_REG), sobre las que se
confirman bajas, se crean concursos y se hace seguimiento fino:

| COD_REG | Carrera                                | Sigla | ¿Tiene especialidad? |
| ------- | -------------------------------------- | ----- | -------------------- |
| 37      | Nueva Carrera Profesional Hospitalaria | CPH   | **SÍ**               |
| 83      | Enfermería                             | ENF   | No                   |
| 85      | Técnicos de la Salud                   | TEC   | No                   |
| 87      | Escalafón General CEETPS               | EG    | No                   |

El resto de los códigos (incluidos **24 Residencias**, **23 Suplentes/Guardias**, 22, etc.) son
**INFORMATIVOS**: solo se usan para tomar novedades. Comportamiento simple esperado: un cargo
nuevo por cada `id_sial` nuevo, baja del `id_sial` viejo, sin gestión fina de baja por usuario.

> ⚠️ **Nota de especialidad (cita):** en el Dotaneitor solo **37 CPH, 23 Suplentes y 24 Residentes**
> tienen especialidad definida (`services/dotaneitor/especialidades.py:28-34` — `HOJAS_POR_COD_REG`;
> paso 9.6 en `services/dotaneitor/Dotaneitor.py` llamando `limpiar_especialidad_indebida`,
> función `limpiar_especialidad_indebida` en `especialidades.py`). De las 4 carreras gestionadas, **solo CPH (37) tiene especialidad**;
> 83/85/87 **no** la tienen. Esto es coherente con la regla del usuario.

> 🎯 **Directiva del usuario (2026-10): TODAS las carreras que tengan especialidad deben quedar
> con las especialidades MAPEADAS Y CORRECTAS**, no solo CPH. Es decir: las 3 carreras con
> especialidad en el padrón — **37 CPH, 23 Suplentes/Guardias y 24 Residencias** — deben tener su
> especialidad bien resuelta contra el catálogo `especialidades_puesto`, sin heredar de otro rol
> (Bug A) ni arrastrar valores viejos cuando el padrón trae otro (caso Sargenti). El hecho de que
> 23/24 sean "informativas" para el flujo de bajas/concursos **no** las exime de tener la
> especialidad correcta: la especialidad es un dato que se muestra y se usa igual. El trabajo de
> curaduría de especialidades (fusión de variantes, grupos, regla del paréntesis + excepción
> Bioquímica) aplica a las tres. Las carreras SIN especialidad (83/85/87 y el resto) quedan con
> especialidad vacía a propósito (regla de oro: antes vacío que inventar).

### Los 3 ejes que se mapean

1. **Estado de los roles de una persona** (un solo activo; el resto en retención/comisión/baja).
2. **Bajas con triple confirmación** (padrón + baja SIAL + usuario) y el estado `validacion_vacante`.
3. **Especialidad** (la manda `LIT_ESP_CARGO`; si viene vacía, regla de oro: antes vacío que inventar).

### Bugs confirmados (una línea cada uno)

- **Bug A (especialidad "conservar"):** cuando el Dotaneitor no manda id y el texto de especialidad
  viene vacío, el lado Node decide `'conservar'` y mantiene la FK vieja — nunca vacía la especialidad
  (`apps/api/src/modules/padron/padron.especialidad.helpers.ts:38-49`, retorno `'conservar'` en línea 47).
- **Bug B (baja no consumida):** un rol que deja de venir en el padrón NO siempre genera un diff
  `eliminado` que cierre su ocupación; además las bajas reales llegan por un canal separado
  (`/bajas-consolidadas`), de modo que la ocupación puede quedar `hasta=NULL` colgada (caso Sargenti,
  rol `001628841-6`).
- **Hallazgo adicional (triple confirmación incompleta):** el botón "Confirmar baja" de
  `/bajas/validacion` **cierra el cargo a `no_vigente` en ese mismo momento**
  (`apps/api/src/modules/bajas/bajas.service.ts:478-491`, `confirmarValidacionService`), en contra de
  la regla 4 (debería ser solo la 3ª validación y dejar el cargo en `validacion_vacante`).
- **Hallazgo adicional (mapeo COD_REG↔carrera divergente):** la tabla JEFE ESCALAFON del Dotaneitor
  asigna 85→Jefe Técnico, 87→**Jefe Enfermería**, 83→**Jefe Administrativo**
  (`services/dotaneitor/Dotaneitor.py` `_calcular_jefe_escalafon`), que **no coincide** con el mapeo
  del usuario (83→ENF, 87→EG). Ver §5 y §8.
- **Hallazgo adicional (regla 1 no modelada como invariante):** nada en el código impide dos
  ocupaciones activas (`hasta=NULL`) de la misma persona, ni elige "el más nuevo gana" entre dos
  activos. Solo existe una limpieza puntual para jefaturas fantasma (§3.6).

---

## 2. Modelo de estados del cargo y del rol

### 2.1 Estado del CARGO — `EstadoCargo` (3 valores)

Definido en `prisma/schema.prisma`, enum `EstadoCargo`:

```prisma
enum EstadoCargo {
  vigente
  no_vigente
  validacion_vacante
}
```

Etiquetas de UI (`apps/web/src/modules/cargos/pages/CargoDetailPanel.tsx:8-13`, `ESTADO_LABEL`):

| Estado               | Etiqueta UI     | Significado                                                              |
| -------------------- | --------------- | ------------------------------------------------------------------------ |
| `vigente`            | "Vigente"       | Cargo activo. Puede estar _Ocupado_ o _Vacante_ (badge secundario).      |
| `validacion_vacante` | "En validación" | Ocupación cerrada por el padrón; espera que el usuario confirme/rechace. |
| `no_vigente`         | "No vigente"    | Baja efectiva / cierre definitivo.                                       |

El badge "Ocupado / Vacante" solo aparece cuando `estado === vigente`
(`CargoDetailPanel.tsx`, `vigente`/`ocupado`): `ocupado = !!persona`.

### 2.2 Estado del ROL — `situacion_revista` / `estado_persona` (texto libre)

El "estado" de cada rol vive en la **ocupación**, no en un enum. Columnas físicas
(`prisma/schema.prisma`, modelo `Ocupacion`):

- `situacion_revista` (`situacionRevista`, `@map("situacion_revista")`) — viene de `SIT_REV` del padrón.
- `estado_persona` (`estadoPersona`, `@map("estado_persona")`) — viene de la columna calculada `ESTADO`.

El Dotaneitor calcula `ESTADO` en `services/dotaneitor/Dotaneitor.py` `_calcular_estado`:

- `BLOQ_DESDE` con valor → `Bloqueado`
- `SIT_REV` contiene "retencion" (normalizado sin tilde) → `Retención de Cargo`
- `SIT_REV` contiene "comision" → `Comisión`
- default → `Activo`

> Confirmado también en `Doc/Contratos/Contrato_Padron.md` (tabla "Reglas ESTADO").
> El comentario del propio código documenta un bug ya corregido: la versión anterior buscaba la
> tilde equivocada ('á' en vez de 'ó') y nunca matcheaba "Retención", cayendo siempre en `Activo`
> (`Dotaneitor.py` `_calcular_estado`, docstring). _Contenido reformulado por cumplimiento de licencia._

El panel de detalle del cargo muestra estos campos del rol
(`CargoDetailPanel.tsx`, sección "Datos de la ocupación"): "Situación de revista" =
`ocup.situacionRevista`, "Estado" = `ocup.estadoPersona`; y detecta retención con la comparación
**exacta** `ocup?.situacionRevista === 'Retencion de Cargo'` (`CargoDetailPanel.tsx:41`).

> ⚠️ **Riesgo de acople de texto:** el front compara `situacionRevista === 'Retencion de Cargo'`
> (sin tilde, capitalización concreta), mientras el Dotaneitor hoy normaliza todo a **minúscula sin
> tilde** (`Dotaneitor.py` `_forzar_mayusculas`, que pese al nombre pasa todo a minúscula sin tilde,
> ver su docstring). Si `situacion_revista` llega en minúscula, la comparación del panel no matchea.
> Es una diferencia a verificar con dato real (ver query 7.v).

### 2.3 Cómo se relacionan hoy cargo ↔ rol

- Una ocupación **vigente** = `hasta IS NULL` (`Ocupacion.hasta`, `schema.prisma`). Es el criterio
  único de "rol activo" en todo el código del padrón y de bajas.
- El estado del CARGO lo mueve el padrón al aprobar (§3) y el canal de bajas (§4); el estado del ROL
  (`situacion_revista`) es un snapshot textual del SIAL y **no** cambia el `EstadoCargo` por sí mismo.
- No hay ninguna regla que derive automáticamente `EstadoCargo` desde `situacion_revista` (p. ej.
  "si SIT_REV = baja entonces cargo no_vigente"). El cierre de ocupación lo dispara la **ausencia**
  del `id_sial` en el padrón nuevo (diff `eliminado`), no el valor de `SIT_REV`.

---

## 3. Flujo actual del diff y la aprobación

Fuente: `apps/api/src/modules/padron/padron.service.ts`.

### 3.1 `calcularDiff(registros)` — cómo clasifica

Carga el estado actual desde Postgres con `prisma.cargo.findMany` filtrando
`estado IN (vigente, validacion_vacante, no_vigente)` **y `idSial IS NOT NULL`**
(`padron.service.ts`, bloque `cargosActuales`, ~líneas 430-495). Para cada cargo trae **una sola**
ocupación relevante: la vigente (`hasta IS NULL`) o, si no hay, la última cerrada
(`orderBy hasta asc nulls first`, `take: 1`).

Arma dos mapas por **`idSial`** (no por `idSialRol`):
`nuevosMap` (clave `ID SIAL` del registro Python) y `actualesMap` (clave `Cargo.idSial`).

- **Nuevos:** `id_sial` presente en el padrón y ausente de Postgres. Construye
  `idSialRol = \`${idSial}-${cuilYRol}\``y vuelca TODO el registro en`valorNuevo` (JSON allowlist).
- **Eliminados:** `id_sial` presente en Postgres y ausente del padrón nuevo. Clasifica con
  `categoriaBaja(estado, ocup)` (`padron.diff.helpers.ts:54-61`): `campo=null` = **baja nueva de la
  semana** (cargo `vigente` + ocupación vigente + `persona.activo === true`); cualquier otro caso
  `campo='baja_previa'`.
- **Modificados:** `id_sial` en ambos. Compara campo a campo con `COLS_WATCH`
  (`padron.service.ts:194-209`). Solo compara campos de ocupación contra una ocupación **vigente**.
  Emite marcadores especiales:
  - `__reabrir_ocupacion__` cuando el cargo reaparece pero su única ocupación estaba cerrada.
  - `__especialidad_puesto_id__` cuando un cambio re-resuelve la FK de especialidad (ver §6, Bug A).

> ⚠️ **Clave del diff = `id_sial`, no `cuil`.** El diff razona por identificador de cargo SIAL. Dos
> roles de la misma persona con `id_sial` distinto (p. ej. `001628841-5` y `001628841-6`) son dos
> cargos independientes para el diff. No hay en `calcularDiff` ninguna lógica "por persona" que
> relacione dos roles de un mismo CUIL (ni "un solo activo", ni "el más nuevo gana"). **Este es el
> hueco de las reglas 1 y 2** (ver §5 y §6/Bug B).

### 3.2 Aprobación — `aprobarSnapshotService(id, usuarioId)`

Dentro de un `$transaction` con timeout de 10 min (`TRANSACTION_OPTS`, `padron.service.ts:138`):

1. Bloquea si hay diffs `nuevo` con `aprobado IS NULL` (decisión individual pendiente).
2. Agrupa diffs por `idSialRol` y separa en `nuevos / rechazados / eliminados / modificados`.
3. **Nuevos aprobados:** crea Persona + Cargo + Ocupación + Histórico (precarga en bloque; resuelve
   `puestoCargoId` y `especialidadPuestoId` vía catálogo — §6).
4. **Reconciliación `validacion_vacante`** (`padron.service.ts`, paso 4, "Resolver automáticamente
   cargos en validacion_vacante"): si un cargo en `validacion_vacante`/`no_vigente` reaparece en el
   padrón nuevo → vuelve a `vigente`; si NO aparece → `no_vigente`.
5. **Eliminados (paso 5):** `ocupacion.updateMany({ hasta: fechaPadron })`, luego:
   - Personas sin ninguna ocupación vigente restante → `activo=false`.
   - Cargos sin ocupación vigente restante → `validacion_vacante` + `estadoDesde` **salvo** que ya
     exista una baja `confirmada` sin vincular, en cuyo caso la vincula y NO pasa por validación
     (`padron.service.ts`, "S17-3").
   - Comentario en código: _"el padrón NUNCA marca no_vigente directamente — pasa a
     validacion_vacante para que el operador confirme o rechace la baja"_ (paso 5, "S8A-2").
     _Contenido reformulado por cumplimiento de licencia._
6. **Modificados (paso 6):** actualiza Cargo/Ocupación por fila; maneja reclasificación de carrera
   (cambio de `codigo_de_registro`), re-resolución de puesto y especialidad (§6).
7. Paso **6d**: normaliza cargos **fantasma de jefatura** (conducción vigente sin `codigo_jefaturas`
   cuyo ocupante tiene un cargo hermano del mismo literal con JCAT) → los marca `no_vigente` y cierra
   su ocupación (`padron.service.ts`, SQL `WITH fantasmas`).
8. Paso **7**: inserta `PadronHistorico` (una fila por ocupación tocada).
9. Paso **10 / invariante `persona.activo`** (documentado en `Contrato_Padron.md`): un `UPDATE` final
   reactiva (`activo=true`) a toda persona inactiva que tenga una ocupación vigente — corrige el
   reingreso (baja + alta posterior quedaba inactiva con cargo activo).

### 3.3 Cómo se cierra una ocupación

Siempre con `hasta = fechaPadron` (diff `eliminado`, paso 5) o `hasta = snapshot.fechaAsignada`
(limpieza de fantasmas, paso 6d). Reapertura: `hasta = NULL` + persona `activo=true` + cargo
`vigente` (marcador `__reabrir_ocupacion__`, paso 6).

### 3.4 Cómo entra la especialidad (marcador + `decidirEspecialidad`)

El Dotaneitor ya resuelve un `especialidad_puesto_id` y lo transporta como marcador
`__especialidad_puesto_id__` (§3.1). En el aprobar, `especialidadPuestoIdFinal(...)`
(`padron.service.ts:1217`) consulta la decisión pura `decidirEspecialidad(...)`
(`padron.especialidad.helpers.ts:38-49`). Ver §6 (Bug A) para el detalle de la regla `'conservar'`.

---

## 4. Flujo de bajas (canal separado)

Hay **dos** sub-canales, ambos distintos del padrón:

### 4.1 `/bajas-consolidadas` → bajas SIAL (`bajas-sial.service.ts`)

- `uploadBajasSialService` parsea un Excel (columnas requeridas `CARGO, CUIL, AYN, MOT_BAJA`,
  `bajas-sial.service.ts:106-110`) e inserta en `baja_sial_registros` / `baja_sial_snapshots`.
- Calcula un diff contra el **snapshot SIAL anterior aprobado** (nuevo/eliminado/modificado por
  `cargo` = `id_sial`), NO contra el padrón.
- **Triangula** por CUIL (`triangular()`, `bajas-sial.service.ts:48-96`): marca
  `existe_en_personas` y `tiene_ocup_activa` (ocupación `hasta=NULL` de ese CUIL), y copia datos del
  cargo activo (cod. registro, hospital, especialidad).
- `aprobarBajasSialService` solo cambia el estado del snapshot SIAL a `aprobado`
  (`bajas-sial.service.ts:371`). **No cierra ocupaciones ni cambia `EstadoCargo` por sí mismo.**

> **Lo que la baja SIAL aporta a la triple confirmación:** es la **2ª confirmación** (la baja llegó
> por SIAL). Su efecto sobre el cargo es **indirecto**: en el aprobar del padrón (§3.2 paso 5), si
> existe una `Baja` con `estado='confirmada'` sin vincular, se vincula y el cargo salta
> `validacion_vacante`. Pero `baja_sial_registros` por sí solo no crea esa `Baja` confirmada.

### 4.2 `/bajas/validacion` → confirmación por usuario (`bajas.service.ts` + `ValidacionBajasPage.tsx`)

`listValidacionService` (`bajas.service.ts:225`) lista los cargos en `validacion_vacante` y para
cada uno cruza **tres orígenes**:

- `enPadronPendiente` — el `id_sial` aparece en un diff `eliminado` de un snapshot de padrón
  (`diffPadronMap`).
- `enSial` — el `id_sial` está en el snapshot SIAL más reciente (`sialMap`).
- `bajaManual` — hay una `Baja` registrada para ese `cargoId`.

Y deriva `origen ∈ {padron, baja_sial, baja_manual, ambos, desconocido}`
(`bajas.service.ts:311-316`). La UI muestra sub-pestañas "Triangulados ⚡ / Solo padrón / Solo baja
SIAL ⚠ / Histórico" (`ValidacionBajasPage.tsx` `SUBTABS`).

**El botón "Confirmar baja"** llama `POST /api/v1/bajas/validacion/:cargoId/confirmar`
(`ValidacionBajasPage.tsx`, mutation `confirmar`) → `confirmarValidacionService`
(`bajas.service.ts:478-491`):

```ts
return prisma.cargo.update({
  where: { id: cargoId },
  data: { estado: 'no_vigente', estadoDesde: new Date(), ... },
})
```

> ❌ **Contradice la regla 4.** Hoy "Confirmar baja" **cierra el cargo a `no_vigente` en el acto**.
> La regla del usuario dice que ese botón es **solo la 3ª validación** y el cargo debe **quedar en
> `validacion_vacante`** (ya habilitado para concursos/altas por baja), siendo el cierre efectivo a
> `no_vigente` un **paso posterior**. (`rechazarValidacionService`, `bajas.service.ts:493`, sí
> hace lo correcto para el rechazo: reabre la ocupación, reactiva la persona y vuelve a `vigente`.)

### 4.3 ¿Dónde está (o falta) la triple confirmación?

| Confirmación        | Señal en el sistema                                                        | ¿Implementada?                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) Padrón          | diff `eliminado` del snapshot de padrón (`enPadronPendiente`)              | ✅ se detecta y se muestra (`bajas.service.ts`)                                                                                                      |
| (b) Baja SIAL       | `id_sial` en `baja_sial_registros` (`enSial`)                              | ✅ se detecta y se muestra                                                                                                                           |
| (c) Usuario         | botón "Confirmar baja"                                                     | ⚠️ existe, pero **cierra el cargo** en vez de solo validar                                                                                           |
| **Estado objetivo** | con las 3 → cargo **sigue** en `validacion_vacante`, habilitado a concurso | ❌ **no implementado**: no hay un flag "3 confirmaciones hechas" ni un estado intermedio "validado pero no cerrado" distinto de `validacion_vacante` |

> No existe en el modelo un campo que registre "esta baja tiene las 3 confirmaciones". El cruce de
> los 3 orígenes es **de solo lectura y en runtime** (`listValidacionService`); confirmar colapsa
> directo a `no_vigente`. **Implementar la regla 4 requiere decidir cómo persistir el estado
> "triple-confirmada pero aún en validación".** Ver §8.

---

## 5. Comportamiento por carrera (qué hace / qué debe / diferencias)

> Importante: en el código actual **no hay ramas por COD_REG que cambien la lógica de estados de
> rol o de baja**. El COD_REG solo influye en: (i) resolución de escalafón/puesto, (ii) si hay o no
> especialidad, (iii) la regla JEFE ESCALAFON, y (iv) el auto-aprobado de `nuevo` para RES/DOC/AS-*
> (`esAutoAprobable`, `padron.service.ts:42-51`). Todo lo demás (diff por `id_sial`, cierre de
> ocupación, `validacion_vacante`) es **idéntico para todas las carreras**. Las diferencias por
> carrera abajo son, por lo tanto, mayormente **lo que FALTA** por carrera gestionada.

### 5.1 COD_REG 37 — CPH (GESTIONADA, con especialidad)

**(a) Qué hace hoy**

- Diff y aprobación estándar (§3). Resuelve puesto contra catálogo y especialidad vía
  `especialidad_puesto_id` del Dotaneitor con fallback por texto (`resolverPuestoCargo.ts`).
- Especialidad del Dotaneitor: respeta `LIT_ESP_CARGO` y aplica la cascada/regla de oro
  (`especialidades.py:1-40`, docstring; `completar_especialidad`, `especialidades.py:191`).
- JEFE ESCALAFON: 37 sin ESCRITORIO → `Jefe CPH POF`; con ESCRITORIO → `Jefe CPH POU`
  (`Dotaneitor.py` `_calcular_jefe_escalafon`).
- Baja: cae en el flujo de `validacion_vacante` + `/bajas/validacion` (§4).

**(b) Qué debe hacer** (reglas 1-5)

- Un solo rol activo por persona; el resto en retención/comisión/baja.
- Si hay dos activos, el `cargo_desde` más reciente es el vigente; el otro pasa a baja.
- Triple confirmación de baja; "Confirmar baja" deja el cargo en `validacion_vacante` (no lo cierra).
- Especialidad: la manda `LIT_ESP_CARGO`; si vacía, antes vacío que inventar.

**(c) Diferencias / bugs**

- **Bug A** afecta de lleno a CPH (es la única gestionada con especialidad): si el padrón trae la
  especialidad vacía y el Dotaneitor no manda id, Node **conserva** la FK vieja (§6).
- **Regla 1/2 no modeladas:** no se detecta "dos activos" ni se aplica "el más nuevo gana".
- **Regla 4 incompleta:** "Confirmar baja" cierra el cargo (§4.2).

### 5.2 COD_REG 83 — Enfermería / ENF (GESTIONADA, sin especialidad)

**(a) Qué hace hoy**

- Mismo flujo estándar. Sin especialidad del SIAL (83 no está en `HOJAS_POR_COD_REG`), pero el lado
  Node puede **derivar** especialidad del nombre del puesto para no-médicos: `derivarEspecialidadDesdePuesto`
  devuelve `'enfermeria'` para cualquier literal que matchee `/enfermer/`
  (`apps/api/src/modules/padron/derivarEspecialidadPuesto.ts:84`). Es especialidad **derivada del
  puesto**, no del SIAL.
- JEFE ESCALAFON: **83 → `Jefe Administrativo`** (`Dotaneitor.py` `_calcular_jefe_escalafon`).

**(b) Qué debe hacer**

- Igual que las demás gestionadas en estados/baja; sin especialidad por SIAL.

**(c) Diferencias / bugs**

- ⚠️ **Discrepancia de mapeo:** el usuario mapea **83 → ENF**, pero el Dotaneitor rotula 83 como
  **"Jefe Administrativo"** y **87 → "Jefe Enfermería"**. Hay que confirmar cuál es correcto (§8,
  pregunta abierta). Si el mapeo del usuario manda, la tabla JEFE ESCALAFON está cruzada entre 83/87.
- Regla 1/2 y regla 4: mismos huecos que CPH.

### 5.3 COD_REG 85 — Técnicos de la Salud / TEC (GESTIONADA, sin especialidad)

**(a) Qué hace hoy**

- Flujo estándar. JEFE ESCALAFON: **85 → `Jefe Tecnico`** (`Dotaneitor.py` `_calcular_jefe_escalafon`).
- Puede derivar especialidad del puesto (ej. "técnico en radiología" → su función) vía
  `derivarEspecialidadDesdePuesto` (`derivarEspecialidadPuesto.ts:76`), pero **no** por SIAL.

**(b) Qué debe hacer** — igual patrón gestionado, sin especialidad SIAL.

**(c) Diferencias / bugs** — regla 1/2 y regla 4: mismos huecos. Mapeo 85→TEC coincide con el
Dotaneitor (`Jefe Tecnico`). ✅

### 5.4 COD_REG 87 — Escalafón General CEETPS / EG (GESTIONADA, sin especialidad)

**(a) Qué hace hoy**

- Flujo estándar. JEFE ESCALAFON: **87 → `Jefe Enfermeria`** (`Dotaneitor.py` `_calcular_jefe_escalafon`).
- Concursos CEETPS tienen su propio sub-flujo (`ConcursoCeetps`, `schema.prisma`), separado del padrón.

**(b) Qué debe hacer** — patrón gestionado, sin especialidad SIAL.

**(c) Diferencias / bugs**

- ⚠️ **Discrepancia de mapeo (misma que 83):** usuario dice **87 → EG (CEETPS)**; el Dotaneitor
  rotula 87 como **"Jefe Enfermería"**. A confirmar (§8).
- Regla 1/2 y regla 4: mismos huecos.

### 5.5 Informativas (24 Residencias, 23 Suplentes/Guardias, 22, y resto)

**(a) Qué hace hoy**

- Mismo flujo de diff/aprobación por `id_sial`. **Residentes (RES) y Docentes (DOC) y AS-\*** se
  **auto-aprueban** en el diff `nuevo` sin revisión manual (`esAutoAprobable`, `padron.service.ts:42`;
  el prefijo se calcula con `prefijoDeCargo`). CPH/ENF/TEC/EG **no** se auto-aprueban (requieren
  decisión individual).
- Especialidad: **24 Residencias** y **23 Suplentes** SÍ tienen hoja de especialidad
  (`HOJAS_POR_COD_REG`, `especialidades.py:28-34`) — aunque el usuario las clasifica como
  informativas. 22 y el resto: especialidad vaciada en paso 9.6.

**(b) Qué debe hacer** (regla simplificada del usuario)

- Cargo nuevo por cada `id_sial` nuevo; baja del `id_sial` viejo; **sin** gestión fina de baja por
  usuario. Caso residentes explícito del usuario: _el cargo del `id_sial` anterior es baja y el
  nuevo es un cargo nuevo._

**(c) Diferencias / bugs**

- El comportamiento "nuevo id = cargo nuevo, viejo id = baja" **depende de que el viejo `id_sial`
  genere un diff `eliminado`** — exactamente el mecanismo que falla en Bug B (§6). Para residentes,
  si el `id_sial` viejo deja de venir y no se genera `eliminado`, la ocupación vieja queda colgada.
- Nota: aunque sean informativas, 23/24 **sí** cargan especialidad en el Dotaneitor, lo que puede
  chocar con la expectativa "solo CPH tiene especialidad entre las que me importan". No es bug, es
  un matiz a tener presente.

---

## 6. Bugs confirmados (mecanismo + cita + evidencia)

### Bug A — especialidad: `'conservar'` impide vaciar/actualizar

**Mecanismo exacto.** `decidirEspecialidad(p)` (`padron.especialidad.helpers.ts:38-49`) decide:

```ts
export function decidirEspecialidad(p: DecisionEspecialidadParams): AccionEspecialidad {
  const id = (p.idDotaneitor ?? '').trim()
  if (id) {
    if (p.puestoDelId && p.puestoDelId === p.puestoDelCargo) return 'usar-id'
    return 'fallback-texto'
  }
  // Sin id del Dotaneitor:
  return p.textoEspecialidadReal != null ? 'fallback-texto' : 'conservar'
}
```

La rama que dispara `'conservar'`: **NO viene id del Dotaneitor** (`idDotaneitor` vacío) **Y** el
texto de especialidad es `null` tras normalizar (`textoEspecialidadReal == null`). `textoEspecialidadReal`
es el resultado de `especialidadSialReal(...)` (`resolverPuestoCargo.ts:283`), que devuelve `null`
cuando el valor es vacío o un placeholder como `'SIN ESPECIALIDAD'` / `'(sin especificar)'` / `'s/e'`
(`resolverPuestoCargo.ts:274-279`, `ESPECIALIDAD_NO_REAL`).

En el aprobar, `'conservar'` se traduce a: **no pisar la FK vigente**. En la rama de modificados
(`padron.service.ts`, bloque `if (espLegacyNueva)`), el comentario es explícito: _"vacío = conservar.
Si el padrón trae la especialidad VACÍA para un cargo que ya tenía una, NO se re-resuelve (se conserva
la anterior)"_ (`padron.service.ts:1968-1971`). _Contenido reformulado por cumplimiento de licencia._

**Por qué contradice la regla 5.** La regla 5 dice: si `LIT_ESP_CARGO` viene vacía, "entre vacío y
una especialidad que no corresponde, prefiero **vacío**". El comportamiento actual, en el caso
"sin id del Dotaneitor + texto vacío", **mantiene la FK vieja** (no vacía). Es decir: cuando el
padrón deja de traer especialidad para un cargo que antes tenía una, la especialidad vieja **persiste**
en `especialidad_puesto_id`, en lugar de quedar vacía.

> Matiz de interpretación: el equipo documentó "vacío = conservar" como una **decisión de negocio
> deliberada** para CPH (evitar perder la especialidad en cargas parciales/jefaturas,
> `padron.service.ts` comentario citado). La regla 5 del usuario para ESTE mapeo pide lo contrario
> (preferir vacío). **Es una contradicción a resolver con el usuario** (§8): ¿"vacío = conservar"
> (código actual) o "vacío = vaciar" (regla 5)? El caso límite es cuando el SIAL legítimamente deja
> de asignar especialidad a un rol.

El lado Python (Dotaneitor) **sí** cumple la regla de oro: respeta `LIT_ESP_CARGO` y, ante vacío,
aplica la cascada por rol / por CUIL no ambiguo / y si nada resuelve deja vacío
(`especialidades.py:1-40` docstring; `_resolver_especialidad_unica` devuelve `None` ante ambigüedad,
`especialidades.py:53`). El problema es del lado Node en el caso "sin id + texto vacío".

### Bug B — baja no consumida: la desaparición de un rol no genera `eliminado`

**Mecanismo exacto.** La detección de bajas en `calcularDiff` recorre **`actualesIds`**, que son las
claves `Cargo.idSial` de los cargos en Postgres (bloque "Eliminados", `padron.service.ts`, loop
`for (const idSial of actualesIds)`), y empuja `eliminado` solo si ese `id_sial` **no aparece** en el
padrón nuevo. Hay **tres condiciones** que pueden hacer que un rol desaparecido NO produzca `eliminado`:

1. **El cargo no está en `cargosActuales`.** La query filtra `estado IN (vigente, validacion_vacante,
no_vigente)` **y `idSial IS NOT NULL`**. Si el `id_sial` del rol nunca llegó a crear un `Cargo`
   (p. ej. su diff `nuevo` quedó pendiente/rechazado y no se aprobó), no hay fila en `actualesMap` y
   por lo tanto no hay a quién marcar `eliminado`. Su ocupación —si existiera— no se cierra por esta vía.
2. **La clave es `id_sial`, no `cuil`/persona.** El diff no razona "esta persona ahora tiene otro
   rol activo". Si el padrón **deja de traer** el rol viejo, depende enteramente de que ese `id_sial`
   viejo estuviera como `Cargo` para generar `eliminado`. No hay un paso "si la persona tiene un rol
   nuevo activo, cerrar el viejo" (reglas 1 y 2 ausentes).
3. **Las bajas vienen por canal separado.** El diseño asume que muchas bajas llegan por
   `/bajas-consolidadas` (SIAL) y `/bajas/validacion`, no por ausencia en el padrón. Una ocupación
   `hasta=NULL` solo se cierra por: (i) diff `eliminado` del padrón (paso 5), (ii) limpieza de
   fantasmas de jefatura (paso 6d), o (iii) `confirmarValidacionService` tras pasar a
   `validacion_vacante`. Si ninguno se dispara, la ocupación queda **colgada** `hasta=NULL`.

**Evidencia — caso Sargenti (CUIL 27368625057).** Datos aportados por el usuario:

- El rol `001628841-6` (`id_sial_rol = 001628841-6-27368625057-6`) figura en `padron_diff` como
  `nuevo` el **2026-09-27** y **2026-10-04**, y **desapareció** del padrón el **2026-10-11**.
- **Nunca** se generó un diff `eliminado` para `001628841-6`; su ocupación quedó `hasta=NULL` colgada.
- En paralelo, el rol `001628841-5` siguió vigente (RES-003285) hasta el 2026-10-18.

Interpretación con el código: como la clave del diff es `id_sial` (`001628841-6` vs `001628841-5` son
**cargos distintos**), y las dos filas `nuevo` del `-6` sugieren que su `Cargo` pudo no consolidarse o
que el `-6` no estaba en `cargosActuales` al momento en que desapareció, no se produjo el `eliminado`.
**La verificación definitiva (¿existe el `Cargo` `001628841-6`? ¿su ocupación tiene `hasta=NULL`?) la
da la query 7.iv y la 7.vi.** No se puede afirmar solo leyendo el código cuál de las condiciones 1-3
aplicó exactamente a Sargenti sin mirar el dato — queda señalado como **a confirmar con SQL**.

> Relación con la regla 2 ("el más nuevo gana"): aunque el `-6` hubiera generado `eliminado`, el
> sistema **no** implementa hoy la lógica de resolver automáticamente dos roles activos de un mismo
> CUIL dejando activo el de `cargo_desde` más reciente. Ese razonamiento por persona **no existe** en
> `calcularDiff` ni en el aprobar.

---

## 7. Métricas por padrón (queries para el usuario)

> Para correr en WSL con:
> `docker compose exec -T postgres psql -U srrhh_user -d srrhh_db -c "<QUERY>"`
> Nombres de columnas físicas verificados contra `@map` en `prisma/schema.prisma`.
> `fecha_asignada` del snapshot está en formato `YYYY-MM-DD`. **No ejecutar desde este documento.**

### (i) Conteo de diffs por tipo, por snapshot/padrón

Devuelve, por fecha de snapshot, cuántos diffs hay de cada tipo (incluye los marcadores internos
`__reabrir_ocupacion__` y `__especialidad_puesto_id__` dentro de `modificado` — se desglosan aparte).

```sql
SELECT ps.fecha_asignada,
       d.tipo,
       count(*) AS filas,
       count(*) FILTER (WHERE d.campo IS NULL)                              AS campo_null,
       count(*) FILTER (WHERE d.campo = 'baja_previa')                      AS baja_previa,
       count(*) FILTER (WHERE d.campo LIKE 'completado:%')                  AS completados,
       count(*) FILTER (WHERE d.campo = '__reabrir_ocupacion__')            AS reaperturas,
       count(DISTINCT d.id_sial_rol)                                        AS roles_distintos
FROM padron_diff d
JOIN padron_snapshots ps ON ps.id = d.snapshot_id
GROUP BY ps.fecha_asignada, d.tipo
ORDER BY ps.fecha_asignada, d.tipo;
```

> Para un solo padrón: agregar `WHERE ps.fecha_asignada = '2026-10-18'` antes del `GROUP BY`.

### (ii) Registros del padrón SIN cargo asignado (regla 3)

El padrón persistido vive en `padron_historico` (una fila por ocupación tocada al aprobar) y toda
fila ahí tiene `cargo_id NOT NULL` (FK obligatoria, `schema.prisma`). Por eso el caso "sin cargo
asignado" (regla 3) **no queda en `padron_historico`**: los registros sin cargo nunca se materializan.
La forma de contarlos desde lo que SÍ se guarda es mirar los diffs `nuevo` cuyo JSON `valor_nuevo`
trae `id_sial` vacío (no se pudo asociar a un cargo). Devuelve, por snapshot, cuántos diffs `nuevo`
no tienen `id_sial` en su payload:

```sql
SELECT ps.fecha_asignada,
       count(*) AS nuevos_sin_id_sial
FROM padron_diff d
JOIN padron_snapshots ps ON ps.id = d.snapshot_id
WHERE d.tipo = 'nuevo'
  AND COALESCE(NULLIF(trim((d.valor_nuevo::jsonb ->> 'id_sial')), ''), NULL) IS NULL
GROUP BY ps.fecha_asignada
ORDER BY ps.fecha_asignada;
```

> ⚠️ **Limitación honesta:** el sistema actual **descarta** las filas del padrón sin cargo antes de
> que lleguen a la BD (regla "si no tiene cargo, no aplica" ya se cumple de hecho: nunca se crea
> Cargo/Ocupación para ellas, `padron.service.ts` saltea con `continue` cuando falta `id_sial`). El
> conteo FINO por archivo crudo (cuántas filas del Excel original venían sin cargo) **no es
> recuperable desde Postgres** — habría que mirar el Excel/parquet del Dotaneitor o instrumentar el
> pipeline. La query de arriba es la mejor aproximación con lo persistido. (Decisión pendiente, §8.)

### (iii) Personas con >1 ocupación activa (viola regla 1), por código de registro

Ocupación activa = `hasta IS NULL`. Agrupa por CUIL y cuenta; luego desglosa por `codigo_registro`
del cargo de cada ocupación activa.

```sql
WITH activas AS (
  SELECT o.id, o.cuil, o.persona_id, c.codigo_registro_id, cr.codigo AS cod_reg
  FROM ocupaciones o
  JOIN cargos c          ON c.id = o.cargo_id
  LEFT JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
  WHERE o.hasta IS NULL
),
multi AS (
  SELECT persona_id
  FROM activas
  GROUP BY persona_id
  HAVING count(*) > 1
)
SELECT a.cod_reg,
       count(DISTINCT a.persona_id) AS personas_con_mas_de_un_activo,
       count(*)                     AS ocupaciones_activas_en_esas_personas
FROM activas a
JOIN multi m ON m.persona_id = a.persona_id
GROUP BY a.cod_reg
ORDER BY personas_con_mas_de_un_activo DESC NULLS LAST;
```

> Nota: cuenta la persona en cada `cod_reg` donde tiene un activo. Para el total de personas con >1
> activo (sin desglose): `SELECT count(*) FROM multi;` usando el mismo CTE.

### (iv) Roles con ocupación `hasta=NULL` pero `situacion_revista` NO activa (fantasmas tipo Bug B), por cód. registro

Detecta ocupaciones abiertas cuya situación de revista indica retención/comisión/baja (es decir, el
rol no debería figurar como activo colgado). Usa `lower()` + sin asumir tildes.

```sql
SELECT cr.codigo AS cod_reg,
       o.situacion_revista,
       count(*) AS roles_colgados
FROM ocupaciones o
JOIN cargos c          ON c.id = o.cargo_id
LEFT JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
WHERE o.hasta IS NULL
  AND o.situacion_revista IS NOT NULL
  AND (
       lower(o.situacion_revista) LIKE '%retenc%'
    OR lower(o.situacion_revista) LIKE '%comis%'
    OR lower(o.situacion_revista) LIKE '%baja%'
  )
GROUP BY cr.codigo, o.situacion_revista
ORDER BY roles_colgados DESC;
```

> Variante usando `estado_persona` (la columna calculada `ESTADO`) en vez de `situacion_revista`:
> reemplazar las 3 condiciones `LIKE` por `lower(o.estado_persona) IN ('retención de cargo',
'retencion de cargo', 'comisión', 'comision', 'bloqueado')`. Correr ambas y comparar: si difieren
> mucho, confirma el riesgo de acople de texto de §2.2.

### (v) Diagnóstico del acople de texto de `situacion_revista` (soporte a §2.2)

Lista los valores distintos realmente presentes, para ver si llegan en minúscula/sin tilde o como
`'Retencion de Cargo'` (lo que compara el panel).

```sql
SELECT situacion_revista, estado_persona, count(*) AS filas
FROM ocupaciones
WHERE hasta IS NULL
GROUP BY situacion_revista, estado_persona
ORDER BY filas DESC
LIMIT 50;
```

### (vi) Evidencia Bug B — estado real del caso Sargenti (CUIL 27368625057)

Muestra, por cada rol de la persona, si existe el `Cargo`, su `estado`, y si su ocupación quedó
abierta (`hasta IS NULL`). Reemplazá el CUIL si querés mirar otro caso.

```sql
SELECT o.id_sial_rol,
       c.id_sial,
       c.codigo,
       c.estado          AS estado_cargo,
       o.situacion_revista,
       o.estado_persona,
       o.desde,
       o.hasta,
       p.activo          AS persona_activa
FROM ocupaciones o
JOIN cargos c   ON c.id = o.cargo_id
JOIN personas p ON p.id = o.persona_id
WHERE o.cuil = '27368625057'
   OR o.id_sial_rol LIKE '%27368625057%'
ORDER BY o.id_sial_rol, o.hasta NULLS FIRST;
```

> Lectura esperada si Bug B está presente: el rol `001628841-6...` aparece con `hasta IS NULL`
> (ocupación colgada) y/o el `Cargo` `001628841-6` no existe (fila ausente) pese a tener diffs
> `nuevo`. Confirmá contra `padron_diff` con la query de verificación del usuario (abajo).

### (vii) ¿Se generó alguna vez un `eliminado` para el rol `001628841-6`? (confirma Bug B)

```sql
SELECT ps.fecha_asignada, d.tipo, d.campo, d.id_sial_rol
FROM padron_diff d
JOIN padron_snapshots ps ON ps.id = d.snapshot_id
WHERE d.id_sial_rol LIKE '001628841-6%'
ORDER BY ps.fecha_asignada, d.tipo;
```

> Si en el resultado solo hay filas `tipo='nuevo'` y ninguna `tipo='eliminado'`, queda confirmado
> que la desaparición del rol nunca se consumió como baja (Bug B).

---

## 8. Preguntas abiertas / decisiones pendientes

1. **Mapeo COD_REG ↔ carrera (83 vs 87).** El usuario dice 83→ENF y 87→EG; el Dotaneitor rotula
   83→"Jefe Administrativo" y 87→"Jefe Enfermería" (`Dotaneitor.py` `_calcular_jefe_escalafon`).
   ¿Cuál es el mapeo correcto? Si manda el del usuario, la tabla JEFE ESCALAFON está cruzada.

2. **Regla 5 vs "vacío = conservar" (Bug A).** El código conserva la especialidad vieja cuando el
   padrón viene sin dato; la regla 5 pide preferir vacío. ¿Se cambia a "vacío = vaciar" para las
   carreras gestionadas (al menos CPH), o se mantiene "conservar" como protección ante cargas
   parciales? Impacta directamente a CPH.

3. **Regla 1/2 (un solo activo / el más nuevo gana).** Hoy NO existe lógica por persona. ¿Dónde debe
   vivir? Opciones: (a) en `calcularDiff`/aprobar, detectando dos `hasta=NULL` del mismo CUIL y
   cerrando el de `cargo_desde` más antiguo; (b) un paso posterior de "reconciliación de roles". El
   usuario aclaró que el viejo **no se cierra solo**: queda "a la espera de la baja" formal
   (mensaje 5 del usuario). Hay que decidir si "dos activos" dispara automáticamente baja del viejo
   o solo lo marca "a la espera".

4. **Regla 4 (triple confirmación).** Falta: (a) persistir que una baja tiene las 3 confirmaciones;
   (b) cambiar "Confirmar baja" para que NO cierre el cargo (hoy va a `no_vigente`,
   `bajas.service.ts:420-432`) y lo deje en `validacion_vacante` habilitado a concurso; (c) definir
   el "paso posterior" que sí cierra a `no_vigente`. ¿Un nuevo estado/flag intermedio, o reutilizar
   `validacion_vacante` + un booleano "validada por usuario"?

5. **Conteo de filas "sin cargo" (regla 3).** No es recuperable desde Postgres (se descartan antes de
   persistir). ¿Alcanza con la aproximación por `padron_diff` (query 7.ii), o se requiere instrumentar
   el Dotaneitor / mirar el Excel/parquet para el conteo exacto por archivo?

6. **Causa exacta de Bug B en Sargenti.** Las queries 7.vi/7.vii dicen si el `Cargo` `001628841-6`
   existe y si alguna vez hubo `eliminado`. Según el resultado, la causa es (1) cargo nunca creado,
   (2) ausencia de lógica por persona, o (3) baja esperada por canal separado. Confirmar con el dato
   antes de diseñar el fix.

7. **Acople de texto en `situacion_revista`.** El panel compara `=== 'Retencion de Cargo'`
   (`CargoDetailPanel.tsx:85`) mientras el Dotaneitor normaliza a minúscula sin tilde. Query 7.v lo
   verifica. ¿Se normaliza la comparación del front, o se fija el formato de `situacion_revista` en
   la carga?

---

### Apéndice — archivos leídos para este diagnóstico

- `services/dotaneitor/Dotaneitor.py` (pasos 0-10, `_calcular_estado`, `_calcular_jefe_escalafon`,
  dedup ID SIAL, jefaturas duplicadas).
- `services/dotaneitor/especialidades.py` (cascada de especialidad, `HOJAS_POR_COD_REG`,
  `_resolver_especialidad_unica`, `limpiar_especialidad_indebida`).
- `apps/api/src/modules/padron/padron.service.ts` (`calcularDiff`, `aprobarSnapshotService`,
  marcadores, pasos 4/5/6/6d/7/10, `especialidadPuestoIdFinal`).
- `apps/api/src/modules/padron/padron.especialidad.helpers.ts` (`decidirEspecialidad`).
- `apps/api/src/modules/padron/padron.diff.helpers.ts` (`categoriaBaja`, `toISO`, `parseFechaDDMMYYYY`).
- `apps/api/src/modules/padron/resolverPuestoCargo.ts` (`especialidadSialReal`, `ESPECIALIDAD_NO_REAL`,
  `resolverEspecialidadPuestoId`) y `derivarEspecialidadPuesto.ts`.
- `apps/api/src/modules/bajas-sial/bajas-sial.service.ts` (`triangular`, upload/diff/aprobar SIAL).
- `apps/api/src/modules/bajas/bajas.service.ts` (`listValidacionService`, `confirmarValidacionService`,
  `rechazarValidacionService`, `origen`).
- `apps/web/src/modules/bajas/pages/ValidacionBajasPage.tsx` (botón "Confirmar baja", sub-pestañas).
- `apps/web/src/modules/cargos/pages/CargoDetailPanel.tsx` (estados del cargo y del rol).
- `prisma/schema.prisma` (`EstadoCargo`, `Cargo`, `Ocupacion`, `PadronDiff`, `PadronHistorico`,
  `PadronSnapshot`, `CodigoRegistro`, `Persona`).
- `Doc/Contratos/Contrato_Padron.md`, `Doc/Referencias/DOTANEITOR_DECISIONES.md`,
  `Doc/Referencias/DOTANEITOR_EVALUACION.md`.

> _Las citas `archivo:línea` apuntan a la versión del repo al 2026-10. Si el código se movió, buscar
> por nombre de función/constante citado._
