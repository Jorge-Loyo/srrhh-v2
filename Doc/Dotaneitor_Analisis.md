# Análisis Dotaneitor — SRRHH v2

> Documento de trabajo de Agustin (S0-5 / S0-6 / S0-7 / S0-10 del Sprint 0).
> Fuente: lectura completa de `services/dotaneitor/` (7 módulos Python, ~3300 líneas) el 2026-08-21.
> Última actualización: 2026-08-21
> Estado: S0-5, S0-6, S0-7 y S0-10 (Sprint 0) cerradas. Sección 4.1 agrega requisitos nuevos para
> Sprint 2 (sin datos hardcodeados + Dotaneitor alimenta tablas secundarias) — todavía sin
> implementar, solo documentados como pedido de Agustin.

---

## 1. Qué es Dotaneitor

Microservicio **FastAPI** (Python 3.11+, puerto `5001`) que procesa el padrón semanal de dotación:
toma el Excel `Cargos_Salud.xlsx` que exporta SIAL, lo cruza contra tablas de referencia
(`SIGLAS`, `AGRUPADOR`, `UNIFICADOR DE PUESTOS`, especialidades) y devuelve un DataFrame limpio y
normalizado, listo para comparar contra el estado actual de la base y aprobar.

**Regla de arquitectura (del README):** el frontend nunca habla directamente con este servicio.
Todo pasa por la API Node (`apps/api`), que orquesta las llamadas y persiste el resultado.

Es la adaptación de un microservicio previo (`dotacion-rrhh/app/python-service`, standalone con
GUI Tkinter incluida) a este monorepo. **La migración a PostgreSQL está a medio hacer** — ver
sección 7.

---

## 2. Flujo de procesamiento

Todo el flujo vive alrededor de una sesión en memoria (`sessions: dict`, TTL 2h, limpieza cada 30
min en un thread de background):

```
POST /session              → crea session_id, carpeta tmp/{id}/
POST /upload-cargos         → sube Cargos_Salud.xlsx, cuenta filas
POST /normalizar            → limpia texto/fechas/teléfonos/nombres       ┐
POST /procesar               → cruza contra tablas de referencia          ├─ asíncronos,
POST /cruzar                 → completa huecos de ESPECIALIDAD            │  se pollean con
GET  /job/{job_id}          → estado del job (pending/done/error)         ┘  GET /job/{id}
GET  /preview                → paginado del resultado (memoria o parquet en disco)
POST /diff                   → compara contra dot_resultado / histórico → nuevos/modif/eliminados
POST /guardar-bd             → (legacy) persiste en MySQL — ver sección 7, punto 4
GET  /descargar               → descarga el Excel procesado
GET  /reporte-calidad         → Excel con 4 hojas de calidad de datos
GET  /historial, /ultima-actualizacion, /health
POST /session/delete
```

Los tres pasos pesados (`normalizar`/`procesar`/`cruzar`) corren en un `Thread` aparte y devuelven
un `job_id` de inmediato; el estado del job se persiste en disco como JSON (sobrevive reinicios de
contenedor), pero el objeto `sessions[session_id]` — que tiene el DataFrame procesado en memoria —
**no se persiste**. Ver hallazgo en sección 7.

---

## 3. Endpoints — tabla completa

El README (`services/dotaneitor/README.md`) documenta 11 endpoints. Leyendo `main.py` aparecen
**4 más** que no están en esa tabla:

| Método | Ruta | En README | Descripción |
|---|---|---|---|
| GET | `/health` | ✅ | Health check |
| POST | `/session` | ✅ | Crear sesión de trabajo |
| POST | `/upload-cargos` | ✅ | Subir Cargos_Salud.xlsx |
| POST | `/normalizar` | ✅ | Normalizar datos (async) |
| POST | `/procesar` | ✅ | Procesar dotación (async) |
| POST | `/cruzar` | ✅ | Cruzar especialidades (async) |
| GET | `/job/{job_id}` | ❌ **falta** | Poll de estado de un job async |
| GET | `/preview` | ✅ | Preview paginado del resultado |
| GET | `/descargar` | ✅ | Descargar Excel procesado |
| GET | `/reporte-calidad` | ✅ | Descargar reporte de calidad (4 hojas) |
| POST | `/diff` | ✅ | Calcular diferencias vs BD |
| POST | `/guardar-bd` | ❌ **falta** | Legacy: persiste en MySQL (`dot_resultado` + histórico) |
| GET | `/historial` | ❌ **falta** | Últimos N procesos guardados con `/guardar-bd` |
| GET | `/ultima-actualizacion` | ❌ **falta** | Fecha del último `dot_resultado` |
| POST | `/session/delete` | ✅ | Eliminar sesión y archivos temporales |

`/guardar-bd`, `/historial` y `/ultima-actualizacion` son parte de la lógica legacy que, según el
propio README, debería reemplazarse por el endpoint Node
`POST /api/v1/padron/snapshots/:id/aprobar` (Sprint 2). Quedan documentados acá porque hoy siguen
implementados y funcionando contra MySQL.

---

## 4. Lógica central — `DotacionAutomation.procesar()` (`Dotaneitor.py`)

**Input:** `cargos_df` (Cargos_Salud.xlsx) + `siglas_df` / `agrupador_df` / `unificador_df` (tablas
de referencia — hoy vienen de un Excel en la clase base, y de MySQL en la subclase
`DotacionAutomationBD` que usa el microservicio).

**Output:** `resultado_df` (DataFrame final, ~55 columnas) + `reporte_calidad` / `detalle_calidad`
(qué no cruzó, qué se limpió, qué se eliminó).

Transformación en 13 pasos:

1. Limpieza puntual de `SIGLA` (`UAIEAIT`→`EAIT`, sacar prefijo `DGAH`) y `LIT_COD_REG` para
   `COD_REG=22`.
2. Extrae `ROL` del campo `CARGO` (después del guión), arma `CUIL Y ROL`.
3. Limpia `CUIL` (saca guiones, lo pasa a número).
4. Cruza `SIGLA` → `UNIVERSO TOTALIZADOR` / `TIPO DE HOSPITAL / SIGLA` / `MONOVALENCIA` (hoja
   `SIGLAS`). Registra siglas sin coincidencia.
