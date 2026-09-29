# Sprint Dotaneitor — Plan de rediseño (decisiones del taller)

# Dotaneitor — Documento de decisiones del taller (alimenta Sprints 20/21/22)

**Fecha:** 2026-09-28
**Base:** producción rama `jorge` (`0f180cb`)
**Estado:** 🧭 Documento de DECISIONES — no es un sprint ejecutable. Las tareas concretas viven en
`SPRINT_20/21/22`. Este doc registra el "qué y por qué" del taller; los sprints tienen el "cómo".
**Insumo:** `DOTANEITOR_EVALUACION.md` (misma carpeta) + decisiones del taller (`dotaneitor_evaluacion.html`).

> ⚠️ **Este documento NO se ejecuta por sí solo.** Es la fuente de las decisiones consolidadas
> como adiciones en los sprints existentes. No abrir un sprint paralelo.

## Trazabilidad decisión → sprint

| Decisión del taller                                           | Dónde se ejecuta                                  |
| ------------------------------------------------------------- | ------------------------------------------------- |
| Catálogo único carrera/puesto/especialidad (FK)               | **Sprint 20** (núcleo, `migrate reset`)           |
| Puesto/especialidad contra catálogo en consumidores           | **Sprint 21**                                     |
| Dotaneitor resuelve `puestoCargoId`/`especialidadPuestoId`    | **Sprint 22**                                     |
| Normalización total minúscula/sin tilde                       | **S21 A21-1** + **S22 A22-1**                     |
| Regla del paréntesis en especialidad (excepción Bioquímica)   | **S22 A22-2**                                     |
| Flag `revisado` + auto-alta revisable + reglas de vinculación | **S21 A21-2** + **S22 A22-3**                     |
| Conservar texto crudo de origen (auditoría)                   | **S22 A22-4** + S20 (columnas auditoría)          |
| Mapeo JCAT → cargo de jefatura (P/G/Z)                        | **Sprint 22** (S22-10/11/12)                      |
| Fix `persona.activo` (ocupación vigente ⇒ activo)             | **Ya aplicado** (código sin commitear — §6)       |
| **KPI mensual (corte último padrón del mes)**                 | ⏳ **PENDIENTE — sprint futuro propio, NO ahora** |

> **KPI mensual:** único punto genuinamente nuevo y no cubierto por 20/21/22. Ya da datos
> incorrectos (ej. Rodríguez Insfrán no aparece con el filtro de puesto). **No se aborda ahora**
> por decisión del equipo; se planificará en su propio sprint (backend + tabla de corte mensual, §4).

> Regla transversal acordada: **toda la BD en minúscula y sin tilde** (valores y nombres de
> columna). El Dotaneitor deja los datos así antes de guardarlos.

---

## 0. Objetivo del Dotaneitor (replanteado)

Que haga **solo** esto, bien y liviano:

1. **Limpiar / normalizar** el archivo del padrón.
2. **Entregar la información limpia** (el backend la consolida y la guarda).
3. Ser **liviano y optimizado** (se evalúa después de fijar el "qué").

Lo que **NO** es responsabilidad del Dotaneitor:

- Armar los KPIs mensuales (no puede: si el archivo es incremental, no tiene la foto completa).
  → **el KPI mensual se arma en el BACKEND al consolidar**, leyendo el estado real de `ocupaciones`.
- Unificar puestos/agrupadores (se hará después con **filtros**, no en la limpieza).

---

## 1. Normalización — qué cambia

| Paso                            | Decisión    | Detalle                                                                                                                                                                                              |
| ------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mojibake + espacios             | ✔ se queda  | igual                                                                                                                                                                                                |
| Fechas                          | ✔ se queda  | igual                                                                                                                                                                                                |
| Teléfono                        | ✔ se queda  | igual                                                                                                                                                                                                |
| AYN                             | ✔ se queda  | igual                                                                                                                                                                                                |
| **LIT_PUESTO**                  | ✎ modificar | En vez de consolidar con diccionario hardcodeado: **normalizar + guardar cada literal de puesto en una tabla maestra con id** (lista consultable con todas las opciones). El cargo referencia el id. |
| **Tildes**                      | ＋ nuevo    | Sacar **todas las tildes**. Nada en la BD lleva tilde.                                                                                                                                               |
| **Vocabulario técnico**         | ✎ modificar | Las reglas de limpieza dejan de estar hardcodeadas: se mueven a **tabla(s) de vinculación** (original → corrección) para saber qué se limpia y poder mantenerlo sin tocar código.                    |
| Emails                          | ✔ se queda  | a minúscula                                                                                                                                                                                          |
| **Forzar minúsculas/sin tilde** | ✎ modificar | Aplicar a **TODO** (hoy solo a columnas pactadas y algunas conservan tilde). Todo el texto: minúscula + sin tilde.                                                                                   |

---

## 2. Procesamiento (`procesar`) — qué cambia

