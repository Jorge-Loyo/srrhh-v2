# Contrato — Lógica de Cargo

> Fuente de verdad para el ciclo de vida de un cargo en el sistema SRRHH.
> Todo código que cree, modifique o consulte cargos u ocupaciones debe respetar estas reglas.

---

## 1. Qué es un cargo

Un cargo es la **unidad mínima de dotación** de un hospital. Existe independientemente de si hay una persona asignada o no. Tiene un código interno (`codigo`) que **nunca cambia**, aunque cambien las personas que lo ocupan a lo largo del tiempo.

### Identidad del cargo

El cargo estructural se identifica por la combinación:

```
hospital + escalafon + codigo_repa + literal_puesto
```

> **Regla crítica**: el campo `id_sial` en la tabla `cargos` es el legajo SIAL de la **persona** que ocupaba el cargo en el momento de la importación inicial — NO identifica al cargo estructural. El cargo estructural se identifica por los cuatro campos de arriba.

El `id_sial_rol` en la tabla `ocupaciones` tiene el formato `{legajo_sial_persona}-{nro_rol}` (ej: `001448563-3`). Identifica la **relación persona-cargo en un período**, no el cargo en sí.

### Código interno del sistema

Formato: `{ESCALAFON}[-{TIPO}][-{MODALIDAD}]-{seq 6 dígitos}`

Ejemplos: `CPH-POU-000056`, `RG-CG-000047`, `ENF-000012`

---

## 2. Estados del cargo

El campo `cargos.estado` (enum `EstadoCargo`) tiene tres valores posibles:

| Estado | Descripción |
|---|---|
| `vigente` | El cargo está activo en la estructura orgánica. |
| `validacion_vacante` | Estado intermedio. El padrón SIAL detectó una baja pendiente de confirmación administrativa. |
| `no_vigente` | Estado terminal. El cargo fue suprimido. No puede reactivarse. |

### 2.1 VIGENTE

**Condición SQL**: `cargo.estado = 'vigente'`

El cargo existe y está activo en la estructura orgánica del hospital.

**Cómo se llega**:
- Alta de cargo: se crea en el sistema (manual o por importación del padrón SIAL). El estado inicial siempre es `vigente`.
- Padrón semanal — diff tipo `nuevo`: aparece un `id_sial_rol` que no existía. El sistema busca cargo por `(hospital, escalafon, codigo_repa, literal_puesto)`. Si no existe, crea uno nuevo con `estado = vigente`.
- Operador rechaza desde Validación de Bajas: cargo vuelve a `vigente` desde `validacion_vacante`.

**Validaciones**:
- No puede tener `estado = no_vigente` si existe una ocupación con `hasta IS NULL`.
- El código del cargo (ej: `RG-CG-000047`) no cambia aunque cambien las personas.
- Un cargo vigente puede estar VACANTE u OCUPADO — son **condiciones derivadas**, no estados almacenados.

---

### 2.1B VALIDACION_VACANTE

**Condición SQL**: `cargo.estado = 'validacion_vacante'`

Estado intermedio generado exclusivamente por el padrón semanal cuando detecta que un `id_sial_rol` desapareció del Excel. La baja aún no fue confirmada administrativamente.

**Cómo se llega**:
- Padrón semanal — diff tipo `eliminado`: el `id_sial_rol` desaparece del Excel. El sistema cierra la ocupación activa (`hasta = fecha del padrón`) y pone el cargo en `validacion_vacante`.

**Cómo se sale**:
- Operador **confirma** la baja desde `/bajas/validacion` → cargo pasa a `no_vigente`.
- Operador **rechaza** (error del sistema) desde `/bajas/validacion` → cargo vuelve a `vigente`, se reabre la ocupación (`hasta = NULL`).

**Validaciones**:
- El padrón **no puede aprobarse** si hay cargos en `validacion_vacante` que reaparecen en el nuevo Excel (alerta bloqueante).
- Un cargo en `validacion_vacante` **no puede generar concurso** directamente — primero debe confirmarse la baja.
- Desde `/cargos/baja/nueva` se pueden seleccionar cargos `validacion_vacante` para el flujo de reemplazo de persona.

---

### 2.2 NO VIGENTE

**Condición SQL**: `cargo.estado = 'no_vigente'`

Estado terminal. El cargo fue suprimido de la estructura. No puede reactivarse.

**Razones de baja**:

| Razón | Descripción |
|---|---|
| Desfinanciación | El cargo pierde financiamiento presupuestario. Se registra en un acto administrativo de baja. |
| Modificación de Estructura | Modificacion de la estructura. con un expediente y un acto administrativo. |
| Vacante a No Vigente | Un cargo vacante pasa a no vigente de forma manual en el sistema. La contrapartida es un expediente de alta de otro cargo. |