5. Cruza `LIT_COD_REG + LIT_PUESTO` → `UNIFICADOR DE PUESTOS` (hoja `UNIFICADOR DE PUESTOS`).
6. Cruza `ESCALAFON + LIT_PUESTO` → `AGRUPADOR` (hoja `AGRUPADOR`), con ajuste: si `COD_SIT=32` y
   `AGRUPADOR="Enfermero/a"` → `"Enfermero/a ATP"`.
7. Limpia `JCAT="0"` (no es jefatura real, se trata como vacío).
8. Calcula `JEFE ESCALAFON` según `COD_REG` + si tiene `JCAT` + si tiene `ESCRITORIO`:
   `37`→Jefe CPH POF/POU, `85`→Jefe Técnico, `87`→Jefe Enfermería, `83`→Jefe Administrativo.
9. Calcula `ESTADO`: `Bloqueado` (si `BLOQ_DESDE`) → `Retención de Cargo` / `Comisión` (según
   `SIT_REV`) → `Activo` por defecto.
10. Renombra ~28 columnas a los nombres finales (`CARGO`→`ID SIAL`, `LIT_ESP_CARGO`→`ESPECIALIDAD`,
    etc. — ver mapeo completo en sección 6).
11. Vacía `ESPECIALIDAD` en filas cuyo `CODIGO DE REGISTRO` no admite especialidad (solo
    `37`/`23`/`24` la tienen).
12. Fuerza mayúscula sin tilde en columnas de vocabulario controlado (`LITERAL PUESTO`,
    `ESPECIALIDAD`, `AGRUPADOR`, etc.) y solo-sin-tilde en el resto de las columnas de texto
    (incluye nombres de personas, por pedido explícito del usuario, 2026-08-06).
13. Elimina duplicados de `ID SIAL` (conserva la fila más completa según columnas núcleo) y
    jefaturas CPH duplicadas (rol activo sin `CODIGO JEFATURAS`), reordena columnas según planilla
    de referencia.

Todo hallazgo de cada paso (sin coincidencia, vaciado, eliminado) queda en `detalle_calidad`,
exportable como Excel de 4 hojas: `Resumen`, `Detalle`, `Completitud por columna`, `Completitud
por fila`.

### 4.1 Requisitos nuevos — pendientes de implementar

> ⚠️ Los pasos 14 a 17 de acá abajo **no existen en el código actual**. Son requisitos que pidió
> Agustin (2026-08-21) para cuando se adapte Dotaneitor en Sprint 2, no una descripción de lo que
> el servicio ya hace. Los numero como continuación del pipeline de `procesar()` porque
> conceptualmente correrían ahí, pero cada uno es harina de otro costal — desarrollarlos por
> separado.

**Paso 14 — Sacar los datos hardcodeados: pasan a ser tablas de la BD**

Hoy varios diccionarios/listas de negocio están escritos directo en el código Python de Dotaneitor,
en vez de vivir en una tabla de referencia (como ya son `ref_agrupadores`, `ref_unificadores_puesto`
y `ref_especialidades_cuil` en `schema.prisma`, que sí migraron). Inventario de lo que falta migrar:

| Constante hardcodeada | Módulo | Qué contiene | Tabla de referencia propuesta |
|---|---|---|---|
| `ABREVIATURAS_TECNICAS` | `normalizador_cargos.py` | ~150 siglas institucionales (HGACA, CESAC, CPH, etc.) que no se tildan ni recasean | `ref_abreviaturas_tecnicas` |
| `ABREVIATURAS_TITULO` | `normalizador_cargos.py` | Dra./Prof./Lic./etc. — tratamientos con mayúscula inicial | `ref_abreviaturas_titulo` |
| `MAPEO_LIT_PUESTO_DIRECTO` + `MAPEO_LIT_PUESTO_POR_COD_REG` | `consolidacion_lit_puesto.py` | Correcciones de variantes de `LIT_PUESTO` (errores de tipeo, terminología vieja) | `ref_correcciones_lit_puesto` |
| `MAPEO_ESPECIALIDAD` | `consolidacion_especialidades.py` | Correcciones de tipeo en `ESPECIALIDAD UNIF.` (ej. `PSIQUATRIA`→`Psiquiatría`) | `ref_correcciones_especialidad` |
| `MAPEO_ESPECIALIDAD_POR_PUESTO` | `especialidad_por_agrupador.py` | ~35 puestos → especialidad por moda empírica, con % de pureza en comentario | `ref_especialidad_por_puesto` |
| `CONECTORES_MINUSCULA` | `normalizador_cargos.py` | Conectores que van en minúscula en Formato Título ("de", "del", "la", "y", etc.) — necesarios para la normalización del Excel raíz | `ref_conectores_minuscula` |
| `SUFIJOS_ORDINALES` | `normalizador_cargos.py` | Sufijos ordinales pegados a un número que van en minúscula ("1er", "2do", "3ro") — idem | `ref_sufijos_ordinales` |

**Resuelto (2026-08-21):** aunque son reglas gramaticales del español y no datos de negocio del
padrón en sí, se confirmó que también pasan a tabla — mismo criterio que el resto del paso 14, nada
queda hardcodeado en el código.

**Paso 15 — Alimentar tablas secundarias del sistema, no solo generar el Excel**

Hoy Dotaneitor entrega `resultado_df` (Excel/DataFrame) y ahí termina su responsabilidad — es Node
quien después, vía `/diff` y `/guardar-bd` (o el futuro flujo de aprobación de Sprint 2), decide qué
se persiste. El pedido es que Dotaneitor **también** haga upsert directo de las entidades atomizables
en sus tablas correspondientes:

| Tabla destino | Estado hoy | Qué cambiaría |
|---|---|---|
| `Hospital` (Hospitales) | Ya existe en `schema.prisma`, Dotaneitor solo la **lee** (siglas/tipo/monovalencia) | Pasaría a poder dar de alta siglas nuevas que aparezcan en el padrón y no estén todavía en la tabla |
| `Persona` (Personas) | Ya existe | Upsert por `CUIL` en cada corrida, no solo al aprobar el snapshot |
| `Especialidad` | **No existe** — hoy `ESPECIALIDAD` es texto libre en `Cargo.especialidad` | Requiere tabla catálogo nueva (ver pregunta abierta abajo) |
| `Puesto` | **No existe** — hoy `LITERAL PUESTO`/`AGRUPADOR`/`UNIFICADOR DE PUESTOS` son texto libre en `Cargo` | Requiere tabla catálogo nueva |
| `Escalafon` / `CodigoRegistro` | Ya existen, mismo caso que `Hospital` | Idem — pasar de solo-lectura a upsert |