| Paso                       | Decisión         | Detalle                                                                                                                                                                          |
| -------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Limpieza previa (SIGLA) | ✔ se queda       | UAIEAIT→EAIT, DGAH                                                                                                                                                               |
| 1–4. Identidad             | ✎ modificar      | Se mantiene la lógica, pero el modelo de `personas` cambia (ver §3): CUIL, ID SIAL y roles, y `activo` según situación de revista.                                               |
| 5. Cruce SIGLAS            | ✔ se queda       | universo / tipo hospital / monovalencia                                                                                                                                          |
| **6. Cruce UNIFICADOR**    | ✖ **se elimina** | Ya no se hace en el Dotaneitor. La columna UNIFICADOR sale de la salida por ahora. Se rearmará con **filtros** después.                                                          |
| **7. Cruce AGRUPADOR**     | ✖ **se elimina** | Ídem. La columna AGRUPADOR sale de la salida por ahora.                                                                                                                          |
| **8. JEFE ESCALAFON**      | ✎ modificar      | Regla afinada (ver §2.1).                                                                                                                                                        |
| **9. ESTADO**              | ✖ **se elimina** | Ya no va como columna calculada. El "estado" de la persona es el **LITERAL PUESTO**. El bloqueo NO es un estado: se deriva de la **fecha de bloqueo** (bloqueado sí/no + fecha). |
| 9.5. Renombre              | ✎ modificar      | Nombres de salida a minúscula/sin tilde/sin espacios (snake_case); arreglar typo `DOCUEMNTACION`→`documentacion_pou`; sacar diéresis de `antiguedad`.                            |
| 9.6–9.7. Especialidad      | ✔ se queda       | vaciar si COD_REG no es 37/23/24                                                                                                                                                 |
| 9.75. Forzar mayúsculas    | ✎ modificar      | pasa a **minúscula + sin tilde** en todo                                                                                                                                         |
| 9.8. Dedup ID SIAL         | ✔ se queda       | (recomendado: traer la versión vectorizada)                                                                                                                                      |
| 9.9. Jefaturas duplicadas  | ✔ se queda       |                                                                                                                                                                                  |
| 10. Reordenar              | ✔ se queda       | ajustar al nuevo set de columnas                                                                                                                                                 |

### 2.1 · Regla afinada de JEFE ESCALAFON

Requiere **valor en JCAT** (y JCAT = `0` NO es válido → no es jefe):

- COD_REG **37** + **sin** ESCRITORIO + JCAT válido → **Jefe CPH POF** (planta)
- COD_REG **37** + **con** ESCRITORIO + JCAT válido → **Jefe CPH POU** (guardia)
- COD_REG **85** + JCAT válido → **Jefe Técnico**
- COD_REG **87** + JCAT válido → **Jefe Enfermería**
- COD_REG **83** + JCAT válido → **Jefe Administrativo**
- resto → no es jefe

### 2.2 · Mapeo del JCAT a cargo de jefatura (nivel + escalafón) — ＋ nuevo

**Problema:** hoy `JEFE ESCALAFON` (§2.1) solo dice **de qué escalafón** es la jefatura (CPH
POF/POU, Técnico, Enfermería, Administrativo), pero **tira el nivel jerárquico** que el propio
JCAT ya codifica. El código actual usa el JCAT únicamente como "hay/no hay jefatura" (booleano).
Analizando los valores reales del JCAT contra la BD local (`ocupaciones.codigo_jefaturas`
cruzado con `cargos.literal_puesto` y `cargos.descripcion_repa`), el JCAT **sí identifica el
cargo de conducción** (Director, Sub-Director, Jefe de Departamento/División/Unidad/Sección).

**Decisión:** agregar un paso que mapea el JCAT a un **cargo de jefatura estructurado**
(nivel jerárquico + escalafón), y guardarlo tanto en el cargo como en el rol de la persona.
Esto no reemplaza `JEFE ESCALAFON`, lo complementa con el nivel.

#### Familia P — Conducción CPH de planta (POF), COD_REG 37

El JCAT identifica directamente el cargo (mapeo 1:1 verificado contra `literal_puesto`):

| JCAT | Cargo de jefatura    | Cód. puesto |
| ---- | -------------------- | ----------- |
| P60  | Director             | 01          |
| P61  | Sub-Director         | 03          |
| P62  | Jefe de Departamento | 02          |
| P63  | Jefe de División     | 04          |
| P64  | Jefe de Unidad       | 05          |
| P65  | Jefe de Sección      | 06          |

#### Familia G — Conducción CPH con guardia (POU/POF), COD_REG 37

Mismos cargos que P pero con componente de guardia (G64/G65 caen mayormente en POU):

| JCAT | Cargo de jefatura    | Cód. puesto |
| ---- | -------------------- | ----------- |
| G62  | Jefe de Departamento | 02          |
| G63  | Jefe de División     | 04          |
| G64  | Jefe de Unidad       | 05          |
| G65  | Jefe de Sección      | 06          |

#### Familia Z — Jefaturas de escalafones NO médicos (COD_REG 83/85/87)