**Cómo se llega**:
- Baja manual por desfinanciación.
- Baja manual por modificación de estructura.
- Baja manual vacante a no vigente.
- Operador confirma baja desde `/bajas/validacion` (cargo venía de `validacion_vacante`).

**Validaciones**:
- El padrón semanal **NUNCA** marca un cargo como `no_vigente` directamente — pasa por `validacion_vacante` primero.
- Al pasar a `no_vigente` por baja manual: cerrar ocupación activa si existe (`ocupacion.hasta = fecha de baja`).
- No puede generarse un concurso sobre un cargo `no_vigente`.
- El historial de ocupaciones anteriores se preserva (no se borra).
- **Estado irreversible**: no existe transición `no_vigente → vigente`.

---

## 3. Condiciones derivadas: VACANTE y OCUPADO

`VACANTE` y `OCUPADO` **no son estados del cargo** — son condiciones calculadas en tiempo de consulta. No existe ningún campo `vacante` ni `ocupado` en la tabla `cargos`.

### 3.1 VACANTE

**Condición SQL**:
```sql
cargo.estado = 'vigente'
AND NOT EXISTS (
  SELECT 1 FROM ocupaciones
  WHERE cargo_id = cargo.id AND hasta IS NULL
)
```

El cargo está vigente pero no tiene ninguna persona asignada actualmente.

**Cómo se genera**:
- Cierre de ocupación activa: se setea `ocupacion.hasta = fecha`. Puede ser por jubilación, renuncia, fallecimiento, vencimiento de mandato (RG), etc.
- Cargo recién creado sin designación.
- Padrón semanal — diff tipo `eliminado` con `genera_concurso = true`: la baja del ocupante genera vacante y habilita apertura de concurso.

**Validaciones**:
- No es un campo en la tabla `cargos` — se calcula en tiempo de consulta.
- Un cargo vacante puede o no tener un concurso abierto asociado.
- Puede quedar vacante sin generar concurso (genera_concurso = false) o puede seguir Vacante si el concurso no prosperó.
- Para CPH/ENF/TEC: la vacante puede disparar un concurso CEETPS.
- Para RG: la vacante espera nueva designación directa (no concurso). Mandato fijo de 5 años.
- Para AS/EG estructura: designación política directa, sin concurso.

**Sub-condiciones de vacante**:

| Sub-condición | Descripción |
|---|---|
| No requiere Concurso | El cargo espera designación directa (RG, AS, EG estructura) o está en pausa. |
| Con concurso abierto | Se inició un proceso de selección. El tipo de concurso depende del escalafón. |

---

### 3.2 OCUPADO

**Condición SQL**:
```sql
cargo.estado = 'vigente'
AND EXISTS (
  SELECT 1 FROM ocupaciones
  WHERE cargo_id = cargo.id AND hasta IS NULL
)
```

El cargo está vigente y tiene exactamente una persona asignada (`ocupacion.hasta IS NULL`).

**Cómo se genera**:
- Nueva designación: se inserta una fila en `ocupaciones` con `hasta = NULL`.
- Padrón semanal — diff tipo `nuevo` sobre cargo existente: aparece un `id_sial_rol` nuevo para un cargo que ya existe. Se crea la ocupación sin cerrar el cargo.
- Resolución de concurso (CPH/ENF/TEC): el ganador es designado. Se crea la ocupación con `situacion_revista = Activo`.

**Validaciones**:
- Solo puede existir **UNA** ocupación activa (`hasta IS NULL`) por cargo a la vez.
- Antes de insertar una nueva ocupación, verificar que no exista otra activa.
- El `id_sial_rol` es único por ocupación — identifica persona + cargo + período.
- El cargo estructural (su código) no cambia aunque cambie el ocupante.

---

## 4. Situación de revista (tabla situacion de revista)

La situación de revista describe el estado de la **persona** dentro de la ocupación activa. Se almacena en `ocupaciones.situacion_revista`.

> ⚠️ **Verificar**: la situación de revista es un atributo de la **persona** en ese cargo, no del cargo en sí. El cargo puede estar OCUPADO independientemente de cuál sea la situación de revista del ocupante.

### 4.1 Activo

**Condición SQL**: `ocupacion.hasta IS NULL AND ocupacion.situacion_revista = 'Activo'`

La persona ejerce normalmente en el cargo. Es la situación de revista estándar.

**Cómo se llega**:
- Designación normal: valor por defecto al crear la ocupación.
- Fin de retención de cargo: la persona vuelve a ejercer en su cargo original.
- Fin de comisión: la persona regresa de la comisión.