✅ **Decidido con Jorge (2026-08-21):** Dotaneitor escribe **directo** en las tablas de **catálogo**
de bajo riesgo (`Hospital`, `Escalafon`, `CodigoRegistro`, `Especialidad`, `Puesto` — nueva
nomenclatura que aparece en el padrón, no datos de personas). `Persona` / `Cargo` / `Ocupacion`
**siguen detrás del flujo de aprobación** de `padron_diff` como está diseñado hoy — Dotaneitor no
las escribe directamente durante `/procesar`, eso lo sigue haciendo Node solo después de que un
humano aprueba el snapshot.

**Paso 16 — Nueva columna `PRIORITARIAS`** (regla de negocio pedida por Agustin, 2026-08-21;
precisiones confirmadas por Agustin el mismo día)

`PRIORITARIAS` **no es un atributo de cada registro/cargo** — es un **atributo de la
`ESPECIALIDAD` en sí** (qué especialidades pueden dar turnos), así que vive en la tabla catálogo
`Especialidad` propuesta en el paso 15 (ej. `Especialidad.prioritaria` booleano, o
`Especialidad.tipo = 'turno'`), no como una columna calculada fila por fila en `resultado_df`. En
la práctica: se marcan como prioritarias las especialidades de la lista de abajo, una sola vez en
el catálogo — cada `Cargo`/`Ocupacion` con esa especialidad hereda el atributo por relación (FK),
no por un cálculo que se repite en cada corrida de Dotaneitor.

- **Alcance:** solo registros `De Planta` (no Guardia), de hospitales o de la sigla `SSAPAC`
  (`SIGLAS` = `SSAPAC` es un valor más de esa columna, igual que cualquier sigla de hospital), con
  `ESTADO = Activo`.
- **Comparación:** exacta por palabra, ignorando mayúscula/minúscula y tildes — no es un `contains`
  ni un match parcial. Mismo patrón que ya usa el resto del código (`sin_tilde_mayuscula()` +
  comparación en mayúscula, como en `_MAPEO_ESPECIALIDAD_POR_PUESTO_UPPER` de
  `especialidad_por_agrupador.py`), así que no hace falta lógica nueva de matching.
- **Especialidades marcadas como prioritarias:**
  Cardiología, Cirugía General, Clínica Médica, Ginecología, Neurología, Oftalmología, Ortopedia y
  Traumatología, Pediatría, Psiquiatría, Tocoginecología, Anestesiología, Cirugía Infantil, Cirugía
  Infantil Pediátrica, Diagnóstico por Imágenes, Endocrinología, Farmacia, Fonoaudiología,
  Kinesiología, Otorrinolaringología, **Odontología** (incluye Endodoncia, Odontología General,
  Odontopediatría, Ortodoncia, Ortopedia Maxilar, Periodoncia) y **Psicología** (incluye Psicología
  Infantil y Psicología Clínica).
- **Valor:** `"Turno"` si la especialidad está en la lista, `NULL`/vacío si no.

Como `PRIORITARIAS` pasa a depender del catálogo `Especialidad` del paso 15, este paso 16 queda
bloqueado por esa tabla: no se puede implementar el uno sin el otro.

**Paso 17 — Generar el Excel al final del pipeline, y archivar cada corrida** (requisito pedido
por Agustin, 2026-08-21)

**Timing:** hoy el Excel del padrón **no se genera como parte de `procesar()`** — se arma recién
si/cuando se llama `/descargar`, leyendo lo que haya en ese momento en la sesión (ver más arriba).
El requisito es que la generación del Excel pase a ser el **último paso del pipeline**, corriendo
automáticamente al final del paso 16 (o del último paso que exista), no como una acción aparte que
depende de que alguien llame a `/descargar`.

**Archivo histórico:** además, cada corrida semanal debe quedar guardada — si hubo 20 cargas de
padrón, tiene que poder descargarse el Excel de cada una de esas 20, no solo el de la última
sesión activa. Hoy no hay ningún archivo histórico: las sesiones se borran a las 2 horas (`TTL`,
`main.py:71`) y `/descargar` solo sirve mientras la sesión sigue viva en memoria/disco temporal
(`tmp/{session_id}/`) — no hay ninguna copia que sobreviva más allá de eso.

**Resuelto (2026-08-21):**

- **Dónde se guarda:** en local, una carpeta dentro del propio repositorio (propuesto:
  `services/dotaneitor/archivos_padron/`, git-ignored igual que `tmp/`). En el servidor de
  producción, una carpeta específica del servidor (ruta exacta a definir en Sprint 6, junto con el
  resto de la infraestructura de producción — ver sección 6, `PLAN_SCRUM_2026.md`).
- **Nombre de archivo:** la fecha declarada al subir (`fecha_asignada`, el mismo campo que ya
  existe en `PadronSnapshot`), con un prefijo de iniciales para distinguir cuál de los dos
  documentos es — propuesto: `RP_{fecha_asignada}.xlsx` para el **R**esultado del **P**adrón y
  `RC_{fecha_asignada}.xlsx` para el **R**eporte de **C**alidad (ej. `RP_2026-08-21.xlsx` /
  `RC_2026-08-21.xlsx`). Ajustar el prefijo si no es la convención que se tenía en mente.
- **Retención:** ninguna — no es un documento histórico con vencimiento, se conservan
  indefinidamente. Nada que limpiar ni migrar a "frío" con el tiempo.
- **Pendiente de definir todavía:** cómo se referencia desde la BD — `PadronSnapshot`
  (`schema.prisma`) hoy tiene `filename` (parece ser el nombre del Excel *subido*, no el generado)
  pero ningún campo para la ruta del Excel *resultado* ni del reporte de calidad. Hace falta agregar
  algo como `archivoResultadoPath` / `archivoCalidadPath` a `PadronSnapshot`, o una tabla aparte si
  conviene modelar "archivos de un snapshot" como su propia entidad.