El JCAT indica el **nivel** (mismo código transversal a los 3 escalafones); el **escalafón** lo
da el COD_REG (83 Administrativo · 85 Técnico · 87 Enfermería). Verificado contra el tipo de
repartición (`descripcion_repa`: DEPT/DIV/SECC):

| JCAT | Nivel (repartición) | Cargo de jefatura    |
| ---- | ------------------- | -------------------- |
| Z22  | DEPT (Departamento) | Jefe de Departamento |
| Z24  | DIV (División)      | Jefe de División     |
| Z26  | SECC (Sección)      | Jefe de Sección      |
| Z32  | DEPT (Departamento) | Jefe de Departamento |

- Nota: los escalafones no médicos **no** tienen nivel Director/Sub-Director/Unidad; solo
  Departamento → División → Sección.
- `M26` (1 solo caso, "Capellán" administrativo) y otros JCAT fuera de estas tablas se tratan
  como **sin cargo mapeado** (nivel `null`), se conserva el JCAT crudo y se informan en el
  reporte de calidad para revisión — no se inventa un nivel.

#### Origen del mapeo y casos límite

- El mapeo se hace por **tabla de vinculación** (`jcat → cargo_jefatura`, mismo criterio §1/§3.3
  de mover reglas hardcodeadas a tabla), NO hardcodeado en el código Python.
- El número del JCAT **no** ordena la jerarquía por sí solo (P61 Sub-Director < P62 Departamento
  numéricamente pero es rango mayor). El orden real lo da el código de puesto (01→06). La tabla
  de vinculación resuelve esto explícitamente.
- Casos atípicos detectados en la BD (nivel del JCAT ≠ tipo de repartición): 2 registros de
  enfermería (1 Z24 en SECC, 1 Z26 en DIV). Son ruido de origen (<0,2%): el mapeo se hace por
  JCAT, y estas inconsistencias se listan en el reporte de calidad, no frenan el padrón.

#### Salida

- Nueva columna en el `resultado_df`/salida del Dotaneitor: `cargo_jefatura` (nivel + escalafón),
  o su id contra el catálogo `puestos_cargo` si se resuelve ahí (ver §4.bis — el cargo de
  conducción también es un `PuestoCargo`). Se decide junto con S22 si va como texto o FK.
- Se guarda en el **cargo** (a qué puesto de conducción corresponde) y se refleja en el **rol**
  de la persona que lo ocupa.

#### Estado del catálogo `puestos_cargo` (verificado en BD local 2026-09-28) — condiciona texto vs FK

Verificación contra la BD local antes de decidir si el mapeo va a FK:

- **CPH (familias P/G):** los cargos de conducción **ya existen** en `puestos_cargo` con
  `tipo_puesto='conduccion'` (Director, Jefe de Departamento/División/Unidad/Sección), colgando
  del escalafón código **22**. El puente funciona: `codigos_registro` mapea COD_REG **37 → escalafón
  22**. ⚠️ **Excepción:** `Sub-Director (03)` está cargado como `tipo_puesto='ejecucion'`, no
  `conduccion` — hay que corregirlo para que P61 resuelva como conducción.
- **No médicos (familia Z, escalafones 83/85/87):** **NO existen** en el catálogo los cargos "Jefe
  de Departamento/División/Sección" para Administrativo/Técnico/Enfermería. En esos escalafones
  `tipo_puesto='conduccion'` NO significa jefatura: contiene los **puestos base** (Licenciado en
  Enfermería, Técnico en Laboratorio, Chofer de Ambulancia, etc.). El catálogo hoy no modela la
  jefatura de estos escalafones como un puesto separado, así que **no hay FK a la que apuntar**.

**Consecuencia — la resolución a FK NO es viable hoy sin trabajo previo.** Dos caminos:

- **Opción A (texto, sin dependencia de catálogo):** `cargo_jefatura` como texto derivado del JCAT
  (ej. `jefe de division` + escalafón por COD_REG). Funciona ya, no toca el catálogo. Pierde la
  normalización por id.
- **Opción B (FK, requiere seed previo):** (1) dar de alta en `puestos_cargo` los cargos de
  jefatura faltantes de los escalafones 83/85/87 (Jefe de Depto/División/Sección), (2) corregir
  `Sub-Director` CPH a `conduccion`, (3) recién entonces mapear JCAT → FK. Más trabajo, pero
  coherente con la cascada del catálogo (§4.bis). Es prerequisito de S22-12.

---

## 3. Modelo de datos — cambios en la BD

### 3.1 · `personas`

- Columnas explícitas para **CUIL**, **ID SIAL** y **roles**.
- Flag **`activo`** derivado de la **situación de revista** (no un flag suelto que se desincroniza).
  - Invariante: persona con ocupación vigente (`hasta IS NULL`) ⇒ `activo = true`.
  - (Ya se implementó el fix correctivo + preventivo de esto — ver §6.)

### 3.2 · Tabla maestra de LITERAL PUESTO (nueva)

- Cada literal de puesto normalizado se guarda una vez con **id**.
- El cargo referencia ese id. Lista consultable de todas las opciones de puesto.

### 3.3 · Tabla(s) de vinculación de limpieza (nueva)