**Campos involucrados**:
- `ocupaciones.situacion_revista = 'Activo'`
- `ocupaciones.hasta IS NULL`

---

### 4.2 Retención de Cargo

**Condición SQL**: `ocupacion.hasta IS NULL AND ocupacion.situacion_revista = 'Retencion de Cargo'`

La persona retiene formalmente este cargo pero ejerce funciones en otro puesto (ej: jefe que asume como director interino).

**Cómo se llega**:
- El agente es designado en un cargo de mayor jerarquía pero retiene el cargo de origen. Se actualiza `situacion_revista = Retencion de Cargo`.

**Validaciones**:
- El cargo sigue **OCUPADO** — no genera vacante ni habilita concurso.
- `sr_doc_respaldo` debe registrar el documento que avala la retención.
- `sr_comentario` puede contener observaciones adicionales.
- Al finalizar la retención, `situacion_revista` vuelve a `Activo`.

**Campos involucrados**:
- `ocupaciones.situacion_revista = 'Retencion de Cargo'`
- `ocupaciones.sr_doc_respaldo` — nro. de resolución
- `ocupaciones.sr_comentario` — texto libre

---

### 4.3 Comisionado

**Condición SQL**: `ocupacion.hasta IS NULL AND ocupacion.situacion_revista = 'Comision'`

La persona está en comisión de servicios en otra repartición. El cargo de origen sigue ocupado.

**Cómo se llega**:
- El agente es enviado a prestar servicios en otra repartición. Se actualiza `situacion_revista = Comision` y se registra la repartición de destino.

**Validaciones**:
- El cargo sigue **OCUPADO** — no genera vacante ni habilita concurso.
- `comision` debe describir el motivo/tipo de comisión.
- `repa_comision` debe registrar la repartición de destino.
- `cr_comentario` puede contener observaciones adicionales.
- Al finalizar la comisión, `situacion_revista` vuelve a `Activo`.

**Campos involucrados**:
- `ocupaciones.situacion_revista = 'Comision'`
- `ocupaciones.comision` — descripción
- `ocupaciones.repa_comision` — repartición destino
- `ocupaciones.cr_comentario` — comentarios

---

## 5. Árbol de estados canónico

```
CARGO
├── NO VIGENTE  (estado terminal — campo cargos.estado)
│   ├── razón: Desfinanciación
│   └── razón: Modificación de Estructura
│
├── VALIDACION_VACANTE  (estado intermedio — campo cargos.estado)
│   └── generado por padrón semanal (diff eliminado)
│       ├── Confirmar baja → NO VIGENTE
│       └── Rechazar (error) → VIGENTE
│
└── VIGENTE  (campo cargos.estado)
    ├── VACANTE  (condición derivada — no hay ocupacion con hasta IS NULL)
    │   ├── Sin concurso
    │   └── Con concurso abierto
    │
    └── OCUPADO  (condición derivada — existe ocupacion con hasta IS NULL)
        ├── situacion_revista: Activo
        ├── situacion_revista: Retencion de Cargo
        └── situacion_revista: Comision
```

---

## 6. Regla de identidad del cargo en el padrón SIAL

**Problema**: cuando una persona se jubila y otra toma el mismo puesto estructural, SIAL genera un nuevo `id_sial_rol` para la nueva persona. El sistema **no debe crear un cargo nuevo** — debe reusar el cargo existente.

**Algoritmo correcto al procesar diff tipo `nuevo`**:

```
1. Extraer (hospital, escalafon, codigo_repa, literal_puesto) del registro SIAL.
2. Buscar en tabla cargos por esos 4 campos.
3a. Si existe → crear nueva ocupación sobre ese cargo (no crear cargo nuevo).
3b. Si no existe → crear cargo nuevo con estado = vigente, luego crear ocupación.
```

**Ejemplo real**:
- Cargo estructural: `RG-CG-000047` (Régimen Gerencial, Hospital X)
- Cattaneo ocupa el cargo → `id_sial_rol = 001234567-1`
- Cattaneo se jubila → diff `eliminado` → se cierra la ocupación (`hasta = fecha`)
- Barreiro Machado toma el mismo puesto → diff `nuevo` con `id_sial_rol = 001448563-3`
- **Correcto**: crear ocupación sobre `RG-CG-000047`
- **Incorrecto**: crear cargo nuevo `RG-CG-000194`

---

## 7. Reglas especiales por escalafón

### RG — Régimen Gerencial

- Mandato fijo de **5 años**.
- Al vencer el mandato, la ocupación se cierra (`hasta = fecha de vencimiento`).
- El **mismo cargo** recibe una nueva designación directa — no se crea cargo nuevo, no se genera concurso.
- La vacante espera designación política directa.