---

## 5. Módulos de soporte

| Módulo | Qué hace |
|---|---|
| `normalizador_cargos.py` | Limpieza de texto (doble codificación UTF-8, espacios, artefacto `_x000D_` de Excel), Formato Título con vocabulario técnico/institucional (~150 siglas hardcodeadas en `ABREVIATURAS_TECNICAS`), normaliza fechas/teléfonos/emails. |
| `consolidacion_lit_puesto.py` | Diccionario chico de variantes de `LIT_PUESTO` que son el mismo cargo (errores de tipeo, terminología vieja) — confirmadas a mano contra los datos reales. |
| `especialidades.py` | Cruce de `ESPECIALIDAD` por CUIL contra 3 hojas externas (CPH/Suplentes/Residentes de `ARCHIVOS PARA DOTACION.xlsx`). Solo completa huecos, nunca pisa un dato existente. |
| `consolidacion_especialidades.py` | Diccionario chico de correcciones de tipeo en `ESPECIALIDAD UNIF.` (ej. `PSIQUATRIA`→`Psiquiatría`). |
| `especialidad_por_agrupador.py` | Segunda pasada de `ESPECIALIDAD` para el universo Médico/No médico/Residente: primero por CUIL (misma persona en otro cargo), después por `MAPEO_ESPECIALIDAD_POR_PUESTO` — diccionario fijo de ~35 puestos calculado a mano por moda empírica (con % de pureza documentado por entrada). Lo que no resuelve ninguno de los dos pasos queda vacío a propósito y documentado. |

---

## 6. Mapeo columnas Excel → BD (S0-6)

`resultado_df` (la salida de `DotacionAutomation.procesar()`) tiene **58 columnas finales**, en el
orden fijado por `_reordenar_columnas()` en `Dotaneitor.py`. Cruzando esa lista contra
`prisma/schema.prisma` (fuente de verdad real, más completo que el `COL_MAP` plano que trae
`main.py` para `dot_resultado`/MySQL — ver sección 7, punto 6): **24 columnas tienen destino claro
y 34 no tienen ningún campo hoy en el schema.**

### 6.1 Columnas con destino claro (24)

| Columna `resultado_df` | Columna origen (Cargos_Salud) | Destino Prisma | Nota |
|---|---|---|---|
| `ID SIAL` | `CARGO` | `Cargo.idSial` | Identifica el **cargo/posición**, no a la persona ni a la ocupación puntual |
| `CUIL` | `CUIL` | `Persona.cuil` | — |
| `CUIL Y ROL` | (armado por Dotaneitor: `CUIL` + rol extraído de `CARGO`) | `Ocupacion.cuilYRol` | Ver 6.3 — el mismo dato de origen (`ID SIAL` + rol) es justo lo que necesita `Ocupacion.idSialRol` |
| `AYN` | `AYN` | `Persona.apellidoNombre` | — |
| `FECHA NACIMIENTO` | `FEC_NACIM` | `Persona.fechaNacimiento` | — |
| `SEXO` | `SEXO` | `Persona.sexo` | — |
| `TIPO DOC` | `TIP_DOC` | `Persona.tipoDoc` | — |
| `NUMERO DOC` | `NUM_DOC` | `Persona.numeroDoc` | — |
| `SIGLAS` | `SIGLA` | `Hospital.sigla` | Resuelve `Cargo.hospitalId` por lookup, no se guarda como texto en `Cargo` |
| `UNIVERSO TOTALIZADOR` | (cruce por `SIGLA` contra hoja `SIGLAS`) | `Hospital.universoTotalizador` | Dato de catálogo del hospital, no varía por registro |
| `TIPO DE HOSPITAL / SIGLA` | (idem) | `Hospital.tipo` | — |
| `MONOVALENCIA` | (idem) | `Hospital.monovalencia` | — |
| `ESCALAFON` | `ESCALAFON` | `Escalafon.nombre` | Resuelve `Cargo.escalafonId` |
| `CODIGO DE REGISTRO` | `COD_REG` | `CodigoRegistro.codigo` | Resuelve `Cargo.codigoRegistroId` |
| `LITERAL CR` | `LIT_COD_REG` | `CodigoRegistro.literal` | — |
| `REGIMEN` | `REGIMEN` | `Cargo.regimen` | — |
| `SITUACION DE REVISTA` | `SIT_REV` | `Ocupacion.situacionRevista` | A nivel ocupación (puede cambiar sin que cambie el cargo) |
| `LITERAL PUESTO` | `LIT_PUESTO` | `Cargo.literalPuesto` | — |
| `ESPECIALIDAD` | `LIT_ESP_CARGO` | `Cargo.especialidad` ⚠️ | Ver ambigüedad en 6.3 — el schema también tiene `Persona.especialidadPrincipal` |
| `UNIFICADOR DE PUESTOS` | (cruce `LIT_COD_REG`+`LIT_PUESTO`) | `Cargo.unificadorPuesto` | — |
| `AGRUPADOR` | (cruce `ESCALAFON`+`LIT_PUESTO`) | `Cargo.agrupador` | — |
| `CARGO_DESDE` | `CARGO_DESDE` | `Ocupacion.desde` | — |
| `CARGO_HASTA` | `CARGO_HASTA` | `Ocupacion.hasta` | — |
| `ESTADO` | (calculado: Bloqueado/Retención/Comisión/Activo) | `Ocupacion.estadoPersona` | No confundir con `Cargo.estado` (`vigente`/`no_vigente`, concepto distinto — lo maneja el flujo de bajas de Sprint 5) |

### 6.2 Columnas sin destino en el schema actual (34)

Ninguna de estas tiene un campo hoy en `personas` / `cargos` / `ocupaciones` / `hospitales`. Las
agrupo por tema con lo que pude reconstruir del código (nombre de columna origen en Cargos_Salud,
qué lógica de Dotaneitor la toca, y qué formato queda después de `normalizador_cargos.py`) para que
se pueda decidir con contexto real, no solo con el nombre de la columna.