- Reglas de corrección (original → corrección) que hoy están hardcodeadas
  (`MAPEO_LIT_PUESTO`, `MAPEO_ESPECIALIDAD`, vocabulario técnico) pasan a tabla.
- Objetivo: mantener las reglas sin tocar código y saber qué se está limpiando.

### 3.4 · Corte mensual para KPIs (nueva) — **lo pide el KPI**

- Tabla que guarda, **por mes**, el estado consolidado (la foto del **último padrón de cada mes**).
- Se **arma en el backend al aprobar cada padrón** (Node, que tiene el estado completo en
  `ocupaciones`), NO en el Dotaneitor.
- El KPI lee de esta tabla → números mensuales correctos y estables.

---

## 4. KPI mensual — el arreglo de fondo

**Problema actual:** el KPI de "Evolución por carrera y especialidad" toma "el snapshot más
grande del mes" como foto del mes. Cuando un mes tiene una foto completa + incrementales
posteriores (ej. septiembre: completa 06/09, incrementales 13/20/27), **los cambios de los
incrementales se pierden**. Por eso Rodríguez Insfrán (pasó a Psicólogo de Planta en un
incremental) no aparece: el KPI mira la foto del 06/09, anterior a su cambio.

**Decisión:**

- El KPI de cada mes = estado del **último padrón de ese mes**, con **todo lo acumulado**.
- Se arma en el **backend** al consolidar, desde el estado real (`ocupaciones`), y se guarda en
  la tabla de **corte mensual** (§3.4).
- El KPI consume esa tabla (rápido y correcto), no adivina cuál snapshot usar.

**Alcance:** este arreglo es de **backend + modelo de datos**, no del Dotaneitor. El Dotaneitor
solo entrega la info limpia; el backend consolida y arma el corte mensual.

---

## 4.bis · Esquema puesto / carrera / especialidad (el del Alta de Cargo — adoptar)

**Decisión:** el Dotaneitor debe resolver CARRERA / PUESTO / ESPECIALIDAD usando el **mismo
esquema formal que ya funciona en el módulo de Altas de Cargo**, basado en el **código de
registro** y el **literal**, en vez de los diccionarios hardcodeados actuales.

### Cascada (4 niveles, con tablas catálogo ya existentes en la BD)

```
CARRERA (Escalafon)            escalafones — codigo = cód. registro principal, nombre = literal CR
  └─N CODIGO DE REGISTRO       codigos_registro — codigo, literal, escalafonId (N códigos → 1 carrera)
  └─N PUESTO (PuestoCargo)     puestos_cargo — escalafonId, modalidad (pof/pou/ambos), nombre, tipoPuesto
        └─N ESPECIALIDAD       especialidades_puesto — puestoCargId, nombre  (la especialidad cuelga del PUESTO)
```

### Mapeo Código de Registro → Carrera (fuente de verdad: FK `CodigoRegistro.escalafonId`)

| Cód. Registro | Carrera (Escalafón)                          | ¿Especialidad? |
| ------------- | -------------------------------------------- | -------------- |
| 37            | Nueva Carrera Profesional Hospitalaria (CPH) | Sí             |
| 22            | Nueva Carrera Profesional Hospitalaria (CPH) | —              |
| 23            | Suplentes (Salud - Guardias)                 | Sí             |
| 24            | Residentes (Residencias)                     | Sí             |
| 83            | Carrera de Enfermería (ENF)                  | No             |
| 85            | Carrera de Técnicos de la Salud (TEC)        | No             |
| 87            | Escalafón General CEETPS (EG)                | No             |

### Regla para el Dotaneitor

- **Carrera** se resuelve por **código de registro** → `CodigoRegistro.escalafonId` → `Escalafon`
  (no por el nombre del escalafón del Excel, que puede variar).
- **Puesto** se normaliza contra el catálogo `PuestoCargo` de esa carrera (§3.2 = esta misma tabla
  o su equivalente maestro de literales de puesto).
- **Especialidad** se valida/completa contra `EspecialidadPuesto` (cuelga del puesto). Solo aplica
  a carreras con especialidad (37/23/24), coherente con el paso 9.6.
- Reemplaza el cruce de especialidad "solo por CUIL" + diccionarios hardcodeados por esta cascada
  formal. Las tablas `Ref*` actuales quedan como insumo de migración a este esquema.

### Endpoints de referencia (cascada del alta, ya existentes)

- `GET /api/v1/escalafones?paraNuevaAlta=true` (carreras con puestos)
- `GET /api/v1/puestos-cargo?escalafonId=&modalidad=` (puestos de la carrera)
- `GET /api/v1/puestos-cargo/especialidades?escalafonId=&nombre=<puesto>` (especialidades del puesto)
- `GET /api/v1/codigos-registro` (mapeo codigo → escalafon)

---

## 4.ter · Literal de puesto — tabla maestra con id + normalización aprendida

**Decisión:** el LITERAL PUESTO es la **clave de entrada** para resolver el puesto. No se guarda
como texto libre (como hoy hace Alta de Cargo, que se duplica por tipeo/casing), sino que se
normaliza y se referencia por **id** contra una tabla maestra, conservando el texto crudo original.