### CPH — Carrera Profesional Hospitalaria

- La vacante puede disparar un concurso CPH (tabla `concursos_cph`).
- Tipos de cargo: POF (Planta de Oficio Fija), POU (Planta de Oficio Universitaria), Jefaturas, Director/SubDirector.
- El concurso se gestiona en `concursos_cph` con su propio ciclo de estados.

### ENF — Enfermería

- La vacante puede disparar un concurso CEETPS (tabla `concursos_ceetps`).

### TEC — Técnicos

- Tipos: POF y POU.
- La vacante puede disparar un concurso CEETPS.

### EG — Escalafón General

- Tipos: Ejecución, Jefe, Director, Gerencial.
- Cargos de estructura: designación directa, sin concurso.

### AS — Autoridades Superiores

- Tipos: Ministro, Subsecretaría, Dirección General.
- Designación política directa, sin concurso.

---

## 8. Modelo de datos relevante

### Tabla `cargos`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | PK interno |
| `id_sial` | VARCHAR(50) UNIQUE | Legajo SIAL de la persona en la importación inicial (NO identifica el cargo estructural) |
| `codigo` | VARCHAR(30) UNIQUE | Código interno del sistema (ej: `RG-CG-000047`) |
| `hospital_id` | UUID | FK → hospitales |
| `escalafon_id` | UUID | FK → escalafones |
| `codigo_repa` | VARCHAR(20) | Código de repartición SIAL |
| `literal_puesto` | VARCHAR(200) | Descripción del puesto |
| `estado` | `EstadoCargo` | `vigente` \| `validacion_vacante` \| `no_vigente` |
| `estado_desde` | DATE | Fecha en que el cargo entró al estado actual |

**Clave de identidad estructural**: `(hospital_id, escalafon_id, codigo_repa, literal_puesto)`

### Tabla `ocupaciones`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | PK interno |
| `persona_id` | UUID | FK → personas |
| `cargo_id` | UUID | FK → cargos |
| `id_sial_rol` | VARCHAR(50) UNIQUE | `{legajo_sial}-{nro_rol}` — identifica persona+cargo+período |
| `situacion_revista` | VARCHAR(50) | `Activo` \| `Retencion de Cargo` \| `Comision` |
| `desde` | DATE | Inicio de la ocupación |
| `hasta` | DATE | Fin de la ocupación. `NULL` = ocupación activa |
| `sr_doc_respaldo` | TEXT | Documento de retención de cargo |
| `sr_comentario` | TEXT | Observaciones de retención |
| `comision` | VARCHAR(150) | Descripción de la comisión |
| `repa_comision` | VARCHAR(200) | Repartición de destino en comisión |
| `cr_comentario` | TEXT | Comentarios de comisión |

**Regla de unicidad**: solo puede existir una fila con `cargo_id = X AND hasta IS NULL` a la vez.

### Tabla `bajas`

| Campo | Tipo | Descripción |
|---|---|---|
| `cargo_id` | UUID | FK → cargos |
| `fecha_baja` | DATE | Fecha en que se produce la vacante |
| `tipo_baja` | VARCHAR(100) | Jubilación, Renuncia, etc. (campo libre) |
| `genera_concurso` | BOOLEAN | Si `true`, habilita apertura de concurso |
| `estado` | `EstadoBaja` | `resolucion_a_la_firma` \| `pendiente` \| `confirmada` \| `anulada` |

---

## 9. Resumen de transiciones

| Desde | Hacia | Evento / Condición |
|---|---|---|
| (inexistente) | VIGENTE | Alta de cargo o diff `nuevo` en padrón |
| VIGENTE + VACANTE | VIGENTE + OCUPADO | Nueva designación (insertar ocupación con `hasta = NULL`) |
| VIGENTE + OCUPADO | VIGENTE + VACANTE | Cierre de ocupación (`hasta = fecha`) |
| VIGENTE + OCUPADO | VALIDACION_VACANTE | Diff `eliminado` en padrón (cierra ocupación) |
| VALIDACION_VACANTE | NO VIGENTE | Operador confirma baja en `/bajas/validacion` |
| VALIDACION_VACANTE | VIGENTE | Operador rechaza baja en `/bajas/validacion` (reabre ocupación) |
| VIGENTE | NO VIGENTE | Baja manual |
| OCUPADO Activo | OCUPADO Retención | Designación en cargo superior |
| OCUPADO Activo | OCUPADO Comisionado | Comisión de servicios |
| OCUPADO Retención | OCUPADO Activo | Fin de retención |
| OCUPADO Comisionado | OCUPADO Activo | Fin de comisión |
| NO VIGENTE | (ninguno) | Estado terminal — irreversible |