**Jefatura** (8) — todo lo relacionado a si la persona ejerce una jefatura de escalafón:
- `CODIGO JEFATURAS` (origen `JCAT`): código de jefatura; `"0"` se trata como "sin jefatura" (Dotaneitor lo vacía explícitamente). Junto con `CODIGO DE REGISTRO` y `ESCRITORIO` determina `JEFE ESCALAFON`.
- `JEFE ESCALAFON`: **calculado por Dotaneitor**, no viene del Excel — `Jefe CPH POF` / `Jefe CPH POU` (según tenga o no `ESCRITORIO`) / `Jefe Técnico` / `Jefe Enfermería` / `Jefe Administrativo`, según `CODIGO DE REGISTRO` (37/85/87/83).
- `DOCUMENTACION JEFATURA` (origen `DOC_RESPALD`): texto libre, probablemente número de expediente/acta que respalda la jefatura. Sin más contexto en el código que el nombre.
- `COMENTARIOS JEFATURAS` (origen `J_COMENTARIO`): texto libre.
- `ESCRITORIO` (origen `ESCRITORIO`, sin normalizar): su sola presencia/ausencia decide `Jefe CPH POF` vs `Jefe CPH POU`; no vi en el código qué representa el valor en sí (¿nombre de oficina? ¿código de escritorio?).
- `POU_DESDE` (origen `POU_DESDE`, es fecha): fecha "desde" asociada al rol POU — desde cuándo ejerce ese escritorio/función, presumiblemente.
- `DIA` (origen `DIA`, pasa por Formato Título): **hallazgo relevante** — el comentario en `_eliminar_duplicados_id_sial` dice que el padrón de origen trae "una fila por cada DIA de guardia que cubre" un mismo cargo. O sea, `DIA` es el día de la semana de un turno de guardia, y hoy Dotaneitor **descarta esa granularidad**: cuando hay varias filas por `ID SIAL` (una por día), se queda con una sola (la "más completa") y tira el resto — incluido el detalle de qué días cubre. Si en algún momento se necesita el detalle de guardia por día, hay que revisar ese paso.
- `DOCUEMNTACION POU` (origen `DOC_RESP`, sic — el typo "DOCUEMNTACION" está en el código, se propaga al Excel final): texto libre, análogo a `DOCUMENTACION JEFATURA` pero para el rol POU.

**Comisión** (5) — datos de cuando la persona está en comisión de servicio en otra dependencia:
- `COMISION` (origen `SR_WU_COMISION`): probablemente código de la unidad de destino de la comisión.
- `REPA COMISION` (origen `SR_DESC_WU_COMISION`, pasa por Formato Título técnico): descripción/nombre de esa repartición de destino.
- `SR_DOC_RESPALD`, `SR_COMENTARIO` (sin renombrar): documentación y comentario de respaldo de la situación de revista (prefijo `SR_` = Situación de Revista), texto libre.
- `CR_COMENTARIO` (sin renombrar): comentario relacionado al Código de Registro, texto libre.

**Bloqueo** (3) — la razón detrás de `ESTADO = "Bloqueado"`:
- `FECHA BLOQUEO` (origen `BLOQ_DESDE`, fecha): si tiene valor, `ESTADO` se calcula como `Bloqueado`.
- `BLOQUEO COMENTARIO` (origen `BLOQ_COMENTARIO`): texto libre.
- `BLOQ MOTIVO` (origen `BL_MOTIVO`, pasa por Formato Título técnico): motivo del bloqueo, parece vocabulario controlado (lista acotada de motivos) más que texto libre.

**Contacto y domicilio** (6) — datos personales:
- `TELEFONO`: normalizado a solo dígitos (saca `+`, espacios, código de país `54`, el `0` de área si sobran dígitos).
- `MAIL_PERSONAL`, `MAIL_LABORAL`: normalizados a minúscula.
- `DOMICILIO`, `LOCALIDAD` (pasan por Formato Título técnico), `PROVINCIA` (sin normalizar).

**Otros** (12):
- `EDAD` (origen `EDAD`): **no la calcula Dotaneitor** — viene directo del Excel de SIAL. Como `Persona.fechaNacimiento` ya está en el schema, hay que decidir si conviene guardar `EDAD` tal cual llega (foto del momento del padrón, puede desactualizarse) o calcularla siempre a partir de la fecha de nacimiento (más consistente, sin duplicación de dato).
- `CODIGO REPA` / `DESCRIPCION REPA` (origen `COD_REP` / `DESC_REP`, esta última con Formato Título técnico): código y descripción de la "repartición" (unidad organizativa GCBA) — parece un nivel más fino que `Hospital`, a confirmar si se solapa con algo del schema o es información nueva.
- `PUESTO` (origen `PUESTO`, sin normalizar ni usar en ningún cruce): código interno del puesto, distinto de `LITERAL PUESTO` (su versión legible, que sí tiene destino). Hoy Dotaneitor no lo usa para nada — los cruces de `AGRUPADOR`/`UNIFICADOR DE PUESTOS` se hacen por `ESCALAFON`+`LIT_PUESTO` (texto), no por este código.
- `COD_AGRUPAMIENTO` / `AGRUPAMIENTO` (origen `COD_AGRUPAMIENTO` / `LIT_AGRUPAMIENTO`, esta última con Formato Título técnico): código y descripción de un agrupamiento — **distinto de `AGRUPADOR`**, que Dotaneitor calcula por su cuenta cruzando `ESCALAFON`+`LIT_PUESTO`. Posiblemente una clasificación salarial/escalafonaria propia de SIAL (a confirmar).
- `COD_FAMILIA` / `LIT_FAMILIA` (esta última con Formato Título técnico): otra clasificación de SIAL, código + descripción, sin relación evidente con nada del schema actual.
- `COD SITUACION` (origen `COD_SIT`): código numérico que la lógica de negocio **ya usa** en un caso puntual (`COD_SIT = 32` fuerza `AGRUPADOR = "Enfermero/a ATP"`), aunque no se persiste en ningún lado del schema hoy.
- `DOCUMENTACION DEL ROL` / `DOCUMENTACION BAJA` (origen `DOC_RESP_ALTA` / `DOC_RESP_BAJA`): expedientes que respaldan el alta y la baja del rol — pareja natural de `CARGO_DESDE`/`CARGO_HASTA` (que sí tienen destino en `Ocupacion.desde`/`hasta`).
- `ANTIGÜEDAD` (origen `SALUD_1ER_CARGO`, fecha): fecha del primer cargo en la carrera de Salud — antigüedad real de la persona en el sistema, distinta de `CARGO_DESDE` (que es la fecha de inicio de *este* cargo puntual).