### Modelo de datos

**`literal_puesto`** (tabla maestra):

| campo          | descripción                                                                      |
| -------------- | -------------------------------------------------------------------------------- |
| `id`           | PK                                                                               |
| `literal`      | forma canónica, minúscula/sin tilde (ej. `psicologo de planta`)                  |
| `escalafon_id` | carrera a la que pertenece                                                       |
| `revisado`     | `true` = validado por un humano · `false` = alta automática pendiente de revisar |

**`literal_puesto_vinculacion`** (reglas de corrección aprendidas):

| campo               | descripción                                                                     |
| ------------------- | ------------------------------------------------------------------------------- |
| `original`          | texto crudo normalizado visto en un padrón (ej. `lic. en psicologia de planta`) |
| `literal_puesto_id` | id canónico al que apunta                                                       |

En **`cargos`**: `literal_puesto_id` (FK a la maestra) **+** `literal_puesto_origen` (texto crudo
del SIAL, para auditoría/reversibilidad — no se pierde el dato original).

### Comportamiento al procesar el padrón (por fila)

1. Normaliza el LITERAL PUESTO del Excel (minúscula, sin tilde, trim).
2. Resuelve la **carrera** por el código de registro.
3. Busca match en este orden:
   - **A) Match directo** en `literal_puesto` (misma carrera) → usa ese id. ✔ sin ruido.
   - **B) Match por vinculación** en `literal_puesto_vinculacion` → usa el id canónico. ✔ se unificó
     solo gracias a una corrección previa.
   - **C) Sin match** → se **agrega automáticamente** a `literal_puesto` con `revisado=false`, se usa
     ese id, y se informa en el **reporte de calidad** ("N literales nuevos sin revisar"). El padrón
     **NO se frena**.
4. El cargo guarda `literal_puesto_id` + `literal_puesto_origen` (crudo).

**Ejemplo (caso real Rodríguez Insfrán):** el Excel trae `"PSICOLOGO DE PLANTA"`, cód. reg. 37 →
normaliza a `psicologo de planta` → carrera CPH → match directo id 101. Si otro padrón trae
`"Lic. En Psicologia De Planta"`, matchea por vinculación al mismo id 101. Ambos cuentan juntos.

### Mantenimiento (pantalla "literales sin revisar")

Para cada literal con `revisado=false`:

- **Es legítimo** → confirmar → `revisado=true` (entra a la lista oficial).
- **Es error/variante** → fusionar con el id correcto: se crea la regla en
  `literal_puesto_vinculacion`, se reapuntan los cargos, se elimina/inactiva el literal sobrante.
  El próximo padrón con ese texto se corrige solo (pasa a ser caso B). El sistema **aprende** de
  las correcciones en vez de repetirlas.

### Uso en desplegables / formularios / KPIs

- **Alta de Cargo (cascada carrera→puesto):** el desplegable muestra los literales de la carrera
  con `revisado=true` (los "sin revisar" NO aparecen — no se ofrece dato sin validar). El cargo
  referencia el **id**, no el texto.
- **Filtro de Puesto en KPIs/tablas:** lista los literales por id. Al filtrar `psicologo de planta`
  (id 101), el KPI cuenta **todos** los cargos con ese id, sin importar cómo vinieron escritos en
  el Excel. **Resuelve el caso Rodríguez Insfrán** (hoy no aparecía porque el filtro comparaba
  texto crudo).
- **Buscador/autocompletado:** una sola entrada canónica por puesto, no las variantes de tipeo.
- **Reportes:** muestra el `literal` canónico; el `literal_puesto_origen` queda para auditoría.

### Especialidad — mismo patrón

La ESPECIALIDAD sigue el mismo esquema que literal de puesto: id canónico + variantes que se
unifican por vinculación + `revisado`, y solo aplica a carreras con especialidad (37/23/24).
Ver detalle en `Doc/Planificacion/DATA_CLEANING_ESPECIALIDADES.md`.

**Catálogo canónico ya existente:** `especialidades_puesto` (~336 filas, sin acentos) — la misma
tabla `EspecialidadPuesto` de la cascada de Altas (§4.bis). Semillas de vinculación iniciales:
las 4 filas de `ref_correcciones_especialidad` (PSIQUATRIA→Psiquiatría, etc.).

**Regla del paréntesis (decisión de negocio, del doc de data-cleaning):** al comparar/normalizar
especialidades, importa lo de **fuera** del paréntesis; la aclaración entre paréntesis es
redundante (`Clinica Medica (Medicina Interna)` ≡ `Clinica Medica`). El Dotaneitor quita el
paréntesis al matchear contra el catálogo.

- **Excepción única:** `Bioquimica Clinica` SÍ tiene subespecialidades reales que compiten
  (Bacteriología, Genética, Hematología, Lactancia, Microbiología Clínica, Química Clínica) — NO
  colapsar el paréntesis ahí.
- La comparación del jurado ya aplica esta regla (`norm()` en `sorteoJurado.service.ts`, sin tocar
  datos) — sirve de modelo.
- **Volumen:** ~4782 cargos traen especialidad con paréntesis; top: `Pediatria (Clinica Pediatrica)`
  (1689), `Clinica Medica (Medicina Interna)` (948 + 546 en mayúsculas), `Bioquimica Clinica
(Quimica Clinica)` (533).

> **Alcance — qué es del Dotaneitor y qué no:**
>
> - **Reglas de normalización de especialidad** (paréntesis, acentos, minúscula, matching contra
>   `especialidades_puesto`, vinculaciones): **SÍ** van al Dotaneitor — es cómo procesa lo que entra.
> - **Limpieza retroactiva de datos ya cargados** (`cargos.especialidad_legacy`,
>   `personas.especialidad_*`, `padron_historico.especialidad`, etc., con backup por tabla): **NO**
>   es del Dotaneitor — es una **migración aparte** (ver §8). Cuidado con los snapshots históricos
>   (`padron_historico`, `miembros_jurado_sorteados`): decidir si se normalizan o se dejan como
>   registro de época.

### Fases sugeridas

- **Fase 1:** tabla maestra + `revisado` + auto-alta + reporte de calidad (revisión por consulta SQL).
- **Fase 2:** pantalla de mantenimiento (confirmar/fusionar) que alimenta las vinculaciones.
- El flag `revisado` va **desde el día uno** (agregarlo después obliga a re-clasificar lo cargado).

---

## 5. Columnas de salida — resumen

- **Se quitan por ahora** (se rearman con filtros después): `UNIFICADOR DE PUESTOS`,
  `AGRUPADOR`, `ESTADO`.
- **Se renombran** a minúscula/sin tilde/snake_case; arreglar `documentacion_pou` y `antiguedad`.
- El resto se mantiene (ver detalle en `DOTANEITOR_EVALUACION.md`, misma carpeta).
- **Contrato de salida a congelar** una vez aplicados estos cambios, para no romper el consumo de Node.

---

## 6. Ya hecho en esta sesión (base local Docker/WSL)

- **Fix persona.activo:** paso 10 en `aprobarSnapshotService` que reactiva personas con ocupación
  vigente (idempotente). Corrección de datos aplicada: 382 personas reactivadas → 0 casos.
  (Rodríguez Insfrán quedó `activo=true`.) **Sin commitear.**

---

## 7. Orden sugerido de ejecución (a validar)

1. Definir el modelo de datos nuevo (tablas §3.2, §3.3, §3.4) + migraciones.
2. Ajustar el Dotaneitor: normalización total (minúscula/sin tilde), sacar pasos 6/7/9,
   afinar JEFE ESCALAFON, LIT_PUESTO a tabla maestra, reglas de limpieza a tablas.
3. Backend: armar el corte mensual al aprobar cada padrón + reapuntar el KPI a esa tabla.
4. Congelar contrato de columnas.
5. Optimización y peso del microservicio (fase final).

---

## 8. Preguntas abiertas / a confirmar con el equipo

- ¿Los cambios se prueban solo en **local (Docker/WSL)** hasta estar seguros? (confirmado: sí).
- ¿La tabla de corte mensual reemplaza a `kpis_dotacion_snapshot` o convive?
- ¿"minúscula y sin tilde en toda la BD" aplica también a las tablas de referencia y datos ya
  cargados (migración de limpieza de lo existente), o solo a lo nuevo que entra?
- ¿La unificación por filtros (ex pasos 6/7) es una vista, una tabla derivada, o filtros en la UI?

---

## 9. Ajustes de estructura de datos (sesión 2026-09-22, sobre el mapeo de la BD)

> Origen: auditoría de la BD local (`Doc/Referencias/MAPEO_NORMALIZACION_BD.md`). Todo esto aplica
> a la **toma de información** (cómo entra el dato al cargarlo), NO a limpieza retroactiva de datos
> viejos. **Sprint 20 ya está terminado en otra rama**, así que estos cambios entran como
> **adiciones a Sprint 21 y Sprint 22** — migraciones nuevas sobre el schema que dejó S20, no como
> parte de su `migrate reset`.

### Trazabilidad decisión (2026-09-22) → sprint

| Decisión                                                                                   | Dónde se ejecuta                             |
| ------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Normalizar a minúscula/sin tilde **al cargar** (ya decidido, se ratifica)                  | S22 (A22-1)                                  |
| `personas` tabla única; toda carga la alimenta                                             | S21 (A21-3)                                  |
| `personas` mantiene `apellido_nombre` (regla de negocio) **y además** `apellido`+`nombre`  | S21 (A21-3) + S22 (el pipeline parte nombre) |
| `ocupaciones.cuil_y_rol` → dejar solo `cuil`                                               | S21 (A21-4)                                  |
| `ocupaciones.id_sial_rol` → separar al cargar: ID SIAL + histórico de roles                | S21 (A21-4) + S22 (el pipeline separa)       |
| Estandarizar convención: corregir `diasGuardia` → `dias_guardia` (snake_case)              | S21 (A21-5)                                  |
| Unificar postulantes: dejar **solo `inscriptos_concurso`**, eliminar las otras dos         | S21 (A21-6)                                  |
| Limpieza estructural (`_backup_cph_estados`, `lit_familia` vacía, drift `cantidad_cargos`) | S21 (A21-7)                                  |