### 6.3 Dos hallazgos a tener en cuenta

- **`ID SIAL` + rol → `Ocupacion.idSialRol`**: Dotaneitor arma `CUIL Y ROL` extrayendo el rol de
  `CARGO` (después del guión) y después descarta esa columna intermedia. Pero `ID SIAL` (el cargo)
  + ese mismo rol es exactamente la combinación que necesita `Ocupacion.idSialRol` (único). Vale la
  pena que quien adapte el Dotaneitor para Sprint 2 conserve ese dato en vez de recalcularlo aparte.
- **Ambigüedad `ESPECIALIDAD`**: el schema tiene `Cargo.especialidad` (el puesto define la
  especialidad que requiere) y también `Persona.especialidadPrincipal` (un resumen a nivel
  persona). El valor que sale de Dotaneitor es por-cargo (una persona con dos cargos puede tener
  dos `ESPECIALIDAD` distintas — de hecho `especialidades.py` documenta esto como limitación
  conocida al resolver por CUIL). Mapea naturalmente a `Cargo.especialidad`; si `Persona.especialidadPrincipal`
  se calcula aparte (¿la más frecuente entre sus cargos?, ¿la del cargo activo más reciente?) es una
  regla de negocio que todavía no está definida en ningún lado.

**Resumen:** de las 58 columnas de salida, 24 tienen destino claro, 1 (`ESPECIALIDAD`) tiene
destino pero con una regla de negocio pendiente, y 34 no tenían ningún campo en el schema — la
propuesta de dónde van esas 34 está en 6.4. A confirmar con Jorge antes de tocar `schema.prisma`.

### 6.4 Propuesta — dónde van las 34 columnas sin destino

Alcance de esta propuesta: **solo `Persona` / `Cargo` / `Ocupacion`** (a pedido de Agustin,
2026-08-21) — no se proponen tablas nuevas acá, todo lo que sigue son campos agregados a esas tres.
Ninguna de las 34 se descarta sin decirlo: la que no suma campo lleva la razón al lado.

**Criterio usado para elegir la tabla:** dato de la persona en sí (no cambia si cambia de cargo) →
`Persona`. Dato del puesto/posición (no cambia según quién lo ocupe) → `Cargo`. Dato de *esta*
ocupación puntual (puede cambiar aunque seas la misma persona en el mismo cargo — situación,
jefatura, bloqueo) → `Ocupacion`, siguiendo el mismo criterio que ya usa el schema para
`situacionRevista`/`estadoPersona`.

#### `Persona` — 7 campos nuevos

| Columna origen | Campo propuesto | Tipo | Nota |
|---|---|---|---|
| `TELEFONO` | `telefono` | `String? @db.VarChar(20)` | Dato de la persona, no del cargo |
| `MAIL_PERSONAL` | `mailPersonal` | `String? @db.VarChar(255)` | — |
| `MAIL_LABORAL` | `mailLaboral` | `String? @db.VarChar(255)` | — |
| `DOMICILIO` | `domicilio` | `String? @db.VarChar(255)` | — |
| `LOCALIDAD` | `localidad` | `String? @db.VarChar(150)` | — |
| `PROVINCIA` | `provincia` | `String? @db.VarChar(100)` | — |
| `ANTIGÜEDAD` (`SALUD_1ER_CARGO`) | `antiguedadDesde` | `DateTime? @db.Date` | Fecha del primer cargo en la carrera de Salud — es de la persona, no de este cargo puntual |

**`EDAD` — no se agrega campo.** `Persona.fechaNacimiento` ya existe; guardar `EDAD` aparte
duplicaría el dato y se desactualizaría solo (la edad de hoy no es la de cuando se subió el
padrón). Se calcula al vuelo donde haga falta mostrarla. Si en algún momento hace falta la "edad
declarada en el padrón de tal fecha" como dato histórico, eso es distinto — avisar y lo agrego.

#### `Cargo` — 7 campos nuevos

| Columna origen | Campo propuesto | Tipo | Nota |
|---|---|---|---|
| `CODIGO REPA` | `codigoRepa` | `String? @db.VarChar(20)` | Unidad organizativa (repartición) del cargo |
| `DESCRIPCION REPA` | `descripcionRepa` | `String? @db.VarChar(200)` | — |
| `COD_AGRUPAMIENTO` | `codAgrupamiento` | `String? @db.VarChar(20)` | ⚠️ Confianza media — no confirmé qué representa exactamente en SIAL, ver 6.2 |
| `AGRUPAMIENTO` | `agrupamiento` | `String? @db.VarChar(150)` | ⚠️ Idem — **distinto** de `Cargo.agrupador`, que ya existe y lo calcula Dotaneitor |
| `COD_FAMILIA` | `codFamilia` | `String? @db.VarChar(20)` | ⚠️ Idem |
| `LIT_FAMILIA` | `litFamilia` | `String? @db.VarChar(150)` | ⚠️ Idem |
| `PUESTO` | `puestoCodigoSial` | `String? @db.VarChar(20)` | Código interno, no lo usa ninguna lógica de Dotaneitor hoy — relevancia baja, lo sumo solo para no perder el dato de origen |

#### `Ocupacion` — 19 campos nuevos

| Columna origen | Campo propuesto | Tipo | Nota |
|---|---|---|---|
| `CODIGO JEFATURAS` | `codigoJefaturas` | `String? @db.VarChar(10)` | — |
| `JEFE ESCALAFON` | `jefeEscalafon` | `String? @db.VarChar(50)` | Calculado por Dotaneitor, no viene del Excel de origen |
| `DOCUMENTACION JEFATURA` | `documentacionJefatura` | `String? @db.Text` | — |
| `COMENTARIOS JEFATURAS` | `comentariosJefaturas` | `String? @db.Text` | — |
| `ESCRITORIO` | `escritorio` | `String? @db.VarChar(100)` | — |
| `POU_DESDE` | `pouDesde` | `DateTime? @db.Date` | — |
| `DOCUEMNTACION POU` | `documentacionPou` | `String? @db.Text` | — |
| `COMISION` | `comision` | `String? @db.VarChar(150)` | — |
| `REPA COMISION` | `repaComision` | `String? @db.VarChar(200)` | — |
| `SR_DOC_RESPALD` | `srDocRespaldo` | `String? @db.Text` | — |
| `SR_COMENTARIO` | `srComentario` | `String? @db.Text` | — |
| `CR_COMENTARIO` | `crComentario` | `String? @db.Text` | ⚠️ Confianza media — el nombre sugiere "Código de Registro", pero lo agrupo con lo demás de la ocupación por ser texto libre puntual |
| `FECHA BLOQUEO` | `fechaBloqueo` | `DateTime? @db.Date` | Respalda `estadoPersona = "Bloqueado"` |
| `BLOQUEO COMENTARIO` | `bloqueoComentario` | `String? @db.Text` | — |
| `BLOQ MOTIVO` | `bloqMotivo` | `String? @db.VarChar(200)` | — |
| `COD SITUACION` | `codSituacion` | `String? @db.VarChar(10)` | Ya lo usa una regla de negocio hoy (`COD_SIT=32` → `AGRUPADOR="Enfermero/a ATP"`) |
| `DOCUMENTACION DEL ROL` | `documentacionDelRol` | `String? @db.Text` | Respalda `desde` |
| `DOCUMENTACION BAJA` | `documentacionBaja` | `String? @db.Text` | Respalda `hasta` |
| `DIA` | `diasGuardia` | `String[]` ⚠️ | **No es un campo simple** — ver nota abajo |

**Nota sobre `DIA`:** a diferencia del resto, esta columna no encaja como un campo escalar más. El
padrón de origen trae una fila por cada día de guardia que la persona cubre (ej. la misma ocupación
puede tener Lunes, Miércoles y Viernes en filas separadas), y hoy Dotaneitor colapsa esas filas a
una sola al eliminar duplicados de `ID SIAL` — se pierde el detalle de qué días son. Para guardarlo
de verdad hace falta, además del campo, **tocar la lógica de deduplicación de Dotaneitor** para que
en vez de tirar las filas extra, junte los días en una lista. Lo dejo marcado como pendiente aparte,
no es un simple "agregar columna".

---

## 7. Deuda técnica y hallazgos (S0-7)

1. **Bug de deploy real:** `main.py` importa `mysql.connector`, pero ese paquete **no está en
   `requirements.txt`** (que ya tiene `psycopg2-binary` + `sqlalchemy` — alguien empezó la
   migración a Postgres y la dejó a medio camino). Tal cual está el código hoy, instalar
   dependencias y arrancar el server rompe en el import. Bloqueante para levantar el servicio, no
   solo para Sprint 2.
2. **44% de `Dotaneitor.py` (595 de 1356 líneas) es la GUI Tkinter** (`DotacionGUI`), sin ningún
   uso en el microservicio — `main.py` mockea el módulo `tkinter` completo para poder importar la
   clase de lógica sin arrastrarla. Candidato a separar `DotacionAutomation` a su propio archivo y
   sacar la GUI del servicio (o del repo del microservicio directamente).
   ✅ **Resuelto (S2-1, 2026-08-24):** se sacó `DotacionGUI` entera de `Dotaneitor.py` (1356→748
   líneas) — la app de escritorio standalone con GUI sigue viviendo en su repo original
   (`dotacion-rrhh`), acá no hacía falta. De paso se limpiaron ~10 imports que solo usaba la GUI
   (`tkinter`, `Path`, `os`, `json`, `shutil`, `datetime`, `Thread`, `NormalizadorCargos`, etc.) y
   se simplificó `main.py`: ya no necesita mockear `tkinter` para importar `DotacionAutomation`.
3. **Recuperación de sesión tras reinicio es parcial:** el estado del `job` persiste en disco y
   sobrevive un reinicio del contenedor, pero `sessions[session_id]` (que tiene el DataFrame
   procesado en memoria) no. Si el contenedor reinicia a mitad de flujo, `get_session()` solo
   puede recuperar el `cargos_path` — hay que repetir `/procesar` y `/cruzar` desde cero.
4. El propio README marca `/guardar-bd` como "a eliminar" (la aprobación la va a manejar Node vía
   `POST /api/v1/padron/snapshots/:id/aprobar`), pero hoy sigue implementado con toda su lógica de
   historial contra MySQL (`dot_resultado_historico`, `dot_resultado_historial_cambios`).
5. `MAPEO_ESPECIALIDAD_POR_PUESTO` (`especialidad_por_agrupador.py`) es un diccionario estático
   calculado una vez a mano sobre una corrida de referencia puntual (2026-08-03/04). El propio
   comentario del código avisa que si cambia algo en `normalizador_cargos.py` /
   `especialidades.py` / `consolidacion_especialidades.py`, los % de pureza documentados quedan
   desactualizados y conviene recalcularlo.
6. `COL_MAP` (sección 6) es un mapeo a tabla plana, no al modelo relacional actual — hay que
   decidir su reemplazo como parte de S0-6/Sprint 2, no reutilizarlo tal cual.