### 9.1 · Convención de nombres — se ratifica **snake_case** (no camelCase)

**snake_case en columnas físicas de Postgres + camelCase en el modelo Prisma** (con `@map`) — lo
que ya rige de hecho y el estándar de Prisma. La única excepción rota es `ocupaciones."diasGuardia"`
(única columna camelCase de toda la BD, además vacía) → se corrige a `dias_guardia`. No se toca el
resto: reescribir las 60+ tablas a camelCase físico rompería todo el SQL crudo (`$queryRaw`) sin
aportar nada.

### 9.2 · `personas` — tabla única + nombre en 3 columnas

- **Una sola tabla `personas`.** Todas las cargas (padrón, bajas SIAL, altas manuales) la alimentan.
  No se crean tablas paralelas de persona.
- Se **mantiene `apellido_nombre`** como columna (regla de negocio: así lo consumen documentos y
  vistas hoy).
- Se **agregan** `apellido` y `nombre` separados, **alimentados desde la carga** (el pipeline parte
  el `"Apellido, Nombre"` por la primera coma). Permiten ordenar/filtrar por apellido o por nombre
  sin parsear en runtime.
- Regla de partición: todo antes de la primera coma = `apellido`; el resto = `nombre`. Apellidos
  compuestos (`Gonzalez Bernaldo de Quiros`) quedan enteros en `apellido` (correcto). Sin coma:
  `apellido` = todo, `nombre` = null (se cuenta cuántos hay y se informa en el diff).

### 9.3 · `ocupaciones` — CUIL y roles

- **`cuil_y_rol` → dejar solo `cuil`.** Deja de guardar el CUIL+rol concatenado; guarda solo el CUIL
  (que además ya está en `personas.cuil`).
- **`id_sial_rol` → separar al cargar.** Hoy empaqueta `legajoSial-rol-cuil-rol`
  (`001812167-1-27246838076-1`). El pipeline lo descompone para tener explícito el **ID SIAL** (el
  legajo) y el **número de rol**, y así poder responder "cuántos roles tuvo este legajo/persona" y
  armar el **histórico de roles**. Se conserva `id_sial_rol` crudo como identificador natural del
  SIAL (auditoría) y se agregan las columnas descompuestas.

### 9.4 · Unificar postulantes → `inscriptos_concurso`

`postulantes` y `postulantes_concurso` están **vacías** y duplican a `inscriptos_concurso` (que
tiene datos y ya está atomizado en `apellido`/`nombre`). Se **eliminan** las dos; queda
`inscriptos_concurso` como única tabla de "persona anotada a un concurso CPH". Migrar los
consumidores (módulo `postulantes` de back/front) a `inscriptos_concurso`.

### 9.5 · Limpieza estructural

- **`_backup_cph_estados`** (backup de una migración, 2.004 filas) → eliminar cuando no se necesite.
- **`cargos.lit_familia`** está vacía (0 filas con dato) → confirmar si algún flujo la llena; si no,
  eliminar la columna.
- **Drift `cantidad_cargos`:** la migración `20260926000000_sync_schema_completo` figura aplicada
  pero la columna sigue existiendo en `concursos_cph`/`concursos_ceetps` en la base local. Como la
  BD se rearma desde cero, el schema queda como fuente de verdad; verificar tras el reset que la
  columna efectivamente NO exista (coherente con Contrato_Datos).

### 9.6 · Histórico de roles — tabla dedicada `roles_persona` (decisión 2026-09-22)

`ocupaciones` hoy mezcla dos cosas: el **estado vivo** (quién ocupa qué hoy) y el **histórico de
roles** de una persona. Se separa el histórico en una tabla propia:

**`roles_persona`** — un registro por cada rol que tuvo la persona a lo largo del tiempo:

| campo         | descripción                                                     |
| ------------- | --------------------------------------------------------------- |
| `id`          | PK                                                              |
| `persona_id`  | FK → `personas` (vínculo directo a la persona)                  |
| `id_sial`     | legajo SIAL **sin** el rol (clave de agrupación del histórico)  |
| `nro_rol`     | número de rol dentro del legajo                                 |
| `cargo_id`    | FK → `cargos` (mapeo del rol al cargo)                          |
| `desde`       | inicio del rol                                                  |
| `hasta`       | fin del rol (`null` = rol vigente)                              |
| `id_sial_rol` | crudo `legajo-rol-cuil-rol` (auditoría / identificador natural) |

- **PK de agrupación:** `id_sial` (legajo sin rol) permite responder "cuántos roles tuvo esta
  persona" con un `COUNT` y mapear los cargos por el FK `cargo_id`.