7. **Performance — loops fila por fila sobre las 48k filas completas** (`Dotaneitor.py:370-429`):
   `_calcular_jefe_escalafon()` y `_calcular_estado()` recorren `df.iterrows()` entero, una vez
   cada uno, en cada `/procesar`. Es el mismo patrón que el resto de `procesar()` evita a propósito
   — los cruces de `SIGLA`/`AGRUPADOR`/`UNIFICADOR DE PUESTOS` (pasos 5-7, `Dotaneitor.py:140-197`)
   ya están vectorizados con diccionarios + `.map()`. Ambas funciones son condicionales simples
   sobre 2-3 columnas (`JCAT`/`COD_REG`/`ESCRITORIO` y `SIT_REV`/`BLOQ_DESDE`), directamente
   vectorizables con máscaras booleanas o `np.select`, siguiendo el mismo patrón ya usado en el
   resto del archivo. Es el candidato más concreto para acercarse al criterio de éxito del MVP
   ("< 60 segundos para 48k registros" — `PLAN_SCRUM_2026.md` sección 8); no llegué a medir el
   tiempo real de una corrida completa sobre un archivo de ese tamaño, queda pendiente para
   cuando haya un Cargos_Salud real disponible para probar.
   ✅ **Resuelto (S2-1, 2026-08-24):** ambas funciones vectorizadas con `np.select`. Medido en
   48.000 filas sintéticas: `_calcular_jefe_escalafon` 1.685s→0.05s (33x), `_calcular_estado`
   6.773s→0.18s (37x) — 8.46s combinado baja a 0.23s. Verificado contra la lógica original con 9
   casos de borde, coincide exactamente. **De paso se encontró y corrigió un bug real:**
   `_calcular_estado` sacaba la tilde `á` antes de buscar "retencion" en `SIT_REV`, pero la palabra
   es "retención" (con `ó`, no `á`) — el reemplazo nunca hacía nada y `ESTADO = "Retencion de
   Cargo"` jamás matcheaba contra datos reales con tilde, caía siempre en "Activo" en silencio.
   Corregido usando `sin_tilde()` (ya existía en el código, cubre todas las vocales) en vez de un
   `.replace()` de una sola letra elegida a mano.
8. **CORS abierto** (`main.py:75-80`): `allow_origins=['*']`, `allow_methods=['*']`,
   `allow_headers=['*']` — contradice la regla del propio README ("el frontend nunca habla
   directamente con este servicio"). Severidad baja mientras el servicio solo sea alcanzable desde
   la red interna de `docker-compose` (no expuesto a internet), pero vale la pena restringirlo
   explícitamente al origen de la API Node cuando se defina el despliegue de producción (Sprint 6).
   ✅ **Resuelto (S2-1, 2026-08-24):** `allow_origins` sale de la variable de entorno
   `CORS_ORIGINS` (vacía por default — Node↔Python es server-to-server, CORS no aplica ahí), y
   `allow_methods` se acotó a `GET`/`POST` (los únicos que usa el servicio).
9. **Duplicación de lógica** entre `main.py:_cruzar_especialidades()` (usada por el endpoint
   `/cruzar`) y `Dotaneitor.py:DotacionGUI._cruzar_especialidades_thread()` (la misma lógica para
   la GUI standalone) — están escritas por separado, no comparten código más allá de las funciones
   de `especialidades.py`/`especialidad_por_agrupador.py`. Si se corrige algo en una copia hay que
   acordarse de replicarlo en la otra. Se resolvería solo si se elimina la GUI del servicio
   (hallazgo 2).
   ✅ **Resuelto (S2-1, 2026-08-24):** se resolvió solo al sacar `DotacionGUI` (hallazgo 2) — ya
   no hay dos copias de la lógica de cruce, solo queda la de `main.py`.

---

## 8. Preguntas abiertas para el equipo

- ¿El mapeo a `personas`/`ocupaciones`/`cargos` de la sección 6 lo define Agustin solo o se revisa
  en conjunto con Jorge antes de Sprint 2 (que es quien va a adaptar `cargar_archivos()` para leer
  de Postgres)?
- ¿Vale la pena arreglar el bug de `mysql.connector` faltante ahora (agregarlo a
  `requirements.txt`) para poder levantar el servicio localmente en Sprint 0, o se deja tal cual
  hasta la migración de Sprint 2?
- ~~Sobre el paso 15 (alimentar tablas secundarias): ¿Dotaneitor escribe directo en `Persona`/
  `Cargo`/`Ocupacion`?~~ **Resuelto (2026-08-21, con Jorge):** no — solo catálogos de bajo riesgo
  escriben directo, `Persona`/`Cargo`/`Ocupacion` siguen detrás del flujo de aprobación. Ver 4.1.
- **Sobre la propuesta de 6.4:** confirmar los 5 campos marcados con ⚠️ confianza media
  (`codAgrupamiento`/`agrupamiento`/`codFamilia`/`litFamilia` en `Cargo`, `crComentario` en
  `Ocupacion`) — no pude confirmar en el código qué representan exactamente en SIAL, más allá del
  nombre de columna. Y decidir qué hacer con `DIA` (días de guardia): agregar el campo implica
  también cambiar la lógica de deduplicación de Dotaneitor, no es solo un campo nuevo.
- **Tablas `Especialidad` y `Puesto`:** no existen hoy en `schema.prisma`. ¿Se agregan como
  catálogos con FK desde `Cargo` (reemplazando los campos de texto libre `Cargo.especialidad` /
  `Cargo.literalPuesto` / `Cargo.agrupador` / `Cargo.unificadorPuesto`), o quedan como texto libre y
  la tabla nueva es solo para normalización/autocompletado? Cambia bastante el alcance de Sprint 2.
- **Sobre el paso 14 (sacar datos hardcodeados):** ¿todas las tablas `ref_*` propuestas se crean
  ahora en `schema.prisma` (Sprint 0/1) para tenerlas listas, o se dejan para cuando Sprint 2 toque
  Dotaneitor de verdad? ~~¿`CONECTORES_MINUSCULA`/`SUFIJOS_ORDINALES` entran también?~~
  **Resuelto (2026-08-21): sí, también pasan a tabla** (`ref_conectores_minuscula` /
  `ref_sufijos_ordinales`).
- ~~Sobre el paso 16 (`PRIORITARIAS`): SSAPAC, criterio de comparación, dónde persiste.~~
  **Resuelto (2026-08-21):** `SSAPAC` es un valor más de `SIGLAS`; la comparación es exacta por
  palabra ignorando mayúscula/minúscula/tildes; `PRIORITARIAS` es un atributo del catálogo
  `Especialidad` (paso 15), no una columna calculada por registro. Ver 4.1, paso 16.
- ~~Sobre el paso 17 (generar y archivar el Excel): dónde vive el archivo, nombre, retención.~~
  **Resuelto (2026-08-21):** carpeta en el repo en local / carpeta del servidor en producción,
  nombre `RP_`/`RC_` + `fecha_asignada`, sin política de retención. Sigue abierto solo cómo se
  referencia el archivo desde `PadronSnapshot` (campo nuevo vs. tabla aparte). Ver 4.1, paso 17.