- **Relación con `ocupaciones` (decisión):** se adopta la **opción (a)** — `roles_persona` es el
  histórico completo; `ocupaciones` queda como estado vivo. No se reemplaza `ocupaciones` (evitar
  reescribir medio backend). A confirmar en la implementación si algún lector de `ocupaciones`
  histórico debe pasar a `roles_persona`.
- La vista de Personas (que hoy ya muestra bien esto derivándolo) pasa a leer de `roles_persona`.
- Lo alimenta el pipeline al cargar (descomposición de `id_sial_rol`, ver S22-16).

### 9.7 · `padron_snapshots` y `padron_diff` — se conservan (decisión 2026-09-22)

Ambas tablas **se mantienen** y son la base del análisis histórico:

- **`padron_snapshots`**: cada snapshot es la foto de una fecha. Habilita consultas históricas por
  período sin reconstruir nada (ej. "cuántos psicólogos había la 1ª semana de julio en tal
  hospital" = consultar `padron_historico` del snapshot de esa fecha). Es el insumo del **KPI
  mensual** pendiente (corte del último padrón de cada mes).
- **`padron_diff`**: permite ver diferencias entre semanas sin recalcular. Se conserva.

### 9.8 · Normalización de los OTROS Excel (bajas SIAL / POU / organigrama)

Hallazgo (auditoría de código 2026-09-22): **solo el padrón pasa por el Dotaneitor (Python)**.
Bajas SIAL, POU y Organigrama se procesan 100% en Node (`xlsx`). Estado real verificado leyendo el
código:

- **`toLowerCase` no existe en NINGÚN archivo del backend Node.** Es decir, ningún flujo Node baja
  a minúscula. La única normalización de caja es `_forzar_mayusculas()` del Dotaneitor (Python), que
  hoy fuerza **MAYÚSCULA** (lo contrario de lo que queremos).
- **Bajas SIAL** (`bajas-sial.service.ts`): la función `str()` hace **solo `.trim()`** — no baja a
  minúscula, no saca tildes, no repara mojibake. Los campos `ayn`, `desc_rep`, `lit_puesto`,
  `mot_baja` entran **crudos** (MAYÚSCULA + tildes). La única regla es la canonización CPH
  (`NOMBRES_CPH_VIEJOS` → `"Nueva Carrera Profesional Hospitalaria"`, en formato Título, con tilde),
  duplicada a mano del `normalizador_cargos.py` de Python.
- **POU** (`pou.service.ts`): `normalizeCell` hace trim + parseInt. Sin minúscula/tilde/mojibake.
- **Organigrama** (`organigrama.service.ts`): tiene su propio `normalizarTexto` (NFD + strip de
  diacríticos) que sí saca tildes, pero solo para **comparar/matchear**, no necesariamente para lo
  que persiste; y es una copia suelta de la lógica de Python.

Esto coincide con la auditoría de datos: `baja_sial_registros.desc_rep` = 100% mayúscula, 30.697 con
tilde; `baja_sial_registros.ayn` = 100% mayúscula. **Hoy estos 3 flujos ya están "dañando" la BD**
en el sentido de tu preocupación: meten texto sin normalizar.

**Decisión de arquitectura (2026-09-22): paquete compartido, NO microservicios separados.**
Se evaluó separar cada subida en su propio microservicio y se **descartó** por sobre-ingeniería:
cada microservicio nuevo es más infra que deployar/monitorear (ya dolió con UN solo servicio Python
en Render: OOM, timeouts, health checks), y bajas/POU/organigrama son cargas livianas que no
necesitan Python ni pandas. El único que justifica microservicio propio es el padrón (pipeline
pesado + pandas), y ya existe.

**Decisión confirmada (2026-09-22):** **solo el padrón queda como microservicio** (Python/
Dotaneitor, por el pipeline pesado). **Bajas SIAL, POU y Organigrama quedan como módulos internos
en Node (TypeScript, mismo lenguaje que el backend)** — NO se crean microservicios nuevos para
ellos. Los tres consumen un **paquete de normalización compartido** (`packages/normalizacion`, TS)
con una única fuente de verdad (minúscula, sin tilde, mojibake, canonización CPH). El Dotaneitor
(Python) mantiene su copia equivalente (no puede importar TS) y se documenta que ambas deben
coincidir. Resuelve la consistencia **sin agregar infra**. Ver tareas A21-8..A21-11.

### 9.9 · Peso del nuevo Dotaneitor — se espera **más liviano**

El microservicio actual son ~2.313 líneas Python con dependencias pesadas (pandas 3, numpy,
pyarrow, sqlalchemy, openpyxl). El rediseño lineal (S22) elimina justo lo que más pesa: sesiones en
memoria, jobs con polling, **parquet temporal (`pyarrow`)**, reporte de calidad de 4 hojas y los
endpoints `/normalizar`+`/procesar`+`/cruzar`+`/preview`+`/descargar`. Esto probablemente permite
**soltar `pyarrow`** y aliviar memoria — ataca directamente la causa del OOM en Render (plan free
512MB). La medición formal de peso queda como fase final (§7, punto 5).
